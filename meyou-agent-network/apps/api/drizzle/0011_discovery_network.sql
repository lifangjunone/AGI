ALTER TABLE "search_missions"
ADD COLUMN IF NOT EXISTS "next_run_at" timestamptz DEFAULT now() NOT NULL;
ALTER TABLE "search_missions"
ADD COLUMN IF NOT EXISTS "scan_interval_minutes" integer DEFAULT 60 NOT NULL;

ALTER TABLE "match_candidates"
ADD COLUMN IF NOT EXISTS "owner_agent_approved" boolean DEFAULT false NOT NULL;
ALTER TABLE "match_candidates"
ADD COLUMN IF NOT EXISTS "candidate_agent_approved" boolean DEFAULT false NOT NULL;
ALTER TABLE "match_candidates"
ADD COLUMN IF NOT EXISTS "candidate_agent_reason" text DEFAULT '' NOT NULL;
ALTER TABLE "match_candidates"
ADD COLUMN IF NOT EXISTS "introduction_status" text DEFAULT 'not_started' NOT NULL;
ALTER TABLE "match_candidates"
ADD COLUMN IF NOT EXISTS "conversation_id" uuid;

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "detail" text NOT NULL,
  "href" text DEFAULT '/app' NOT NULL,
  "entity_id" text,
  "read_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notifications_owner_created_idx"
ON "notifications"("owner_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "search_missions_due_idx"
ON "search_missions"("active", "next_run_at");
