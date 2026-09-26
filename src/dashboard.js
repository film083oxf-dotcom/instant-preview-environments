const STATUS_ORDER = ["BUILDING", "READY", "FAILED", "DELETING", "DELETE FAILED", "DELETED"];

export async function getDashboardData(env, projectId = null) {
  if (!env.CONTROL_DB) throw new Error("CONTROL_DB binding is not configured.");

  const selectedId = projectId || "instant-preview-environments";
  const project = await env.CONTROL_DB.prepare(
    "SELECT project_id, repo_full_name, name, status, created_at, updated_at FROM projects WHERE project_id = ?"
  ).bind(selectedId).first();

  if (!project) throw new Error("Project not found.");

  const query = "SELECT pr_number, status, commit_sha, preview_url, database_name, ai_status, updated_at, last_error FROM project_environments WHERE project_id = ? ORDER BY datetime(updated_at) DESC LIMIT 100";
  const { results } = await env.CONTROL_DB.prepare(query).bind(project.project_id).all();

  const environments = (results || []).map(row => ({
    pr: Number(row.pr_number),
    title: "Pull Request #" + row.pr_number,
    state: row.status === "DELETED" ? "closed" : "open",
    commit: row.commit_sha ? String(row.commit_sha).slice(0, 7) : "unknown",
    status: STATUS_ORDER.includes(row.status) ? row.status : "PENDING",
    previewUrl: row.preview_url || null,
    database: row.database_name || ("instant-preview-pr-" + row.pr_number),
    prUrl: "https://github.com/" + project.repo_full_name + "/pull/" + row.pr_number,
    updatedAt: row.updated_at,
    aiStatus: row.ai_status || null,
    lastError: row.last_error || null
  }));

  const summary = {
    total: environments.length,
    active: environments.filter(item => item.status !== "DELETED").length,
    ready: environments.filter(item => item.status === "READY").length,
    building: environments.filter(item => item.status === "BUILDING" || item.status === "DELETING").length,
    failed: environments.filter(item => item.status === "FAILED" || item.status === "DELETE FAILED").length,
    deleted: environments.filter(item => item.status === "DELETED").length
  };

  const aiDiagnosed = environments.filter(item => item.aiStatus === "DIAGNOSED").length;
  const aiUnavailable = environments.filter(item => item.aiStatus === "UNAVAILABLE").length;

  return {
    generatedAt: new Date().toISOString(),
    project,
    repository: project.repo_full_name,
    summary,
    ai: { diagnosed: aiDiagnosed, unavailable: aiUnavailable },
    environments
  };
}

