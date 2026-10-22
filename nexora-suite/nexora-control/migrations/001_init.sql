CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS managed_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, external_id text,
  name text NOT NULL, source text NOT NULL, version text NOT NULL DEFAULT '', endpoint text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', capabilities jsonb NOT NULL DEFAULT '[]', manifest jsonb NOT NULL DEFAULT '{}',
  owner_id uuid NOT NULL, last_heartbeat timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, source, external_id)
);
CREATE INDEX IF NOT EXISTS managed_agents_tenant_idx ON managed_agents (tenant_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS agent_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, agent_id uuid NOT NULL REFERENCES managed_agents(id),
  prefix text NOT NULL, secret_hash text NOT NULL, status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, name text NOT NULL,
  effect text NOT NULL, agent_id uuid, environment text NOT NULL DEFAULT '*',
  allowed_callers jsonb NOT NULL DEFAULT '[]', rate_limit_per_minute integer NOT NULL DEFAULT 60,
  enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invocation_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, agent_id uuid NOT NULL,
  version text NOT NULL, caller_id uuid NOT NULL, status text NOT NULL, request_id text NOT NULL,
  latency_ms integer NOT NULL, input_tokens integer NOT NULL, output_tokens integer NOT NULL,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traces_tenant_time_idx ON invocation_traces (tenant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS consumed_events (
  event_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, event_type text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);
