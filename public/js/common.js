export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
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
