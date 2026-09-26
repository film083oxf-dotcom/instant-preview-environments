import { writeFile } from "node:fs/promises";

const [outputFile, mode, projectId, prNumber] = process.argv.slice(2);

if (!outputFile || !mode || !projectId || !prNumber) {
  throw new Error("Usage: node scripts/write-resource-reservation.mjs <file> <reserve|release> <project-id> <pr-number>");
}

const sqlString = value => "'" + String(value ?? "").replaceAll("'", "''") + "'";
const projectSql = sqlString(projectId);
const pr = Number(prNumber);

if (!Number.isInteger(pr) || pr <= 0) {
  throw new Error("PR number must be a positive integer.");
}

let sql;

if (mode === "reserve") {
  sql = `DELETE FROM project_resource_reservations
WHERE project_id = ${projectSql} AND pr_number = ${pr};

INSERT INTO project_resource_reservations
  (project_id, pr_number, reservation_type, created_at, expires_at)
SELECT
  ${projectSql},
  ${pr},
  'preview_environment',
  datetime('now'),
  datetime('now', '+30 minutes')
WHERE
  (
    SELECT COUNT(*)
    FROM project_environments
    WHERE project_id = ${projectSql}
      AND status IN ('BUILDING','READY','FAILED','UPDATING','DELETING','DELETE FAILED')
  )
  +
  (
    SELECT COUNT(*)
    FROM project_resource_reservations r
    WHERE r.project_id = ${projectSql}
      AND datetime(r.expires_at) > datetime('now')
      AND NOT EXISTS (
        SELECT 1
        FROM project_environments e
        WHERE e.project_id = r.project_id
          AND e.pr_number = r.pr_number
          AND e.status IN ('BUILDING','READY','FAILED','UPDATING','DELETING','DELETE FAILED')
      )
  )
  +
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM project_environments e
      WHERE e.project_id = ${projectSql}
        AND e.pr_number = ${pr}
        AND e.status IN ('BUILDING','READY','FAILED','UPDATING','DELETING','DELETE FAILED')
    ) THEN 0
    ELSE 1
  END
  <= (
    SELECT max_active_environments
    FROM project_quotas
    WHERE project_id = ${projectSql}
  )
  AND
  (
    (
      SELECT COUNT(*)
      FROM project_environments
      WHERE project_id = ${projectSql}
        AND status IN ('BUILDING','UPDATING')
    )
    +
  (
    SELECT COUNT(*)
    FROM project_resource_reservations
    WHERE project_id = ${projectSql}
      AND datetime(expires_at) > datetime('now')
  )
  < (
    SELECT max_concurrent_builds
    FROM project_quotas
    WHERE project_id = ${projectSql}
  )
  AND
  (
    SELECT COUNT(*)
    FROM project_environments e
    WHERE e.project_id = ${projectSql}
      AND e.status IN ('BUILDING','READY','FAILED','UPDATING','DELETING','DELETE FAILED')
      AND e.database_name IS NOT NULL
  )
  +
  (
    SELECT COUNT(*)
    FROM project_resource_reservations r
    WHERE r.project_id = ${projectSql}
      AND datetime(r.expires_at) > datetime('now')
      AND NOT EXISTS (
        SELECT 1
        FROM project_environments e
        WHERE e.project_id = r.project_id
          AND e.pr_number = r.pr_number
          AND e.status IN ('BUILDING','READY','FAILED','UPDATING','DELETING','DELETE FAILED')
      )
  )
  +
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM project_environments e
      WHERE e.project_id = ${projectSql}
        AND e.pr_number = ${pr}
        AND e.status IN ('BUILDING','READY','FAILED','UPDATING','DELETING','DELETE FAILED')
    ) THEN 0
    ELSE 1
  END
  <= (
    SELECT max_active_databases
    FROM project_quotas
    WHERE project_id = ${projectSql}
  );

SELECT changes() AS reserved;`;
} else if (mode === "release") {
  sql = `DELETE FROM project_resource_reservations
WHERE project_id = ${projectSql} AND pr_number = ${pr};

SELECT changes() AS released;`;
} else {
  throw new Error("Mode must be reserve or release.");
}

await writeFile(outputFile, sql + "\n", "utf8");
