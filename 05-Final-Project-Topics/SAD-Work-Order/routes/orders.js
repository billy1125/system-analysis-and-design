// FR-LIST, FR-WO, FR-RPT, FR-QRY: open list, create, edit, dispatch, report, cancel, search.
// Team leaders see and report only the orders of their own work center.

const { getDb, transaction, now, today } = require('../lib/db');
const { ORDER_SELECT, withDerived, getOrder, nextOrderNo, checkOrderFields } = require('../lib/rules');
const { ROLE_PLANNER, ROLE_LEADER, STATUSES, text, fail, toId, isDate, toCount } = require('../lib/validate');

function allWorkCenters(db) {
  return db.prepare('SELECT id, name, is_active FROM work_centers ORDER BY id').all();
}

function activeProducts(db, keepId) {
  return db.prepare('SELECT id, part_no, name FROM products WHERE is_active = 1 OR id = ? ORDER BY part_no')
    .all(keepId || 0);
}

// ---------- UI-02 open list (FR-LIST-01..04) ----------

function openList({ query, user }) {
  const db = getDb();
  const isPlanner = user.role === ROLE_PLANNER;
  // What this user may see at all; the summary uses this scope only
  const scope = isPlanner
    ? ["o.status IN ('待派工', '已派工', '生產中')"]
    : ["o.status IN ('已派工', '生產中')", 'o.work_center_id = ?'];
  const scopeArgs = isPlanner ? [] : [user.work_center_id || 0];

  const where = [...scope];
  const args = [...scopeArgs];
  const status = text(query.get('status'));
  if (['待派工', '已派工', '生產中'].includes(status)) { where.push('o.status = ?'); args.push(status); }
  if (text(query.get('due')) === 'overdue') { where.push('o.due_date < ?'); args.push(today()); }
  const wcId = isPlanner ? toId(query.get('work_center_id')) : null;
  if (wcId) { where.push('o.work_center_id = ?'); args.push(wcId); }

  const rows = db.prepare(`${ORDER_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.due_date, o.wo_no`)
    .all(...args).map(withDerived);
  const s = db.prepare(`
    SELECT SUM(o.status = '待派工') AS pending, SUM(o.status = '已派工') AS dispatched,
           SUM(o.status = '生產中') AS producing, SUM(o.due_date < ?) AS overdue
      FROM work_orders o WHERE ${scope.join(' AND ')}
  `).get(today(), ...scopeArgs);
  return {
    rows,
    summary: {
      pending: s.pending || 0,
      dispatched: s.dispatched || 0,
      producing: s.producing || 0,
      overdue: s.overdue || 0,
    },
    work_centers: isPlanner ? allWorkCenters(db) : [],
  };
}

// ---------- UI-03 create (FR-WO-01, 02) ----------

function newForm() {
  return { products: activeProducts(getDb(), null) };
}

function createOrder({ body, user }) {
  const created = transaction((db) => {
    const f = checkOrderFields(db, body, null);
    const woNo = nextOrderNo(db);
    const result = db.prepare(`
      INSERT INTO work_orders (wo_no, so_no, product_id, qty, due_date, note, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, '待派工', ?, ?)
    `).run(woNo, f.so_no, f.product_id, f.qty, f.due_date, f.note, user.id, now());
    return { id: Number(result.lastInsertRowid), woNo };
  });
  return { id: created.id, message: `已開立工單 ${created.woNo}` };
}

// ---------- UI-04 search (FR-QRY-01) ----------

function searchOrders({ query }) {
  const db = getDb();
  const where = [];
  const args = [];
  const from = text(query.get('from'));
  const to = text(query.get('to'));
  if (isDate(from) && isDate(to) && from > to) fail('起始日期不可晚於結束日期');
  if (isDate(from)) { where.push('o.due_date >= ?'); args.push(from); }
  if (isDate(to)) { where.push('o.due_date <= ?'); args.push(to); }
  const productId = toId(query.get('product_id'));
  if (productId) { where.push('o.product_id = ?'); args.push(productId); }
  const wcId = toId(query.get('work_center_id'));
  if (wcId) { where.push('o.work_center_id = ?'); args.push(wcId); }
  const status = text(query.get('status'));
  if (STATUSES.includes(status)) { where.push('o.status = ?'); args.push(status); }
  const keyword = text(query.get('keyword'));
  if (keyword) {
    where.push("(instr(o.wo_no, ?) > 0 OR instr(ifnull(o.so_no, ''), ?) > 0)");
    args.push(keyword, keyword);
  }

  const sql = `${ORDER_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.due_date DESC, o.wo_no DESC`;
  return {
    rows: db.prepare(sql).all(...args).map(withDerived),
    products: db.prepare('SELECT id, part_no, name, is_active FROM products ORDER BY part_no').all(),
    work_centers: allWorkCenters(db),
  };
}

// ---------- UI-05 detail (FR-QRY-02) ----------

function orderDetail({ params, user }) {
  const db = getDb();
  const order = withDerived(getOrder(db, toId(params.id)));
  const editable = order.status === '待派工' || order.status === '已派工';
  if (user.role !== ROLE_PLANNER || !editable) return { order, today: today() };
  // Choices for the edit and dispatch forms. The current product stays even if disabled.
  return {
    order,
    today: today(),
    products: activeProducts(db, order.product_id),
    work_centers: db.prepare('SELECT id, name FROM work_centers WHERE is_active = 1 ORDER BY id').all(),
  };
}

// ---------- UI-05 planner actions (FR-WO-03..06) ----------

