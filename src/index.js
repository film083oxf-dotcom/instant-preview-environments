import { getDashboardData, renderDashboard } from "./dashboard.js";
import { handleAuthCallback, handleAuthExchange, handleAuthLogin, handleAuthLogout, requireAuthorized } from "./auth.js";
import { requirePreviewAccess } from "./preview-auth.js";
import { listMemberships, grantMembership, revokeMembership } from "./access-control.js";
import { renderAccessPage, redirectBack } from "./access-page.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth/login") return handleAuthLogin(request, env);
    if (url.pathname === "/auth/callback") return handleAuthCallback(request, env);
    if (url.pathname === "/auth/exchange") return handleAuthExchange(request, env);
    if (url.pathname === "/auth/logout") return handleAuthLogout();

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        environment: env.ENVIRONMENT,
        app: env.APP_NAME,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex"
        }
      });
    }

    let authorization;

    if (env.ENVIRONMENT === "preview") {
      authorization = await requirePreviewAccess(request, env);
      if (authorization.response) return authorization.response;
    } else {
      authorization = await requireAuthorized(request, env);
      if (authorization.response) return authorization.response;
    }

    if (url.pathname === "/api/me") {
      return Response.json({
        ok: true,
        user: authorization.session,
        access: authorization.membership
      }, {
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
      });
    }

    if (url.pathname === "/access" && env.ENVIRONMENT === "production") {
      if (authorization.membership.role !== "admin") {
        return Response.json(
          { ok: false, error: "Admin access required." },
          { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
        );
      }

      const memberships = await listMemberships(env.CONTROL_DB);
      return new Response(renderAccessPage({
        repository: env.GITHUB_REPO,
        user: { ...authorization.session, role: authorization.membership.role },
        memberships
      }), {
        headers: {
          "content-type": "text/html; charset=UTF-8",
          "cache-control": "private, no-store",
          "x-robots-tag": "noindex"
        }
      });
    }

    if (url.pathname === "/api/access/grant" && request.method === "POST") {
      if (env.ENVIRONMENT !== "production" || authorization.membership.role !== "admin") {
        return Response.json(
          { ok: false, error: "Admin access required." },
          { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
        );
      }

      const origin = request.headers.get("Origin");
      if (origin && origin !== new URL(env.AUTH_BASE_URL).origin) {
        return Response.json(
          { ok: false, error: "Invalid request origin." },
          { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
        );
      }

      try {
        const form = await request.formData();
        await grantMembership(
          env.CONTROL_DB,
          { ...authorization.session, role: authorization.membership.role },
          form.get("login"),
          form.get("role") || "member"
        );
        return redirectBack(new URL("/access", env.AUTH_BASE_URL).toString(), null);
      } catch (error) {
        return redirectBack(
          new URL("/access", env.AUTH_BASE_URL).toString(),
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (url.pathname === "/api/access/revoke" && request.method === "POST") {
      if (env.ENVIRONMENT !== "production" || authorization.membership.role !== "admin") {
        return Response.json(
          { ok: false, error: "Admin access required." },
          { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
        );
      }

      const origin = request.headers.get("Origin");
      if (origin && origin !== new URL(env.AUTH_BASE_URL).origin) {
        return Response.json(
          { ok: false, error: "Invalid request origin." },
          { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
        );
      }

      try {
        const form = await request.formData();
        await revokeMembership(
          env.CONTROL_DB,
          { ...authorization.session, role: authorization.membership.role },
          form.get("github_id")
        );
        return redirectBack(new URL("/access", env.AUTH_BASE_URL).toString(), null);
      } catch (error) {
        return redirectBack(
          new URL("/access", env.AUTH_BASE_URL).toString(),
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (url.pathname === "/api/environments") {
      try {
        const data = await getDashboardData(env);
        return Response.json(data, {
          headers: {
            "Cache-Control": "private, no-store"
          }
        });
      } catch (error) {
        return Response.json({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }, {
          status: 502,
          headers: { "Cache-Control": "no-store" }
        });
      }
    }

    if (url.pathname === "/db") {
      if (!env.DB) {
        return Response.json({
          ok: false,
          error: "D1 binding is not configured for this environment."
        }, {
          status: 500,
          headers: { "Cache-Control": "no-store" }
        });
      }

      const previewId = env.PREVIEW_ID || "unknown-preview";
      const now = new Date().toISOString();

      await env.DB.prepare(
        "INSERT INTO preview_state (id, preview_id, created_at, counter) VALUES (1, ?, ?, 0) ON CONFLICT(id) DO NOTHING"
      ).bind(previewId, now).run();

      await env.DB.prepare(
        "UPDATE preview_state SET counter = counter + 1 WHERE id = 1"
      ).run();

      const row = await env.DB.prepare(
        "SELECT preview_id, created_at, counter FROM preview_state WHERE id = 1"
      ).first();

      return Response.json({
        ok: true,
        environment: env.ENVIRONMENT,
        previewId,
        databaseIsolation: "isolated-per-preview",
        firstSeenAt: row?.created_at ?? null,
        requestCounter: row?.counter ?? 0
      }, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    if (url.pathname === "/" && env.ENVIRONMENT === "production") {
      try {
        const data = await getDashboardData(env);
        const auth = await requireAuthenticated(request, env);
        return new Response(renderDashboard(data, { ...authorization.session, role: authorization.membership.role }), {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "cache-control": "private, no-store",
            "x-robots-tag": "noindex"
          }
        });
      } catch (error) {
        return new Response(
          "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Dashboard Error</title></head><body style='font-family:system-ui;padding:40px;background:#080c16;color:#eef2ff'><h1>Dashboard temporarily unavailable</h1><p>Control-plane D1 could not be read right now.</p><pre>" +
          escapeHtml(error instanceof Error ? error.message : String(error)) +
          "</pre></body></html>",
          {
            status: 502,
            headers: {
              "content-type": "text/html; charset=UTF-8",
              "cache-control": "no-store"
            }
          }
        );
      }
    }

    const title = env.ENVIRONMENT === "preview"
      ? "Preview Environment Ready"
      : "Production Environment";

    const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>${escapeHtml(env.APP_NAME)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1020; color: #eef2ff; }
    .card { width: min(680px, calc(100% - 32px)); padding: 32px; border: 1px solid #26304a; border-radius: 20px; background: #12182a; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
    .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #1d2742; color: #a9bbff; font-size: 13px; }
    h1 { margin: 16px 0 8px; font-size: clamp(28px, 5vw, 44px); }
    p { color: #aeb8cf; line-height: 1.7; }
    code { color: #d7e0ff; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); margin-top: 24px; }
    .item { padding: 14px; border-radius: 14px; background: #0d1323; border: 1px solid #202b45; }
    .label { font-size: 12px; color: #7f8aa5; }
    .value { margin-top: 4px; font-weight: 600; word-break: break-word; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">${escapeHtml(env.ENVIRONMENT)}</span>
    <h1>${escapeHtml(title)}</h1>
    <p>GitHub authentication protects this environment.</p>
    <div class="grid">
      <div class="item"><div class="label">Application</div><div class="value">${escapeHtml(env.APP_NAME)}</div></div>
      <div class="item"><div class="label">Environment</div><div class="value">${escapeHtml(env.ENVIRONMENT)}</div></div>
      <div class="item"><div class="label">Health</div><div class="value"><code>/health</code> (public)</div></div>
      <div class="item"><div class="label">Database</div><div class="value">${escapeHtml(env.ENVIRONMENT === "preview" ? "Isolated D1" : "Not configured")}</div></div>
    </div>
    <p>Signed in. <a href="/auth/logout">Sign out</a></p>
  </main>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex"
      }
    });
  }
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
