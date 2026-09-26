CREATE TABLE IF NOT EXISTS preview_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  preview_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0
);
