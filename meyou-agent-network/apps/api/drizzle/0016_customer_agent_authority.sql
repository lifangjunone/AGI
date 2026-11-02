ALTER TABLE customer_threads ADD COLUMN IF NOT EXISTS agent_mode text NOT NULL DEFAULT 'paused';
ALTER TABLE customer_threads ADD COLUMN IF NOT EXISTS agent_revision integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS customer_agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES customer_threads(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  authority_revision integer NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','completed','cancelled','failed')),
  attempts integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id,source_id,authority_revision)
);
CREATE INDEX IF NOT EXISTS customer_agent_tasks_pending ON customer_agent_tasks(state,created_at);
