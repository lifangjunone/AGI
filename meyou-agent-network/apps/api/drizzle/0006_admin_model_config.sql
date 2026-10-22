CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL,
  "email" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE IF NOT EXISTS "model_configurations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text DEFAULT 'ark' NOT NULL,
  "base_url" text NOT NULL,
  "model_id" text NOT NULL,
  "api_key_encrypted" text NOT NULL,
  "thinking_enabled" boolean DEFAULT true NOT NULL,
  "timeout_ms" integer DEFAULT 1800000 NOT NULL,
  "temperature_milli" integer DEFAULT 350 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
