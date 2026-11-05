export async function api(path, { method = 'GET', body } = {}) {
  const hasBody = method !== 'GET';
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(body ?? {}) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('Can\'t reach the AmbuIntake server. Check your connection; see status.html for details.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!data) throw Object.assign(new Error(`The AmbuIntake server isn't responding properly (HTTP ${res.status}). See status.html.`), { status: res.status });
  if (!res.ok) {
    if (data.code === 'AUTH_REQUIRED') redirectToLogin();
    if (data.code === 'PASSWORD_CHANGE_REQUIRED') redirectToLogin({ change: true });
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

// Replaces the page with a clear explanation when it can't load (for example
// the server can't reach the database), instead of leaving dead buttons.
export function showLoadFailure(err) {
  console.error('[AmbuIntake] Page failed to load:', err);
  if (document.getElementById('load-failure')) return;
  const box = document.createElement('div');
  box.id = 'load-failure';
  box.className = 'load-failure';
  box.setAttribute('role', 'alert');
  box.innerHTML = `
    <div class="load-failure-card">
      <h1>AmbuIntake couldn't load</h1>
      <p class="reason">${esc(err?.message || err || 'Unknown error.')}</p>
      <p>Nothing on this page will work until this is fixed. The system status page checks the server, the database connection and the settings, and says what to change.</p>
      <div class="actions">
        <a class="btn btn-primary" href="status.html">Open system status</a>
        <button type="button" class="btn" data-retry>Try again</button>
        <a class="btn btn-ghost" href="login.html">Sign in again</a>
      </div>
    </div>`;
  box.querySelector('[data-retry]').addEventListener('click', () => location.reload());
  document.body.prepend(box);
}

// ----------------------------------------------------------- versioning
// Each Netlify deploy writes version.json. Pages show it in the user menu and,
// when a newer deploy appears while a page is open, offer to reload.
async function fetchVersion() {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export function versionLabel(v) {
  if (!v || v.commit === 'local') return 'Version: local copy';
  return `Version ${v.commit}${v.builtAt ? ` · deployed ${new Date(v.builtAt).toLocaleString()}` : ''}`;
}

export async function watchForUpdates({ isBusy = () => false, everyMs = 5 * 60 * 1000 } = {}) {
  const loaded = await fetchVersion();
  document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = versionLabel(loaded); });
  if (!loaded || loaded.commit === 'local') return;
  const check = async () => {
    const now = await fetchVersion();
    if (!now || now.commit === loaded.commit || document.getElementById('update-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'update-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>A new version of AmbuIntake is available.</span><button type="button" class="btn btn-sm">Reload now</button>';
    bar.querySelector('button').addEventListener('click', () => {
      if (!isBusy() || confirm('Reload now? Unsaved changes to this call will be lost. Save the call first to keep them.')) location.reload();
    });
    document.body.prepend(bar);
  };
  setInterval(check, everyMs);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}

export function redirectToLogin({ change = false } = {}) {
  const next = encodeURIComponent(location.pathname + location.hash);
  location.href = `login.html?next=${next}${change ? '&change=1' : ''}`;
}

// Resolves to the signed-in user, or redirects to the sign-in page.
export async function requireUser({ role } = {}) {
  const { user } = await api('/api/auth/session');
  if (!user) { redirectToLogin(); return new Promise(() => {}); }
  if (user.must_change_password) { redirectToLogin({ change: true }); return new Promise(() => {}); }
  if (role && user.role !== role) {
    location.href = 'index.html?denied=1';
    return new Promise(() => {});
  }
  return user;
}

export const ROLE_LABELS = { admin: 'Administrator', call_taker: 'Call Taker' };

// Renders the signed-in user's name and menu into the top bar.
export function mountUserMenu(container, user) {
  const initials = user.display_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  container.innerHTML = `
    <div class="user-menu">
      <button type="button" class="user-chip" aria-haspopup="true" aria-expanded="false">
        <span class="avatar">${esc(initials)}</span>
        <span class="who"><strong>${esc(user.display_name)}</strong><small>${esc(ROLE_LABELS[user.role] || user.role)}</small></span>
        <span aria-hidden="true">▾</span>
      </button>
      <div class="menu" role="menu" hidden>
        <a role="menuitem" href="login.html?change=1&next=${encodeURIComponent(location.pathname)}">Change password</a>
        <button role="menuitem" type="button" data-signout>Sign out</button>
        <div class="menu-version" data-version>Version …</div>
      </div>
    </div>`;
  const chip = container.querySelector('.user-chip');
  const menu = container.querySelector('.menu');
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    chip.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', () => { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); });
  container.querySelector('[data-signout]').addEventListener('click', async () => {
    if (window.beforeSignOut && !window.beforeSignOut()) return;
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = 'login.html';
  });
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function toast(message, type = '') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const STATUS_LABELS = {
  meets: 'Meets Medical Necessity',
  likely: 'Likely Meets — Complete Items',
  review: 'Needs Review',
  not_met: 'Does Not Appear to Meet',
  incomplete: 'Gathering Information',
  not_required: 'Medical Necessity Not Required',
};

export const STATUS_CHIPS = {
  meets: 'chip-green',
  likely: 'chip-green',
  review: 'chip-amber',
  not_met: 'chip-red',
  incomplete: '',
  not_required: 'chip-blue',
};

export const CRITERION_LABELS = {
  emergency: 'Emergency screen',
  bed_confined: 'Bed confinement',
  condition: 'Supports necessity',
  als: 'ALS indicator',
  sct: 'SCT indicator',
  disqualifier: 'Disqualifier',
  documentation: 'Documentation',
  prior_auth: 'Prior authorization',
  info: 'Information',
};

export const CRITERION_CHIPS = {
  emergency: 'chip-red',
  bed_confined: 'chip-blue',
  condition: 'chip-green',
  als: 'chip-violet',
  sct: 'chip-violet',
  disqualifier: 'chip-amber',
  documentation: '',
  prior_auth: 'chip-amber',
  info: '',
};

export const PRIORITY_LABELS = { 1: 'Critical', 2: 'High', 3: 'Normal' };

export function formatAnswer(v) {
  if (v === 'yes') return 'Yes';
  if (v === 'no') return 'No';
  return v ?? '';
}

export function formatDate(sqlUtc) {
  if (!sqlUtc) return '';
  const d = new Date(`${sqlUtc.replace(' ', 'T')}Z`);
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// Payer <option>s grouped into payers and transport brokers.
export function payerOptions(payers, selected = '') {
  const opt = (p) => `<option value="${esc(p.code)}" ${p.code === selected ? 'selected' : ''}>${esc(p.name)}</option>`;
  const plain = payers.filter((p) => p.kind !== 'broker');
  const brokers = payers.filter((p) => p.kind === 'broker');
  return `<optgroup label="Payers">${plain.map(opt).join('')}</optgroup>`
    + (brokers.length ? `<optgroup label="Transport brokers">${brokers.map(opt).join('')}</optgroup>` : '');
}
