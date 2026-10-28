CREATE TABLE IF NOT EXISTS "society_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "paused" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "society_relationships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_low_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "user_high_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "stage" text DEFAULT 'stranger' NOT NULL,
  "interaction_count" integer DEFAULT 0 NOT NULL,
  "reciprocity" integer DEFAULT 0 NOT NULL,
  "trust" integer DEFAULT 0 NOT NULL,
  "affinity" integer DEFAULT 0 NOT NULL,
  "evidence_summary" text DEFAULT '' NOT NULL,
  "last_interaction_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "society_relationship_pair_idx" UNIQUE("user_low_id","user_high_id"),
  CONSTRAINT "society_relationship_no_self" CHECK ("user_low_id" <> "user_high_id")
);
CREATE TABLE IF NOT EXISTS "society_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "target_user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "title" text NOT NULL,
  "reason" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "decided_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "decided_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "digital_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "stage" text DEFAULT 'newborn' NOT NULL,
  "digital" boolean DEFAULT true NOT NULL,
  "paused" boolean DEFAULT false NOT NULL,
  "origin_proposal_id" uuid NOT NULL UNIQUE REFERENCES "society_proposals"("id") ON DELETE restrict,
  "inherited_summary" text DEFAULT '' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "digital_agent_guardians" (
  "digital_agent_id" uuid NOT NULL REFERENCES "digital_agents"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" text DEFAULT 'guardian' NOT NULL,
  "can_manage" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY("digital_agent_id","user_id")
);
CREATE TABLE IF NOT EXISTS "digital_learning_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "digital_agent_id" uuid NOT NULL REFERENCES "digital_agents"("id") ON DELETE cascade,
  "recorded_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "skill" text NOT NULL,
  "evidence" text NOT NULL,
  "source" text NOT NULL,
  "score" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "society_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "peer_id" uuid REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "summary" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "society_events_owner_created_idx" ON "society_events"("owner_id","created_at" DESC);
CREATE INDEX IF NOT EXISTS "digital_learning_agent_idx" ON "digital_learning_events"("digital_agent_id","created_at" DESC);
