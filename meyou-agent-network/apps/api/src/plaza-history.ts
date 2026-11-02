import { z } from "zod";
import { pool } from "./db/client.js";
import type { PlazaSnapshot } from "@meyou/shared";

export const plazaHistoryQuery = z.object({
  circleId: z.string().uuid(),
  before: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  q: z.string().trim().max(120).default(""),
  mode: z.enum(["chat", "activity"]).default("chat"),
  limit: z.coerce.number().int().min(1).max(100).default(40)
});

export const plazaTopicQuery = z.object({
  circleId: z.string().uuid(),
  before: z.string().uuid().optional(),
  q: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

async function requireCircleAccess(viewerId: string, circleId: string) {
  // Check access before cursor resolution or message queries, including private circles.
  const access = await pool.query(
    `select c.id from plaza_circles c where c.id=$1 and c.active=true
     and (c.visibility='public' or c.owner_id=$2 or exists (
       select 1 from memberships m where m.community_id=c.community_id and m.user_id=$2))`,
    [circleId, viewerId]
  );
  if (!access.rowCount) throw new Error("circle_access_denied");
}

export async function listPlazaTopics(viewerId: string, input: z.infer<typeof plazaTopicQuery>) {
  await requireCircleAccess(viewerId, input.circleId);
  if (input.before) {
    const cursor = await pool.query(
      "select root_event_id from plaza_discussions where root_event_id=$1 and circle_id=$2",
      [input.before, input.circleId]
    );
    if (!cursor.rowCount) throw new Error("invalid_history_cursor");
  }
  const params: unknown[] = [input.circleId];
  const conditions = ["d.circle_id=$1"];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (input.before) {
    conditions.push(`(e.created_at,e.id) < (select created_at,id from plaza_events where id=${bind(input.before)})`);
  }
  if (input.q) {
    const query = bind(`%${input.q.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(`(e.content ilike ${query} escape '\\' or u.display_name ilike ${query} escape '\\')`);
  }
  const rows = await pool.query(
    `select d.root_event_id as "rootEventId",d.circle_id as "circleId",
       d.current_round as "currentRound",d.max_rounds as "maxRounds",d.status,
       d.end_reason as "endReason",d.updated_at as "updatedAt",e.created_at as "createdAt",
       e.content as title,u.display_name as "ownerName"
     from plaza_discussions d join plaza_events e on e.id=d.root_event_id
     join users u on u.id=d.initiator_id
     where ${conditions.join(" and ")}
     order by e.created_at desc,e.id desc limit ${bind(input.limit + 1)}`,
    params
  );
  const topics = rows.rows.slice(0, input.limit).map(row => ({
    ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
  }));
  const hasMore = rows.rows.length > input.limit;
  return { topics, nextCursor: hasMore ? topics.at(-1)!.rootEventId as string : null, hasMore };
}

export async function listPlazaHistory(viewerId: string, input: z.infer<typeof plazaHistoryQuery>) {
  await requireCircleAccess(viewerId, input.circleId);
  if (input.before) {
    const cursor = await pool.query("select id from plaza_events where id=$1 and circle_id=$2", [input.before, input.circleId]);
    if (!cursor.rowCount) throw new Error("invalid_history_cursor");
  }
  const params: unknown[] = [input.circleId];
  const conditions = ["e.circle_id=$1"];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (input.before) {
    const cursor = bind(input.before);
    // DB compares its own timestamps, preserving microseconds and timestamp ties.
    conditions.push(`(e.created_at,e.id) < (select created_at,id from plaza_events where id=${cursor})`);
  }
  if (input.mode === "chat") conditions.push("(e.kind in ('chatting','business','dating') or e.metadata->>'humanTopic'='true')");
  if (input.threadId) {
    const thread = bind(input.threadId);
    conditions.push(`(e.id=${thread}::uuid or e.metadata->>'threadRootId'=${thread}::text)`);
  }
  if (input.q) {
    const text = bind(`%${input.q.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(`(e.content ilike ${text} escape '\\' or u.display_name ilike ${text} escape '\\' or a.name ilike ${text} escape '\\')`);
  }
  const limit = bind(input.limit + 1);
  const rows = await pool.query(
    `select e.id,e.circle_id as "circleId",e.user_id as "userId",e.kind,e.content,e.metadata,e.created_at as "createdAt",
      u.display_name as "ownerName",a.name as "agentName"
     from plaza_events e join users u on u.id=e.user_id join agents a on a.owner_id=u.id
     where ${conditions.join(" and ")} order by e.created_at desc,e.id desc limit ${limit}`,
    params
  );
  const hasMore = rows.rows.length > input.limit;
  const events = rows.rows.slice(0, input.limit).map(row => ({
    ...row, createdAt: row.createdAt.toISOString()
  })) as PlazaSnapshot["events"];
  return { events, nextCursor: hasMore ? events.at(-1)!.id : null, hasMore };
}
