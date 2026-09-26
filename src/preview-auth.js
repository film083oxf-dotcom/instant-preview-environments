import { getSession } from "./auth.js";

export async function requirePreviewAccess(request, env) {
  const session = await getSession(request, env.SESSION_SIGNING_KEY);

  if (session) return null;

  const accept = request.headers.get("Accept") || "";

  if (accept.includes("text/html")) {
    const loginUrl = new URL("/auth/login", env.AUTH_BASE_URL);
    loginUrl.searchParams.set("return_to", request.url);

    return new Response(null, {
      status: 302,
      headers: {
        Location: loginUrl.toString(),
        "Cache-Control": "no-store"
      }
    });
  }

  return Response.json(
    {
      ok: false,
      error: "Preview authentication required.",
      login: new URL("/auth/login", env.AUTH_BASE_URL).toString()
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex"
      }
    }
  );
}
