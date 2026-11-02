CREATE TABLE IF NOT EXISTS customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES customer_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  actor text NOT NULL CHECK (actor IN ('customer','human')),
  content text NOT NULL,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id,sender_id,request_id)
);
CREATE INDEX IF NOT EXISTS customer_messages_thread_time ON customer_messages(thread_id,created_at,id);
