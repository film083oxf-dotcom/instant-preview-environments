export function renderAccessPage({ repository, user, memberships }) {
  const rows = memberships.length
    ? memberships.map(item => {
        const status = item.status === "active" ? "ACTIVE" : "REVOKED";
        const action = Number(item.github_id) === Number(user.githubId)
          ? "<span class='muted'>Current account</span>"
          : "<form method='post' action='/api/access/revoke' onsubmit='return confirm(&quot;Revoke access for this account?&quot;)'><input type='hidden' name='github_id' value='" + escapeAttr(item.github_id) + "'><button class='danger' type='submit'>Revoke</button></form>";

        return "<tr>" +
          "<td><strong>" + escapeHtml(item.login || ("GitHub #" + item.github_id)) + "</strong><div class='muted'>" + escapeHtml(item.github_id) + "</div></td>" +
          "<td>" + escapeHtml(item.role) + "</td>" +
          "<td><span class='status " + escapeHtml(item.status) + "'>" + status + "</span></td>" +
          "<td>" + escapeHtml(item.granted_by || "—") + "</td>" +
          "<td>" + action + "</td>" +
        "</tr>";
      }).join("")
    : "<tr><td colspan='5' class='muted'>No members yet.</td></tr>";

  return "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Access Control · Instant Preview</title>" +
    "<style>" +
    ":root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:#080c16;color:#eef2ff}main{width:min(1100px,calc(100% - 32px));margin:0 auto;padding:40px 0 72px}a{color:#a9bbff}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-end}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:#7e8ba8}h1{margin:8px 0 8px;font-size:clamp(32px,5vw,52px)}.subtitle{color:#9eabc5;line-height:1.6}.panel{margin-top:22px;border:1px solid #1c2840;border-radius:20px;background:#0e1524;padding:20px}.form-row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.field{display:grid;gap:6px}.field label{font-size:12px;color:#7f8ba5}.field input,.field select{height:40px;padding:0 12px;border-radius:10px;border:1px solid #273652;background:#0a101c;color:#eef2ff}.primary,.danger{height:40px;padding:0 14px;border-radius:10px;border:1px solid #273652;cursor:pointer;font-weight:600}.primary{background:#edf2ff;color:#0a1020}.danger{background:#32191d;color:#f4bec7}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{text-align:left;padding:12px;border-bottom:1px solid #1c2840;white-space:nowrap}th{font-size:12px;color:#7f8ba5}.status{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid #273652}.status.active{background:#102a20}.status.revoked{background:#2a171b;color:#f4bec7}.muted{color:#7f8ba5;font-size:12px}" +
    "</style></head><body><main>" +
    "<div class='top'><div><div class='eyebrow'>Authorization</div><h1>Access Control</h1><p class='subtitle'>Manage who can access the current Preview Platform.</p></div><div>Signed in as <strong>" + escapeHtml(user.login) + "</strong> · <a href='/'>Dashboard</a> · <a href='/auth/logout'>Sign out</a></div></div>" +
    "<section class='panel'><h2>Grant access</h2><p class='subtitle'>The user must sign in once before their GitHub login can be granted access.</p><form class='form-row' method='post' action='/api/access/grant'><div class='field'><label>GitHub login</label><input name='login' placeholder='octocat' required></div><div class='field'><label>Role</label><select name='role'><option value='member'>member</option><option value='admin'>admin</option></select></div><button class='primary' type='submit'>Grant access</button></form></section>" +
    "<section class='panel'><h2>Members</h2><div class='table-wrap'><table><thead><tr><th>GitHub account</th><th>Role</th><th>Status</th><th>Granted by</th><th>Action</th></tr></thead><tbody>" + rows + "</tbody></table></div></section>" +
    "<p class='muted'>Phase 6B currently applies platform-wide access to this repository. Project-scoped memberships can build on this model later.</p>" +
    "</main></body></html>";
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
