const SESSION_COOKIE = "ipe_session";
const OAUTH_STATE_COOKIE = "ipe_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const STATE_TTL_SECONDS = 60 * 10;
const TICKET_TTL_SECONDS = 60 * 5;

export async function handleAuthLogin(request, env) {
  const currentUrl = new URL(request.url);

  if (env.ENVIRONMENT === "preview") {
    const productionLogin = new URL("/auth/login", env.AUTH_BASE_URL);
    productionLogin.searchParams.set("return_to", currentUrl.toString());

    return new Response(null, {
      status: 302,
      headers: {
        Location: productionLogin.toString(),
        "Cache-Control": "no-store"
      }
    });
  }

  assertAuthConfig(env);

  const requestedReturnTo = currentUrl.searchParams.get("return_to");
  const returnTo = sanitizeReturnTo(requestedReturnTo, env);
  const state = randomToken(32);
  const verifier = randomToken(32);
  const challenge = await sha256Base64Url(verifier);

  const statePayload = {
    state,
    verifier,
    returnTo,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS
  };

  const signedState = await signObject(statePayload, env.SESSION_SIGNING_KEY);
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", getCallbackUrl(env));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": serializeCookie(
        OAUTH_STATE_COOKIE,
        signedState,
        STATE_TTL_SECONDS,
        true
      ),
      "Cache-Control": "no-store"
    }
  });
}

export async function handleAuthCallback(request, env) {
  assertAuthConfig(env);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const githubError = url.searchParams.get("error");

  if (githubError) {
    return new Response(
      "GitHub sign-in was cancelled or denied: " + githubError,
      { status: 400, headers: noStoreHeaders() }
    );
  }

  if (!code || !state) {
    return new Response("Missing OAuth callback parameters.", {
      status: 400,
      headers: noStoreHeaders()
    });
  }

  const rawState = getCookie(request.headers.get("Cookie"), OAUTH_STATE_COOKIE);
  const stateData = await verifyObject(rawState, env.SESSION_SIGNING_KEY);

  if (!stateData || stateData.exp < Math.floor(Date.now() / 1000) || stateData.state !== state) {
    return new Response("Invalid or expired OAuth state.", {
      status: 400,
      headers: noStoreHeaders()
    });
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Instant-Preview-Environments"
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: getCallbackUrl(env),
      code_verifier: stateData.verifier
    })
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    return new Response("GitHub token exchange failed.", {
      status: 502,
      headers: noStoreHeaders()
    });
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: "Bearer " + tokenData.access_token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Instant-Preview-Environments"
    }
  });

  const githubUser = await userResponse.json();

  if (!userResponse.ok || !githubUser.id || !githubUser.login) {
    return new Response("Could not read the GitHub account.", {
      status: 502,
      headers: noStoreHeaders()
    });
  }

  await upsertUser(env.CONTROL_DB, githubUser);

  const productionOrigin = new URL(env.AUTH_BASE_URL).origin;
  const target = new URL(stateData.returnTo);
  const isProduction = target.origin === productionOrigin;

  if (isProduction) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.toString(),
        "Set-Cookie": joinCookies(
          serializeCookie(
            SESSION_COOKIE,
            await createSession(
              {
                githubId: githubUser.id,
                login: githubUser.login,
                avatarUrl: githubUser.avatar_url || ""
              },
              env.SESSION_SIGNING_KEY
            ),
            SESSION_TTL_SECONDS,
            true
          ),
          serializeCookie(OAUTH_STATE_COOKIE, "", 0, true)
        ),
        "Cache-Control": "no-store"
      }
    });
  }

  const ticket = randomToken(32);
  await createAuthTicket(env.CONTROL_DB, {
    ticket,
    githubId: githubUser.id,
    login: githubUser.login,
    returnUrl: target.toString()
  });

  const exchangeUrl = new URL("/auth/exchange", target.origin);
  exchangeUrl.searchParams.set("ticket", ticket);

  return new Response(null, {
    status: 302,
    headers: {
      Location: exchangeUrl.toString(),
      "Set-Cookie": serializeCookie(OAUTH_STATE_COOKIE, "", 0, true),
      "Cache-Control": "no-store"
    }
  });
}

export async function handleAuthExchange(request, env) {
  const ticket = new URL(request.url).searchParams.get("ticket");

  if (!ticket) {
    return new Response("Missing authentication ticket.", {
      status: 400,
      headers: noStoreHeaders()
    });
  }

  const record = await consumeAuthTicket(env.CONTROL_DB, ticket);

  if (!record) {
    return new Response("Authentication ticket is invalid or expired.", {
      status: 401,
      headers: noStoreHeaders()
    });
  }

  const expectedHost = new URL(record.return_url).hostname;
  const currentHost = new URL(request.url).hostname;

  if (expectedHost !== currentHost) {
    return new Response("Authentication ticket target mismatch.", {
      status: 403,
      headers: noStoreHeaders()
    });
  }

  const session = await createSession(
    {
      githubId: record.github_id,
      login: record.github_login,
      avatarUrl: ""
    },
    env.SESSION_SIGNING_KEY
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: record.return_url,
      "Set-Cookie": serializeCookie(
        SESSION_COOKIE,
        session,
        SESSION_TTL_SECONDS,
        true
      ),
      "Cache-Control": "no-store"
    }
  });
}

