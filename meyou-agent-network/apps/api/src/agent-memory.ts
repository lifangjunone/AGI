import { z } from "zod";
import { pool } from "./db/client.js";

export const memoryListQuery = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const memoryUpdateSchema = z.object({
  visibility: z.enum(["public", "match", "agent", "never"]).optional(),
  enabled: z.boolean().optional()
}).refine(value => value.visibility !== undefined || value.enabled !== undefined);

type MemoryRow = {
  id: string;
  title: string;
  content: string;
  source: string;
  visibility: "public" | "match" | "agent" | "never";
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function publicMemory(row: MemoryRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    sourceType: row.source.startsWith("plaza-event:")
      ? "plaza_event"
      : row.source.startsWith("conversation:")
        ? "conversation"
        : "other",
    visibility: row.visibility,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function listAgentMemories(
  ownerId: string,
  input: z.infer<typeof memoryListQuery>
) {
  if (input.before) {
    const cursor = await pool.query(
      `select m.id from memories m join agents a on a.id=m.agent_id
       where m.id=$1 and a.owner_id=$2`,
      [input.before, ownerId]
    );
    if (!cursor.rowCount) throw new Error("invalid_memory_cursor");
  }
  const values: unknown[] = [ownerId];
  const conditions = ["a.owner_id=$1"];
  if (input.before) {
    values.push(input.before);
    conditions.push(`(m.updated_at,m.id) < (
      select m2.updated_at,m2.id from memories m2 join agents a2 on a2.id=m2.agent_id
      where m2.id=$2 and a2.owner_id=$1
    )`);
  }
  values.push(input.limit + 1);
  const result = await pool.query<MemoryRow>(
    `select m.id,m.title,m.content,m.source,m.visibility,m.enabled,
       m.created_at as "createdAt",m.updated_at as "updatedAt"
     from memories m join agents a on a.id=m.agent_id
     where ${conditions.join(" and ")}
     order by m.updated_at desc,m.id desc limit $${values.length}`,
    values
  );
  const rows = result.rows.slice(0, input.limit);
  const hasMore = result.rows.length > input.limit;
  return {
    memories: rows.map(publicMemory),
    nextCursor: hasMore ? rows.at(-1)!.id : null,
    hasMore
  };
}

export async function updateAgentMemory(
  ownerId: string,
  memoryId: string,
  input: z.infer<typeof memoryUpdateSchema>
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query<MemoryRow>(
      `select m.id,m.title,m.content,m.source,m.visibility,m.enabled,
         m.created_at as "createdAt",m.updated_at as "updatedAt"
       from memories m join agents a on a.id=m.agent_id
       where m.id=$1 and a.owner_id=$2 for update of m`,
      [memoryId, ownerId]
    );
    if (!current.rowCount) {
      await client.query("rollback");
      return null;
    }
    const previous = current.rows[0]!;
    const visibility = input.visibility ?? previous.visibility;
    const enabled = input.enabled ?? previous.enabled;
    const updated = await client.query<MemoryRow>(
      `update memories set visibility=$2,enabled=$3,updated_at=now()
       where id=$1 returning id,title,content,source,visibility,enabled,
       created_at as "createdAt",updated_at as "updatedAt"`,
      [memoryId, visibility, enabled]
    );
    await client.query(
      `insert into audit_events(owner_id,action,summary,policy_refs)
       values($1,'agent.memory_updated',$2,$3::jsonb)`,
      [
        ownerId,
        `更新记忆“${previous.title.slice(0, 80)}”的使用权限`,
        JSON.stringify([
          `memory:${memoryId}`,
          `visibility:${previous.visibility}->${visibility}`,
          `enabled:${previous.enabled}->${enabled}`
        ])
      ]
    );
    await client.query("commit");
    return publicMemory(updated.rows[0]!);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAgentMemory(ownerId: string, memoryId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query<{ id: string; title: string }>(
      `select m.id,m.title from memories m join agents a on a.id=m.agent_id
       where m.id=$1 and a.owner_id=$2 for update of m`,
      [memoryId, ownerId]
    );
    if (!current.rowCount) {
      await client.query("rollback");
      return false;
    }
    await client.query("delete from memories where id=$1", [memoryId]);
    await client.query(
      `insert into audit_events(owner_id,action,summary,policy_refs)
       values($1,'agent.memory_deleted',$2,$3::jsonb)`,
      [
        ownerId,
        `删除记忆“${current.rows[0]!.title.slice(0, 80)}”`,
        JSON.stringify([`memory:${memoryId}`, "user-requested-deletion"])
      ]
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
