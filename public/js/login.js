const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
let user = null;

// A request that explains when the server itself isn't working.
async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...options });
  } catch {
    throw Object.assign(new Error('Can\'t reach the AmbuIntake server. Check your connection.'), { server: true });
  }
  const data = await res.json().catch(() => null);
  if (!data) throw Object.assign(new Error(`The AmbuIntake server isn't responding properly (HTTP ${res.status}).`), { server: true });
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { server: res.status >= 500 });
  return data;
}

const post = (path, body) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function showServerProblem(message) {
  const banner = $('#server-banner');
  banner.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = `${message} `;
  const link = document.createElement('a');
  link.href = 'status.html';
  link.textContent = 'Open the system status page';
  banner.append(text, link, document.createTextNode(' for details.'));
  banner.hidden = false;
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
  let session = {};
  try {
    session = await request('/api/auth/session');
  } catch (err) {
    showServerProblem(err.message);
  }
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
    if (err.server) showServerProblem(err.message);
    showError($('#login-error'), err.server ? 'Sign-in is unavailable right now (see the message above).' : err.message);
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
