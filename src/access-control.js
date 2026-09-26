const PLATFORM_ROLE_VALUES = ["admin", "member"];
const PROJECT_ID = "instant-preview-environments";

export async function getMembership(db, githubId) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  return db.prepare(
    "SELECT github_id, role, status, created_at, updated_at, granted_by FROM memberships WHERE github_id = ?"
  ).bind(Number(githubId)).first();
}

export async function ensureOwnerMembership(db, user, githubRepo) {
  if (!db || !user || !githubRepo) return null;

  const owner = String(githubRepo).split("/")[0]?.trim().toLowerCase();
  const login = String(user.login || "").trim().toLowerCase();

  if (!owner || !login || owner !== login) {
    return getMembership(db, user.githubId);
  }

  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO memberships (github_id, role, status, created_at, updated_at, granted_by) VALUES (?, 'admin', 'active', ?, ?, ?) " +
    "ON CONFLICT(github_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ?"
  ).bind(
    Number(user.githubId),
    now,
    now,
    "bootstrap:repo-owner",
    now
  ).run();

  return getMembership(db, user.githubId);
}

export async function getProjectById(db, projectId) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  return db.prepare(
    "SELECT project_id, repo_full_name, name, status, created_at, updated_at FROM projects WHERE project_id = ?"
  ).bind(String(projectId)).first();
}

export async function listAccessibleProjects(db, githubId, role) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  if (role === "admin") {
    const { results } = await db.prepare(
      "SELECT project_id, repo_full_name, name, status, created_at, updated_at FROM projects WHERE status = 'active' ORDER BY LOWER(name)"
    ).all();
    return results || [];
  }

  const { results } = await db.prepare(
    "SELECT p.project_id, p.repo_full_name, p.name, p.status, p.created_at, p.updated_at " +
    "FROM projects p INNER JOIN project_memberships pm ON pm.project_id = p.project_id " +
    "WHERE p.status = 'active' AND pm.github_id = ? AND pm.status = 'active' " +
    "ORDER BY LOWER(p.name)"
  ).bind(Number(githubId)).all();

  return results || [];
}

export async function getProject(db, repoFullName) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  const row = await db.prepare(
    "SELECT project_id, repo_full_name, name, status, created_at, updated_at FROM projects WHERE repo_full_name = ?"
  ).bind(String(repoFullName)).first();

  if (row) return row;

  const projectId = projectIdForRepo(repoFullName);
  const now = new Date().toISOString();

  await db.prepare(
    "INSERT INTO projects (project_id, repo_full_name, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?) " +
    "ON CONFLICT(repo_full_name) DO UPDATE SET updated_at = excluded.updated_at"
  ).bind(
    projectId,
    String(repoFullName),
    projectNameForRepo(repoFullName),
    now,
    now
  ).run();

  return db.prepare(
    "SELECT project_id, repo_full_name, name, status, created_at, updated_at FROM projects WHERE repo_full_name = ?"
  ).bind(String(repoFullName)).first();
}

export async function getProjectMembership(db, repoFullName, githubId) {
  const project = await getProject(db, repoFullName);
  if (!project) return null;

  return db.prepare(
    "SELECT project_id, github_id, status, created_at, updated_at, granted_by FROM project_memberships WHERE project_id = ? AND github_id = ?"
  ).bind(project.project_id, Number(githubId)).first();
}

export async function listMemberships(db) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  const { results } = await db.prepare(
    "SELECT m.github_id, u.login, u.avatar_url, m.role, m.status, m.created_at, m.updated_at, m.granted_by " +
    "FROM memberships m LEFT JOIN users u ON u.github_id = m.github_id " +
    "ORDER BY CASE WHEN m.status = 'active' THEN 0 ELSE 1 END, LOWER(COALESCE(u.login, ''))"
  ).all();

  return results || [];
}

export async function listProjectMemberships(db, repoFullName) {
  const project = await getProject(db, repoFullName);
  if (!project) return [];

  const { results } = await db.prepare(
    "SELECT pm.project_id, pm.github_id, u.login, u.avatar_url, pm.status, pm.created_at, pm.updated_at, pm.granted_by " +
    "FROM project_memberships pm LEFT JOIN users u ON u.github_id = pm.github_id " +
    "WHERE pm.project_id = ? " +
    "ORDER BY CASE WHEN pm.status = 'active' THEN 0 ELSE 1 END, LOWER(COALESCE(u.login, ''))"
  ).bind(project.project_id).all();

  return results || [];
}

