import { z } from "zod";
import { pool } from "./db/client.js";

export const knowledgeCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(50000),
  active: z.boolean().default(true)
}).strict();
export const knowledgeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().trim().min(1).max(50000).optional(),
  active: z.boolean().optional(),
  revision: z.string().datetime()
}).strict().refine(value => value.title !== undefined || value.content !== undefined || value.active !== undefined,
  "update_required");

export const knowledgeListSchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

export const knowledgeSourceCheckSchema = z.object({
  sources: z.array(z.object({
    documentId: z.string().uuid(), revision: z.string().datetime()
  }).strict()).min(1).max(8)
}).strict();

export async function checkKnowledgeSources(
  ownerId: string, organizationId: string, sources: z.infer<typeof knowledgeSourceCheckSchema>["sources"]
) {
  const organization = await pool.query(
    "select id from organizations where id=$1 and owner_id=$2", [organizationId, ownerId]
  );
  if (!organization.rowCount) return null;
  const current = await pool.query(
    `select id,to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as revision
     from knowledge_documents where organization_id=$1 and active=true and id=any($2::uuid[])`,
    [organizationId, sources.map(source => source.documentId)]
  );
  return { valid: sources.every(source => current.rows.some(row =>
    row.id === source.documentId && row.revision === source.revision)) };
}

export async function listOrganizationKnowledge(
  ownerId: string, organizationId: string, input = knowledgeListSchema.parse({})
) {
  const organization = await pool.query(
    "select id from organizations where id=$1 and owner_id=$2", [organizationId, ownerId]
  );
  if (!organization.rowCount) return null;
  if (input.before) {
    const cursor = await pool.query(
      "select id from knowledge_documents where id=$1 and organization_id=$2", [input.before, organizationId]
    );
    if (!cursor.rowCount) throw new Error("invalid_knowledge_cursor");
  }
  const result = await pool.query(
    `select id,title,active,created_at as "createdAt",updated_at as "updatedAt",
     to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as revision
     from knowledge_documents where organization_id=$1
     ${input.before ? "and (created_at,id) < (select created_at,id from knowledge_documents where id=$3 and organization_id=$1)" : ""}
     order by created_at desc,id desc limit $2`,
    input.before ? [organizationId, input.limit + 1, input.before] : [organizationId, input.limit + 1]
  );
  const documents = result.rows.slice(0, input.limit);
  return { documents, nextCursor: result.rows.length > input.limit ? documents.at(-1)!.id as string : null };
}

export async function getOrganizationKnowledgeDocument(ownerId: string, organizationId: string, id: string) {
  const result = await pool.query(
    `select d.id,d.title,d.content,d.active,d.updated_at as "updatedAt",
       to_char(d.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as revision
     from knowledge_documents d join organizations o on o.id=d.organization_id
     where d.id=$1 and d.organization_id=$2 and o.owner_id=$3`, [id, organizationId, ownerId]
  );
  return result.rows[0] ?? null;
}

export async function mutateOrganizationKnowledge(
  ownerId: string, organizationId: string,
  operation: { kind: "create"; input: z.infer<typeof knowledgeCreateSchema> }
    | { kind: "update"; id: string; input: z.infer<typeof knowledgeUpdateSchema> }
    | { kind: "delete"; id: string; revision: string }
) {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    // Serializes authorization changes and document operations for this organization.
    const organization = await connection.query(
      "select id from organizations where id=$1 and owner_id=$2 for update", [organizationId, ownerId]
    );
    if (!organization.rowCount) {
      await connection.query("rollback");
      return null;
    }
    let documentId: string;
    if (operation.kind === "create") {
      const result = await connection.query(
        `insert into knowledge_documents (organization_id,title,content,active)
         values ($1,$2,$3,$4) returning id`,
        [organizationId, operation.input.title, operation.input.content, operation.input.active]
      );
      documentId = result.rows[0].id;
    } else {
      const document = await connection.query(
        "select * from knowledge_documents where id=$1 and organization_id=$2 for update",
        [operation.id, organizationId]
      );
      if (!document.rowCount) throw new Error("knowledge_not_found");
      const revision = operation.kind === "update" ? operation.input.revision : operation.revision;
      // Compare in PostgreSQL to retain microsecond precision.
      const current = await connection.query(
        "select id from knowledge_documents where id=$1 and updated_at=$2::timestamptz",
        [operation.id, revision]
      );
      if (!current.rowCount) throw new Error("knowledge_conflict");
      documentId = operation.id;
      if (operation.kind === "delete") {
        await connection.query("delete from knowledge_documents where id=$1", [documentId]);
      } else {
        const row = document.rows[0];
        await connection.query(
          `update knowledge_documents set title=$2,content=$3,active=$4,
           updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=$1`,
          [documentId, operation.input.title ?? row.title, operation.input.content ?? row.content,
            operation.input.active ?? row.active]
        );
      }
    }
    // No document body or secrets in audit records.
    await connection.query(
      `insert into audit_events (owner_id,organization_id,action,summary,policy_refs)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [ownerId, organizationId, `knowledge.${operation.kind}`, `企业知识文档操作：${operation.kind}`,
        JSON.stringify([`knowledge:${documentId}`])]
    );
    await connection.query("commit");
    return { id: documentId };
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally { connection.release(); }
}
