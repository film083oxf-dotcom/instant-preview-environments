const PREVIEW_WORKFLOW = 'Preview Environment';
const CLEANUP_WORKFLOW = 'Cleanup Preview Environment';
const AI_WORKFLOW = 'AI Diagnose Preview Failures';

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'instant-preview-environments-dashboard',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function githubJson(path) {
  const response = await fetch('https://api.github.com' + path, { headers: githubHeaders() });
  const body = await response.text();
  if (!response.ok) throw new Error('GitHub API ' + response.status + ': ' + body.slice(0, 500));
  return JSON.parse(body);
}

function latestRun(runs, name, pr) {
  return runs
    .filter(function(run) {
      return run.name === name && (run.head_branch === pr.head.ref || (run.pull_requests || []).some(function(item) { return item.number === pr.number; }));
    })
    .sort(function(a, b) { return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at); })[0] || null;
}

function statusFor(pr, previewRun, cleanupRun) {
  if (pr.state === 'closed') {
    if (cleanupRun && cleanupRun.status !== 'completed') return 'DELETING';
    if (cleanupRun && cleanupRun.conclusion === 'success') return 'DELETED';
    return cleanupRun ? 'DELETE FAILED' : 'DELETED';
  }
  if (!previewRun) return 'PENDING';
  if (previewRun.status !== 'completed') return 'BUILDING';
  return previewRun.conclusion === 'success' ? 'READY' : 'FAILED';
}

export async function getDashboardData(env) {
  const repo = env.GITHUB_REPO;
  const results = await Promise.all([
    githubJson('/repos/' + repo + '/pulls?state=all&per_page=50&sort=updated&direction=desc'),
    githubJson('/repos/' + repo + '/actions/runs?per_page=100')
  ]);
  const prs = results[0];
  const runs = results[1].workflow_runs || [];
  const environments = prs.map(function(pr) {
    const previewRun = latestRun(runs, PREVIEW_WORKFLOW, pr);
    const cleanupRun = latestRun(runs, CLEANUP_WORKFLOW, pr);
    const status = statusFor(pr, previewRun, cleanupRun);
    const previewName = 'pr-' + pr.number;
    return {
      pr: pr.number,
      title: pr.title,
      state: pr.state,
      branch: pr.head.ref,
      commit: pr.head.sha.slice(0, 7),
      status: status,
      previewName: previewName,
      previewUrl: pr.state === 'open' && status !== 'DELETED'
        ? 'https://' + previewName + '-instant-preview-environments.' + env.PREVIEW_DOMAIN
        : null,
      database: 'instant-preview-pr-' + pr.number,
      prUrl: pr.html_url,
      updatedAt: pr.updated_at,
      previewRun: previewRun ? { id: previewRun.id, status: previewRun.status, conclusion: previewRun.conclusion, updatedAt: previewRun.updated_at } : null
    };
  });
  const aiCandidates = runs.filter(function(run) { return run.name === AI_WORKFLOW; })
    .sort(function(a, b) { return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at); });
  const ai = aiCandidates.find(function(run) { return run.conclusion === "success"; }) || aiCandidates[0] || null;
  return {
    generatedAt: new Date().toISOString(),
    repository: repo,
    summary: {
      total: environments.length,
      active: environments.filter(function(x) { return x.state === 'open'; }).length,
      ready: environments.filter(function(x) { return x.status === 'READY'; }).length,
      building: environments.filter(function(x) { return x.status === 'BUILDING' || x.status === 'DELETING'; }).length,
      failed: environments.filter(function(x) { return x.status === 'FAILED' || x.status === 'DELETE FAILED'; }).length,
      deleted: environments.filter(function(x) { return x.status === 'DELETED'; }).length
    },
    environments: environments,
    ai: ai ? { status: ai.status, conclusion: ai.conclusion, updatedAt: ai.updated_at, url: ai.html_url } : null
  };
}

