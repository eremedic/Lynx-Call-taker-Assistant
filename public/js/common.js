export async function api(path, { method = 'GET', body } = {}) {
  const hasBody = method !== 'GET';
  const res = await fetch(path, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body ?? {}) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
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
    if (window.lynxBeforeSignOut && !window.lynxBeforeSignOut()) return;
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
};

export const STATUS_CHIPS = {
  meets: 'chip-green',
  likely: 'chip-green',
  review: 'chip-amber',
  not_met: 'chip-red',
  incomplete: '',
};

export const CRITERION_LABELS = {
  emergency: 'Emergency screen',
  bed_confined: 'Bed confinement',
  condition: 'Supports necessity',
  als: 'ALS indicator',
  sct: 'SCT indicator',
  disqualifier: 'Disqualifier',
  documentation: 'Documentation',
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
