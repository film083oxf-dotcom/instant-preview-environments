export function renderAccessPage({ repository, user, memberships, projectMemberships }) {
  const projectName = String(repository || "").split("/")[1] || String(repository || "Current project");

  const platformRows = memberships.length
    ? memberships.map(item => {
        const status = item.status === "active" ? "ACTIVE" : "REVOKED";
        const action = Number(item.github_id) === Number(user.githubId)
          ? "<span class='muted'>Current account</span>"
          : "<form method='post' action='/api/access/revoke' onsubmit='return confirm(&quot;Revoke platform access for this account?&quot;)'><input type='hidden' name='github_id' value='" + escapeAttr(item.github_id) + "'><button class='danger' type='submit'>Revoke</button></form>";

        return "<tr>" +
          "<td><strong>" + escapeHtml(item.login || ("GitHub #" + item.github_id)) + "</strong><div class='muted'>" + escapeHtml(item.github_id) + "</div></td>" +
          "<td>" + escapeHtml(item.role) + "</td>" +
          "<td><span class='status " + escapeHtml(item.status) + "'>" + status + "</span></td>" +
          "<td>" + escapeHtml(item.granted_by || "—") + "</td>" +
          "<td>" + action + "</td>" +
        "</tr>";
      }).join("")
    : "<tr><td colspan='5' class='muted'>No platform members yet.</td></tr>";

  const projectRows = projectMemberships.length
    ? projectMemberships.map(item => {
        const status = item.status === "active" ? "ACTIVE" : "REVOKED";
        const action = Number(item.github_id) === Number(user.githubId)
          ? "<span class='muted'>Current account</span>"
          : "<form method='post' action='/api/access/project-revoke' onsubmit='return confirm(&quot;Revoke project access for this account?&quot;)'><input type='hidden' name='github_id' value='" + escapeAttr(item.github_id) + "'><button class='danger' type='submit'>Revoke</button></form>";

        return "<tr>" +
          "<td><strong>" + escapeHtml(item.login || ("GitHub #" + item.github_id)) + "</strong><div class='muted'>" + escapeHtml(item.github_id) + "</div></td>" +
          "<td><span class='status " + escapeHtml(item.status) + "'>" + status + "</span></td>" +
          "<td>" + escapeHtml(item.granted_by || "—") + "</td>" +
          "<td>" + action + "</td>" +
        "</tr>";
      }).join("")
    : "<tr><td colspan='4' class='muted'>No project members yet.</td></tr>";

  return "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Access Control · Instant Preview</title>" +
    "<style>" +
    ":root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:#080c16;color:#eef2ff}main{width:min(1100px,calc(100% - 32px));margin:0 auto;padding:40px 0 72px}a{color:#a9bbff}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-end}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:#7e8ba8}h1{margin:8px 0 8px;font-size:clamp(32px,5vw,52px)}h2{margin-top:0}.subtitle{color:#9eabc5;line-height:1.6}.panel{margin-top:22px;border:1px solid #1c2840;border-radius:20px;background:#0e1524;padding:20px}.form-row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.field{display:grid;gap:6px}.field label{font-size:12px;color:#7f8ba5}.field input,.field select{height:40px;padding:0 12px;border-radius:10px;border:1px solid #273652;background:#0a101c;color:#eef2ff}.primary,.danger{height:40px;padding:0 14px;border-radius:10px;border:1px solid #273652;cursor:pointer;font-weight:600}.primary{background:#edf2ff;color:#0a1020}.danger{background:#32191d;color:#f4bec7}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{text-align:left;padding:12px;border-bottom:1px solid #1c2840;white-space:nowrap}th{font-size:12px;color:#7f8ba5}.status{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid #273652}.status.active{background:#102a20}.status.revoked{background:#2a171b;color:#f4bec7}.muted{color:#7f8ba5;font-size:12px}.note{padding:12px 14px;border-radius:12px;background:#111a2d;border:1px solid #22304b;color:#aeb8cf;line-height:1.6}" +
    "</style></head><body><main>" +
    "<div class='top'><div><div class='eyebrow'>Authorization</div><h1>Access Control</h1><p class='subtitle'>Manage platform access and access to the current project.</p></div><div>Signed in as <strong>" + escapeHtml(user.login) + "</strong> · <a href='/'>Dashboard</a> · <a href='/auth/logout'>Sign out</a></div></div>" +
    "<section class='panel'><h2>Platform access</h2><p class='subtitle'>Platform membership controls who can use this Preview Platform at all.</p><form class='form-row' method='post' action='/api/access/grant'><div class='field'><label>GitHub login</label><input name='login' placeholder='octocat' required></div><div class='field'><label>Role</label><select name='role'><option value='member'>member</option><option value='admin'>admin</option></select></div><button class='primary' type='submit'>Grant platform access</button></form><div class='table-wrap'><table><thead><tr><th>GitHub account</th><th>Role</th><th>Status</th><th>Granted by</th><th>Action</th></tr></thead><tbody>" + platformRows + "</tbody></table></div></section>" +
    "<section class='panel'><h2>Project access · " + escapeHtml(projectName) + "</h2><p class='subtitle'>A platform member must also have access to this project. Platform admins bypass project membership checks.</p><form class='form-row' method='post' action='/api/access/project-grant'><div class='field'><label>GitHub login</label><input name='login' placeholder='octocat' required></div><button class='primary' type='submit'>Grant project access</button></form><div class='table-wrap'><table><thead><tr><th>GitHub account</th><th>Status</th><th>Granted by</th><th>Action</th></tr></thead><tbody>" + projectRows + "</tbody></table></div></section>" +
    "<p class='note'>Phase 7 introduces project-scoped authorization. Current production uses this repository as the first project. The data model is ready for additional projects without changing the user/session model.</p>" +
    "</main></body></html>";
}


export function redirectBack(url, error) {
  const target = new URL(url);
  if (error) target.searchParams.set("error", error);
  return new Response(null, {
    status: 303,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store"
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll(String.fromCharCode(96), "&#096;");
}
