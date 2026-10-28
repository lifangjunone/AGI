CREATE SCHEMA IF NOT EXISTS runtime;

CREATE TABLE IF NOT EXISTS runtime.runtime_profiles (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name text NOT NULL,
  adapter_id text NOT NULL,
  endpoint text NOT NULL,
  deployment_mode text NOT NULL,
  credential_ref text,
  permission_profile text NOT NULL,
  status text NOT NULL,
  package_id text,
  desired_version text,
  current_version text,
  previous_version text,
  deployment_status text,
  last_deployment_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_profiles_tenant_status_idx
  ON runtime.runtime_profiles (tenant_id, status);

CREATE TABLE IF NOT EXISTS runtime.runtime_deployments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  profile_id text NOT NULL,
  package_id text NOT NULL,
  version text NOT NULL,
  previous_version text,
  status text NOT NULL,
  stage text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime.tasks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  profile_id text NOT NULL,
  status text NOT NULL,
  input text NOT NULL,
  model_route text,
  trace_id text NOT NULL,
  permission_profile text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  latency_ms bigint
);

CREATE INDEX IF NOT EXISTS runtime_tasks_tenant_started_idx
  ON runtime.tasks (tenant_id, started_at DESC);
