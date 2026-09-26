const API_BASE = "https://console.neon.tech/api/v2";

function config() {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error("NEON_API_KEY and NEON_PROJECT_ID are required for the Neon database provider.");
  }
  return { apiKey, projectId };
}

async function call(path, options = {}) {
  const { apiKey } = config();
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: "Bearer " + apiKey,
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;

  const body = await response.json();
  if (!response.ok) {
    throw new Error("Neon API failed (" + response.status + "): " + JSON.stringify(body));
  }
  return body;
}

export async function ensureBranch({ name, prNumber, commitSha }) {
  const { projectId } = config();
  const search = await call(
    "/projects/" + projectId + "/branches?search=" + encodeURIComponent(name) + "&limit=100"
  );
  const existing = (search?.branches || []).find(branch => branch.name === name);

  if (existing?.id) {
    return {
      provider: "neon",
      branchId: existing.id,
      branchName: existing.name
    };
  }

  const body = await call("/projects/" + projectId + "/branches", {
    method: "POST",
    body: JSON.stringify({
      branch: {
        name,
        ...(process.env.NEON_PARENT_BRANCH_ID
          ? { parent_id: process.env.NEON_PARENT_BRANCH_ID }
          : {}),
        protected: false
      },
      annotation_value: {
        pr_number: String(prNumber),
        commit_sha: String(commitSha || "")
      }
    })
  });

  const branch = body?.branch;
  if (!branch?.id) {
    throw new Error("Neon did not return a branch id.");
  }

  return {
    provider: "neon",
    branchId: branch.id,
    branchName: branch.name || name
  };
}

export async function deleteBranch(branchId) {
  const { projectId } = config();
  await call("/projects/" + projectId + "/branches/" + encodeURIComponent(branchId), {
    method: "DELETE"
  });
  return { provider: "neon", branchId, deleted: true };
}
