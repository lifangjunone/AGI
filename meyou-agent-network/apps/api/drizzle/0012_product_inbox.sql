CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "agent_mode" "agent_mode" DEFAULT 'auto' NOT NULL,
  "state" text DEFAULT 'active' NOT NULL,
  "last_read_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_participants_conversation_id_user_id_pk"
    PRIMARY KEY("conversation_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "message_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "content" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "source_message_id" uuid REFERENCES "messages"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "reported_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE set null,
  "reason" text NOT NULL,
  "detail" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

INSERT INTO "conversation_participants" ("conversation_id", "user_id", "agent_mode", "state", "last_read_at")
SELECT "id", "owner_id", "agent_mode", 'active', "created_at" FROM "conversations"
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;

INSERT INTO "conversation_participants" ("conversation_id", "user_id", "agent_mode", "state", "last_read_at")
SELECT "id", "peer_id", "agent_mode", 'active', "created_at" FROM "conversations" WHERE "peer_id" IS NOT NULL
ON CONFLICT ("conversation_id", "user_id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "conversation_participants_user_idx"
ON "conversation_participants"("user_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "message_drafts_owner_status_idx"
ON "message_drafts"("owner_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "reports_status_idx"
ON "reports"("status", "created_at" DESC);
