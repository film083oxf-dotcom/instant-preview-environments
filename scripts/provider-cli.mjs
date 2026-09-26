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
  if (!value || value.startsWith("--")) {
    throw new Error("Missing value for " + name);
  }
  return value;
}

function print(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
}

const provider = getProvider();

switch (command) {
  case "ensure-control-db": {
    const name = flag("--name", false) || process.env.CONTROL_DB_NAME || "instant-preview-control-plane";
    print(await provider.ensureControlDatabase(name));
    break;
  }
  case "ensure-preview-db": {
    const name = flag("--name");
    print(await provider.ensurePreviewDatabase(name));
    break;
  }
  case "delete-db": {
    const name = flag("--name");
    print(await provider.deleteDatabase(name));
    break;
  }
  case "deploy-preview": {
    const name = flag("--name");
    const config = flag("--config");
    await provider.deployPreview({ name, config });
    break;
  }
  case "delete-preview": {
    const name = flag("--name");
    print(await provider.deletePreview(name));
    break;
  }
  case "deploy-production": {
    const config = flag("--config");
    const secretsFile = flag("--secrets-file");
    await provider.deployProduction({ config, secretsFile });
    break;
  }
  default:
    throw new Error(
      "Usage: node scripts/provider-cli.mjs <ensure-control-db|ensure-preview-db|delete-db|deploy-preview|delete-preview|deploy-production> ..."
    );
}
