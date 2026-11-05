// FR-ADM-02, 03: user accounts (managers only)

const { getDb, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { hashPassword } = require('../lib/auth');
const { ROLE_MANAGER, ROLE_STAFF, text, fail, toId, isUniqueError } = require('../lib/validate');

function listUsers() {
  const rows = getDb().prepare(`
    SELECT id, emp_no, name, title, role, is_active FROM users ORDER BY emp_no
  `).all();
  return { rows };
}

function checkUserFields(body) {
  const u = {
    emp_no: text(body.emp_no).toUpperCase(),
    name: text(body.name),
    title: text(body.title),
    role: Number(body.role),
    password: body.password === undefined || body.password === null ? '' : String(body.password),
  };
  if (!/^E\d{4}$/.test(u.emp_no)) fail('員工編號格式錯誤，須為 E 加 4 碼數字');
  if (!u.name) fail('請輸入姓名');
  if (u.name.length > 20) fail('姓名不可超過 20 字');
  if (!u.title) fail('請輸入職稱');
  if (u.title.length > 20) fail('職稱不可超過 20 字');
  if (text(body.role) === '' || (u.role !== ROLE_MANAGER && u.role !== ROLE_STAFF)) fail('請選擇角色');
  return u;
}

function createUser({ body }) {
  const u = checkUserFields(body);
  if (!u.password) fail('新增帳號時請輸入密碼');
  try {
    getDb().prepare(`
      INSERT INTO users (emp_no, password_hash, name, title, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(u.emp_no, hashPassword(u.password), u.name, u.title, u.role, now());
  } catch (err) {
    if (isUniqueError(err)) fail('員工編號已存在');
    throw err;
  }
  return { message: '已儲存帳號資料' };
}

function getUser(db, id) {
  const u = id && db.prepare('SELECT id, emp_no, role FROM users WHERE id = ?').get(id);
  if (!u) throw new UserError('找不到這個帳號', 404);
  return u;
}

function updateUser({ params, body, user }) {
  const db = getDb();
  const target = getUser(db, toId(params.id));
  const u = checkUserFields(body);
  if (target.id === user.id && u.role !== target.role) fail('不能修改自己的角色');
  try {
    db.prepare('UPDATE users SET emp_no = ?, name = ?, title = ?, role = ? WHERE id = ?')
      .run(u.emp_no, u.name, u.title, u.role, target.id);
    // Blank password means keep the old one
    if (u.password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(u.password), target.id);
  } catch (err) {
    if (isUniqueError(err)) fail('員工編號已存在');
    throw err;
  }
  return { message: '已儲存帳號資料' };
}

function setUserActive({ params, body, user }) {
  const db = getDb();
  const target = getUser(db, toId(params.id));
  const active = body.is_active ? 1 : 0;
  if (!active && target.id === user.id) fail('不能停用自己的帳號');
  if (!active) {
    // The counter of an open count must be able to log in until it is closed
    const open = db.prepare("SELECT count_no FROM counts WHERE counter_id = ? AND status = '盤點中' ORDER BY id").get(target.id);
    if (open) fail(`此帳號是盤點單 ${open.count_no} 的盤點人員，盤點結案前不能停用`);
  }
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(active, target.id);
  return { message: `已${active ? '啟用' : '停用'}帳號 ${target.emp_no}` };
}

module.exports = [
  { method: 'GET', path: '/api/admin/users', access: 'manager', handler: listUsers },
  { method: 'POST', path: '/api/admin/users', access: 'manager', handler: createUser },
  { method: 'PUT', path: '/api/admin/users/:id', access: 'manager', handler: updateUser },
  { method: 'PUT', path: '/api/admin/users/:id/active', access: 'manager', handler: setUserActive },
];
