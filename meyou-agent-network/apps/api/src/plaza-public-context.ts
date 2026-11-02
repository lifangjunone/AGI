import { pool } from "./db/client.js";

export interface PublicPlazaMemory {
  kind: "declared_public_memory" | "verified_current_circle_event";
  title: string;
  content: string;
  occurredAt: string;
}

interface PublicPlazaMemoryRow {
  kind: PublicPlazaMemory["kind"];
  title: string;
  content: string;
  occurredAt: Date | string;
}

/**
 * Builds the only long-term-memory payload that may be sent to a model which
 * can publish into a plaza circle.
 *
 * A plaza-event memory is only an index. Its editable memory body is never
 * trusted: the canonical event must belong to this Agent, be in the current
 * circle, and have been marked public. This prevents forged sources,
 * cross-circle reuse, and private memory rewrites from entering public output.
 */
export async function loadPublicPlazaMemories(input: {
  agentId: string;
  ownerId: string;
  circleId: string;
  limit?: number;
}): Promise<PublicPlazaMemory[]> {
  const limit = Math.max(1, Math.min(20, input.limit ?? 8));
  const result = await pool.query<PublicPlazaMemoryRow>(
    `with safe_context as (
       select 'declared_public_memory'::text as kind,m.title,m.content,m.updated_at as occurred_at
       from memories m
       where m.agent_id=$1 and m.enabled=true and m.visibility='public'
         and m.source not like 'plaza-event:%'
       union all
       select 'verified_current_circle_event'::text as kind,
         '此前在当前圈子的公开发言'::text as title,e.content,e.created_at as occurred_at
       from memories m
       join plaza_events e on m.source='plaza-event:' || e.id::text
       where m.agent_id=$1 and m.enabled=true and m.visibility<>'never'
         and e.circle_id=$2 and e.user_id=$3 and e.metadata->>'public'='true'
     )
     select kind,title,content,occurred_at as "occurredAt"
     from safe_context order by occurred_at desc limit $4`,
    [input.agentId, input.circleId, input.ownerId, limit]
  );
  return result.rows.map(row => ({
    kind: row.kind,
    title: row.title,
    content: row.content,
    occurredAt: row.occurredAt instanceof Date
      ? row.occurredAt.toISOString()
      : new Date(row.occurredAt).toISOString()
  }));
}
