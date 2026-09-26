const ROLE_VALUES = ["admin", "member"];

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

export async function listMemberships(db) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  const { results } = await db.prepare(
    "SELECT m.github_id, u.login, u.avatar_url, m.role, m.status, m.created_at, m.updated_at, m.granted_by " +
    "FROM memberships m LEFT JOIN users u ON u.github_id = m.github_id " +
    "ORDER BY CASE WHEN m.status = 'active' THEN 0 ELSE 1 END, LOWER(COALESCE(u.login, ''))"
  ).all();

  return results || [];
}

export async function grantMembership(db, actor, login, role = "member") {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");
  if (!actor || actor.role !== "admin") throw new Error("Admin access required.");

  const normalizedRole = ROLE_VALUES.includes(role) ? role : "member";
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
}

export function isActiveMember(membership) {
  return Boolean(
    membership &&
    membership.status === "active" &&
    ROLE_VALUES.includes(membership.role)
  );
}
