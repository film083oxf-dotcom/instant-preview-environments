const PREVIEW_USERNAME = "preview";
const AUTH_REALM = "Preview Environment";

export async function requirePreviewAccess(request, env) {
  if (env.ENVIRONMENT !== "preview") {
    return null;
  }

  if (!env.PREVIEW_ACCESS_PASSWORD_HASH) {
    return new Response("Preview access control is not configured.", {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "x-robots-tag": "noindex"
      }
    });
  }

  const authorization = request.headers.get("Authorization");
  const credentials = parseBasicAuthorization(authorization);

  if (!credentials || credentials.username !== PREVIEW_USERNAME) {
    return unauthorizedResponse();
  }

  const providedHash = await sha256Hex(credentials.password);

  if (!constantTimeEqual(providedHash, env.PREVIEW_ACCESS_PASSWORD_HASH)) {
    return unauthorizedResponse();
  }

  return null;
}

function parseBasicAuthorization(value) {
  if (!value?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(value.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;

  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    const a = left.charCodeAt(index) || 0;
    const b = right.charCodeAt(index) || 0;
    diff |= a ^ b;
  }

  return diff === 0;
}

function unauthorizedResponse() {
  return new Response(
    "Authentication required. Use the Preview username/password configured for this project.",
    {
      status: 401,
      headers: {
        "www-authenticate": 'Basic realm="' + AUTH_REALM + '", charset="UTF-8"',
        "cache-control": "no-store",
        "x-robots-tag": "noindex"
      }
    }
  );
}
