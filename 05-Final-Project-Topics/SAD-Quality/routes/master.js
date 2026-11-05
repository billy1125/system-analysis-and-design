// FR-ADM-01..03: products, departments, defect types (managers only).
// None of them can be deleted; disabling keeps the issues that already use them.

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
    SELECT p.*, (SELECT COUNT(*) FROM issues i WHERE i.product_id = p.id) AS issue_count
      FROM products p ORDER BY p.part_no
  `).all();
  return { rows };
}

function checkProduct(db, body, id) {
  const p = {
    part_no: text(body.part_no).toUpperCase(),
    name: text(body.name),
    customer: text(body.customer),
  };
  if (!/^AP-\d{4}$/.test(p.part_no)) fail('料號格式錯誤，須為 AP- 加 4 碼數字');
  if (taken(db, 'products', 'part_no', p.part_no, id)) fail('料號已存在');
  if (!p.name) fail('請輸入品名');
  if (p.name.length > 30) fail('品名不可超過 30 字');
  if (p.customer.length > 30) fail('客戶不可超過 30 字');
  p.customer = p.customer || null;
  return p;
}

function createProduct({ body }) {
  const db = getDb();
  const p = checkProduct(db, body, null);
  db.prepare('INSERT INTO products (part_no, name, customer, created_at) VALUES (?, ?, ?, ?)')
    .run(p.part_no, p.name, p.customer, now());
  return { message: '已儲存產品資料' };
}

function updateProduct({ params, body }) {
  const db = getDb();
  const old = getRow(db, 'products', toId(params.id), '找不到這個產品');
  const p = checkProduct(db, body, old.id);
  db.prepare('UPDATE products SET part_no = ?, name = ?, customer = ?, updated_at = ? WHERE id = ?')
    .run(p.part_no, p.name, p.customer, now(), old.id);
  return { message: '已儲存產品資料' };
}

function setProductActive({ params, body }) {
  const db = getDb();
  const p = getRow(db, 'products', toId(params.id), '找不到這個產品');
  const active = body.is_active ? 1 : 0;
  db.prepare('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?').run(active, now(), p.id);
  return { message: `已${active ? '啟用' : '停用'}產品 ${p.part_no}` };
}

// ---------- departments (FR-ADM-02) ----------

function listDepartments() {
  const rows = getDb().prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM issues i WHERE i.dept_id = d.id AND i.status = '處理中') AS working_count
      FROM departments d ORDER BY d.id
  `).all();
  return { rows };
}

function checkDepartment(db, body, id) {
  const d = { name: text(body.name), contact: text(body.contact), ext: text(body.ext) };
  if (!d.name) fail('請輸入單位名稱');
  if (d.name.length > 20) fail('單位名稱不可超過 20 字');
  if (taken(db, 'departments', 'name', d.name, id)) fail('單位名稱已存在');
  if (!d.contact) fail('請輸入窗口');
  if (d.contact.length > 20) fail('窗口不可超過 20 字');
  if (!/^\d{4}$/.test(d.ext)) fail('分機格式錯誤，須為 4 碼數字');
  return d;
}

function createDepartment({ body }) {
  const db = getDb();
  const d = checkDepartment(db, body, null);
  db.prepare('INSERT INTO departments (name, contact, ext, created_at) VALUES (?, ?, ?, ?)')
    .run(d.name, d.contact, d.ext, now());
  return { message: '已儲存責任單位' };
}

function updateDepartment({ params, body }) {
  const db = getDb();
  const old = getRow(db, 'departments', toId(params.id), '找不到這個責任單位');
  const d = checkDepartment(db, body, old.id);
  db.prepare('UPDATE departments SET name = ?, contact = ?, ext = ?, updated_at = ? WHERE id = ?')
    .run(d.name, d.contact, d.ext, now(), old.id);
  return { message: '已儲存責任單位' };
}

function setDepartmentActive({ params, body }) {
  const db = getDb();
  const d = getRow(db, 'departments', toId(params.id), '找不到這個責任單位');
  const active = body.is_active ? 1 : 0;
  if (!active) {
    // Issues still being handled need a department that can be contacted
    const n = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE dept_id = ? AND status = '處理中'").get(d.id).n;
    if (n > 0) fail(`這個責任單位還有 ${n} 張處理中的異常單，請先改派再停用`);
  }
  db.prepare('UPDATE departments SET is_active = ?, updated_at = ? WHERE id = ?').run(active, now(), d.id);
  return { message: `已${active ? '啟用' : '停用'}責任單位 ${d.name}` };
}

// ---------- defect types (FR-ADM-03) ----------

function listDefectTypes() {
  const rows = getDb().prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM issues i WHERE i.defect_type_id = t.id) AS issue_count
      FROM defect_types t ORDER BY t.id
  `).all();
  return { rows };
}

function checkDefectType(db, body, id) {
  const name = text(body.name);
  if (!name) fail('請輸入類別名稱');
  if (name.length > 10) fail('類別名稱不可超過 10 字');
  if (taken(db, 'defect_types', 'name', name, id)) fail('類別名稱已存在');
  return name;
}

function createDefectType({ body }) {
  const db = getDb();
  const name = checkDefectType(db, body, null);
  db.prepare('INSERT INTO defect_types (name, created_at) VALUES (?, ?)').run(name, now());
  return { message: '已儲存異常類別' };
}

function updateDefectType({ params, body }) {
  const db = getDb();
  const old = getRow(db, 'defect_types', toId(params.id), '找不到這個異常類別');
  const name = checkDefectType(db, body, old.id);
  db.prepare('UPDATE defect_types SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), old.id);
  return { message: '已儲存異常類別' };
}

function setDefectTypeActive({ params, body }) {
  const db = getDb();
  const t = getRow(db, 'defect_types', toId(params.id), '找不到這個異常類別');
  const active = body.is_active ? 1 : 0;
  db.prepare('UPDATE defect_types SET is_active = ?, updated_at = ? WHERE id = ?').run(active, now(), t.id);
  return { message: `已${active ? '啟用' : '停用'}異常類別「${t.name}」` };
}

module.exports = [
  { method: 'GET', path: '/api/products', access: 'manager', handler: listProducts },
  { method: 'POST', path: '/api/products', access: 'manager', handler: createProduct },
  { method: 'PUT', path: '/api/products/:id', access: 'manager', handler: updateProduct },
  { method: 'PUT', path: '/api/products/:id/active', access: 'manager', handler: setProductActive },
  { method: 'GET', path: '/api/departments', access: 'manager', handler: listDepartments },
  { method: 'POST', path: '/api/departments', access: 'manager', handler: createDepartment },
  { method: 'PUT', path: '/api/departments/:id', access: 'manager', handler: updateDepartment },
  { method: 'PUT', path: '/api/departments/:id/active', access: 'manager', handler: setDepartmentActive },
  { method: 'GET', path: '/api/defect-types', access: 'manager', handler: listDefectTypes },
  { method: 'POST', path: '/api/defect-types', access: 'manager', handler: createDefectType },
  { method: 'PUT', path: '/api/defect-types/:id', access: 'manager', handler: updateDefectType },
  { method: 'PUT', path: '/api/defect-types/:id/active', access: 'manager', handler: setDefectTypeActive },
];
