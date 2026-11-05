// Business rules shared by the issue routes: derived values (spec 5.4),
// issue number, and the field checks for registering and editing (spec 7.1).

const { UserError } = require('./http');
const { today } = require('./db');
const { OPEN_STATUSES, text, fail, toId, toMinuteTime } = require('./validate');

// Whole days from date a to date b ('YYYY-MM-DD'); UTC avoids daylight-saving shifts
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function isOpen(issue) {
  return OPEN_STATUSES.includes(issue.status);
}

// One issue row with the names shown on screen
const ISSUE_SELECT = `
  SELECT i.*,
         p.part_no, p.name AS product_name, p.customer, p.is_active AS product_active,
         t.name AS defect_name, t.is_active AS defect_active,
         d.name AS dept_name, d.contact AS dept_contact, d.ext AS dept_ext,
         cu.name AS created_by_name, au.name AS assigned_by_name, xu.name AS closed_by_name
    FROM issues i
    JOIN products p ON p.id = i.product_id
    JOIN defect_types t ON t.id = i.defect_type_id
    LEFT JOIN departments d ON d.id = i.dept_id
    JOIN users cu ON cu.id = i.created_by
    LEFT JOIN users au ON au.id = i.assigned_by
    LEFT JOIN users xu ON xu.id = i.closed_by`;

// Add elapsed days: open issues count to today, finished ones to the closing date
function withDays(issue) {
  const end = isOpen(issue) ? today() : issue.closed_at.slice(0, 10);
  return { ...issue, days: daysBetween(issue.found_at.slice(0, 10), end) };
}

function getIssue(db, id) {
  const issue = id && db.prepare(ISSUE_SELECT + ' WHERE i.id = ?').get(id);
  if (!issue) throw new UserError('找不到這張異常單', 404);
  return issue;
}

// Next number for this month: QI-YYMM-NNN, based on the registration date
function nextIssueNo(db) {
  const prefix = `QI-${today().slice(2, 4)}${today().slice(5, 7)}-`;
  const last = db.prepare('SELECT MAX(issue_no) AS no FROM issues WHERE issue_no LIKE ?').get(prefix + '%').no;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return prefix + String(seq).padStart(3, '0');
}

// Spec 7.1 steps 3-17. old is the issue being edited, or null when registering.
// An edited issue may keep a product or defect type that has been disabled since.
function checkIssueFields(db, body, old, nowTime) {
  // Steps 3-4: found time
  const foundAt = toMinuteTime(text(body.found_at));
  if (!foundAt) fail('請輸入正確的發現時間');
  if (foundAt > nowTime) fail('發現時間不能晚於現在');
  // Steps 5-9: reporter, line, station
  const reporter = text(body.reporter);
  if (!reporter) fail('請輸入回報人');
  if (reporter.length > 20) fail('回報人不可超過 20 字');
  const line = text(body.line);
  if (!line) fail('請輸入產線');
  if (line.length > 20) fail('產線不可超過 20 字');
  const station = text(body.station);
  if (station.length > 30) fail('工站或機台不可超過 30 字');
  // Steps 10-11: product
  const productId = toId(body.product_id);
  const product = productId && db.prepare('SELECT part_no, is_active FROM products WHERE id = ?').get(productId);
  if (!product) fail('請選擇產品');
  if (!product.is_active && !(old && old.product_id === productId)) fail(`產品 ${product.part_no} 已停用，請重新選擇`);
  // Step 12: lot number
  const lotNo = text(body.lot_no);
  if (lotNo.length > 20) fail('批號不可超過 20 字');
  // Steps 13-14: defect type
  const typeId = toId(body.defect_type_id);
  const type = typeId && db.prepare('SELECT name, is_active FROM defect_types WHERE id = ?').get(typeId);
  if (!type) fail('請選擇異常類別');
  if (!type.is_active && !(old && old.defect_type_id === typeId)) fail(`異常類別「${type.name}」已停用，請重新選擇`);
  // Steps 15-16: description
  const description = text(body.description);
  if (!description) fail('請輸入異常描述');
  if (description.length > 200) fail('異常描述不可超過 200 字');
  // Step 17: quantity
  const qtyText = text(body.qty);
  const qty = Number(qtyText);
  if (!/^\d+$/.test(qtyText) || qty > 99999) fail('影響數量須為 0 到 99999 的整數');

  return {
    found_at: foundAt,
    reporter,
    line,
    station: station || null,
    product_id: productId,
    lot_no: lotNo || null,
    defect_type_id: typeId,
    description,
    qty,
  };
}

module.exports = { daysBetween, isOpen, ISSUE_SELECT, withDays, getIssue, nextIssueNo, checkIssueFields };
