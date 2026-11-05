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

const MENU = [
  { href: 'index.html', label: '盤點單' },
  { href: 'items.html', label: '料號' },
  { href: 'moves.html', label: '庫存異動' },
  { href: 'users.html', label: '帳號', manager: true },
];

function renderMenu(user) {
  const current = location.pathname.split('/').pop() || 'index.html';
  const links = MENU
    .filter((m) => !m.manager || user.role === 0)
    .map((m) => `<a href="${m.href}"${m.href === current ? ' class="active"' : ''}>${m.label}</a>`)
    .join('');
  document.getElementById('nav').innerHTML = `
    <div class="brand">倉庫盤點管理系統</div>
    <nav>${links}</nav>
    <div class="who">${esc(user.name)}（${user.role === 0 ? '主管' : '倉管人員'}）
      <a href="#" id="logout">登出</a></div>`;
  document.getElementById('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('POST', '/api/logout');
    location.href = 'login.html';
  });
}

// Call at the top of every page except login. Redirects if not allowed.
async function initPage({ managerOnly = false } = {}) {
  const { user } = await api('GET', '/api/me');
  if (managerOnly && user.role !== 0) {
    location.href = 'index.html';
    throw new Error('只有主管可以使用這個頁面');
  }
  renderMenu(user);
  showFlash();
  return user;
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

// Label for a list that includes disabled items
function withOff(label, isActive) {
  return isActive ? label : `${label}（停用）`;
}

const BADGE_CLASS = { 盤點中: 'info', 已結案: 'ok' };

// Colored label for a count status
function badge(value) {
  return `<span class="badge ${BADGE_CLASS[value] || 'off'}">${esc(value)}</span>`;
}

// '+5', '−3' (minus sign), '0'; empty for null
function signed(n) {
  if (n === null || n === undefined) return '';
  if (n > 0) return '+' + n;
  if (n < 0) return '−' + Math.abs(n);
  return '0';
}
