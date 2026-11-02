import { z } from "zod";
import { pool } from "./db/client.js";

export const organizationReceptionSchema = z.object({
  mode: z.enum(["human", "agent"]),
  confirmation: z.literal("authorize-new-customer-reception").optional()
}).strict().refine(value => value.mode !== "agent" || Boolean(value.confirmation));

export async function getOrganizationReception(ownerId: string, organizationId: string) {
  const result = await pool.query(
    "select reception_mode as mode from organizations where id=$1 and owner_id=$2", [organizationId, ownerId]
  );
  return result.rows[0] ?? null;
}

/** Organization lock serializes default changes with first inquiry creation. */
export async function setOrganizationReception(ownerId: string, organizationId: string, mode: "human" | "agent") {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const existing = await connection.query(
      "select reception_mode from organizations where id=$1 and owner_id=$2 for update", [organizationId, ownerId]
    );
    if (!existing.rowCount) { await connection.query("rollback"); return null; }
    if (existing.rows[0].reception_mode !== mode) {
      await connection.query("update organizations set reception_mode=$2,updated_at=now() where id=$1", [organizationId, mode]);
      await connection.query(
        `insert into audit_events (owner_id,organization_id,action,summary,policy_refs)
         values ($1,$2,'organization.reception_changed',$3,$4::jsonb)`,
        [ownerId, organizationId, `企业新咨询默认接待：${mode}`, JSON.stringify([`organization:${organizationId}`])]
      );
    }
    await connection.query("commit");
    return { mode };
  } catch (error) { await connection.query("rollback"); throw error; }
  finally { connection.release(); }
}
