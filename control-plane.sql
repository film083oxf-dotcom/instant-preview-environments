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

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects(status);

INSERT OR IGNORE INTO projects (
  project_id, repo_full_name, name, status, created_at, updated_at
) VALUES (
  'instant-preview-environments',
  'film083oxf-dotcom/instant-preview-environments',
  'Instant Preview Environments',
  'active',
  datetime('now'),
  datetime('now')
);

CREATE TABLE IF NOT EXISTS project_memberships (
  project_id TEXT NOT NULL,
  github_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  granted_by TEXT,
  PRIMARY KEY (project_id, github_id)
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_status
  ON project_memberships(project_id, status);

CREATE INDEX IF NOT EXISTS idx_project_memberships_github
  ON project_memberships(github_id);

INSERT OR IGNORE INTO project_memberships (
  project_id, github_id, status, created_at, updated_at, granted_by
)
SELECT
  'instant-preview-environments',
  github_id,
  status,
  created_at,
  updated_at,
  COALESCE(granted_by, 'migration:phase7')
FROM memberships;

CREATE TABLE IF NOT EXISTS project_environments (
  project_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  commit_sha TEXT,
  preview_url TEXT,
  database_name TEXT,
  ai_status TEXT,
  updated_at TEXT NOT NULL,
  last_error TEXT,
  PRIMARY KEY (project_id, pr_number),
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_environments_updated_at
  ON project_environments(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_environments_status
  ON project_environments(project_id, status);



CREATE TABLE IF NOT EXISTS database_branches (
  project_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  provider TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  database_name TEXT,
  commit_sha TEXT,
  status TEXT NOT NULL CHECK (status IN ('PROVISIONING','READY','DELETING','DELETED','FAILED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, pr_number, provider),
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_database_branches_status
  ON database_branches(project_id, status);

CREATE INDEX IF NOT EXISTS idx_database_branches_branch_id
  ON database_branches(provider, branch_id);

CREATE TABLE IF NOT EXISTS project_quotas (
  project_id TEXT PRIMARY KEY,
  max_active_environments INTEGER NOT NULL DEFAULT 10 CHECK (max_active_environments >= 1),
  max_active_databases INTEGER NOT NULL DEFAULT 10 CHECK (max_active_databases >= 1),
  max_concurrent_builds INTEGER NOT NULL DEFAULT 3 CHECK (max_concurrent_builds >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

INSERT OR IGNORE INTO project_quotas (
  project_id, max_active_environments, max_active_databases, max_concurrent_builds, created_at, updated_at
) VALUES (
  'instant-preview-environments', 10, 10, 3, datetime('now'), datetime('now')
);

CREATE TABLE IF NOT EXISTS project_resource_reservations (
  project_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  reservation_type TEXT NOT NULL CHECK (reservation_type IN ('preview_environment')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (project_id, pr_number),
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_resource_reservations_expiry
  ON project_resource_reservations(project_id, expires_at);

INSERT OR IGNORE INTO project_environments (
  project_id, pr_number, status, commit_sha, preview_url, database_name, ai_status, updated_at, last_error
)
SELECT
  'instant-preview-environments',
  pr_number,
  status,
  commit_sha,
  preview_url,
  database_name,
  ai_status,
  updated_at,
  last_error
FROM environments;
