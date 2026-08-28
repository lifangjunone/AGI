PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'standard', 'unattended')),
  view_preference TEXT NOT NULL,
  status TEXT NOT NULL,
  source_document_id TEXT,
  workspace_path TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE stage_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  stage TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(task_id, stage, attempt)
);

CREATE TABLE task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  stage_run_id TEXT NOT NULL REFERENCES stage_runs(id),
  sequence INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  level TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  idempotency_key TEXT NOT NULL,
  UNIQUE(task_id, sequence),
  UNIQUE(task_id, idempotency_key)
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  stage_run_id TEXT NOT NULL REFERENCES stage_runs(id),
  status TEXT NOT NULL,
  decision TEXT,
  comment TEXT,
  requested_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  stage_run_id TEXT REFERENCES stage_runs(id),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_events_task_sequence ON task_events(task_id, sequence);
CREATE INDEX idx_stage_runs_task ON stage_runs(task_id, stage);
