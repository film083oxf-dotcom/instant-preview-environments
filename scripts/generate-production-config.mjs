import fs from "node:fs";

const [controlDbId, controlDbName, githubClientId] = process.argv.slice(2);

if (!controlDbId || !controlDbName || !githubClientId) {
  throw new Error("Usage: node scripts/generate-production-config.mjs <control-db-id> <control-db-name> <github-client-id>");
}

const base = JSON.parse(fs.readFileSync("wrangler.jsonc", "utf8"));

const config = {
  ...base,
  vars: {
    ...(base.vars || {}),
    GITHUB_CLIENT_ID: githubClientId
  },
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
