import type { PoolClient } from "pg";

/** Caller must already hold the customer thread row lock in the same transaction. */
export async function queueCustomerAgentTask(
  connection: Pick<PoolClient, "query">, thread: { id: string; agent_mode: string; agent_revision: number; status: string },
  sourceId: string
) {
  if (thread.agent_mode !== "auto" || thread.status === "resolved") return false;
  await connection.query(
    `insert into customer_agent_tasks (thread_id,source_id,authority_revision)
     values ($1,$2,$3) on conflict (thread_id,source_id,authority_revision) do nothing`,
    [thread.id, sourceId, thread.agent_revision]
  );
  return true;
}