export function renderDashboard(data, user = null, projects = []) {
  const projectOptions = projects.length
    ? projects.map(project => {
        const selected = project.project_id === data.project.project_id ? " selected" : "";
        return '<option value="' + escapeAttr(project.project_id) + '"' + selected + '>' + escapeHtml(project.name) + '</option>';
      }).join("")
    : '<option value="' + escapeAttr(data.project.project_id) + '">' + escapeHtml(data.project.name) + '</option>';

  const cards = data.environments.slice(0, 20).map(item => {
    const previewAction = item.previewUrl
      ? '<a class="button primary" href="' + escapeAttr(item.previewUrl) + '" target="_blank" rel="noreferrer">Open Preview</a>'
      : '<span class="button disabled">Preview deleted</span>';
    const error = item.lastError ? '<div class="error">' + escapeHtml(item.lastError) + '</div>' : '';
    const ai = item.aiStatus ? '<span class="ai-pill">AI ' + escapeHtml(item.aiStatus) + '</span>' : '';

    return '<article class="card">' +
      '<div class="card-head">' +
        '<div><div class="eyebrow">PR #' + item.pr + '</div><h2>' + escapeHtml(item.title) + '</h2></div>' +
        '<div class="status-row"><span class="status ' + item.status.toLowerCase().replaceAll(" ", "-") + '">' + escapeHtml(item.status) + '</span>' + ai + '</div>' +
      '</div>' +
      '<div class="meta">' +
        '<div><span>Commit</span><strong><code>' + escapeHtml(item.commit) + '</code></strong></div>' +
        '<div><span>Database</span><strong><code>' + escapeHtml(item.database) + '</code></strong></div>' +
        '<div><span>Updated</span><strong>' + escapeHtml(new Date(item.updatedAt).toLocaleString()) + '</strong></div>' +
      '</div>' + error +
      '<div class="actions">' + previewAction + '<a class="button" href="' + escapeAttr(item.prUrl) + '" target="_blank" rel="noreferrer">Open PR</a></div>' +
      '</article>';
  }).join('');

  const empty = '<div class="card"><h2>No environments yet</h2><p class="subtitle">Open a Pull Request to create the first Preview Environment.</p></div>';

  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instant Preview Dashboard</title><style>' +
    ':root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#080c16;color:#eef2ff}main{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:40px 0 72px}.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:20px}.project-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:28px;padding:14px 16px;border:1px solid #1c2840;border-radius:16px;background:#0e1524}.project-bar label{font-size:12px;color:#7f8ba5}.project-bar select{min-width:260px;height:40px;padding:0 12px;border-radius:10px;border:1px solid #273652;background:#0a101c;color:#eef2ff}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:#7e8ba8}h1{margin:8px 0;font-size:clamp(34px,5vw,56px);line-height:1.05}h2{margin:6px 0 0;font-size:20px}.subtitle{margin:0;color:#9eabc5;line-height:1.6}.refresh{font-size:12px;color:#7e8ba5}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:28px}.metric{padding:18px;border:1px solid #1c2840;border-radius:18px;background:#0e1524}.metric span{display:block;color:#7786a5;font-size:12px}.metric strong{display:block;margin-top:4px;font-size:28px}.toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.toolbar h3{margin:0;font-size:18px}.ai{font-size:12px;color:#9eabc5}.grid{display:grid;gap:14px}.card{border:1px solid #1c2840;border-radius:20px;background:#0e1524;padding:20px}.card-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.status-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.status{display:inline-flex;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em;border:1px solid #2a3855}.status.ready{background:#102a20}.status.building,.status.deleting{background:#292516}.status.failed,.status.delete-failed{background:#32191d}.status.deleted{background:#171d2b;color:#7f8ba5}.status.pending{background:#182236}.ai-pill{display:inline-flex;padding:6px 10px;border-radius:999px;font-size:11px;border:1px solid #283b60;color:#9db3e6}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.meta>div{padding:12px;border-radius:14px;background:#0a101c;border:1px solid #172136}.meta span{display:block;color:#6f7d99;font-size:11px}.meta strong{display:block;margin-top:4px;font-size:13px;word-break:break-word}.error{margin-top:12px;padding:12px;border-radius:12px;background:#2a171b;border:1px solid #4b252d;color:#f1b4bd;font-size:12px;line-height:1.5}.actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 13px;border-radius:11px;border:1px solid #273652;color:#dce5ff;text-decoration:none;font-size:13px}.button.primary{background:#edf2ff;color:#0a1020;border-color:#edf2ff}.button.disabled{opacity:.45}footer{margin-top:26px;color:#62708b;font-size:11px}@media(max-width:700px){.top{display:block}.project-bar{display:block}.project-bar select{width:100%;margin-top:8px}.refresh{margin-top:10px}.meta{grid-template-columns:1fr}}' +
    '</style></head><body><main>' +
    '<div class="top"><div><div class="eyebrow">Control Plane</div><h1>Instant Preview Dashboard</h1><p class="subtitle">'+ escapeHtml(data.project.name) +' · PR → Preview → isolated database → AI diagnosis → cleanup</p></div><div class="account">' + (user ? 'Signed in as <strong>' + escapeHtml(user.login) + '</strong>' + (user.role === 'admin' ? ' · <a href="/access">Access Control</a>' : '') + ' · <a href="/auth/logout">Sign out</a>' : '<a href="/auth/login">Sign in with GitHub</a>') + '</div><div class="refresh">Updated ' + escapeHtml(new Date(data.generatedAt).toLocaleString()) + '</div></div>' +
    '<form class="project-bar" method="get" action="/"><label>Project</label><select name="project" onchange="this.form.submit()">' + projectOptions + '</select></form>' +
    '<section class="summary">' + metric("Active", data.summary.active) + metric("Ready", data.summary.ready) + metric("Building", data.summary.building) + metric("Failed", data.summary.failed) + metric("Deleted", data.summary.deleted) + '</section>' +
    '<div class="toolbar"><h3>Recent environments</h3><div class="ai">AI diagnosed: ' + data.ai.diagnosed + ' · unavailable: ' + data.ai.unavailable + '</div></div>' +
    '<section class="grid">' + (cards || empty) + '</section>' +
    '<footer>Project: ' + escapeHtml(data.project.project_id) + ' · Repository: ' + escapeHtml(data.repository) + ' · State stored in central D1.</footer>' +
    '</main></body></html>';
}

function metric(label, value) { return '<div class="metric"><span>' + escapeHtml(label) + '</span><strong>' + value + '</strong></div>'; }

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) { return escapeHtml(value).replaceAll('`', '&#096;'); }
