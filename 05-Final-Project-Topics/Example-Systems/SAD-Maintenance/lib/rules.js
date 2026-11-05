// Values derived from dates and records (spec 5.4), and the checks shared by
// recording and editing maintenance (spec 7.1 and 7.2). None of the derived values are stored.

const { today } = require('./db');
const { UserError } = require('./http');
const { ITEM_RESULTS, text, fail, isDate } = require('./validate');

const SOON_DAYS = 7;

function utcOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// 'YYYY-MM-DD' plus n days
function addDays(date, n) {
  return new Date(utcOf(date) + n * 86400000).toISOString().slice(0, 10);
}

// Days from a to b; negative when b is earlier
function daysBetween(a, b) {
  return Math.round((utcOf(b) - utcOf(a)) / 86400000);
}

// Plans with equipment, owner and last done date
const PLAN_SELECT = `
  SELECT p.id, p.equipment_id, p.plan_type, p.cycle_days, p.items, p.owner_id,
         p.first_due_date, p.is_active,
         e.equip_no, e.name AS equip_name, e.line, e.location, e.is_active AS equip_active,
         u.name AS owner_name,
         (SELECT MAX(r.done_date) FROM pm_records r WHERE r.plan_id = p.id) AS last_done
    FROM pm_plans p
    JOIN equipment e ON e.id = p.equipment_id
    JOIN users u ON u.id = p.owner_id`;

// Add next due date, days left and due status
function withDueState(plan, day = today()) {
  const nextDue = plan.last_done ? addDays(plan.last_done, plan.cycle_days) : plan.first_due_date;
  const daysLeft = daysBetween(day, nextDue);
  let dueStatus = '未到期';
  if (daysLeft < 0) dueStatus = '逾期';
  else if (daysLeft <= SOON_DAYS) dueStatus = '即將到期';
  return { ...plan, next_due: nextDue, days_left: daysLeft, due_status: dueStatus };
}

function getPlan(db, id) {
  const p = id && db.prepare(PLAN_SELECT + ' WHERE p.id = ?').get(id);
  if (!p) throw new UserError('找不到這個保養計畫', 404);
  return withDueState(p);
}

// Plan items text -> array of lines, blank lines removed
function splitItems(value) {
  return text(value).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// Records with plan, equipment, worker and item counts
const RECORD_SELECT = `
  SELECT r.id, r.plan_id, r.done_date, r.done_by, r.note, r.created_at, r.updated_at,
         p.plan_type, p.cycle_days, e.id AS equipment_id, e.equip_no, e.name AS equip_name,
         u.name AS done_by_name,
         (SELECT COUNT(*) FROM pm_record_items i WHERE i.record_id = r.id AND i.result = '異常') AS abnormal,
         (SELECT COUNT(*) FROM pm_record_items i WHERE i.record_id = r.id AND i.result = '未執行') AS skipped
    FROM pm_records r
    JOIN pm_plans p ON p.id = r.plan_id
    JOIN equipment e ON e.id = p.equipment_id
    JOIN users u ON u.id = r.done_by`;

// Record result: 有異常 / 部分未執行 / 正常
function withResult(r) {
  let result = '正常';
  if (r.abnormal > 0) result = '有異常';
  else if (r.skipped > 0) result = '部分未執行';
  return { ...r, result };
}

// Steps 4-6: maintenance date. previous is the last done date before this record, or null.
function checkDoneDate(value, previous) {
  const date = text(value);
  if (!isDate(date)) fail('請輸入正確的保養日期');
  if (date > today()) fail('保養日期不能晚於今天');
  if (previous && date <= previous) fail(`保養日期必須晚於上一次保養日（${previous}）`);
  return date;
}

// Steps 7-11: item results and note
function checkItemResults(list, expectedCount, countMessage, noteValue) {
  // Step 7: item count matches
  if (!Array.isArray(list) || list.length !== expectedCount) fail(countMessage);
  const items = list.map((i) => ({ result: text(i && i.result), remark: text(i && i.remark) }));

  // Step 8: every item has a result
  items.forEach((i, n) => {
    if (!ITEM_RESULTS.includes(i.result)) fail(`第 ${n + 1} 項還沒選結果`);
  });
  // Step 9: abnormal or skipped items need a remark
  items.forEach((i, n) => {
    if (i.result !== '正常' && !i.remark) fail(`第 ${n + 1} 項為異常或未執行，請填寫說明`);
  });
  // Step 10: remark length
  items.forEach((i, n) => {
    if (i.remark.length > 100) fail(`第 ${n + 1} 項的說明不可超過 100 字`);
  });
  // Step 11: note length
  const note = text(noteValue);
  if (note.length > 200) fail('備註不可超過 200 字');

  return {
    items: items.map((i) => ({ result: i.result, remark: i.remark || null })),
    note: note || null,
  };
}

module.exports = {
  addDays, daysBetween, PLAN_SELECT, withDueState, getPlan, splitItems,
  RECORD_SELECT, withResult, checkDoneDate, checkItemResults,
};
