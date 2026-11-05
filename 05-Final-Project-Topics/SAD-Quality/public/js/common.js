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
  { href: 'index.html', label: '未結案清單' },
  { href: 'issue-new.html', label: '登記異常' },
  { href: 'issues.html', label: '異常單查詢' },
  { href: 'products.html', label: '產品', manager: true },
  { href: 'departments.html', label: '責任單位', manager: true },
  { href: 'defect-types.html', label: '異常類別', manager: true },
  { href: 'users.html', label: '帳號', manager: true },
];

function renderMenu(user) {
  const current = location.pathname.split('/').pop() || 'index.html';
  const links = MENU
    .filter((m) => !m.manager || user.role === 0)
    .map((m) => `<a href="${m.href}"${m.href === current ? ' class="active"' : ''}>${m.label}</a>`)
    .join('');
  document.getElementById('nav').innerHTML = `
    <div class="brand">品質異常回報管理系統</div>
    <nav>${links}</nav>
    <div class="who">${esc(user.name)}（${user.role === 0 ? '主管' : '品管人員'}）
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

const BADGE_CLASS = { 待處理: 'warn', 處理中: 'info', 已結案: 'ok', 不成立: 'off' };

// Colored label for an issue status
function badge(value) {
  return `<span class="badge ${BADGE_CLASS[value] || 'off'}">${esc(value)}</span>`;
}

// ---------- issue fields, used by UI-03 (register) and UI-05 (edit) ----------

// v: current values (empty object for a new issue); now: 'YYYY-MM-DD HH:MM'
function issueFieldsHtml(v, products, defectTypes, now) {
  const foundAt = v.found_at ? v.found_at.slice(0, 16).replace(' ', 'T') : now.replace(' ', 'T');
  return `
    <div class="row">
      <label>發現時間<input name="found_at" type="datetime-local" max="${esc(now.replace(' ', 'T'))}" value="${esc(foundAt)}"></label>
      <label>回報人<input name="reporter" maxlength="20" value="${esc(v.reporter)}" placeholder="姓名（單位與職稱）"></label>
      <label>產線<input name="line" maxlength="20" value="${esc(v.line)}"></label>
      <label>工站或機台<input name="station" maxlength="30" value="${esc(v.station)}"></label>
    </div>
    <div class="row">
      <label>產品<select name="product_id">${optionTags(
        products.map((p) => ({ value: p.id, label: `${p.part_no} ${p.name}` })), v.product_id, '請選擇')}</select></label>
      <label>批號<input name="lot_no" maxlength="20" value="${esc(v.lot_no)}"></label>
      <label>異常類別<select name="defect_type_id">${optionTags(
        defectTypes.map((t) => ({ value: t.id, label: t.name })), v.defect_type_id, '請選擇')}</select></label>
      <label>影響數量<input name="qty" type="number" min="0" max="99999" value="${esc(v.qty)}"></label>
    </div>
    <div class="row">
      <label>異常描述<textarea name="description" maxlength="200">${esc(v.description)}</textarea></label>
    </div>`;
}

function readIssueFields(form) {
  const body = {};
  for (const name of ['found_at', 'reporter', 'line', 'station', 'product_id', 'lot_no', 'defect_type_id', 'qty', 'description']) {
    body[name] = form[name].value;
  }
  return body;
}
