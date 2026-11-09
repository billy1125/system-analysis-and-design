// Shared helpers for every page: API calls, menu, messages.

// Call the server API. Returns the JSON data, or throws Error with the message to show.
async function api(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/login')) {
    location.href = 'login.html';
    throw new Error(data.error || '請先登入');
  }
  if (!res.ok) throw new Error(data.error || '系統發生錯誤');
  return data;
}

// Escape text before putting it into HTML
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Show a message in the #msg box. type: 'ok' or 'error'
function showMessage(text, type = 'ok') {
  const box = document.getElementById('msg');
  if (!box) return alert(text);
  box.textContent = text;
  box.className = 'msg ' + type;
  box.hidden = !text;
}

function clearMessage() {
  showMessage('');
}

// Keep a message for the next page (used after a redirect)
function setFlash(text) {
  sessionStorage.setItem('flash', text);
}

function showFlash() {
  const text = sessionStorage.getItem('flash');
  if (text) {
    sessionStorage.removeItem('flash');
    showMessage(text, 'ok');
  }
}

// users.role values
const ROLE_ADMIN = 0;
const ROLE_RECEPTIONIST = 1;
const ROLE_EMPLOYEE = 2; // host employee (CR-01)
const ROLE_LABELS = { 0: '管理員', 1: '接待員', 2: '受訪員工' };
const STAFF = [ROLE_ADMIN, ROLE_RECEPTIONIST];

const MENU = [
  { href: 'index.html', label: '在廠訪客', roles: STAFF },
  { href: 'register.html', label: '來訪登記', roles: STAFF },
  { href: 'appointments.html', label: '預約清單', roles: STAFF },
  { href: 'visits.html', label: '來訪紀錄', roles: STAFF },
  { href: 'visitors.html', label: '訪客資料', roles: STAFF },
  { href: 'overview.html', label: '當日總覽', roles: [ROLE_ADMIN] }, // CR-03
  { href: 'employees.html', label: '員工名單', roles: [ROLE_ADMIN] },
  { href: 'passes.html', label: '訪客證', roles: [ROLE_ADMIN] },
  { href: 'users.html', label: '帳號', roles: [ROLE_ADMIN] },
  { href: 'my-appointments.html', label: '我的預約', roles: [ROLE_EMPLOYEE] },
];

// FR-04 (revised): home page depends on the role
function homePage(role) {
  return role === ROLE_EMPLOYEE ? 'my-appointments.html' : 'index.html';
}

function renderMenu(user) {
  const current = location.pathname.split('/').pop() || 'index.html';
  const links = MENU
    .filter((m) => m.roles.includes(user.role))
    .map((m) => `<a href="${m.href}"${m.href === current ? ' class="active"' : ''}>${m.label}</a>`)
    .join('');
  document.getElementById('nav').innerHTML = `
    <div class="brand">工廠訪客進出登記系統</div>
    <nav>${links}</nav>
    <div class="who">${esc(user.name)}（${ROLE_LABELS[user.role]}）
      <a href="#" id="logout">登出</a></div>`;
  document.getElementById('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('POST', '/api/logout');
    location.href = 'login.html';
  });
}

// Call at the top of every page except login. roles: who may open the page.
async function initPage({ roles = STAFF } = {}) {
  const { user } = await api('GET', '/api/me');
  if (!roles.includes(user.role)) {
    location.href = homePage(user.role);
    throw new Error('你的帳號不能使用這個頁面');
  }
  renderMenu(user);
  showFlash();
  return user;
}

// Turn textarea text into a list of names, one per line
function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '');
}

// Build <option> tags. items: [{ value, label }]
function optionTags(items, selected, placeholder) {
  const head = placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '';
  return head + items
    .map((i) => `<option value="${esc(i.value)}"${String(i.value) === String(selected) ? ' selected' : ''}>${esc(i.label)}</option>`)
    .join('');
}

// 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DD HH:MM'
function shortTime(t) {
  return t ? t.slice(0, 16) : '';
}

function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
