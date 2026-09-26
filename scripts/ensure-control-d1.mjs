import { appendFile } from "node:fs/promises";

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const name = process.env.CONTROL_DB_NAME || "instant-preview-control-plane";

if (!token || !accountId) {
  throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");
}

const api = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/d1/database";
const headers = {
  Authorization: "Bearer " + token,
  "Content-Type": "application/json"
};

async function call(url, options = {}) {
  const response = await fetch(url, { ...options, headers });
  const body = await response.json();

  if (!response.ok || body.success === false) {
    throw new Error("Cloudflare D1 API failed (" + response.status + "): " + JSON.stringify(body));
  }

  return body;
}

const list = await call(api + "?name=" + encodeURIComponent(name) + "&per_page=10000");
let db = list.result?.[0];

if (!db) {
  try {
    const created = await call(api, {
      method: "POST",
      body: JSON.stringify({ name })
    });
    db = created.result;
  } catch (error) {
    // A concurrent workflow may have created the same database.
    const retry = await call(api + "?name=" + encodeURIComponent(name) + "&per_page=10000");
    db = retry.result?.[0];
    if (!db) throw error;
  }
}

if (!db?.uuid) {
  throw new Error("Cloudflare did not return a D1 database UUID for " + name);
}

console.log("control_db_name=" + name);
console.log("control_db_id=" + db.uuid);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    "database_name=" + name + "\ndatabase_id=" + db.uuid + "\n"
  );
}
