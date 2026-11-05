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

const ROLE_PLANNER = 0;

const MENU = [
  { href: 'index.html', label: '未完工工單' },
  { href: 'order-new.html', label: '開立工單', planner: true },
  { href: 'orders.html', label: '工單查詢' },
  { href: 'products.html', label: '產品', planner: true },
  { href: 'work-centers.html', label: '工作中心', planner: true },
  { href: 'users.html', label: '帳號', planner: true },
];

function renderMenu(user) {
  const current = location.pathname.split('/').pop() || 'index.html';
  const links = MENU
    .filter((m) => !m.planner || user.role === ROLE_PLANNER)
    .map((m) => `<a href="${m.href}"${m.href === current ? ' class="active"' : ''}>${m.label}</a>`)
    .join('');
  // Team leaders also show their work center (spec 6.2)
  const who = user.role === ROLE_PLANNER ? '生管人員' : `組長，${esc(user.work_center_name)}`;
  document.getElementById('nav').innerHTML = `
    <div class="brand">工單分派管理系統</div>
    <nav>${links}</nav>
    <div class="who">${esc(user.name)}（${who}）
      <a href="#" id="logout">登出</a></div>`;
  document.getElementById('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('POST', '/api/logout');
    location.href = 'login.html';
  });
}

// Call at the top of every page except login. Redirects if not allowed.
async function initPage({ plannerOnly = false } = {}) {
  const { user } = await api('GET', '/api/me');
  if (plannerOnly && user.role !== ROLE_PLANNER) {
    location.href = 'index.html';
    throw new Error('只有生管人員可以使用這個頁面');
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

const BADGE_CLASS = { 待派工: 'warn', 已派工: 'info', 生產中: 'run', 已完工: 'ok', 已取消: 'off' };

// Colored label for a work order status
function badge(value) {
  return `<span class="badge ${BADGE_CLASS[value] || 'off'}">${esc(value)}</span>`;
}

// Due status text; overdue and late ones in red
function dueText(o) {
  const late = o.overdue || o.due_status.startsWith('延遲');
  return late ? `<span class="late">${esc(o.due_status)}</span>` : esc(o.due_status);
}

// ---------- work order fields, used by UI-03 (create) and UI-05 (edit) ----------

// v: current values (empty object for a new order)
function orderFieldsHtml(v, products) {
  return `
    <div class="row">
      <label>訂單號<input name="so_no" maxlength="20" value="${esc(v.so_no)}"></label>
      <label>產品<select name="product_id">${optionTags(
        products.map((p) => ({ value: p.id, label: `${p.part_no} ${p.name}` })), v.product_id, '請選擇')}</select></label>
      <label>數量<input name="qty" type="number" min="1" max="99999" value="${esc(v.qty)}"></label>
      <label>交期<input name="due_date" type="date" value="${esc(v.due_date)}"></label>
    </div>
    <div class="row">
      <label>備註<textarea name="note" maxlength="200">${esc(v.note)}</textarea></label>
    </div>`;
}

function readOrderFields(form) {
  const body = {};
  for (const name of ['so_no', 'product_id', 'qty', 'due_date', 'note']) body[name] = form[name].value;
  return body;
}
