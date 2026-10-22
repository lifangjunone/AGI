CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS model_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  name text NOT NULL, kind text NOT NULL, base_url text NOT NULL,
  encrypted_api_key text NOT NULL DEFAULT '', key_hint text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS model_providers_tenant_idx ON model_providers (tenant_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  provider_id uuid NOT NULL REFERENCES model_providers(id), name text NOT NULL,
  upstream_model text NOT NULL, modality text NOT NULL DEFAULT 'text',
  context_window integer NOT NULL DEFAULT 0,
  input_price_per_mtok numeric(12,6) NOT NULL DEFAULT 0,
  output_price_per_mtok numeric(12,6) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, provider_id, upstream_model)
);
CREATE INDEX IF NOT EXISTS model_catalog_tenant_idx ON model_catalog (tenant_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS model_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  name text NOT NULL, alias text NOT NULL, model_id uuid NOT NULL REFERENCES model_catalog(id),
  strategy text NOT NULL DEFAULT 'primary', enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, alias)
);
CREATE TABLE IF NOT EXISTS model_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  route_id uuid NOT NULL, model_id uuid NOT NULL, provider_id uuid NOT NULL,
  caller_id uuid NOT NULL, request_id text NOT NULL, status text NOT NULL,
  latency_ms integer NOT NULL, input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0, cost_usd numeric(14,8) NOT NULL DEFAULT 0,
  error_code text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_invocations_tenant_time_idx ON model_invocations (tenant_id, created_at DESC);
