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
