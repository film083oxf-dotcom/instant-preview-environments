import { getDashboardData, renderDashboard } from "./dashboard.js";
import { handleAuthCallback, handleAuthExchange, handleAuthLogin, handleAuthLogout, requirePlatformAuthorized, requireProjectAuthorized } from "./auth.js";
import { requirePreviewAccess } from "./preview-auth.js";
import { getProjectById, getProjectMembership, listAccessibleProjects, listMemberships, listProjectMemberships, grantMembership, revokeMembership, grantProjectMembership, revokeProjectMembership } from "./access-control.js";
import { renderAccessPage, redirectBack } from "./access-page.js";
import { getProjectQuota, getProjectResourceUsage, updateProjectQuota } from "./resource-control.js";

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();

    try {
      const response = await handleRequest(request, env);
      response.headers.set("X-Request-Id", requestId);

      console.log(JSON.stringify({
        event: "request.completed",
        requestId,
        environment: env.ENVIRONMENT,
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Date.now() - startedAt
      }));

      return response;
    } catch (error) {
      console.error(JSON.stringify({
        event: "request.failed",
        requestId,
        environment: env.ENVIRONMENT,
        method: request.method,
        path: new URL(request.url).pathname,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      }));

      const accept = request.headers.get("Accept") || "";
      const message = error instanceof Error ? error.message : String(error);

      if (accept.includes("text/html")) {
        return new Response(
          "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Internal Server Error</title></head><body style='font-family:system-ui;padding:40px;background:#080c16;color:#eef2ff'><h1>Internal server error</h1><p>Request ID: <code>" +
          escapeHtml(requestId) +
          "</code></p></body></html>",
          {
            status: 500,
            headers: {
              "content-type": "text/html; charset=UTF-8",
              "cache-control": "no-store",
              "x-request-id": requestId
            }
          }
        );
      }

      return Response.json(
        { ok: false, error: "Internal server error.", requestId },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
            "X-Request-Id": requestId
          }
        }
      );
    }
  }
};