export async function grantMembership(db, actor, login, role = "member") {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");
  if (!actor || actor.role !== "admin") throw new Error("Admin access required.");

  const normalizedRole = PLATFORM_ROLE_VALUES.includes(role) ? role : "member";
  const target = String(login || "").trim();

  if (!target) throw new Error("GitHub login is required.");

  const user = await db.prepare(
    "SELECT github_id, login FROM users WHERE LOWER(login) = LOWER(?)"
  ).bind(target).first();

  if (!user) {
    throw new Error("User must sign in with GitHub once before access can be granted.");
  }

  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO memberships (github_id, role, status, created_at, updated_at, granted_by) VALUES (?, ?, 'active', ?, ?, ?) " +
    "ON CONFLICT(github_id) DO UPDATE SET role = ?, status = 'active', updated_at = ?, granted_by = ?"
  ).bind(
    Number(user.github_id),
    normalizedRole,
    now,
    now,
    actor.login,
    normalizedRole,
    now,
    actor.login
  ).run();

  return user;
}

export async function revokeMembership(db, actor, githubId) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");
  if (!actor || actor.role !== "admin") throw new Error("Admin access required.");

  const targetId = Number(githubId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new Error("Valid GitHub user ID is required.");
  }

  if (targetId === Number(actor.githubId)) {
    throw new Error("You cannot revoke your own access.");
  }

  const target = await getMembership(db, targetId);
  if (!target) throw new Error("Membership not found.");

  if (target.role === "admin" && target.status === "active") {
    const row = await db.prepare(
      "SELECT COUNT(*) AS count FROM memberships WHERE role = 'admin' AND status = 'active'"
    ).first();

    if (Number(row?.count || 0) <= 1) {
      throw new Error("The last active admin cannot be revoked.");
    }
  }

  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE memberships SET status = 'revoked', updated_at = ? WHERE github_id = ?"
  ).bind(now, targetId).run();

  await db.prepare(
    "UPDATE project_memberships SET status = 'revoked', updated_at = ? WHERE github_id = ?"
  ).bind(now, targetId).run();
}

export async function grantProjectMembership(db, actor, repoFullName, login) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");
  if (!actor || actor.role !== "admin") throw new Error("Admin access required.");

  const project = await getProject(db, repoFullName);
  if (!project) throw new Error("Project not found.");

  const target = String(login || "").trim();
  if (!target) throw new Error("GitHub login is required.");

  const user = await db.prepare(
    "SELECT github_id, login FROM users WHERE LOWER(login) = LOWER(?)"
  ).bind(target).first();

  if (!user) {
    throw new Error("User must sign in with GitHub once before project access can be granted.");
  }

  const platformMembership = await getMembership(db, user.github_id);
  if (!isActiveMembership(platformMembership)) {
    throw new Error("Grant platform access before granting project access.");
  }

  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO project_memberships (project_id, github_id, status, created_at, updated_at, granted_by) VALUES (?, ?, 'active', ?, ?, ?) " +
    "ON CONFLICT(project_id, github_id) DO UPDATE SET status = 'active', updated_at = ?, granted_by = ?"
  ).bind(
    project.project_id,
    Number(user.github_id),
    now,
    now,
    actor.login,
    now,
    actor.login
  ).run();

  return user;
}

export async function revokeProjectMembership(db, actor, repoFullName, githubId) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");
  if (!actor || actor.role !== "admin") throw new Error("Admin access required.");

  const targetId = Number(githubId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new Error("Valid GitHub user ID is required.");
  }

  if (targetId === Number(actor.githubId)) {
    throw new Error("You cannot revoke your own project access.");
  }

  const project = await getProject(db, repoFullName);
  if (!project) throw new Error("Project not found.");

  const membership = await getProjectMembership(db, repoFullName, targetId);
  if (!membership) throw new Error("Project membership not found.");

  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE project_memberships SET status = 'revoked', updated_at = ? WHERE project_id = ? AND github_id = ?"
  ).bind(now, project.project_id, targetId).run();
}

export function isActiveMember(membership) {
  return isActiveMembership(membership);
}

export function isActiveProjectMember(membership) {
  return Boolean(
    membership &&
    membership.status === "active"
  );
}

function isActiveMembership(membership) {
  return Boolean(
    membership &&
    membership.status === "active" &&
    PLATFORM_ROLE_VALUES.includes(membership.role)
  );
}

function projectIdForRepo(repoFullName) {
  const normalized = String(repoFullName).trim().toLowerCase();
  const slug = normalized
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return slug || PROJECT_ID;
}

function projectNameForRepo(repoFullName) {
  const parts = String(repoFullName).split("/");
  return parts[1] || String(repoFullName);
}
