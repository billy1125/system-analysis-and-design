// FR-REC and FR-QRY-01, 02: record maintenance, search and edit records

const { getDb, transaction, now, today } = require('../lib/db');
const { UserError } = require('../lib/http');
const {
  addDays, getPlan, splitItems, RECORD_SELECT, withResult, checkDoneDate, checkItemResults,
} = require('../lib/rules');
const { ROLE_MANAGER, text, fail, toId, isDate } = require('../lib/validate');

// Why a plan cannot be recorded now, or null (spec 7.1 steps 2-3)
function blockedReason(plan) {
  if (!plan.is_active) return '這個保養計畫已停用，不能登錄保養';
  if (!plan.equip_active) return `設備 ${plan.equip_no} 已停用，不能登錄保養`;
  return null;
}

// UI-03: plan info and items for the record form
function recordForm({ params }) {
  const plan = getPlan(getDb(), toId(params.id));
  return { plan: { ...plan, items: splitItems(plan.items) }, today: today(), blocked: blockedReason(plan) };
}

// FR-REC-01..04. Checks follow spec 7.1 in order.
function createRecord({ params, body, user }) {
  const db = getDb();
  // Step 1: plan exists
  const plan = getPlan(db, toId(params.id));
  // Steps 2-3: plan and equipment are active
  const blocked = blockedReason(plan);
  if (blocked) fail(blocked);
  // Steps 4-6: date
  const doneDate = checkDoneDate(body.done_date, plan.last_done);
  // Steps 7-11: items and note
  const planItems = splitItems(plan.items);
  const { items, note } = checkItemResults(body.items, planItems.length, '保養項目已變更，請重新開啟這個頁面', body.note);

  transaction((conn) => {
    const { lastInsertRowid } = conn.prepare(`
      INSERT INTO pm_records (plan_id, done_date, done_by, note, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(plan.id, doneDate, user.id, note, now());
    // Item text is copied so later plan edits do not change this record (FR-REC-04)
    const insertItem = conn.prepare(`
      INSERT INTO pm_record_items (record_id, seq, item, result, remark) VALUES (?, ?, ?, ?, ?)
    `);
    items.forEach((i, n) => insertItem.run(lastInsertRowid, n + 1, planItems[n], i.result, i.remark));
  });

  const nextDue = addDays(doneDate, plan.cycle_days);
  return { message: `已登錄保養：${plan.equip_no} ${plan.plan_type}（${doneDate}），下次應保養日 ${nextDue}` };
}

// FR-QRY-01
function listRecords({ query }) {
  const db = getDb();
  const where = [];
  const args = [];
  const from = text(query.get('from'));
  const to = text(query.get('to'));
  const equipmentId = toId(query.get('equipment_id'));
  const doneBy = toId(query.get('done_by'));
  const result = text(query.get('result'));
  if (isDate(from)) { where.push('r.done_date >= ?'); args.push(from); }
  if (isDate(to)) { where.push('r.done_date <= ?'); args.push(to); }
  if (equipmentId) { where.push('e.id = ?'); args.push(equipmentId); }
  if (doneBy) { where.push('r.done_by = ?'); args.push(doneBy); }

  const rows = db.prepare(`${RECORD_SELECT}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY r.done_date DESC, r.created_at DESC
  `).all(...args).map(withResult).filter((r) => !result || r.result === result);

  const equipment = db.prepare('SELECT id, equip_no, name FROM equipment ORDER BY equip_no').all();
  const users = db.prepare('SELECT id, emp_no, name FROM users ORDER BY emp_no').all();
  return { rows, equipment, users };
}

function getRecord(db, id) {
  const r = id && db.prepare(RECORD_SELECT + ' WHERE r.id = ?').get(id);
  if (!r) throw new UserError('找不到這筆保養紀錄', 404);
  return withResult(r);
}

function latestDate(db, planId) {
  return db.prepare('SELECT MAX(done_date) AS d FROM pm_records WHERE plan_id = ?').get(planId).d;
}

// Only the newest record of a plan, by a manager or the person who did it (spec 5.4)
function canEdit(user, record, latest) {
  return record.done_date === latest && (user.role === ROLE_MANAGER || record.done_by === user.id);
}

function getItems(db, recordId) {
  return db.prepare('SELECT seq, item, result, remark FROM pm_record_items WHERE record_id = ? ORDER BY seq')
    .all(recordId);
}

// FR-QRY-02
function recordDetail({ params, user }) {
  const db = getDb();
  const record = getRecord(db, toId(params.id));
  return {
    record,
    items: getItems(db, record.id),
    can_edit: canEdit(user, record, latestDate(db, record.plan_id)),
    today: today(),
  };
}

// FR-REC-05. Checks follow spec 7.2 in order.
function updateRecord({ params, body, user }) {
  const db = getDb();
  // Step 1: record exists
  const record = getRecord(db, toId(params.id));
  // Step 2: manager or the person who did it
  if (user.role !== ROLE_MANAGER && record.done_by !== user.id) fail('只能修改自己登錄的保養紀錄');
  // Step 3: newest record of the plan
  if (record.done_date !== latestDate(db, record.plan_id)) fail('這個計畫已有更新的保養紀錄，不能修改這一筆');
  // Steps 4-6: date, compared with the record before this one
  const previous = db.prepare('SELECT MAX(done_date) AS d FROM pm_records WHERE plan_id = ? AND done_date < ?')
    .get(record.plan_id, record.done_date).d;
  const doneDate = checkDoneDate(body.done_date, previous);
  // Steps 7-11: items and note
  const oldItems = getItems(db, record.id);
  const { items, note } = checkItemResults(body.items, oldItems.length, '保養項目數不正確', body.note);

  transaction((conn) => {
    conn.prepare('UPDATE pm_records SET done_date = ?, note = ?, updated_at = ? WHERE id = ?')
      .run(doneDate, note, now(), record.id);
    const updateItem = conn.prepare('UPDATE pm_record_items SET result = ?, remark = ? WHERE record_id = ? AND seq = ?');
    items.forEach((i, n) => updateItem.run(i.result, i.remark, record.id, oldItems[n].seq));
  });
  return { message: '已儲存保養紀錄' };
}

module.exports = [
  { method: 'GET', path: '/api/plans/:id/record-form', access: 'login', handler: recordForm },
  { method: 'POST', path: '/api/plans/:id/records', access: 'login', handler: createRecord },
  { method: 'GET', path: '/api/records', access: 'login', handler: listRecords },
  { method: 'GET', path: '/api/records/:id', access: 'login', handler: recordDetail },
  { method: 'PUT', path: '/api/records/:id', access: 'login', handler: updateRecord },
];
