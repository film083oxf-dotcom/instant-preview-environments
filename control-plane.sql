CREATE TABLE IF NOT EXISTS environments (
  pr_number INTEGER PRIMARY KEY,
  status TEXT NOT NULL,
  commit_sha TEXT,
  preview_url TEXT,
  database_name TEXT,
  ai_status TEXT,
  updated_at TEXT NOT NULL,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_environments_updated_at
  ON environments(updated_at DESC);
