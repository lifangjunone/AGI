ALTER TABLE customer_agent_tasks ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE customer_messages DROP CONSTRAINT IF EXISTS customer_messages_actor_check;
ALTER TABLE customer_messages ADD CONSTRAINT customer_messages_actor_check CHECK (actor IN ('customer','human','agent'));
CREATE TABLE IF NOT EXISTS customer_agent_outputs (
  task_id uuid PRIMARY KEY REFERENCES customer_agent_tasks(id) ON DELETE CASCADE,
  message_id uuid UNIQUE REFERENCES customer_messages(id) ON DELETE CASCADE,
  outcome text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  model jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
