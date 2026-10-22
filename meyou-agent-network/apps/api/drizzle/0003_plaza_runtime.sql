CREATE TABLE "plaza_runtime_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "mode" text DEFAULT 'controlled' NOT NULL,
  "active_from" text DEFAULT '09:00' NOT NULL,
  "active_until" text DEFAULT '22:00' NOT NULL,
  "daily_limit" integer DEFAULT 8 NOT NULL,
  "cooldown_minutes" integer DEFAULT 120 NOT NULL,
  "allowed_activities" jsonb DEFAULT '["walking","looking","idle","chatting","business","dating"]'::jsonb NOT NULL,
  "actions_today" integer DEFAULT 0 NOT NULL,
  "usage_date" text DEFAULT '' NOT NULL,
  "last_autonomous_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plaza_runtime_settings" ADD CONSTRAINT "plaza_runtime_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
