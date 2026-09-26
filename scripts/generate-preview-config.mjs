import fs from "node:fs";

const [databaseId, databaseName, previewId, controlDbId, controlDbName] = process.argv.slice(2);

if (!databaseId || !databaseName || !previewId || !controlDbId || !controlDbName) {
  throw new Error("Usage: node scripts/generate-preview-config.mjs <database-id> <database-name> <preview-id> <control-db-id> <control-db-name>");
}

const base = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));

const config = {
  ...base,
  previews: {
    ...(base.previews || {}),
    vars: {
      ...((base.previews && base.previews.vars) || {}),
      APP_NAME: base.vars?.APP_NAME || "Instant On-Demand Preview Environments",
      ENVIRONMENT: "preview",
      GITHUB_REPO: base.vars?.GITHUB_REPO || "film083oxf-dotcom/instant-preview-environments",
      AUTH_BASE_URL: base.vars?.AUTH_BASE_URL || "https://instant-preview-environments.film083oxf.workers.dev",
      PREVIEW_DOMAIN: base.vars?.PREVIEW_DOMAIN || "film083oxf.workers.dev",
      WORKER_NAME: base.vars?.WORKER_NAME || "instant-preview-environments",
      PREVIEW_ID: previewId
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: databaseName,
        database_id: databaseId
      },
      {
        binding: "CONTROL_DB",
        database_name: controlDbName,
        database_id: controlDbId
      }
    ]
  }
};

fs.writeFileSync("wrangler.preview.generated.jsonc", JSON.stringify(config, null, 2) + "\n");
