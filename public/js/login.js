const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
let user = null;

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Only follow same-site relative paths after sign-in.
function destination(u) {
  const next = params.get('next');
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('login.html')) {
    if (u.role === 'admin' || !next.includes('admin')) return next;
  }
  return u.role === 'admin' ? 'admin.html' : 'index.html';
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function showLogin() {
  $('#change-form').hidden = true;
  $('#login-form').hidden = false;
  $('#username').focus();
}

function showChange(forced) {
  $('#login-form').hidden = true;
  $('#change-form').hidden = false;
  $('#change-intro').textContent = forced
    ? `Welcome, ${user.display_name}. For security, choose your own password before continuing.`
    : `Signed in as ${user.display_name} (${user.username}).`;
  $('#change-cancel').parentElement.hidden = forced;
  $('#current').focus();
}

async function init() {
  fetch('/api/public-config').then((r) => r.json()).then((c) => { if (c.orgName) $('#org-name').textContent = c.orgName; }).catch(() => {});
  const session = await fetch('/api/auth/session', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({}));
  user = session.user || null;
  if (user && (user.must_change_password || params.has('change'))) return showChange(user.must_change_password);
  if (user) return location.replace(destination(user));
  showLogin();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  const btn = e.submitter;
  btn.disabled = true;
  try {
    ({ user } = await post('/api/auth/login', { username: $('#username').value.trim(), password: $('#password').value }));
    $('#password').value = '';
    if (user.must_change_password) {
      $('#current').value = '';
      showChange(true);
    } else {
      location.replace(destination(user));
    }
  } catch (err) {
    showError($('#login-error'), err.message);
    $('#password').select();
  } finally {
    btn.disabled = false;
  }
});

$('#change-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#change-error').hidden = true;
  if ($('#new').value !== $('#confirm').value) return showError($('#change-error'), 'The new passwords do not match.');
  try {
    ({ user } = await post('/api/auth/change-password', { currentPassword: $('#current').value, newPassword: $('#new').value }));
    location.replace(destination(user));
  } catch (err) {
    showError($('#change-error'), err.message);
  }
});

$('#change-cancel').addEventListener('click', (e) => {
  e.preventDefault();
  location.replace(destination(user));
});

init();
