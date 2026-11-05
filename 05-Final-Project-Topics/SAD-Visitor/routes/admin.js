// FR-ADM: employees, visitor passes and accounts (admin only)

const { getDb, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { hashPassword } = require('../lib/auth');
const { text, fail, toId } = require('../lib/validate');

function isUniqueError(e) {
  return /UNIQUE constraint failed/.test(String(e && e.message));
}

// ---------- employees (FR-ADM-01) ----------

function listEmployees() {
  const rows = getDb()
    .prepare('SELECT id, emp_no, name, department, extension, is_active FROM employees ORDER BY emp_no')
    .all();
  return { rows };
}

function checkEmployeeFields(body) {
  const e = {
    emp_no: text(body.emp_no).toUpperCase(),
    name: text(body.name),
    department: text(body.department),
    extension: text(body.extension),
  };
  if (!/^E\d{4}$/.test(e.emp_no)) fail('員工編號格式錯誤，須為 E 加 4 碼數字');
  if (!e.name) fail('請輸入員工姓名');
  if (e.name.length > 20) fail('員工姓名不可超過 20 字');
  if (!e.department) fail('請輸入部門');
  if (e.department.length > 20) fail('部門不可超過 20 字');
  if (e.extension && !/^\d{4}$/.test(e.extension)) fail('分機格式錯誤，須為 4 碼數字');
  e.extension = e.extension || null;
  return e;
}

function createEmployee({ body }) {
  const e = checkEmployeeFields(body);
  try {
    getDb()
      .prepare('INSERT INTO employees (emp_no, name, department, extension) VALUES (?, ?, ?, ?)')
      .run(e.emp_no, e.name, e.department, e.extension);
  } catch (err) {
    if (isUniqueError(err)) fail('員工編號已存在');
    throw err;
  }
  return { message: `已新增員工 ${e.name}` };
}

function updateEmployee({ params, body }) {
  const id = toId(params.id);
  const db = getDb();
  if (!id || !db.prepare('SELECT 1 FROM employees WHERE id = ?').get(id)) {
    throw new UserError('找不到這位員工', 404);
  }
  const e = checkEmployeeFields(body);
  try {
    db.prepare('UPDATE employees SET emp_no = ?, name = ?, department = ?, extension = ? WHERE id = ?')
      .run(e.emp_no, e.name, e.department, e.extension, id);
  } catch (err) {
    if (isUniqueError(err)) fail('員工編號已存在');
    throw err;
  }
  return { message: '已儲存修改' };
}

function setEmployeeActive({ params, body }) {
  const id = toId(params.id);
  const db = getDb();
  const emp = id && db.prepare('SELECT name FROM employees WHERE id = ?').get(id);
  if (!emp) throw new UserError('找不到這位員工', 404);
  const active = body.is_active ? 1 : 0;
  db.prepare('UPDATE employees SET is_active = ? WHERE id = ?').run(active, id);
  return { message: `已將 ${emp.name} 設為${active ? '在職' : '離職'}` };
}

// ---------- visitor passes (FR-ADM-02) ----------

function listPasses() {
  const rows = getDb()
    .prepare('SELECT id, pass_no, is_active, note FROM visitor_passes ORDER BY pass_no')
    .all();
  return { rows };
}

function createPass({ body }) {
  const passNo = text(body.pass_no).toUpperCase();
  const note = text(body.note) || null;
  if (!/^V-\d{2}$/.test(passNo)) fail('訪客證編號格式錯誤，須為 V- 加 2 碼數字');
  try {
    getDb().prepare('INSERT INTO visitor_passes (pass_no, note) VALUES (?, ?)').run(passNo, note);
  } catch (err) {
    if (isUniqueError(err)) fail('訪客證編號已存在');
    throw err;
  }
  return { message: `已新增訪客證 ${passNo}` };
}

// Disable or enable a pass with a note. There is no check for passes in use.
function setPassActive({ params, body }) {
  const id = toId(params.id);
  const db = getDb();
  const pass = id && db.prepare('SELECT pass_no FROM visitor_passes WHERE id = ?').get(id);
  if (!pass) throw new UserError('找不到這張訪客證', 404);
  const active = body.is_active ? 1 : 0;
  const note = text(body.note) || null;
  db.prepare('UPDATE visitor_passes SET is_active = ?, note = ? WHERE id = ?').run(active, note, id);
  return { message: `已${active ? '啟用' : '停用'}訪客證 ${pass.pass_no}` };
}

// ---------- accounts (FR-ADM-03, FR-ADM-04) ----------

function listUsers() {
  const rows = getDb()
    .prepare('SELECT id, username, name, role, is_active, created_at FROM users ORDER BY id')
    .all();
  return { rows };
}

function createUser({ body }) {
  const username = text(body.username);
  const password = body.password === undefined || body.password === null ? '' : String(body.password);
  const name = text(body.name);
  const role = Number(body.role);
  if (!/^[A-Za-z0-9]{4,20}$/.test(username)) fail('帳號格式錯誤，須為英數字 4 到 20 碼');
  if (!password) fail('請輸入密碼');
  if (!name) fail('請輸入姓名');
  if (name.length > 20) fail('姓名不可超過 20 字');
  if (role !== 0 && role !== 1) fail('請選擇角色');
  try {
    getDb().prepare(`
      INSERT INTO users (username, password_hash, name, role, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(username, hashPassword(password), name, role, now());
  } catch (err) {
    if (isUniqueError(err)) fail('帳號已存在');
    throw err;
  }
  return { message: `已新增帳號 ${username}` };
}

function updateUser({ params, body, user }) {
  const id = toId(params.id);
  const db = getDb();
  const target = id && db.prepare('SELECT id, username, role, is_active FROM users WHERE id = ?').get(id);
  if (!target) throw new UserError('找不到這個帳號', 404);

  const role = body.role === undefined ? target.role : Number(body.role);
  const active = body.is_active === undefined ? target.is_active : (body.is_active ? 1 : 0);
  if (role !== 0 && role !== 1) fail('請選擇角色');
  if (target.id === user.id) {
    if (active !== 1) fail('不能停用自己的帳號');
    if (role !== target.role) fail('不能修改自己的角色');
  }
  db.prepare('UPDATE users SET role = ?, is_active = ? WHERE id = ?').run(role, active, id);
  return { message: `已更新帳號 ${target.username}` };
}

module.exports = [
  { method: 'GET', path: '/api/admin/employees', access: 'admin', handler: listEmployees },
  { method: 'POST', path: '/api/admin/employees', access: 'admin', handler: createEmployee },
  { method: 'PUT', path: '/api/admin/employees/:id', access: 'admin', handler: updateEmployee },
  { method: 'PUT', path: '/api/admin/employees/:id/active', access: 'admin', handler: setEmployeeActive },
  { method: 'GET', path: '/api/admin/passes', access: 'admin', handler: listPasses },
  { method: 'POST', path: '/api/admin/passes', access: 'admin', handler: createPass },
  { method: 'PUT', path: '/api/admin/passes/:id/active', access: 'admin', handler: setPassActive },
  { method: 'GET', path: '/api/admin/users', access: 'admin', handler: listUsers },
  { method: 'POST', path: '/api/admin/users', access: 'admin', handler: createUser },
  { method: 'PUT', path: '/api/admin/users/:id', access: 'admin', handler: updateUser },
];
