export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        environment: env.ENVIRONMENT,
        app: env.APP_NAME,
        timestamp: new Date().toISOString()
      }, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    const title = env.ENVIRONMENT === "preview"
      ? "Preview Environment Ready"
      : "Production Environment";

    const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
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
    <p>นี่คือ MVP ของระบบที่สร้าง Preview Environment แยกให้แต่ละ Pull Request แบบอัตโนมัติ (ทดสอบอัปเดต v2)</p>
    <div class="grid">
      <div class="item"><div class="label">Application</div><div class="value">${escapeHtml(env.APP_NAME)}</div></div>
      <div class="item"><div class="label">Environment</div><div class="value">${escapeHtml(env.ENVIRONMENT)}</div></div>
      <div class="item"><div class="label">Health</div><div class="value"><code>/health</code></div></div>
    </div>
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
