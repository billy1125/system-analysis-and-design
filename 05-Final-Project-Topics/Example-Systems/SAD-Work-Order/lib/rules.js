// Business rules shared by the work order routes: derived values (spec 5.4),
// work order number, and the field checks for creating and editing (spec 7.1).

const { UserError } = require('./http');
const { today } = require('./db');
const { OPEN_STATUSES, text, fail, toId, isDate, toCount } = require('./validate');

// Whole days from date a to date b ('YYYY-MM-DD'); UTC avoids daylight-saving shifts
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function isOpen(order) {
  return OPEN_STATUSES.includes(order.status);
}

// One work order row with the names shown on screen
const ORDER_SELECT = `
  SELECT o.*,
         p.part_no, p.name AS product_name, p.is_active AS product_active,
         w.name AS wc_name,
         cu.name AS created_by_name, du.name AS dispatched_by_name,
         su.name AS started_by_name, xu.name AS closed_by_name
    FROM work_orders o
    JOIN products p ON p.id = o.product_id
    LEFT JOIN work_centers w ON w.id = o.work_center_id
    JOIN users cu ON cu.id = o.created_by
    LEFT JOIN users du ON du.id = o.dispatched_by
    LEFT JOIN users su ON su.id = o.started_by
    LEFT JOIN users xu ON xu.id = o.closed_by`;

// Add due status, overdue flag and yield (spec 5.4)
function withDerived(order) {
  let dueStatus = '';
  let overdue = false;
  if (isOpen(order)) {
    const left = daysBetween(today(), order.due_date);
    overdue = left < 0;
    dueStatus = overdue ? `逾期 ${-left} 天` : `剩 ${left} 天`;
  } else if (order.status === '已完工') {
    const late = daysBetween(order.due_date, order.closed_at.slice(0, 10));
    dueStatus = late > 0 ? `延遲 ${late} 天` : '準時';
  }
  let yieldRate = '';
  if (order.status === '已完工' && order.good_qty + order.ng_qty > 0) {
    yieldRate = (order.good_qty / (order.good_qty + order.ng_qty) * 100).toFixed(1) + '%';
  }
  return { ...order, due_status: dueStatus, overdue, yield_rate: yieldRate };
}

function getOrder(db, id) {
  const order = id && db.prepare(ORDER_SELECT + ' WHERE o.id = ?').get(id);
  if (!order) throw new UserError('找不到這張工單', 404);
  return order;
}

// Next number for today: WO-YYMMDD-NN, based on the date the order is created
function nextOrderNo(db) {
  const d = today();
  const prefix = `WO-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-`;
  const last = db.prepare('SELECT MAX(wo_no) AS no FROM work_orders WHERE wo_no LIKE ?').get(prefix + '%').no;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return prefix + String(seq).padStart(2, '0');
}

// Spec 7.1 steps 3-9. old is the order being edited, or null when creating.
// An edited order may keep a product that has been disabled since.
function checkOrderFields(db, body, old) {
  // Step 3: order number
  const soNo = text(body.so_no);
  if (soNo.length > 20) fail('訂單號不可超過 20 字');
  // Steps 4-5: product
  const productId = toId(body.product_id);
  const product = productId && db.prepare('SELECT part_no, is_active FROM products WHERE id = ?').get(productId);
  if (!product) fail('請選擇產品');
  if (!product.is_active && !(old && old.product_id === productId)) fail(`產品 ${product.part_no} 已停用，請重新選擇`);
  // Step 6: quantity
  const qty = toCount(body.qty, 1, 99999);
  if (qty === null) fail('數量須為 1 到 99999 的整數');
  // Steps 7-8: due date, not before the day the order was created
  const dueDate = text(body.due_date);
  if (!isDate(dueDate)) fail('請輸入正確的交期');
  const openDate = old ? old.created_at.slice(0, 10) : today();
  if (dueDate < openDate) fail(`交期不能早於開立日期（${openDate}）`);
  // Step 9: note
  const note = text(body.note);
  if (note.length > 200) fail('備註不可超過 200 字');

  return { so_no: soNo || null, product_id: productId, qty, due_date: dueDate, note: note || null };
}

module.exports = { daysBetween, isOpen, ORDER_SELECT, withDerived, getOrder, nextOrderNo, checkOrderFields };
