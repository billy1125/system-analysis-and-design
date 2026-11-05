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
  { href: 'index.html', label: '在廠訪客' },
  { href: 'register.html', label: '來訪登記' },
  { href: 'visits.html', label: '來訪紀錄' },
  { href: 'visitors.html', label: '訪客資料' },
  { href: 'employees.html', label: '員工名單', admin: true },
  { href: 'passes.html', label: '訪客證', admin: true },
  { href: 'users.html', label: '帳號', admin: true },
];

function renderMenu(user) {
  const current = location.pathname.split('/').pop() || 'index.html';
  const links = MENU
    .filter((m) => !m.admin || user.role === 0)
    .map((m) => `<a href="${m.href}"${m.href === current ? ' class="active"' : ''}>${m.label}</a>`)
    .join('');
  document.getElementById('nav').innerHTML = `
    <div class="brand">工廠訪客進出登記系統</div>
    <nav>${links}</nav>
    <div class="who">${esc(user.name)}（${user.role === 0 ? '管理員' : '接待員'}）
      <a href="#" id="logout">登出</a></div>`;
  document.getElementById('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('POST', '/api/logout');
    location.href = 'login.html';
  });
}

// Call at the top of every page except login. Redirects if not allowed.
async function initPage({ adminOnly = false } = {}) {
  const { user } = await api('GET', '/api/me');
  if (adminOnly && user.role !== 0) {
    location.href = 'index.html';
    throw new Error('只有管理員可以使用這個頁面');
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

function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
