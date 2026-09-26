import { appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const WRANGLER_VERSION = "4.136.3";
const CLOUDFLARE_API = () => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
  }
  return {
    base: "https://api.cloudflare.com/client/v4/accounts/" + accountId,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    }
  };
};

async function cloudflareCall(url, options = {}) {
  const { headers } = CLOUDFLARE_API();
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const body = await response.json();

  if (!response.ok || body.success === false) {
    throw new Error("Cloudflare API failed (" + response.status + "): " + JSON.stringify(body));
  }

  return body;
}

async function cloudflareEnsureD1(name) {
  const { base } = CLOUDFLARE_API();
  const endpoint = base + "/d1/database";
  const list = await cloudflareCall(endpoint + "?name=" + encodeURIComponent(name) + "&per_page=10000");
  let db = list.result?.[0];
  let created = false;

  if (!db) {
    try {
      const result = await cloudflareCall(endpoint, {
        method: "POST",
        body: JSON.stringify({ name })
      });
      db = result.result;
      created = true;
    } catch (error) {
      const retry = await cloudflareCall(endpoint + "?name=" + encodeURIComponent(name) + "&per_page=10000");
      db = retry.result?.[0];
      if (!db) throw error;
    }
  }

  if (!db?.uuid) {
    throw new Error("Provider did not return a database ID for " + name);
  }

  return {
    name,
    id: db.uuid,
    created
  };
}

async function cloudflareDeleteD1(name) {
  const { base } = CLOUDFLARE_API();
  const list = await cloudflareCall(
    base + "/d1/database?name=" + encodeURIComponent(name) + "&per_page=10000"
  );
  const db = list.result?.[0];

  if (!db?.uuid) {
    return { name, deleted: false, notFound: true };
  }

  try {
    await cloudflareCall(base + "/d1/database/" + db.uuid, { method: "DELETE" });
    return { name, deleted: true, notFound: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|does not exist|could not find/i.test(message)) {
      return { name, deleted: false, notFound: true };
    }
    throw error;
  }
}

function runWrangler(args, options = {}) {
  execFileSync(
    "npx",
    ["--yes", "wrangler@" + WRANGLER_VERSION, ...args],
    {
      stdio: options.captureOutput
        ? ["inherit", "ignore", "inherit"]
        : "inherit",
      env: process.env
    }
  );
}

function cloudflareDeployPreview({ name, config }) {
  runWrangler(["preview", "--name", name, "--config", config]);
}

function cloudflareDeletePreview(name) {
  try {
    runWrangler(["preview", "delete", "--name", name, "--skip-confirmation"], { captureOutput: true });
    return { deleted: true, notFound: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Preview not found. [code: 10025]")) {
      return { deleted: false, notFound: true };
    }
    throw error;
  }
}

function cloudflareDeployProduction({ config, secretsFile }) {
  runWrangler(["deploy", "--config", config, "--secrets-file", secretsFile]);
}

export async function ensureControlDatabase(name) {
  const result = await cloudflareEnsureD1(name);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      "database_name=" + result.name + "\ndatabase_id=" + result.id + "\n"
    );
  }
  return result;
}

export async function ensurePreviewDatabase(name) {
  return cloudflareEnsureD1(name);
}

export async function deleteDatabase(name) {
  return cloudflareDeleteD1(name);
}

export async function deployPreview(options) {
  cloudflareDeployPreview(options);
}

export async function deletePreview(name) {
  return cloudflareDeletePreview(name);
}

export async function deployProduction(options) {
  cloudflareDeployProduction(options);
}
