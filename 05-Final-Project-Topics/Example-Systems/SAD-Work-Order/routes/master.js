// FR-ADM-01, 02: products and work centers (production control only).
// Neither can be deleted; disabling keeps the work orders that already use them.

const { getDb, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { text, fail, toId } = require('../lib/validate');

function getRow(db, table, id, notFound) {
  const row = id && db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) throw new UserError(notFound, 404);
  return row;
}

// True when another row (not excludeId) already uses this value
function taken(db, table, column, value, excludeId) {
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? AND id != ?`).get(value, excludeId || 0);
}

// ---------- products (FR-ADM-01) ----------

function listProducts() {
  const rows = getDb().prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM work_orders o WHERE o.product_id = p.id) AS order_count
      FROM products p ORDER BY p.part_no
  `).all();
  return { rows };
}

function checkProduct(db, body, id) {
  const p = { part_no: text(body.part_no).toUpperCase(), name: text(body.name) };
  if (!/^BP-\d{4}$/.test(p.part_no)) fail('料號格式錯誤，須為 BP- 加 4 碼數字');
  if (taken(db, 'products', 'part_no', p.part_no, id)) fail('料號已存在');
  if (!p.name) fail('請輸入品名');
  if (p.name.length > 30) fail('品名不可超過 30 字');
  return p;
}

function createProduct({ body }) {
  const db = getDb();
  const p = checkProduct(db, body, null);
  db.prepare('INSERT INTO products (part_no, name, created_at) VALUES (?, ?, ?)').run(p.part_no, p.name, now());
  return { message: '已儲存產品資料' };
}

function updateProduct({ params, body }) {
  const db = getDb();
  const old = getRow(db, 'products', toId(params.id), '找不到這個產品');
  const p = checkProduct(db, body, old.id);
  db.prepare('UPDATE products SET part_no = ?, name = ?, updated_at = ? WHERE id = ?')
    .run(p.part_no, p.name, now(), old.id);
  return { message: '已儲存產品資料' };
}

// Open work orders keep a disabled product as they are
function setProductActive({ params, body }) {
  const db = getDb();
  const p = getRow(db, 'products', toId(params.id), '找不到這個產品');
  const active = body.is_active ? 1 : 0;
  db.prepare('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?').run(active, now(), p.id);
  return { message: `已${active ? '啟用' : '停用'}產品 ${p.part_no}` };
}

// ---------- work centers (FR-ADM-02) ----------

function openCount(db, wcId) {
  return db.prepare("SELECT COUNT(*) AS n FROM work_orders WHERE work_center_id = ? AND status IN ('已派工', '生產中')")
    .get(wcId).n;
}

function listWorkCenters() {
  const db = getDb();
  const leaders = db.prepare(`
    SELECT work_center_id, name FROM users WHERE role = 1 AND is_active = 1 AND work_center_id IS NOT NULL ORDER BY emp_no
  `).all();
  const rows = db.prepare('SELECT * FROM work_centers ORDER BY id').all().map((w) => ({
    ...w,
    leaders: leaders.filter((u) => u.work_center_id === w.id).map((u) => u.name).join('、'),
    open_count: openCount(db, w.id),
  }));
  return { rows };
}

function checkWorkCenter(db, body, id) {
  const name = text(body.name);
  if (!name) fail('請輸入工作中心名稱');
  if (name.length > 20) fail('工作中心名稱不可超過 20 字');
  if (taken(db, 'work_centers', 'name', name, id)) fail('工作中心名稱已存在');
  return name;
}

function createWorkCenter({ body }) {
  const db = getDb();
  const name = checkWorkCenter(db, body, null);
  db.prepare('INSERT INTO work_centers (name, created_at) VALUES (?, ?)').run(name, now());
  return { message: '已儲存工作中心' };
}

function updateWorkCenter({ params, body }) {
  const db = getDb();
  const old = getRow(db, 'work_centers', toId(params.id), '找不到這個工作中心');
  const name = checkWorkCenter(db, body, old.id);
  db.prepare('UPDATE work_centers SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), old.id);
  return { message: '已儲存工作中心' };
}

function setWorkCenterActive({ params, body }) {
  const db = getDb();
  const w = getRow(db, 'work_centers', toId(params.id), '找不到這個工作中心');
  const active = body.is_active ? 1 : 0;
  if (!active) {
    // Dispatched or running orders need a work center that can still report
    const n = openCount(db, w.id);
    if (n > 0) fail(`這個工作中心還有 ${n} 張已派工或生產中的工單，不能停用`);
  }
  db.prepare('UPDATE work_centers SET is_active = ?, updated_at = ? WHERE id = ?').run(active, now(), w.id);
  return { message: `已${active ? '啟用' : '停用'}工作中心 ${w.name}` };
}

module.exports = [
  { method: 'GET', path: '/api/products', access: 'planner', handler: listProducts },
  { method: 'POST', path: '/api/products', access: 'planner', handler: createProduct },
  { method: 'PUT', path: '/api/products/:id', access: 'planner', handler: updateProduct },
  { method: 'PUT', path: '/api/products/:id/active', access: 'planner', handler: setProductActive },
  { method: 'GET', path: '/api/work-centers', access: 'planner', handler: listWorkCenters },
  { method: 'POST', path: '/api/work-centers', access: 'planner', handler: createWorkCenter },
  { method: 'PUT', path: '/api/work-centers/:id', access: 'planner', handler: updateWorkCenter },
  { method: 'PUT', path: '/api/work-centers/:id/active', access: 'planner', handler: setWorkCenterActive },
];
