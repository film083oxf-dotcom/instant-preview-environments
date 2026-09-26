import fs from "node:fs";

const [controlDbId, controlDbName] = process.argv.slice(2);

if (!controlDbId || !controlDbName) {
  throw new Error("Usage: node scripts/generate-production-config.mjs <control-db-id> <control-db-name>");
}

const base = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));

const config = {
  ...base,
  d1_databases: [
    {
      binding: "CONTROL_DB",
      database_name: controlDbName,
      database_id: controlDbId
    }
  ]
};

fs.writeFileSync(
  "wrangler.production.generated.jsonc",
  JSON.stringify(config, null, 2) + "\n"
);
