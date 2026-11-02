CREATE TABLE IF NOT EXISTS service_heartbeats (
  service text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
