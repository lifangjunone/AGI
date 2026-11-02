import { randomUUID } from "node:crypto";
import { pool } from "./db/client.js";

export interface CustomerAgentTask {
  id: string; thread_id: string; source_id: string; authority_revision: number; lease_token: string;
}

/** Serialize claims on the same thread lock used by messages and human takeover. */
export async function claimCustomerAgentTask(taskId: string): Promise<CustomerAgentTask | null> {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const thread = await connection.query(
      `select t.id from customer_threads t join customer_agent_tasks j on j.thread_id=t.id
       where j.id=$1 for update of t`, [taskId]
    );
    if (!thread.rowCount) { await connection.query("rollback"); return null; }
    const active = await connection.query(
      `select id from customer_agent_tasks where thread_id=$1 and id<>$2
       and state='running' and lease_until>now() limit 1`, [thread.rows[0].id, taskId]
    );
    if (active.rowCount) { await connection.query("commit"); return null; }
    const claimed = await connection.query(
      `update customer_agent_tasks set state='running',attempts=attempts+1,lease_token=$2,
       lease_until=now()+interval '35 minutes',updated_at=now()
       where id=$1 and (state='pending' or (state='running' and lease_until<now()))
       returning *`, [taskId, randomUUID()]
    );
    await connection.query("commit");
    return claimed.rows[0] ?? null;
  } catch (error) { await connection.query("rollback"); throw error; }
  finally { connection.release(); }
}
