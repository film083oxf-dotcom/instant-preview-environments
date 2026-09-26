import { writeFile } from "node:fs/promises";

const [outputFile, mode, projectId, prNumber, provider, branchId, branchName, databaseName, commitSha] = process.argv.slice(2);

if (!outputFile || !mode || !projectId || !prNumber || !provider) {
  throw new Error("Usage: node scripts/write-database-branch-state.mjs <file> <upsert|delete> <project-id> <pr-number> <provider> [branch-id] [branch-name] [database-name] [commit-sha]");
}

const sqlString = value => "'" + String(value ?? "").replaceAll("'", "''") + "'";
const projectSql = sqlString(projectId);
const pr = Number(prNumber);
if (!Number.isInteger(pr) || pr <= 0) throw new Error("PR number must be a positive integer.");

const now = new Date().toISOString();

let sql;
if (mode === "upsert") {
  if (!branchId || !branchName) throw new Error("branch-id and branch-name are required for upsert.");
  const dbSql = databaseName ? sqlString(databaseName) : "NULL";
  const shaSql = commitSha ? sqlString(commitSha) : "NULL";
  sql = `INSERT INTO database_branches
    (project_id, pr_number, provider, branch_id, branch_name, database_name, commit_sha, status, created_at, updated_at)
    VALUES (${projectSql}, ${pr}, ${sqlString(provider)}, ${sqlString(branchId)}, ${sqlString(branchName)}, ${dbSql}, ${shaSql}, 'READY', ${sqlString(now)}, ${sqlString(now)})
    ON CONFLICT(project_id, pr_number, provider) DO UPDATE SET
      branch_id = excluded.branch_id,
      branch_name = excluded.branch_name,
      database_name = excluded.database_name,
      commit_sha = excluded.commit_sha,
      status = excluded.status,
      updated_at = excluded.updated_at;`;
} else if (mode === "delete") {
  sql = `UPDATE database_branches
    SET status = 'DELETED', updated_at = ${sqlString(now)}
    WHERE project_id = ${projectSql}
      AND pr_number = ${pr}
      AND provider = ${sqlString(provider)};`;
} else {
  throw new Error("Mode must be upsert or delete.");
}

await writeFile(outputFile, sql + "\n", "utf8");
