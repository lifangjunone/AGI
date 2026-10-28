ALTER TABLE "plaza_runtime_settings"
ADD COLUMN IF NOT EXISTS "max_conversation_rounds" integer DEFAULT 4 NOT NULL;

CREATE TABLE IF NOT EXISTS "plaza_discussions" (
  "root_event_id" uuid PRIMARY KEY NOT NULL,
  "circle_id" uuid NOT NULL,
  "initiator_id" uuid NOT NULL,
  "last_event_id" uuid,
  "current_round" integer DEFAULT 0 NOT NULL,
  "max_rounds" integer DEFAULT 4 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "end_reason" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plaza_discussions_root_event_id_plaza_events_id_fk" FOREIGN KEY ("root_event_id") REFERENCES "public"."plaza_events"("id") ON DELETE cascade,
  CONSTRAINT "plaza_discussions_circle_id_plaza_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."plaza_circles"("id") ON DELETE cascade,
  CONSTRAINT "plaza_discussions_initiator_id_users_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "plaza_discussions_last_event_id_plaza_events_id_fk" FOREIGN KEY ("last_event_id") REFERENCES "public"."plaza_events"("id") ON DELETE set null
);

CREATE TABLE IF NOT EXISTS "plaza_relationships" (
  "owner_id" uuid NOT NULL,
  "peer_id" uuid NOT NULL,
  "familiarity" integer DEFAULT 0 NOT NULL,
  "trust" integer DEFAULT 0 NOT NULL,
  "affinity" integer DEFAULT 0 NOT NULL,
  "interactions" integer DEFAULT 0 NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "last_interaction_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plaza_relationships_owner_id_peer_id_pk" PRIMARY KEY("owner_id","peer_id"),
  CONSTRAINT "plaza_relationships_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "plaza_relationships_peer_id_users_id_fk" FOREIGN KEY ("peer_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "plaza_relationships_no_self" CHECK ("owner_id" <> "peer_id")
);

CREATE TABLE IF NOT EXISTS "agent_skills" (
  "agent_id" uuid NOT NULL,
  "name" text NOT NULL,
  "experience" integer DEFAULT 0 NOT NULL,
  "evidence_count" integer DEFAULT 0 NOT NULL,
  "last_evidence" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_skills_agent_id_name_pk" PRIMARY KEY("agent_id","name"),
  CONSTRAINT "agent_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade
);
