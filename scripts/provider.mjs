const PROVIDER = process.env.PREVIEW_PROVIDER || process.env.RESOURCE_PROVIDER || "cloudflare";

if (PROVIDER !== "cloudflare") {
  throw new Error("Unsupported provider: " + PROVIDER + ". Supported providers: cloudflare.");
}

const provider = await import("./providers/cloudflare.mjs");

export function getProvider() {
  return provider;
}