export async function handleAuthLogout() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": serializeCookie(SESSION_COOKIE, "", 0, true),
      "Cache-Control": "no-store"
    }
  });
}

export async function requireAuthenticated(request, env) {
  const session = await getSession(request, env.SESSION_SIGNING_KEY);
  if (session) return { session };

  if ((request.headers.get("Accept") || "").includes("text/html")) {
    const loginUrl = new URL("/auth/login", env.AUTH_BASE_URL);
    loginUrl.searchParams.set("return_to", request.url);

    return {
      response: new Response(null, {
        status: 302,
        headers: {
          Location: loginUrl.toString(),
          "Cache-Control": "no-store"
        }
      })
    };
  }

  return {
    response: Response.json(
      { ok: false, error: "Authentication required." },
      { status: 401, headers: noStoreHeaders() }
    )
  };
}

export async function getSession(request, signingKey) {
  const raw = getCookie(request.headers.get("Cookie"), SESSION_COOKIE);
  if (!raw) return null;

  const data = await verifyObject(raw, signingKey);
  if (!data || data.exp < Math.floor(Date.now() / 1000)) return null;

  return {
    githubId: data.githubId,
    login: data.login,
    avatarUrl: data.avatarUrl || null
  };
}

async function createSession(user, signingKey) {
  return signObject(
    {
      githubId: user.githubId,
      login: user.login,
      avatarUrl: user.avatarUrl || "",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
    },
    signingKey
  );
}

async function upsertUser(db, user) {
  if (!db) throw new Error("CONTROL_DB binding is not configured.");

  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO users (github_id, login, avatar_url, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, avatar_url = excluded.avatar_url, last_seen_at = excluded.last_seen_at"
  ).bind(
    Number(user.id),
    String(user.login),
    String(user.avatar_url || ""),
    now,
    now
  ).run();
}

async function createAuthTicket(db, data) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((now + TICKET_TTL_SECONDS) * 1000).toISOString();
  const ticketHash = await sha256Hex(data.ticket);

  await db.prepare(
    "INSERT INTO auth_tickets (ticket_hash, github_id, github_login, return_url, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    ticketHash,
    Number(data.githubId),
    String(data.login),
    String(data.returnUrl),
    expiresAt
  ).run();
}

async function consumeAuthTicket(db, ticket) {
  const ticketHash = await sha256Hex(ticket);
  const now = new Date().toISOString();

  const result = await db.prepare(
    "UPDATE auth_tickets SET used_at = ? WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ? " +
    "RETURNING github_id, github_login, return_url"
  ).bind(now, ticketHash, now).first();

  return result || null;
}

function assertAuthConfig(env) {
  const required = [
    "AUTH_BASE_URL",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "SESSION_SIGNING_KEY"
  ];

  for (const key of required) {
    if (!env[key]) {
      throw new Error("Missing required authentication binding: " + key);
    }
  }

  if (!env.CONTROL_DB) {
    throw new Error("CONTROL_DB binding is not configured.");
  }
}

function sanitizeReturnTo(value, env) {
  const fallback = new URL("/", env.AUTH_BASE_URL).toString();

  if (!value) return fallback;

  try {
    const target = new URL(value);
    const production = new URL(env.AUTH_BASE_URL);
    const suffix = String(env.AUTH_ALLOWED_HOST_SUFFIX || "").toLowerCase();

    if (target.protocol !== "https:") return fallback;
    if (target.hostname === production.hostname) return target.toString();
    if (suffix && target.hostname.toLowerCase().endsWith("." + suffix)) return target.toString();
  } catch {
    // Ignore malformed return URLs.
  }

  return fallback;
}

function getCallbackUrl(env) {
  return new URL("/auth/callback", env.AUTH_BASE_URL).toString();
}

async function signObject(value, secret) {
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const signature = await hmacBase64Url(payload, secret);
  return payload + "." + signature;
}

async function verifyObject(value, secret) {
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = await hmacBase64Url(payload, secret);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
  } catch {
    return null;
  }
}

async function hmacBase64Url(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return encodeBase64Url(new Uint8Array(signature));
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return encodeBase64Url(new Uint8Array(digest));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return encodeBase64Url(buffer);
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function constantTimeEqual(a, b) {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function getCookie(header, name) {
  if (!header) return null;

  const cookies = header.split(";").map(value => value.trim());

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;

    const key = cookie.slice(0, separator);
    const value = cookie.slice(separator + 1);

    if (key === name) return decodeURIComponent(value);
  }

  return null;
}

function serializeCookie(name, value, maxAge, httpOnly) {
  const attributes = [
    name + "=" + encodeURIComponent(value),
    "Path=/",
    "Max-Age=" + Math.max(0, maxAge),
    "Secure",
    "SameSite=Lax"
  ];

  if (httpOnly) attributes.push("HttpOnly");

  return attributes.join("; ");
}

function joinCookies(...cookies) {
  return cookies.join(", ");
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex"
  };
}
