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

CREATE TABLE IF NOT EXISTS users (
  github_id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tickets (
  ticket_hash TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL,
  github_login TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_tickets_expires_at
  ON auth_tickets(expires_at);

CREATE TABLE IF NOT EXISTS memberships (
  github_id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  granted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_memberships_status
  ON memberships(status);

CREATE INDEX IF NOT EXISTS idx_memberships_role
  ON memberships(role);
