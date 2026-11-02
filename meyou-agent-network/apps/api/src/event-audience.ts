import { pool } from "./db/client.js";

/** null means all authenticated users; an empty set means nobody. Fail closed. */
export async function eventAudience(event: Record<string, unknown>): Promise<Set<string> | null> {
  if (event.type === "conversation.message" && typeof event.conversationId === "string") {
    const result = await pool.query(
      "select owner_id,peer_id from conversations where id=$1", [event.conversationId]
    );
    return new Set(result.rows.flatMap(row => [row.owner_id, row.peer_id].filter(Boolean)));
  }
  if (String(event.type).startsWith("society.") && typeof event.proposalId === "string") {
    const result = await pool.query(
      "select actor_id,target_user_id from society_proposals where id=$1", [event.proposalId]
    );
    return new Set(result.rows.flatMap(row => [row.actor_id, row.target_user_id].filter(Boolean)));
  }
  if (String(event.type).startsWith("plaza.") && typeof event.circleId === "string") {
    const result = await pool.query(
      `select c.visibility,c.owner_id,m.user_id from plaza_circles c
       left join memberships m on m.community_id=c.community_id where c.id=$1 and c.active=true`,
      [event.circleId]
    );
    if (result.rows[0]?.visibility === "public") return null;
    return new Set(result.rows.flatMap(row => [row.owner_id, row.user_id].filter(Boolean)));
  }
  // Unscoped presence updates may reveal a private circle's membership. Owner only.
  if (event.type === "plaza.presence" && typeof event.userId === "string") return new Set([event.userId]);
  return new Set();
}
