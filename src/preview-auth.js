import { requireAuthorized } from "./auth.js";

export async function requirePreviewAccess(request, env) {
  return requireAuthorized(request, env);
}
