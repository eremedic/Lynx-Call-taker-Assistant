const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Explains why the server function didn't answer with JSON.
function unreachable(status) {
  if (status === 404) {
    return 'The AmbuIntake server function is not deployed. In Netlify, open the latest deploy and check the "Functions" section of the deploy log for an "api" function. Make sure the site deploys the main branch and that the repository\'s netlify.toml is being used (Site configuration → Build & deploy: base directory empty).';
  }
  if (status === 502 || status === 500) {
    return 'The server function crashed while starting. First, in Netlify → Deploys, make sure the newest deploy (from the main branch) is the one that is Published — older deploys had a startup bug. If it is, open Logs → Functions → api and look at the most recent red error lines.';
  }
  if (status === 504) {
    return 'The server function timed out. This usually means it could not reach the database: check DATABASE_URL (Supabase → Connect → Transaction pooler) and that the Supabase project is not paused.';
  }
  return `The server did not respond normally${status ? ` (HTTP ${status})` : ''}. Check your internet connection, then Netlify → Logs → Functions → api.`;
}

function render(result) {
  const failing = result.checks.filter((c) => !c.ok && !c.warn && !c.info);
  const warnings = result.checks.filter((c) => !c.ok && c.warn);
  $('#status-title').textContent = failing.length ? 'Something needs attention' : warnings.length ? 'Working, with warnings' : 'Everything is working';
  $('#status-title').style.color = failing.length ? 'var(--red-600)' : warnings.length ? 'var(--amber-600)' : 'var(--green-600)';
  $('#status-sub').textContent = failing.length
    ? 'Fix the first red item below, redeploy if you changed a Netlify setting, then click "Check again".'
    : `Checked ${new Date(result.checkedAt || Date.now()).toLocaleString()}.`;
  $('#status-checks').innerHTML = result.checks.map((c) => {
    const kind = c.ok ? 'ok' : c.warn ? 'warn' : c.info ? 'info' : 'bad';
    const mark = { ok: '✓', warn: '!', info: 'i', bad: '✕' }[kind];
    return `<li class="status-${kind}"><span class="mark">${mark}</span><div><strong>${esc(c.name)}</strong><div>${esc(c.detail)}</div>${c.error ? `<code>${esc(c.error)}</code>` : ''}</div></li>`;
  }).join('');
}

async function check() {
  $('#status-title').textContent = 'Checking…';
  $('#status-title').style.color = '';
  $('#status-checks').innerHTML = '';
  let res;
  try {
    res = await fetch('/api/health', { cache: 'no-store' });
  } catch {
    render({ checks: [{ name: 'Server', ok: false, detail: unreachable(0) }] });
    return;
  }
  const data = await res.json().catch(() => null);
  if (!data?.checks) {
    render({ checks: [
      { name: 'Web pages', ok: true, detail: 'This page loaded, so the site itself is published.' },
      { name: 'Server function', ok: false, detail: unreachable(res.status) },
    ] });
    return;
  }
  render(data);
}

$('#recheck').addEventListener('click', check);
check();
