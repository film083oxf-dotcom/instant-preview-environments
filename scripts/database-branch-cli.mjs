import { execFileSync } from "node:child_process";
import { getProvider } from "./provider.mjs";

const args = process.argv.slice(2);
const command = args[0];

function flag(name, required = true) {
  const index = args.indexOf(name);
  if (index === -1) {
    if (required) throw new Error("Missing required flag " + name);
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error("Missing value for " + name);
  return value;
}

function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    execFileSync("bash", ["-lc", "printf '%s=%s\\n' " + JSON.stringify(name) + " " + JSON.stringify(value) + " >> \"$GITHUB_OUTPUT\""]);
  }
}

const databaseProvider = process.env.DATABASE_PROVIDER || "cloudflare-d1";

switch (databaseProvider) {
  case "cloudflare-d1": {
    const provider = getProvider();
    if (command === "ensure") {
      const name = flag("--name");
      const result = await provider.ensurePreviewDatabase(name);
      console.log(JSON.stringify({
        provider: "cloudflare-d1",
        branchId: result.id,
        branchName: result.name,
        databaseName: result.name,
        created: result.created
      }));
    } else if (command === "delete") {
      const name = flag("--name");
      console.log(JSON.stringify(await provider.deleteDatabase(name)));
    } else {
      throw new Error("Usage for cloudflare-d1: ensure --name <name> | delete --name <name>");
    }
    break;
  }
  case "neon": {
    const { ensureBranch, deleteBranch } = await import("./database-providers/neon.mjs");
    if (command === "ensure") {
      const name = flag("--name");
      const prNumber = flag("--pr-number");
      const commitSha = flag("--commit-sha", false) || "";
      const result = await ensureBranch({ name, prNumber, commitSha });
      console.log(JSON.stringify({ ...result, created: true }));
    } else if (command === "delete") {
      const branchId = flag("--branch-id");
      console.log(JSON.stringify(await deleteBranch(branchId)));
    } else {
      throw new Error("Usage for neon: ensure --name <name> --pr-number <number> --commit-sha <sha> | delete --branch-id <id>");
    }
    break;
  }
  default:
    throw new Error("Unsupported DATABASE_PROVIDER: " + databaseProvider);
}
