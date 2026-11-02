import { z } from "zod";
import { pool } from "./db/client.js";
import { queueCustomerAgentTask } from "./customer-agent-authority.js";
import { resolveModelConfiguration } from "./model.js";
import { planLimits } from "@meyou/shared";
import { customerWorkerAvailable } from "./customer-worker-health.js";
import { customerAgentInScope } from "./customer-agent-scope.js";

export async function customerReceptionReadiness(ownerId: string, threadId: string) {
  const thread = (await pool.query(
    `select t.organization_id,t.customer_id,t.status from customer_threads t
     join organizations o on o.id=t.organization_id where t.id=$1 and o.owner_id=$2`, [threadId, ownerId]
  )).rows[0];
  if (!thread) return null;
  const agent = (await pool.query("select modes from agents where owner_id=$1", [ownerId])).rows[0];
  const sources = (await pool.query(
    "select count(*)::int as total from knowledge_documents where organization_id=$1 and active=true",
    [thread.organization_id]
  )).rows[0];
  const usage = (await pool.query(
    `select u.plan,coalesce(sum(l.amount),0)::int as total from users u
     left join usage_ledger l on l.owner_id=u.id and l.metric='agent_reply'
     where u.id=$1 group by u.id,u.plan`, [ownerId]
  )).rows[0];
  let modelReady = false;
  try {
    const model = await resolveModelConfiguration();
    modelReady = Boolean(model.apiKey && model.modelId);
  } catch { /* Report unavailable without exposing provider configuration or credentials. */ }
  const limit = usage ? planLimits[usage.plan as keyof typeof planLimits]?.replies : undefined;
  const checks = {
    customerChannel: Boolean(thread.customer_id),
    threadOpen: thread.status !== "resolved",
    businessPermission: agent?.modes?.business === "auto",
    activeKnowledge: Number(sources?.total ?? 0) > 0,
    modelConfigured: modelReady,
    quotaAvailable: Boolean(usage && limit !== undefined && usage.total < limit),
    executionEnabled: customerAgentInScope(thread.organization_id) && await customerWorkerAvailable()
  };
  return { ready: Object.values(checks).every(Boolean), checks };
}

export const customerUpdateSchema = z.object({
  action: z.enum(["takeover", "resolve", "reopen", "resume_agent"]).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
  priority: z.enum(["normal", "high"]).optional()
}).strict().refine(value => value.action || value.note || value.priority, "update_required");

export async function getCustomerThread(ownerId: string, id: string) {
  const result = await pool.query(
    `select t.*,o.name as organization_name,u.display_name as customer_name,
       a.display_name as assignee_name from customer_threads t
     join organizations o on o.id=t.organization_id
     left join users u on u.id=t.customer_id
     left join users a on a.id=t.assignee_id where t.id=$1 and o.owner_id=$2`,
    [id, ownerId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const tasks = await pool.query(
    `select t.id,t.state,t.authority_revision as "authorityRevision",t.updated_at as "updatedAt",
       o.outcome from customer_agent_tasks t
     left join customer_agent_outputs o on o.task_id=t.id
     where t.thread_id=$1 order by t.created_at desc,t.id desc limit 5`, [id]
  );
  return {
    id: row.id, organizationId: row.organization_id, organizationName: row.organization_name,
    customerName: row.customer_name || row.guest_name || "",
    subject: row.subject, status: row.status, priority: row.priority,
    assigneeName: row.assignee_name, internalNotes: row.internal_notes,
    agentMode: row.agent_mode ?? "paused", agentRevision: row.agent_revision ?? 0,
    agentTasks: tasks.rows,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
  };
}

export async function updateCustomerThread(ownerId: string, id: string, input: z.infer<typeof customerUpdateSchema>) {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const result = await connection.query(
      `select t.* from customer_threads t join organizations o on o.id=t.organization_id
       where t.id=$1 and o.owner_id=$2 for update of t`, [id, ownerId]
    );
    const thread = result.rows[0];
    if (!thread) { await connection.query("rollback"); return null; }
    const status = input.action === "resolve" ? "resolved"
      : input.action === "resume_agent" ? "agent"
      : input.action === "takeover" || input.action === "reopen" ? "active" : thread.status;
    const mode = input.action === "resume_agent" ? "auto" : "paused";
    const assignedToOwner = input.action === "takeover" || input.action === "reopen";
    const actionChanges = Boolean(input.action && (
      thread.status !== status || thread.agent_mode !== mode
      || (assignedToOwner && thread.assignee_id !== ownerId)
    ));
    if (!actionChanges && !input.note && (!input.priority || input.priority === thread.priority)) {
      await connection.query("commit");
      return { updated: true };
    }
    if (input.action === "resume_agent" && actionChanges) {
      const agent = (await connection.query("select modes from agents where owner_id=$1 for share", [ownerId])).rows[0];
      const knowledge = await connection.query(
        "select id from knowledge_documents where organization_id=$1 and active=true limit 1 for share",
        [thread.organization_id]
      );
      if (!thread.customer_id || thread.status === "resolved" || agent?.modes?.business !== "auto" || !knowledge.rowCount) {
        throw new Error("customer_agent_not_ready");
      }
      const model = await resolveModelConfiguration();
      if (!model.apiKey || !model.modelId) throw new Error("customer_agent_not_ready");
    }
    const notes = input.note ? [...thread.internal_notes, input.note] : thread.internal_notes;
    await connection.query(
      `update customer_threads set status=$2,priority=$3,assignee_id=$4,internal_notes=$5::jsonb,updated_at=now() where id=$1`,
      [id, status, input.priority ?? thread.priority,
        input.action === "takeover" || input.action === "reopen" ? ownerId : thread.assignee_id,
        JSON.stringify(notes)]
    );
    if (actionChanges) {
      await connection.query(
        "update customer_threads set agent_mode=$2,agent_revision=agent_revision+1 where id=$1",
        [id, mode]
      );
      await connection.query(
        "update customer_agent_tasks set state='cancelled',updated_at=now() where thread_id=$1 and state in ('pending','running')", [id]
      );
      if (input.action === "resume_agent") {
        const latest = await connection.query(
          "select id,actor from customer_messages where thread_id=$1 order by created_at desc,id desc limit 1", [id]
        );
        // Never answer an old customer input after a human has already replied.
        if (!latest.rowCount || latest.rows[0].actor === "customer") {
          await queueCustomerAgentTask(connection, {
            id, agent_mode: "auto", agent_revision: Number(thread.agent_revision ?? 0) + 1, status
          }, latest.rows[0]?.id ?? id);
        }
      }
    }
    await connection.query(
      `insert into audit_events (owner_id,organization_id,action,summary,policy_refs)
       values ($1,$2,'customer.updated',$3,$4::jsonb)`,
      [ownerId, thread.organization_id, actionChanges ? `客户线程操作：${input.action}` : "客户线程备注或优先级更新",
        JSON.stringify([`customer:${id}`])]
    );
    await connection.query("commit");
    return { updated: true };
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally { connection.release(); }
}
