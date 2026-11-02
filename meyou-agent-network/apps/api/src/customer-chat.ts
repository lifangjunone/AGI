import { z } from "zod";
import { pool } from "./db/client.js";
import { queueCustomerAgentTask } from "./customer-agent-authority.js";

export const customerMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  requestId: z.string().uuid()
}).strict();

export const customerHistorySchema = z.object({
  before: z.string().uuid().optional(),
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40)
}).refine(value => !(value.before && value.after), { message: "Choose one cursor direction" });

export async function readCustomerChat(
  viewerId: string, threadId: string, audience: "customer" | "owner", input = customerHistorySchema.parse({})
) {
  const result = await pool.query(
    `select t.id,t.subject,t.status,t.agent_mode,t.customer_id,o.owner_id,o.handle,o.name
     from customer_threads t join organizations o on o.id=t.organization_id
     where t.id=$1 and ${audience === "customer" ? "t.customer_id" : "o.owner_id"}=$2`,
    [threadId, viewerId]
  );
  const thread = result.rows[0];
  if (!thread) return null;
  const cursorId = input.before ?? input.after;
  if (cursorId) {
    const cursor = await pool.query(
      "select id from customer_messages where id=$1 and thread_id=$2", [cursorId, threadId]
    );
    if (!cursor.rowCount) throw new Error("invalid_customer_cursor");
  }
  const messages = await pool.query(
    `select id,actor,content,created_at as "createdAt" from customer_messages where thread_id=$1
     ${cursorId ? `and (created_at,id) ${input.after ? ">" : "<"} (select created_at,id from customer_messages where id=$3 and thread_id=$1)` : ""}
     order by created_at ${input.after ? "asc" : "desc"},id ${input.after ? "asc" : "desc"} limit $2`,
    cursorId ? [threadId, input.limit + 1, cursorId] : [threadId, input.limit + 1]
  );
  const page = messages.rows.slice(0, input.limit);
  if (audience === "owner" && page.some(message => message.actor === "agent")) {
    const traces = await pool.query(
      `select task_id as "taskId",message_id as "messageId",sources,model
       from customer_agent_outputs where message_id=any($1::uuid[])`,
      [page.filter(message => message.actor === "agent").map(message => message.id)]
    );
    for (const message of page) {
      const trace = traces.rows.find(row => row.messageId === message.id);
      if (trace) message.trace = { taskId: trace.taskId, sources: trace.sources, model: trace.model };
    }
  }
  const nextCursor = messages.rows.length > input.limit ? page.at(-1)!.id as string : null;
  return {
    thread: { id: thread.id, subject: thread.subject, status: thread.status, agentMode: thread.agent_mode ?? "paused",
      companyName: thread.name, companyHandle: thread.handle },
    messages: input.after ? page : page.reverse(),
    nextCursor: input.after ? null : nextCursor,
    nextAfterCursor: input.after ? nextCursor : null
  };
}

export const customerDirectorySchema = z.object({
  handle: z.string().min(1).max(80),
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export async function listCustomerChats(
  customerId: string, handle: string, input: { limit: number; before?: string } = { limit: 20 }
) {
  if (input.before) {
    const cursor = await pool.query(
      `select t.id from customer_threads t join organizations o on o.id=t.organization_id
       where t.id=$1 and t.customer_id=$2 and o.handle=$3`, [input.before, customerId, handle]
    );
    if (!cursor.rowCount) throw new Error("invalid_customer_cursor");
  }
  const result = await pool.query(
    `select t.id,t.subject,t.status,t.updated_at as "updatedAt",t.created_at as "createdAt"
     from customer_threads t join organizations o on o.id=t.organization_id
     where t.customer_id=$1 and o.handle=$2
     ${input.before ? "and (t.created_at,t.id) < (select created_at,id from customer_threads where id=$4 and customer_id=$1)" : ""}
     order by t.created_at desc,t.id desc limit $3`,
    input.before ? [customerId, handle, input.limit + 1, input.before] : [customerId, handle, input.limit + 1]
  );
  const threads = result.rows.slice(0, input.limit);
  return { threads, nextCursor: result.rows.length > input.limit ? threads.at(-1)!.id as string : null };
}

export async function sendCustomerChat(
  viewerId: string, threadId: string, audience: "customer" | "owner",
  input: z.infer<typeof customerMessageSchema>
) {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const result = await connection.query(
      `select t.id,t.status,t.agent_mode,t.agent_revision,t.customer_id,t.organization_id,o.owner_id,o.handle
       from customer_threads t join organizations o on o.id=t.organization_id
       where t.id=$1 and ${audience === "customer" ? "t.customer_id" : "o.owner_id"}=$2 for update of t`,
      [threadId, viewerId]
    );
    const thread = result.rows[0];
    if (!thread) { await connection.query("rollback"); return null; }
    const existing = await connection.query(
      "select id,content from customer_messages where thread_id=$1 and sender_id=$2 and request_id=$3",
      [threadId, viewerId, input.requestId]
    );
    if (existing.rowCount) {
      if (existing.rows[0].content !== input.content) throw new Error("message_request_conflict");
      await connection.query("commit");
      return { id: existing.rows[0].id as string, delivery: "delivered" as const, duplicate: true };
    }
    if (thread.status === "resolved") throw new Error("customer_thread_resolved");
    if (!thread.customer_id) throw new Error("customer_reply_channel_unavailable");
    const inserted = await connection.query(
      `insert into customer_messages (thread_id,sender_id,actor,content,request_id)
       values ($1,$2,$3,$4,$5) returning id`,
      [threadId, viewerId, audience === "customer" ? "customer" : "human", input.content, input.requestId]
    );
    await connection.query(
      "update customer_threads set updated_at=now(),status=$2 where id=$1",
      [threadId, audience === "owner" ? "active" : thread.status]
    );
    if (audience === "customer") await queueCustomerAgentTask(connection, thread, inserted.rows[0].id);
    else {
      // A human response is also an explicit takeover. Invalidate every in-flight generation.
      await connection.query(
        "update customer_threads set agent_mode='paused',agent_revision=agent_revision+1 where id=$1", [threadId]
      );
      await connection.query(
        "update customer_agent_tasks set state='cancelled',updated_at=now() where thread_id=$1 and state in ('pending','running')",
        [threadId]
      );
    }
    const recipientId = audience === "owner" ? thread.customer_id : thread.owner_id;
    const href = audience === "owner"
      ? `/company/${thread.handle}?thread=${threadId}` : `/app/customers?thread=${threadId}`;
    await connection.query(
      `insert into notifications (owner_id,kind,title,detail,href,entity_id)
       values ($1,'customer_message_received','企业会话收到新消息',$2,$3,$4)`,
      [recipientId, input.content.slice(0, 160), href, inserted.rows[0].id]
    );
    await connection.query(
      `insert into audit_events (owner_id,organization_id,action,summary,policy_refs)
       values ($1,$2,'customer.message_sent','真人企业会话消息已发送',$3::jsonb)`,
      [thread.owner_id, thread.organization_id, JSON.stringify([`customer:${threadId}`, `message:${inserted.rows[0].id}`])]
    );
    await connection.query("commit");
    return { id: inserted.rows[0].id as string, delivery: "delivered" as const, duplicate: false };
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally { connection.release(); }
}
