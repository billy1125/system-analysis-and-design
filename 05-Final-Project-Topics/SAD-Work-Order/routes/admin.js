// FR-ADM-03, 04: user accounts (production control only)

const { getDb, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { hashPassword } = require('../lib/auth');
const { ROLE_PLANNER, ROLE_LEADER, text, fail, toId } = require('../lib/validate');

function listUsers() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT u.id, u.emp_no, u.name, u.title, u.role, u.work_center_id, u.is_active, w.name AS wc_name
      FROM users u LEFT JOIN work_centers w ON w.id = u.work_center_id
     ORDER BY u.emp_no
  `).all();
  // Disabled work centers are listed too, so an edited account can keep its old one
  const workCenters = db.prepare('SELECT id, name, is_active FROM work_centers ORDER BY id').all();
  return { rows, work_centers: workCenters };
}

// Checked in this order: emp no, name, title, role, work center, password (spec 7.5).
// old is the account being edited, or null when creating.
function checkUserFields(db, body, old) {
  const u = {
    emp_no: text(body.emp_no).toUpperCase(),
    name: text(body.name),
    title: text(body.title),
    role: Number(body.role),
    work_center_id: null,
    password: body.password === undefined || body.password === null ? '' : String(body.password),
  };
  if (!/^E\d{4}$/.test(u.emp_no)) fail('員工編號格式錯誤，須為 E 加 4 碼數字');
  if (db.prepare('SELECT 1 FROM users WHERE emp_no = ? AND id != ?').get(u.emp_no, old ? old.id : 0)) fail('員工編號已存在');
  if (!u.name) fail('請輸入姓名');
  if (u.name.length > 20) fail('姓名不可超過 20 字');
  if (!u.title) fail('請輸入職稱');
  if (u.title.length > 20) fail('職稱不可超過 20 字');
  if (text(body.role) === '' || (u.role !== ROLE_PLANNER && u.role !== ROLE_LEADER)) fail('請選擇角色');
  // Team leaders need a work center; production control is always stored as NULL
  if (u.role === ROLE_LEADER) {
    const wcId = toId(body.work_center_id);
    const wc = wcId && db.prepare('SELECT id, name, is_active FROM work_centers WHERE id = ?').get(wcId);
    if (!wc) fail('組長請選擇所屬工作中心');
    if (!wc.is_active && !(old && old.work_center_id === wc.id)) fail(`工作中心「${wc.name}」已停用，請重新選擇`);
    u.work_center_id = wc.id;
  }
  if (!old && !u.password) fail('新增帳號時請輸入密碼');
  return u;
}

function createUser({ body }) {
  const db = getDb();
  const u = checkUserFields(db, body, null);
  db.prepare(`
    INSERT INTO users (emp_no, password_hash, name, title, role, work_center_id, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(u.emp_no, hashPassword(u.password), u.name, u.title, u.role, u.work_center_id, now());
  return { message: '已儲存帳號資料' };
}

function getUser(db, id) {
  const u = id && db.prepare('SELECT id, emp_no, role, work_center_id FROM users WHERE id = ?').get(id);
  if (!u) throw new UserError('找不到這個帳號', 404);
  return u;
}

function updateUser({ params, body, user }) {
  const db = getDb();
  const target = getUser(db, toId(params.id));
  const u = checkUserFields(db, body, target);
  if (target.id === user.id && u.role !== target.role) fail('不能修改自己的角色');
  db.prepare('UPDATE users SET emp_no = ?, name = ?, title = ?, role = ?, work_center_id = ? WHERE id = ?')
    .run(u.emp_no, u.name, u.title, u.role, u.work_center_id, target.id);
  // Blank password means keep the old one
  if (u.password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(u.password), target.id);
  return { message: '已儲存帳號資料' };
}

function setUserActive({ params, body, user }) {
  const db = getDb();
  const target = getUser(db, toId(params.id));
  const active = body.is_active ? 1 : 0;
  if (!active && target.id === user.id) fail('不能停用自己的帳號');
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(active, target.id);
  return { message: `已${active ? '啟用' : '停用'}帳號 ${target.emp_no}` };
}

module.exports = [
  { method: 'GET', path: '/api/admin/users', access: 'planner', handler: listUsers },
  { method: 'POST', path: '/api/admin/users', access: 'planner', handler: createUser },
  { method: 'PUT', path: '/api/admin/users/:id', access: 'planner', handler: updateUser },
  { method: 'PUT', path: '/api/admin/users/:id/active', access: 'planner', handler: setUserActive },
];
