// FR-QRY-03 and FR-ADM-01..03: equipment and maintenance plans.
// Everyone logged in can view; only managers can change.

const { getDb, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { PLAN_SELECT, withDueState, splitItems, RECORD_SELECT, withResult } = require('../lib/rules');
const { PLAN_TYPES, text, fail, toId, isDate, isUniqueError } = require('../lib/validate');

function getEquipment(db, id) {
  const e = id && db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
  if (!e) throw new UserError('找不到這台設備', 404);
  return e;
}

// ---------- equipment (FR-ADM-01) ----------

function listEquipment() {
  const rows = getDb().prepare(`
    SELECT e.id, e.equip_no, e.name, e.model, e.maker, e.line, e.location, e.is_active,
           (SELECT COUNT(*) FROM pm_plans p WHERE p.equipment_id = e.id AND p.is_active = 1) AS plan_count
      FROM equipment e
     ORDER BY e.equip_no
  `).all();
  return { rows };
}

function checkEquipmentFields(body) {
  const e = {
    equip_no: text(body.equip_no).toUpperCase(),
    name: text(body.name),
    model: text(body.model),
    maker: text(body.maker),
    line: text(body.line),
    location: text(body.location),
  };
  if (!/^EQ-\d{3}$/.test(e.equip_no)) fail('設備編號格式錯誤，須為 EQ- 加 3 碼數字');
  if (!e.name) fail('請輸入設備名稱');
  if (e.name.length > 30) fail('設備名稱不可超過 30 字');
  if (e.model.length > 30) fail('型號不可超過 30 字');
  if (e.maker.length > 30) fail('廠牌不可超過 30 字');
  if (!e.line) fail('請輸入產線');
  if (e.line.length > 20) fail('產線不可超過 20 字');
  if (!e.location) fail('請輸入位置');
  if (e.location.length > 30) fail('位置不可超過 30 字');
  e.model = e.model || null;
  e.maker = e.maker || null;
  return e;
}

function createEquipment({ body }) {
  const e = checkEquipmentFields(body);
  try {
    getDb().prepare(`
      INSERT INTO equipment (equip_no, name, model, maker, line, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(e.equip_no, e.name, e.model, e.maker, e.line, e.location, now());
  } catch (err) {
    if (isUniqueError(err)) fail('設備編號已存在');
    throw err;
  }
  return { message: '已儲存設備資料' };
}

function updateEquipment({ params, body }) {
  const db = getDb();
  const old = getEquipment(db, toId(params.id));
  const e = checkEquipmentFields(body);
  try {
    db.prepare(`
      UPDATE equipment SET equip_no = ?, name = ?, model = ?, maker = ?, line = ?, location = ?, updated_at = ?
       WHERE id = ?
    `).run(e.equip_no, e.name, e.model, e.maker, e.line, e.location, now(), old.id);
  } catch (err) {
    if (isUniqueError(err)) fail('設備編號已存在');
    throw err;
  }
  return { message: '已儲存設備資料' };
}

// Plans keep their own status; they come back to the due list when the equipment is enabled again
function setEquipmentActive({ params, body }) {
  const db = getDb();
  const e = getEquipment(db, toId(params.id));
  const active = body.is_active ? 1 : 0;
  db.prepare('UPDATE equipment SET is_active = ?, updated_at = ? WHERE id = ?').run(active, now(), e.id);
  return { message: `已${active ? '啟用' : '停用'}設備 ${e.equip_no}` };
}

// ---------- equipment detail (FR-QRY-03) ----------

function equipmentDetail({ params }) {
  const db = getDb();
  const equipment = getEquipment(db, toId(params.id));
  const plans = db.prepare(PLAN_SELECT + ' WHERE p.equipment_id = ? ORDER BY p.id').all(equipment.id)
    .map((p) => ({ ...withDueState(p), items: splitItems(p.items) }));
  const records = db.prepare(RECORD_SELECT + ' WHERE e.id = ? ORDER BY r.done_date DESC, r.created_at DESC')
    .all(equipment.id).map(withResult);
  const owners = db.prepare('SELECT id, emp_no, name FROM users WHERE is_active = 1 ORDER BY emp_no').all();
  return { equipment, plans, records, owners, plan_types: PLAN_TYPES };
}

// ---------- plans (FR-ADM-02, 03). Checks follow spec 7.3. ----------

// Steps 4-10. checkFirstDue is false when editing a plan that already has records.
function checkPlanFields(db, body, checkFirstDue) {
  // Step 4: cycle
  const cycle = Number(text(body.cycle_days));
  if (text(body.cycle_days) === '' || !Number.isInteger(cycle) || cycle < 1 || cycle > 730) {
    fail('保養週期須為 1 到 730 天的整數');
  }
  // Steps 5-7: items, one per line
  const items = splitItems(body.items);
  if (items.length === 0) fail('請輸入保養項目，一行一項');
  if (items.length > 10) fail('保養項目最多 10 項');
  if (items.some((i) => i.length > 50)) fail('每個保養項目不可超過 50 字');
  // Steps 8-9: owner
  const ownerId = toId(body.owner_id);
  if (!ownerId) fail('請選擇負責人');
  const owner = db.prepare('SELECT is_active FROM users WHERE id = ?').get(ownerId);
  if (!owner || owner.is_active !== 1) fail('負責人必須是啟用中的帳號');
  // Step 10: first due date
  const firstDue = text(body.first_due_date);
  if (checkFirstDue && !isDate(firstDue)) fail('請輸入正確的起始應保養日');
  return { cycle, items: items.join('\n'), ownerId, firstDue };
}

function createPlan({ params, body }) {
  const db = getDb();
  const equipment = getEquipment(db, toId(params.id));
  // Step 1: equipment is active
  if (!equipment.is_active) fail(`設備 ${equipment.equip_no} 已停用，不能新增保養計畫`);
  // Step 2: plan type
  const type = text(body.plan_type);
  if (!PLAN_TYPES.includes(type)) fail('請選擇保養類別');
  // Step 3: one plan per type per equipment, disabled ones included
  const dup = db.prepare('SELECT 1 FROM pm_plans WHERE equipment_id = ? AND plan_type = ?').get(equipment.id, type);
  if (dup) fail(`這台設備已有「${type}」計畫`);
  // Steps 4-10
  const p = checkPlanFields(db, body, true);
  try {
    db.prepare(`
      INSERT INTO pm_plans (equipment_id, plan_type, cycle_days, items, owner_id, first_due_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(equipment.id, type, p.cycle, p.items, p.ownerId, p.firstDue, now());
  } catch (err) {
    if (isUniqueError(err)) fail(`這台設備已有「${type}」計畫`);
    throw err;
  }
  return { message: '已儲存保養計畫' };
}

function getPlanRow(db, id) {
  const p = id && db.prepare('SELECT * FROM pm_plans WHERE id = ?').get(id);
  if (!p) throw new UserError('找不到這個保養計畫', 404);
  return p;
}

// Plan type and equipment never change. First due date is locked once a record exists.
function updatePlan({ params, body }) {
  const db = getDb();
  const plan = getPlanRow(db, toId(params.id));
  const hasRecords = !!db.prepare('SELECT 1 FROM pm_records WHERE plan_id = ?').get(plan.id);
  const p = checkPlanFields(db, body, !hasRecords);
  db.prepare(`
    UPDATE pm_plans SET cycle_days = ?, items = ?, owner_id = ?, first_due_date = ?, updated_at = ? WHERE id = ?
  `).run(p.cycle, p.items, p.ownerId, hasRecords ? plan.first_due_date : p.firstDue, now(), plan.id);
  return { message: '已儲存保養計畫' };
}

function setPlanActive({ params, body }) {
  const db = getDb();
  const plan = getPlanRow(db, toId(params.id));
  const active = body.is_active ? 1 : 0;
  if (active) {
    const e = db.prepare('SELECT equip_no, is_active FROM equipment WHERE id = ?').get(plan.equipment_id);
    if (!e.is_active) fail(`設備 ${e.equip_no} 已停用，不能啟用保養計畫`);
    const owner = db.prepare('SELECT name, is_active FROM users WHERE id = ?').get(plan.owner_id);
    if (!owner.is_active) fail(`負責人 ${owner.name} 已停用，請先改派負責人再啟用`);
  }
  db.prepare('UPDATE pm_plans SET is_active = ?, updated_at = ? WHERE id = ?').run(active, now(), plan.id);
  return { message: `已${active ? '啟用' : '停用'}保養計畫` };
}

module.exports = [
  { method: 'GET', path: '/api/equipment', access: 'login', handler: listEquipment },
  { method: 'POST', path: '/api/equipment', access: 'manager', handler: createEquipment },
  { method: 'GET', path: '/api/equipment/:id', access: 'login', handler: equipmentDetail },
  { method: 'PUT', path: '/api/equipment/:id', access: 'manager', handler: updateEquipment },
  { method: 'PUT', path: '/api/equipment/:id/active', access: 'manager', handler: setEquipmentActive },
  { method: 'POST', path: '/api/equipment/:id/plans', access: 'manager', handler: createPlan },
  { method: 'PUT', path: '/api/plans/:id', access: 'manager', handler: updatePlan },
  { method: 'PUT', path: '/api/plans/:id/active', access: 'manager', handler: setPlanActive },
];
