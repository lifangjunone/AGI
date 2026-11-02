import { pool } from "./db/client.js";

export async function recordCustomerWorkerHeartbeat() {
  await pool.query(
    `insert into service_heartbeats (service,seen_at) values ('customer-agent-worker',now())
     on conflict (service) do update set seen_at=excluded.seen_at`
  );
}

export async function customerWorkerAvailable() {
  if (process.env.CUSTOMER_AGENT_ENABLED !== "true") return false;
  const result = await pool.query(
    `select exists(select 1 from service_heartbeats
     where service='customer-agent-worker' and seen_at>now()-interval '30 seconds') as available`
  );
  return result.rows[0]?.available === true;
}