export function renderDashboard(data) {
  const cards = data.environments.slice(0, 20).map(function(item) {
    const previewAction = item.previewUrl
      ? '<a class="button primary" href="' + escapeAttr(item.previewUrl) + '" target="_blank" rel="noreferrer">Open Preview</a>'
      : '<span class="button disabled">Preview deleted</span>';
    return '<article class="card">' +
      '<div class="card-head"><div><div class="eyebrow">PR #' + item.pr + '</div><h2>' + escapeHtml(item.title) + '</h2></div>' +
      '<span class="status ' + item.status.toLowerCase().replaceAll(' ', '-') + '">' + escapeHtml(item.status) + '</span></div>' +
      '<div class="meta">' +
      '<div><span>Branch</span><strong>' + escapeHtml(item.branch) + '</strong></div>' +
      '<div><span>Commit</span><strong><code>' + escapeHtml(item.commit) + '</code></strong></div>' +
      '<div><span>Database</span><strong><code>' + escapeHtml(item.database) + '</code></strong></div>' +
      '</div>' +
      '<div class="actions">' + previewAction + '<a class="button" href="' + escapeAttr(item.prUrl) + '" target="_blank" rel="noreferrer">Open PR</a></div>' +
      '</article>';
  }).join('');

  const aiText = data.ai ? 'AI Diagnose: <strong>' + escapeHtml(data.ai.conclusion || data.ai.status) + '</strong>' : 'AI Diagnose: no runs yet';
  const empty = '<div class="card"><h2>No pull requests found</h2><p class="subtitle">Open a PR to create the first preview environment.</p></div>';

  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Instant Preview Dashboard</title><style>' +
    ':root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#080c16;color:#eef2ff}main{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:40px 0 72px}.top{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:28px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:#7e8ba8}h1{margin:8px 0;font-size:clamp(34px,5vw,56px);line-height:1.05}.subtitle{margin:0;color:#9eabc5;line-height:1.6}.refresh{font-size:12px;color:#7e8ba5}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:28px}.metric{padding:18px;border:1px solid #1c2840;border-radius:18px;background:#0e1524}.metric span{display:block;color:#7786a5;font-size:12px}.metric strong{display:block;margin-top:4px;font-size:28px}.toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.toolbar h3{margin:0;font-size:18px}.ai{font-size:12px;color:#9eabc5}.grid{display:grid;gap:14px}.card{border:1px solid #1c2840;border-radius:20px;background:#0e1524;padding:20px}.card-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}h2{margin:6px 0 0;font-size:20px}.status{display:inline-flex;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.06em;border:1px solid #2a3855}.status.ready{background:#102a20}.status.building,.status.deleting{background:#292516}.status.failed,.status.delete-failed{background:#32191d}.status.deleted{background:#171d2b;color:#7f8ba5}.status.pending{background:#182236}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.meta>div{padding:12px;border-radius:14px;background:#0a101c;border:1px solid #172136}.meta span{display:block;color:#6f7d99;font-size:11px}.meta strong{display:block;margin-top:4px;font-size:13px;word-break:break-word}.actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 13px;border-radius:11px;border:1px solid #273652;color:#dce5ff;text-decoration:none;font-size:13px}.button.primary{background:#edf2ff;color:#0a1020;border-color:#edf2ff}.button.disabled{opacity:.45}footer{margin-top:26px;color:#62708b;font-size:11px}@media(max-width:700px){.top{display:block}.refresh{margin-top:10px}.meta{grid-template-columns:1fr}}' +
    '</style></head><body><main>' +
    '<div class="top"><div><div class="eyebrow">Control Plane</div><h1>Instant Preview Dashboard</h1><p class="subtitle">PR → Preview → isolated database → AI diagnosis → cleanup</p></div><div class="refresh">Updated ' + escapeHtml(new Date(data.generatedAt).toLocaleString()) + '</div></div>' +
    '<section class="summary">' + metric('Active', data.summary.active) + metric('Ready', data.summary.ready) + metric('Building', data.summary.building) + metric('Failed', data.summary.failed) + metric('Deleted', data.summary.deleted) + '</section>' +
    '<div class="toolbar"><h3>Recent environments</h3><div class="ai">' + aiText + '</div></div>' +
    '<section class="grid">' + (cards || empty) + '</section>' +
    '<footer>Repository: ' + escapeHtml(data.repository) + ' · Refresh this page to pull the latest GitHub state.</footer>' +
    '</main></body></html>';
}

function metric(label, value) {
  return '<div class="metric"><span>' + escapeHtml(label) + '</span><strong>' + value + '</strong></div>';
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) { return escapeHtml(value).replaceAll('`', '&#096;'); }
