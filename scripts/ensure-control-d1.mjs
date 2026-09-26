import { getProvider } from "./provider.mjs";

const name = process.env.CONTROL_DB_NAME || "instant-preview-control-plane";
const result = await getProvider().ensureControlDatabase(name);

console.log("control_db_name=" + result.name);
console.log("control_db_id=" + result.id);