async function handleRequest(request, env) {
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

    if (url.pathname === "/ready") {
      const checks = {
        controlPlane: false,
        previewDatabase: env.ENVIRONMENT === "preview" ? false : null
      };

      try {
        await checkReadyDatabase(env.CONTROL_DB);
        checks.controlPlane = true;

        if (env.ENVIRONMENT === "preview") {
          await checkReadyDatabase(env.DB);
          checks.previewDatabase = true;
        }

        return Response.json({
          ok: true,
          ready: true,
          environment: env.ENVIRONMENT,
          checks,
          timestamp: new Date().toISOString()
        }, {
          headers: {
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex"
          }
        });
      } catch (error) {
        console.error(JSON.stringify({
          event: "readiness.failed",
          environment: env.ENVIRONMENT,
          checks,
          error: error instanceof Error ? error.message : String(error)
        }));

        return Response.json({
          ok: false,
          ready: false,
          environment: env.ENVIRONMENT,
          checks,
          timestamp: new Date().toISOString()
        }, {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex"
          }
        });
      }
    }

    let authorization;

    if (env.ENVIRONMENT === "preview") {
      authorization = await requirePreviewAccess(request, env);
      if (authorization.response) return authorization.response;
    } else {
      authorization = await requirePlatformAuthorized(request, env);
      if (authorization.response) return authorization.response;
    }

    if (url.pathname === "/api/me") {
      const projectMembership = await getProjectMembership(
        env.CONTROL_DB,
        env.GITHUB_REPO,
        authorization.session.githubId
      );

      return Response.json({
        ok: true,
        user: authorization.session,
        access: {
          platform: authorization.membership,
          project: projectMembership || null
        }
      }, {
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
      });
    }

    if (url.pathname === "/api/projects") {
      const projects = await listAccessibleProjects(
        env.CONTROL_DB,
        authorization.session.githubId,
        authorization.membership.role
      );

      return Response.json({
        ok: true,
        projects
      }, {
        headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" }
      });
    }

    if (url.pathname === "/access" && env.ENVIRONMENT === "production") {
      if (authorization.membership.role !== "admin") {
        return Response.json(
          { ok: false, error: "Admin access required." },
          { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
        );
      }

      const currentProject = await getProjectById(env.CONTROL_DB, "instant-preview-environments");
      const [memberships, projectMemberships, quota, resourceUsage] = await Promise.all([
        listMemberships(env.CONTROL_DB),
        listProjectMemberships(env.CONTROL_DB, env.GITHUB_REPO),
        getProjectQuota(env.CONTROL_DB, currentProject?.project_id || "instant-preview-environments"),
        getProjectResourceUsage(env.CONTROL_DB, currentProject?.project_id || "instant-preview-environments")
      ]);

      return new Response(renderAccessPage({
        repository: env.GITHUB_REPO,
        user: { ...authorization.session, role: authorization.membership.role },
        memberships,
        projectMemberships,
        quota,
        resourceUsage
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

    if (url.pathname === "/api/access/project-grant" && request.method === "POST") {
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
        await grantProjectMembership(
          env.CONTROL_DB,
          { ...authorization.session, role: authorization.membership.role },
          env.GITHUB_REPO,
          form.get("login")
        );
        return redirectBack(new URL("/access", env.AUTH_BASE_URL).toString(), null);
      } catch (error) {
        return redirectBack(
          new URL("/access", env.AUTH_BASE_URL).toString(),
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    if (url.pathname === "/api/access/project-revoke" && request.method === "POST") {
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
        await revokeProjectMembership(
          env.CONTROL_DB,
          { ...authorization.session, role: authorization.membership.role },
          env.GITHUB_REPO,
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

    if (url.pathname === "/api/resource-quota/update" && request.method === "POST") {
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
        const project = await getProjectById(env.CONTROL_DB, "instant-preview-environments");
        if (!project) throw new Error("Project not found.");

        await updateProjectQuota(
          env.CONTROL_DB,
          { ...authorization.session, role: authorization.membership.role },
          project.project_id,
          {
            max_active_environments: form.get("max_active_environments"),
            max_active_databases: form.get("max_active_databases"),
            max_concurrent_builds: form.get("max_concurrent_builds")
          }
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
      const selectedProjectId = new URL(request.url).searchParams.get("project") || "instant-preview-environments";
      const selectedProject = await getProjectById(env.CONTROL_DB, selectedProjectId);

      if (!selectedProject || selectedProject.status !== "active") {
        return Response.json(
          { ok: false, error: "Project not found." },
          { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
        );
      }

      const projectAuthorization = await requireProjectAuthorized(
        request,
        env,
        selectedProject.repo_full_name
      );
      if (projectAuthorization.response) return projectAuthorization.response;

      try {
        const data = await getDashboardData(env, selectedProject.project_id);
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
        const selectedProjectId = new URL(request.url).searchParams.get("project") || "instant-preview-environments";
        const selectedProject = await getProjectById(env.CONTROL_DB, selectedProjectId);

        if (!selectedProject || selectedProject.status !== "active") {
          return new Response("Project not found.", {
            status: 404,
            headers: {
              "content-type": "text/plain; charset=UTF-8",
              "cache-control": "no-store"
            }
          });
        }

        const projectAuthorization = await requireProjectAuthorized(
          request,
          env,
          selectedProject.repo_full_name
        );
        if (projectAuthorization.response) return projectAuthorization.response;

        const projects = await listAccessibleProjects(
          env.CONTROL_DB,
          authorization.session.githubId,
          authorization.membership.role
        );

        const data = await getDashboardData(env, selectedProject.project_id);

        return new Response(
          renderDashboard(
            data,
            { ...authorization.session, role: authorization.membership.role },
            projects
          ),
          {
            headers: {
              "content-type": "text/html; charset=UTF-8",
              "cache-control": "private, no-store",
              "x-robots-tag": "noindex"
            }
          }
        );
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

async function checkReadyDatabase(db) {
  if (!db) throw new Error("D1 binding is not configured.");
  await db.prepare("SELECT 1 AS ok").first();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
