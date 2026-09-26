const ACTIVE_ENVIRONMENTS = ["BUILDING", "READY", "FAILED", "UPDATING", "DELETING", "DELETE FAILED"];
const BUILDING_STATES = ["BUILDING", "UPDATING"];

export async function getProjectQuota(db, projectId) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  return db.prepare(
    "SELECT project_id, max_active_environments, max_active_databases, max_concurrent_builds, created_at, updated_at FROM project_quotas WHERE project_id = ?"
  ).bind(String(projectId)).first();
}

export async function getProjectResourceUsage(db, projectId) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  const activeStatuses = ACTIVE_ENVIRONMENTS.map(() => "?").join(",");
  const buildingStatuses = BUILDING_STATES.map(() => "?").join(",");

  const [quota, counts, reservations] = await Promise.all([
    getProjectQuota(db, projectId),
    db.prepare(
      "SELECT " +
      "SUM(CASE WHEN status IN (" + activeStatuses + ") THEN 1 ELSE 0 END) AS active_environments, " +
      "SUM(CASE WHEN status IN (" + activeStatuses + ") AND database_name IS NOT NULL THEN 1 ELSE 0 END) AS active_databases, " +
      "SUM(CASE WHEN status IN (" + buildingStatuses + ") THEN 1 ELSE 0 END) AS concurrent_builds " +
      "FROM project_environments WHERE project_id = ?"
    ).bind(
      ...ACTIVE_ENVIRONMENTS,
      ...ACTIVE_ENVIRONMENTS,
      ...BUILDING_STATES,
      String(projectId)
    ).first(),
    db.prepare(
      "SELECT " +
      "COUNT(*) AS active_reservations, " +
      "SUM(CASE WHEN NOT EXISTS (" +
        "SELECT 1 FROM project_environments e " +
        "WHERE e.project_id = r.project_id AND e.pr_number = r.pr_number " +
        "AND e.status IN (" + activeStatuses + ")" +
      ") THEN 1 ELSE 0 END) AS new_environment_reservations " +
      "FROM project_resource_reservations r " +
      "WHERE r.project_id = ? AND datetime(r.expires_at) > datetime('now')"
    ).bind(
      ...ACTIVE_ENVIRONMENTS,
      String(projectId)
    ).first()
  ]);

  return {
    projectId: String(projectId),
    quota: quota || null,
    activeEnvironments: Number(counts?.active_environments || 0),
    activeDatabases: Number(counts?.active_databases || 0),
    concurrentBuilds: Number(counts?.concurrent_builds || 0),
    activeReservations: Number(reservations?.active_reservations || 0),
    newEnvironmentReservations: Number(reservations?.new_environment_reservations || 0)
  };
}

export async function updateProjectQuota(db, actor, projectId, values) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");
  if (!actor || actor.role !== "admin") throw new Error("Admin access required.");

  const maxActiveEnvironments = parsePositiveInteger(values?.max_active_environments);
  const maxActiveDatabases = parsePositiveInteger(values?.max_active_databases);
  const maxConcurrentBuilds = parsePositiveInteger(values?.max_concurrent_builds);

  if (maxActiveEnvironments > 1000 || maxActiveDatabases > 1000 || maxConcurrentBuilds > 1000) {
    throw new Error("Resource quotas cannot exceed 1000.");
  }

  if (maxConcurrentBuilds > maxActiveEnvironments) {
    throw new Error("Concurrent builds cannot exceed the active environment quota.");
  }

  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO project_quotas " +
    "(project_id, max_active_environments, max_active_databases, max_concurrent_builds, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(project_id) DO UPDATE SET " +
    "max_active_environments = excluded.max_active_environments, " +
    "max_active_databases = excluded.max_active_databases, " +
    "max_concurrent_builds = excluded.max_concurrent_builds, " +
    "updated_at = excluded.updated_at"
  ).bind(
    String(projectId),
    maxActiveEnvironments,
    maxActiveDatabases,
    maxConcurrentBuilds,
    now,
    now
  ).run();

  return getProjectQuota(db, projectId);
}

function parsePositiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("Resource quota values must be positive integers.");
  }

  return number;
}
