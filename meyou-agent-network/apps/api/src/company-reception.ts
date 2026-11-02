import { z } from "zod";
import { pool } from "./db/client.js";
import { queueCustomerAgentTask } from "./customer-agent-authority.js";
import { customerAgentInScope } from "./customer-agent-scope.js";

export const companyInquirySchema = z.object({
  content: z.string().trim().min(1).max(2000),
  requestId: z.string().uuid().optional()
}).strict();

export async function getPublicCompany(handle: string) {
  const result = await pool.query(
    `select handle,name,description,business_hours as "businessHours"
     from organizations where handle=$1`, [handle]
  );
  return result.rows[0] ?? null;
}

/** Authenticated customer identity is supplied only by the server's auth context. */
export async function createCompanyInquiry(customerId: string, handle: string, content: string, requestId?: string) {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const organization = await connection.query(
    "select id,owner_id,reception_mode from organizations where handle=$1 for update", [handle]
    );
    const company = organization.rows[0];
    if (!company) { await connection.query("rollback"); return null; }
    if (requestId) {
      const existing = await connection.query(
        `select id,subject,status from customer_threads
         where organization_id=$1 and customer_id=$2 and inquiry_request_id=$3`,
        [company.id, customerId, requestId]
      );
      if (existing.rowCount) {
        if (existing.rows[0].subject !== content) throw new Error("inquiry_request_conflict");
        await connection.query("commit");
        return { id: existing.rows[0].id as string, status: existing.rows[0].status as string,
          delivery: "delivered" as const };
      }
    }
    const customer = await connection.query("select display_name from users where id=$1", [customerId]);
    if (!customer.rowCount) throw new Error("customer_unavailable");
    const created = await connection.query(
      `insert into customer_threads (organization_id,customer_id,guest_name,subject,status,inquiry_request_id)
       values ($1,$2,$3,$4,'unassigned',$5) returning id`,
      [company.id, customerId, customer.rows[0].display_name, content, requestId ?? null]
    );
    const id = created.rows[0].id as string;
    const eligible = company.reception_mode === "agent"
      && process.env.CUSTOMER_AGENT_ENABLED === "true" && customerAgentInScope(company.id);
    const available = eligible ? await connection.query(
      `select exists(select 1 from service_heartbeats
       where service='customer-agent-worker' and seen_at>now()-interval '30 seconds') as available`
    ) : null;
    const automatic = available?.rows[0]?.available === true;
    if (automatic) {
      await connection.query(
        "update customer_threads set agent_mode='auto',agent_revision=1,status='agent' where id=$1", [id]
      );
      await queueCustomerAgentTask(connection, { id, agent_mode: "auto", agent_revision: 1, status: "agent" }, id);
    }
    await connection.query(
      `insert into notifications (owner_id,kind,title,detail,href,entity_id)
       values ($1,'company_inquiry_received','企业收到一条客户咨询',$2,$3,$4)`,
      [company.owner_id, content.slice(0, 160), `/app/customers?thread=${id}`, id]
    );
    await connection.query(
      `insert into audit_events (owner_id,organization_id,action,summary,policy_refs)
       values ($1,$2,'customer.inquiry_created','登录客户提交企业咨询',$3::jsonb)`,
      [company.owner_id, company.id, JSON.stringify([`customer:${id}`])]
    );
    await connection.query("commit");
    // Do not expose internal notes, organization owner IDs or other customer rooms.
    return { id, status: automatic ? "agent" : "unassigned", delivery: "delivered" as const };
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally { connection.release(); }
}
