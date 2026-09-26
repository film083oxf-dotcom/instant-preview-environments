const MAX_METADATA_LENGTH = 4000;

export async function writeAuditEvent(db, {
  eventType,
  actor = null,
  projectId = null,
  prNumber = null,
  targetGithubId = null,
  metadata = null
}) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");
  if (!eventType) throw new Error("Audit event type is required.");

  const metadataJson = metadata == null ? null : JSON.stringify(metadata).slice(0, MAX_METADATA_LENGTH);
  const now = new Date().toISOString();

  await db.prepare(
    "INSERT INTO audit_events (event_type, actor_github_id, actor_login, project_id, pr_number, target_github_id, metadata_json, created_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    String(eventType),
    actor?.githubId == null ? null : Number(actor.githubId),
    actor?.login ? String(actor.login) : null,
    projectId == null ? null : String(projectId),
    prNumber == null ? null : Number(prNumber),
    targetGithubId == null ? null : Number(targetGithubId),
    metadataJson,
    now
  ).run();
}

export async function listAuditEvents(db, limit = 100) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { results } = await db.prepare(
    "SELECT id, event_type, actor_github_id, actor_login, project_id, pr_number, target_github_id, metadata_json, created_at " +
    "FROM audit_events ORDER BY id DESC LIMIT ?"
  ).bind(safeLimit).all();

  return results || [];
}
