import { writeFile } from "node:fs/promises";

const [outputFile, mode, projectId, prNumber, status, commitSha, previewUrl, databaseName, lastError] = process.argv.slice(2);

if (!outputFile || !mode || !projectId || !prNumber) {
  throw new Error("Usage: node scripts/write-control-state.mjs <file> <environment|ai> <project-id> <pr-number> ...");
}

const sqlString = value => "'" + String(value ?? "").replaceAll("'", "''") + "'";
const now = new Date().toISOString();

let sql;

if (mode === "environment") {
  if (!status) throw new Error("Environment status is required");

  const previewSql = previewUrl ? sqlString(previewUrl) : "NULL";
  const dbSql = databaseName ? sqlString(databaseName) : "NULL";
  const errorSql = lastError ? sqlString(lastError) : "NULL";
  const commitSql = commitSha ? sqlString(commitSha) : "NULL";

  sql = `INSERT INTO project_environments
    (project_id, pr_number, status, commit_sha, preview_url, database_name, updated_at, last_error)
    VALUES (${sqlString(projectId)}, ${Number(prNumber)}, ${sqlString(status)}, ${commitSql}, ${previewSql}, ${dbSql}, ${sqlString(now)}, ${errorSql})
    ON CONFLICT(project_id, pr_number) DO UPDATE SET
      status = excluded.status,
      commit_sha = excluded.commit_sha,
      preview_url = excluded.preview_url,
      database_name = excluded.database_name,
      updated_at = excluded.updated_at,
      last_error = excluded.last_error;

  INSERT INTO environments
    (pr_number, status, commit_sha, preview_url, database_name, ai_status, updated_at, last_error)
    VALUES (${Number(prNumber)}, ${sqlString(status)}, ${commitSql}, ${previewSql}, ${dbSql}, NULL, ${sqlString(now)}, ${errorSql})
    ON CONFLICT(pr_number) DO UPDATE SET
      status = excluded.status,
      commit_sha = excluded.commit_sha,
      preview_url = excluded.preview_url,
      database_name = excluded.database_name,
      updated_at = excluded.updated_at,
      last_error = excluded.last_error;`;
} else if (mode === "ai") {
  if (!status) throw new Error("AI status is required");

  sql = `UPDATE project_environments
    SET ai_status = ${sqlString(status)},
        updated_at = ${sqlString(now)}
    WHERE project_id = ${sqlString(projectId)} AND pr_number = ${Number(prNumber)};

  UPDATE environments
    SET ai_status = ${sqlString(status)},
        updated_at = ${sqlString(now)}
    WHERE pr_number = ${Number(prNumber)};`;
} else {
  throw new Error("Mode must be environment or ai");
}

await writeFile(outputFile, sql + "\n", "utf8");