// Spec 7.1 steps 1-2, then 3-9. Status and dispatch fields do not change.
function updateOrder({ params, body }) {
  return transaction((db) => {
    const order = getOrder(db, toId(params.id));
    if (order.status !== '待派工' && order.status !== '已派工') fail('這張工單已開工、完工或取消，不能修改');
    const f = checkOrderFields(db, body, order);
    db.prepare(`
      UPDATE work_orders SET so_no = ?, product_id = ?, qty = ?, due_date = ?, note = ?, updated_at = ? WHERE id = ?
    `).run(f.so_no, f.product_id, f.qty, f.due_date, f.note, now(), order.id);
    return { message: '已儲存工單' };
  });
}

// Spec 7.2. Redispatching overwrites the previous work center, plan date, dispatcher and time.
function dispatchOrder({ params, body, user }) {
  return transaction((db) => {
    // Steps 1-2
    const order = getOrder(db, toId(params.id));
    if (order.status !== '待派工' && order.status !== '已派工') fail('這張工單已開工、完工或取消，不能派工');
    // Steps 3-4
    const wcId = toId(body.work_center_id);
    const wc = wcId && db.prepare('SELECT id, name, is_active FROM work_centers WHERE id = ?').get(wcId);
    if (!wc) fail('請選擇工作中心');
    if (!wc.is_active) fail(`工作中心「${wc.name}」已停用，請重新選擇`);
    // Steps 5-6
    const planDate = text(body.plan_date);
    if (!isDate(planDate)) fail('請輸入正確的預定生產日');
    if (planDate < today()) fail('預定生產日不能早於今天');
    // Step 7
    const redispatch = order.status === '已派工';
    if (redispatch && order.work_center_id === wc.id && order.plan_date === planDate) fail('派工內容沒有變更');

    db.prepare(`
      UPDATE work_orders SET status = '已派工', work_center_id = ?, plan_date = ?, dispatched_by = ?, dispatched_at = ?
       WHERE id = ?
    `).run(wc.id, planDate, user.id, now(), order.id);
    return { message: `已${redispatch ? '改派' : '派工'}給 ${wc.name}，預定 ${planDate} 生產` };
  });
}

// Spec 7.4. The dispatch fields stay as they were.
function cancelOrder({ params, body, user }) {
  return transaction((db) => {
    const order = getOrder(db, toId(params.id));
    if (order.status !== '待派工' && order.status !== '已派工') fail('這張工單已開工、完工或取消，不能取消');
    const reason = text(body.close_note);
    if (!reason) fail('請輸入取消理由');
    if (reason.length > 200) fail('取消理由不可超過 200 字');
    db.prepare(`
      UPDATE work_orders SET status = '已取消', close_note = ?, closed_by = ?, closed_at = ? WHERE id = ?
    `).run(reason, user.id, now(), order.id);
    return { message: `已取消工單 ${order.wo_no}` };
  });
}

// ---------- UI-05 team leader actions (FR-RPT-01..04) ----------

// Spec 7.3 step 2. Planners cannot report for a team leader.
function checkOwnCenter(user, order) {
  if (user.role !== ROLE_LEADER || !order.work_center_id || user.work_center_id !== order.work_center_id) {
    fail('只有這張工單所屬工作中心的組長可以回報');
  }
}

function startOrder({ params, user }) {
  return transaction((db) => {
    const order = getOrder(db, toId(params.id));
    checkOwnCenter(user, order);
    if (order.status !== '已派工') fail('只有已派工的工單可以開工');
    db.prepare(`
      UPDATE work_orders SET status = '生產中', started_by = ?, started_at = ? WHERE id = ?
    `).run(user.id, now(), order.id);
    return { message: `已回報 ${order.wo_no} 開工` };
  });
}

// Good plus defective does not have to equal the order quantity (FR-RPT-03)
function finishOrder({ params, body, user }) {
  return transaction((db) => {
    // Steps 1-3
    const order = getOrder(db, toId(params.id));
    checkOwnCenter(user, order);
    if (order.status !== '生產中') fail('只有生產中的工單可以完工回報');
    // Steps 4-6
    const good = toCount(body.good_qty, 0, 99999);
    if (good === null) fail('良品數須為 0 到 99999 的整數');
    const ng = toCount(body.ng_qty, 0, 99999);
    if (ng === null) fail('不良數須為 0 到 99999 的整數');
    if (good === 0 && ng === 0) fail('良品數與不良數不能都是 0');
    // Steps 7-8
    const note = text(body.close_note);
    if (ng > 0 && !note) fail('有不良品時請在完工備註說明原因');
    if (note.length > 200) fail('完工備註不可超過 200 字');

    db.prepare(`
      UPDATE work_orders SET status = '已完工', good_qty = ?, ng_qty = ?, close_note = ?, closed_by = ?, closed_at = ?
       WHERE id = ?
    `).run(good, ng, note || null, user.id, now(), order.id);
    return { message: `已回報 ${order.wo_no} 完工` };
  });
}

module.exports = [
  { method: 'GET', path: '/api/orders/open', access: 'login', handler: openList },
  { method: 'GET', path: '/api/orders/new-form', access: 'planner', handler: newForm },
  { method: 'GET', path: '/api/orders', access: 'login', handler: searchOrders },
  { method: 'POST', path: '/api/orders', access: 'planner', handler: createOrder },
  { method: 'GET', path: '/api/orders/:id', access: 'login', handler: orderDetail },
  { method: 'PUT', path: '/api/orders/:id', access: 'planner', handler: updateOrder },
  { method: 'PUT', path: '/api/orders/:id/dispatch', access: 'planner', handler: dispatchOrder },
  { method: 'PUT', path: '/api/orders/:id/cancel', access: 'planner', handler: cancelOrder },
  { method: 'PUT', path: '/api/orders/:id/start', access: 'login', handler: startOrder },
  { method: 'PUT', path: '/api/orders/:id/finish', access: 'login', handler: finishOrder },
];
