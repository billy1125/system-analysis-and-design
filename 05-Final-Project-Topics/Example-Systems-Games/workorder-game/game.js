'use strict';
/*
 * Work order dispatch simulation game (teaching material).
 * Plain HTML/CSS/JS. Opens from file:// with no network and no storage.
 * Sections:
 *   1. constants and helpers
 *   2. work order rules (pure functions, no DOM; same checks and messages as the original system)
 *   3. level data (fixed fictional data)
 *   4. game state and clock
 *   5. level controllers (midterm: level 1, level 2)
 *   6. CR scenario controller (final only; removed in the midterm build)
 *   6b. sound
 *   7. UI
 */

const EDITION = 'final'; // @@EDITION  build script sets 'midterm' for the midterm zip

/* ---------- 1. constants and helpers ---------- */

const TILE = 40;
const MAP_ROWS = [
  '####################',
  '#P.T.N#.......W..B.#',
  '#.....#............#',
  '#.....#..MM.MM.....#',
  '#.....D...........H#',
  '#.....#..MM.MM.....#',
  '#.....#.......GX...#',
  '#.....#............#',
  '#######OOOOOO#OOOOO#'
];
const MAP_W = MAP_ROWS[0].length;
const MAP_H = MAP_ROWS.length;
const BLOCKING = '#PTNWBHGXMO';
const OBJECTS = { P: 'planner', T: 'phone', N: 'memo', W: 'center', B: 'board', H: 'sheet', G: 'goodbin', X: 'ngbin' };
const OBJECT_LABELS = {
  planner: '生管電腦', phone: '電話', memo: '業務需求便條', center: '工作中心電腦',
  board: '清點板', sheet: '交接班單', goodbin: '良品箱', ngbin: '不良品箱'
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const PHONE_BOOK = [
  { ext: '3001', name: '生管辦公室' },
  { ext: '3101', name: 'CNC 車削組' },
  { ext: '3102', name: 'CNC 銑削組' },
  { ext: '3103', name: '組裝線' }
];

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function pad2(n) { return String(n).padStart(2, '0'); }
function clockAt(y, mo, d, h, mi) { return Date.UTC(y, mo - 1, d, h, mi); }
function fmtDT(ms) {
  const t = new Date(ms);
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate()) +
    ' ' + pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes());
}
function fmtHM(ms) { const t = new Date(ms); return pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes()); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#';
  return MAP_ROWS[y][x];
}

/* ---------- 2. work order rules (pure functions, no DOM) ---------- */

const ROLE_PLANNER = 0;
const ROLE_LEADER = 1;
const STATUSES = ['待派工', '已派工', '生產中', '已完工', '已取消'];
const OPEN_STATUSES = ['待派工', '已派工', '生產中'];
const PLANNER_ONLY = '只有生管人員可以使用這個功能';

function text(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function toId(v) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }
// 'YYYY-MM-DD' and a real calendar date
function isDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
// Whole number between min and max, or null
function toCount(v, min, max) {
  const s = text(v);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function isOpen(o) { return OPEN_STATUSES.includes(o.status); }
function nextId(rows) { return rows.reduce((m, r) => Math.max(m, r.id), 0) + 1; }
function failed(db, msg) { return { ok: false, errors: [msg], db }; }
function findOrder(db, id) { return db.work_orders.find(o => o.id === id) || null; }
function userById(db, id) { return db.users.find(u => u.id === id) || null; }
function userName(db, id) { const u = userById(db, id); return u ? u.name : ''; }
function centerName(db, id) { const w = db.work_centers.find(x => x.id === id); return w ? w.name : ''; }

function blankOrder() {
  return {
    id: 0, wo_no: '', so_no: null, product_id: null, qty: 0, due_date: '', note: null, status: '待派工',
    work_center_id: null, plan_date: null, dispatched_by: null, dispatched_at: null,
    started_by: null, started_at: null, good_qty: null, ng_qty: null, close_note: null,
    closed_by: null, closed_at: null, created_by: null, created_at: '', updated_at: null
  };
}

// WO-YYMMDD-NN from the date the order is created
function nextOrderNo(db, today) {
  const prefix = 'WO-' + today.slice(2, 4) + today.slice(5, 7) + today.slice(8, 10) + '-';
  const seqs = db.work_orders.filter(o => o.wo_no.indexOf(prefix) === 0).map(o => Number(o.wo_no.slice(prefix.length)));
  const seq = seqs.length ? Math.max.apply(null, seqs) + 1 : 1;
  return prefix + pad2(seq);
}

// Field checks for create and edit, in the original order. old is the order being edited, or null.
function checkOrderFields(db, body, old, today) {
  const soNo = text(body.so_no);
  if (soNo.length > 20) return { error: '訂單號不可超過 20 字' };
  const productId = toId(body.product_id);
  const product = productId && db.products.find(p => p.id === productId);
  if (!product) return { error: '請選擇產品' };
  if (!product.active && !(old && old.product_id === productId)) return { error: '產品 ' + product.part_no + ' 已停用，請重新選擇' };
  const qty = toCount(body.qty, 1, 99999);
  if (qty === null) return { error: '數量須為 1 到 99999 的整數' };
  const dueDate = text(body.due_date);
  if (!isDate(dueDate)) return { error: '請輸入正確的交期' };
  const openDate = old ? old.created_at.slice(0, 10) : today;
  if (dueDate < openDate) return { error: '交期不能早於開立日期（' + openDate + '）' };
  const note = text(body.note);
  if (note.length > 200) return { error: '備註不可超過 200 字' };
  return { value: { so_no: soNo || null, product_id: productId, qty, due_date: dueDate, note: note || null } };
}

function createOrder(db, body, user, now) {
  if (!user || user.role !== ROLE_PLANNER) return failed(db, PLANNER_ONLY);
  const today = now.slice(0, 10);
  const f = checkOrderFields(db, body, null, today);
  if (f.error) return failed(db, f.error);
  const next = clone(db);
  const order = Object.assign(blankOrder(), f.value, {
    id: nextId(next.work_orders), wo_no: nextOrderNo(next, today), status: '待派工', created_by: user.id, created_at: now
  });
  next.work_orders.push(order);
  return { ok: true, errors: [], db: next, order, message: '已開立工單 ' + order.wo_no };
}

// Status and dispatch fields do not change; updated_at is written only here.
function updateOrder(db, id, body, user, now) {
  if (!user || user.role !== ROLE_PLANNER) return failed(db, PLANNER_ONLY);
  const order = findOrder(db, id);
  if (!order) return failed(db, '找不到這張工單');
  if (order.status !== '待派工' && order.status !== '已派工') return failed(db, '這張工單已開工、完工或取消，不能修改');
  const f = checkOrderFields(db, body, order, now.slice(0, 10));
  if (f.error) return failed(db, f.error);
  const next = clone(db);
  const o = findOrder(next, id);
  Object.assign(o, f.value, { updated_at: now });
  return { ok: true, errors: [], db: next, order: o, message: '已儲存工單' };
}

// Redispatch overwrites work center, plan date, dispatcher and time. No history is kept.
function dispatchOrder(db, id, body, user, now) {
  if (!user || user.role !== ROLE_PLANNER) return failed(db, PLANNER_ONLY);
  const order = findOrder(db, id);
  if (!order) return failed(db, '找不到這張工單');
  if (order.status !== '待派工' && order.status !== '已派工') return failed(db, '這張工單已開工、完工或取消，不能派工');
  const wcId = toId(body.work_center_id);
  const wc = wcId && db.work_centers.find(w => w.id === wcId);
  if (!wc) return failed(db, '請選擇工作中心');
  if (!wc.active) return failed(db, '工作中心「' + wc.name + '」已停用，請重新選擇');
  const planDate = text(body.plan_date);
  if (!isDate(planDate)) return failed(db, '請輸入正確的預定生產日');
  if (planDate < now.slice(0, 10)) return failed(db, '預定生產日不能早於今天');
  const redispatch = order.status === '已派工';
  if (redispatch && order.work_center_id === wc.id && order.plan_date === planDate) return failed(db, '派工內容沒有變更');
  const next = clone(db);
  const o = findOrder(next, id);
  Object.assign(o, { status: '已派工', work_center_id: wc.id, plan_date: planDate, dispatched_by: user.id, dispatched_at: now });
  return { ok: true, errors: [], db: next, order: o, redispatch, message: '已' + (redispatch ? '改派' : '派工') + '給 ' + wc.name + '，預定 ' + planDate + ' 生產' };
}

// Dispatch fields keep their values.
function cancelOrder(db, id, body, user, now) {
  if (!user || user.role !== ROLE_PLANNER) return failed(db, PLANNER_ONLY);
  const order = findOrder(db, id);
  if (!order) return failed(db, '找不到這張工單');
  if (order.status !== '待派工' && order.status !== '已派工') return failed(db, '這張工單已開工、完工或取消，不能取消');
  const reason = text(body.close_note);
  if (!reason) return failed(db, '請輸入取消理由');
  if (reason.length > 200) return failed(db, '取消理由不可超過 200 字');
  const next = clone(db);
  const o = findOrder(next, id);
  Object.assign(o, { status: '已取消', close_note: reason, closed_by: user.id, closed_at: now });
  return { ok: true, errors: [], db: next, order: o, message: '已取消工單 ' + order.wo_no };
}

// Planners cannot report for a team leader. Any leader of the same work center may report.
function checkOwnCenter(user, order) {
  if (!user || user.role !== ROLE_LEADER || !order.work_center_id || user.work_center_id !== order.work_center_id) {
    return '只有這張工單所屬工作中心的組長可以回報';
  }
  return null;
}

function startOrder(db, id, user, now) {
  const order = findOrder(db, id);
  if (!order) return failed(db, '找不到這張工單');
  const own = checkOwnCenter(user, order);
  if (own) return failed(db, own);
  if (order.status !== '已派工') return failed(db, '只有已派工的工單可以開工');
  const next = clone(db);
  const o = findOrder(next, id);
  Object.assign(o, { status: '生產中', started_by: user.id, started_at: now });
  return { ok: true, errors: [], db: next, order: o, message: '已回報 ' + order.wo_no + ' 開工' };
}

// One report only. Good plus defective does not have to equal the order quantity.
function finishOrder(db, id, body, user, now) {
  const order = findOrder(db, id);
  if (!order) return failed(db, '找不到這張工單');
  const own = checkOwnCenter(user, order);
  if (own) return failed(db, own);
  if (order.status !== '生產中') return failed(db, '只有生產中的工單可以完工回報');
  const good = toCount(body.good_qty, 0, 99999);
  if (good === null) return failed(db, '良品數須為 0 到 99999 的整數');
  const ng = toCount(body.ng_qty, 0, 99999);
  if (ng === null) return failed(db, '不良數須為 0 到 99999 的整數');
  if (good === 0 && ng === 0) return failed(db, '良品數與不良數不能都是 0');
  const note = text(body.close_note);
  if (ng > 0 && !note) return failed(db, '有不良品時請在完工備註說明原因');
  if (note.length > 200) return failed(db, '完工備註不可超過 200 字');
  const next = clone(db);
  const o = findOrder(next, id);
  Object.assign(o, { status: '已完工', good_qty: good, ng_qty: ng, close_note: note || null, closed_by: user.id, closed_at: now });
  return { ok: true, errors: [], db: next, order: o, message: '已回報 ' + order.wo_no + ' 完工' };
}

// Derived values: not stored in the table. today comes from the simulated clock.
function withDerived(o, today) {
  let dueStatus = '';
  let overdue = false;
  if (isOpen(o)) {
    const left = daysBetween(today, o.due_date);
    overdue = left < 0;
    dueStatus = overdue ? '逾期 ' + (-left) + ' 天' : '剩 ' + left + ' 天';
  } else if (o.status === '已完工') {
    const late = daysBetween(o.due_date, o.closed_at.slice(0, 10));
    dueStatus = late > 0 ? '延遲 ' + late + ' 天' : '準時';
  }
  let yieldRate = '';
  if (o.status === '已完工' && o.good_qty + o.ng_qty > 0) {
    yieldRate = (o.good_qty / (o.good_qty + o.ng_qty) * 100).toFixed(1) + '%';
  }
  return Object.assign({}, o, { due_status: dueStatus, overdue, yield_rate: yieldRate });
}

function joinOrder(db, o, today) {
  const p = db.products.find(x => x.id === o.product_id) || {};
  return Object.assign(withDerived(o, today), {
    part_no: p.part_no || '', product_name: p.name || '', wc_name: centerName(db, o.work_center_id),
    created_by_name: userName(db, o.created_by), dispatched_by_name: userName(db, o.dispatched_by),
    started_by_name: userName(db, o.started_by), closed_by_name: userName(db, o.closed_by)
  });
}

function byDueThenNo(a, b) { return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.wo_no.localeCompare(b.wo_no); }

// Planners see every open order; team leaders see only dispatched or producing orders of their own center.
function openScope(db, user) {
  if (user.role === ROLE_PLANNER) return db.work_orders.filter(isOpen);
  return db.work_orders.filter(o => (o.status === '已派工' || o.status === '生產中') && o.work_center_id === (user.work_center_id || 0));
}
function listOpen(db, user, today, filter) {
  filter = filter || {};
  let rows = openScope(db, user);
  if (['待派工', '已派工', '生產中'].includes(filter.status)) rows = rows.filter(o => o.status === filter.status);
  if (filter.due === 'overdue') rows = rows.filter(o => o.due_date < today);
  const wcId = user.role === ROLE_PLANNER ? toId(filter.work_center_id) : null;
  if (wcId) rows = rows.filter(o => o.work_center_id === wcId);
  return rows.slice().sort(byDueThenNo).map(o => joinOrder(db, o, today));
}
function openSummary(db, user, today) {
  const rows = openScope(db, user);
  return {
    pending: rows.filter(o => o.status === '待派工').length,
    dispatched: rows.filter(o => o.status === '已派工').length,
    producing: rows.filter(o => o.status === '生產中').length,
    overdue: rows.filter(o => o.due_date < today).length
  };
}

// Both roles can search every work center. Date range is on the due date.
function searchOrders(db, q, today) {
  q = q || {};
  const from = text(q.from), to = text(q.to);
  if (isDate(from) && isDate(to) && from > to) return { ok: false, errors: ['起始日期不可晚於結束日期'], rows: [] };
  let rows = db.work_orders.slice();
  if (isDate(from)) rows = rows.filter(o => o.due_date >= from);
  if (isDate(to)) rows = rows.filter(o => o.due_date <= to);
  const pid = toId(q.product_id);
  if (pid) rows = rows.filter(o => o.product_id === pid);
  const wcId = toId(q.work_center_id);
  if (wcId) rows = rows.filter(o => o.work_center_id === wcId);
  if (STATUSES.includes(q.status)) rows = rows.filter(o => o.status === q.status);
  const kw = text(q.keyword);
  if (kw) rows = rows.filter(o => o.wo_no.indexOf(kw) >= 0 || (o.so_no || '').indexOf(kw) >= 0);
  rows.sort((a, b) => -byDueThenNo(a, b));
  return { ok: true, errors: [], rows: rows.map(o => joinOrder(db, o, today)) };
}

// Buttons per role and status, as in the original detail page. Finished and cancelled orders have none.
const PLANNER_ACTIONS = {
  待派工: [['edit', '修改'], ['dispatch', '派工'], ['cancel', '取消工單']],
  已派工: [['edit', '修改'], ['dispatch', '改派'], ['cancel', '取消工單']]
};
const LEADER_ACTIONS = { 已派工: [['start', '開工']], 生產中: [['finish', '完工回報']] };
function actionsFor(user, o) {
  if (user.role === ROLE_PLANNER) return PLANNER_ACTIONS[o.status] || [];
  if (o.work_center_id && o.work_center_id === user.work_center_id) return LEADER_ACTIONS[o.status] || [];
  return [];
}

/* ---------- 3. level data (fixed fictional data) ---------- */

function baseCenters() {
  return [
    { id: 1, name: 'CNC 車削組', active: true },
    { id: 2, name: 'CNC 銑削組', active: true },
    { id: 3, name: '組裝線', active: true },
    { id: 4, name: '傳統車床組', active: false }
  ];
}
function baseUsers() {
  return [
    { id: 1, emp_no: 'E8001', name: '吳淑惠', title: '生管課長', role: 0, work_center_id: null, active: true },
    { id: 2, emp_no: 'E8002', name: '林家豪', title: '生管員', role: 0, work_center_id: null, active: true },
    { id: 3, emp_no: 'E8101', name: '陳俊男', title: '車削組長', role: 1, work_center_id: 1, active: true },
    { id: 4, emp_no: 'E8102', name: '許志明', title: '車削夜班組長', role: 1, work_center_id: 1, active: true },
    { id: 5, emp_no: 'E8103', name: '黃雅琪', title: '銑削組長', role: 1, work_center_id: 2, active: true },
    { id: 6, emp_no: 'E8104', name: '張文德', title: '組裝組長', role: 1, work_center_id: 3, active: true },
    { id: 7, emp_no: 'E8105', name: '劉建國', title: '傳統車床組長', role: 1, work_center_id: 4, active: false }
  ];
}
function baseProducts() {
  return [
    { id: 1, part_no: 'BP-1101', name: '前花鼓殼', active: true },
    { id: 2, part_no: 'BP-1102', name: '後花鼓殼', active: true },
    { id: 3, part_no: 'BP-2201', name: '曲柄（左）', active: true },
    { id: 4, part_no: 'BP-2202', name: '曲柄（右）', active: true },
    { id: 5, part_no: 'BP-3301', name: '座管束', active: true },
    { id: 6, part_no: 'BP-4401', name: '碟煞轉接座', active: true },
    { id: 7, part_no: 'BP-0901', name: '車首碗組（舊款）', active: false }
  ];
}
function mkOrder(f) { return Object.assign(blankOrder(), f); }

function level1Data() {
  return {
    work_centers: baseCenters(), users: baseUsers(), products: baseProducts(),
    work_orders: [
      mkOrder({ id: 1, wo_no: 'WO-270920-01', so_no: 'SO-27-0351', product_id: 3, qty: 500, due_date: '2027-09-28', status: '已完工',
        work_center_id: 1, plan_date: '2027-09-22', dispatched_by: 1, dispatched_at: '2027-09-20 15:00', started_by: 3, started_at: '2027-09-22 08:05',
        good_qty: 495, ng_qty: 5, close_note: '不良 5 件為內孔刀痕', closed_by: 3, closed_at: '2027-09-27 16:40', created_by: 2, created_at: '2027-09-20 14:30' }),
      mkOrder({ id: 2, wo_no: 'WO-270930-01', so_no: 'SO-27-0388', product_id: 5, qty: 400, due_date: '2027-10-08', status: '生產中',
        work_center_id: 2, plan_date: '2027-10-01', dispatched_by: 1, dispatched_at: '2027-09-30 15:00', started_by: 5, started_at: '2027-10-01 08:10',
        created_by: 2, created_at: '2027-09-30 14:20' }),
      mkOrder({ id: 3, wo_no: 'WO-271001-01', so_no: 'SO-27-0390', product_id: 6, qty: 150, due_date: '2027-10-12', status: '待派工',
        created_by: 2, created_at: '2027-10-01 09:00' })
    ]
  };
}

function level2Data() {
  return {
    work_centers: baseCenters(), users: baseUsers(), products: baseProducts(),
    work_orders: [
      mkOrder({ id: 1, wo_no: 'WO-271001-02', so_no: 'SO-27-0397', product_id: 3, qty: 600, due_date: '2027-10-07', status: '已派工',
        work_center_id: 1, plan_date: '2027-10-04', dispatched_by: 1, dispatched_at: '2027-10-01 10:30', created_by: 2, created_at: '2027-10-01 10:05' }),
      mkOrder({ id: 2, wo_no: 'WO-271004-01', so_no: 'SO-27-0405', product_id: 4, qty: 200, due_date: '2027-10-05', status: '已派工',
        work_center_id: 1, plan_date: '2027-10-04', dispatched_by: 1, dispatched_at: '2027-10-04 13:10', created_by: 1, created_at: '2027-10-04 13:00',
        note: '客戶急單' }),
      mkOrder({ id: 3, wo_no: 'WO-270930-01', so_no: 'SO-27-0388', product_id: 5, qty: 400, due_date: '2027-10-08', status: '生產中',
        work_center_id: 2, plan_date: '2027-10-01', dispatched_by: 1, dispatched_at: '2027-09-30 15:00', started_by: 5, started_at: '2027-10-01 08:10',
        created_by: 2, created_at: '2027-09-30 14:20' })
    ]
  };
}

/* ---------- 4. game state and clock ---------- */

let gameState = null;
let RUN_SEQ = 0;

function newState(mode) {
  return {
    mode, runId: ++RUN_SEQ, db: null, clock: 0, identity: null, onDuty: null,
    player: { x: 2, y: 3, dir: 'right' },
    npcs: {}, flags: {}, trail: [], predictions: {}, cr: null, sheet: null,
    visited: {}, done: false
  };
}
function advance(st, minutes) { st.clock += minutes * 60000; }
function nowStr(st) { return fmtDT(st.clock); }
function todayOf(st) { return fmtDT(st.clock).slice(0, 10); }
function addTrail(st, t) { st.trail.push(fmtDT(st.clock).slice(5) + '　' + t); }
function npcDef(id, name, color, x, y, visible) { return { id, name, color, x, y, visible: visible !== false }; }
function userLabel(u) { return u ? u.title + ' ' + u.name : ''; }

/* ---------- 5. level controllers (midterm) ---------- */

const MIDTERM_PROMPTS = [
  { h: '觀察', q: '生管員與組長各實際做了哪些事情？哪些是人工（清點、交接班、電話、口頭分配），哪些是系統負責的功能與檢核？請把下面的操作紀錄分成兩類。' },
  { h: '推論', q: '開立、派工、改派、開工、完工各影響哪些狀態與欄位？哪些值是存下來的，哪些是推導出來的（交期狀態、良率）？' },
  { h: '實際系統待查證', q: '如何在真實工單系統及 SQLite 驗證上述推論？可能對應哪些使用案例、活動圖判斷點與資料表欄位？' }
];

function ordersTableHtml(db, today, ids, caption) {
  const rows = db.work_orders.filter(o => !ids || ids.includes(o.id)).map(o => joinOrder(db, o, today));
  const v = x => (x === null || x === undefined || x === '') ? '<em>（空）</em>' : esc(x);
  return '<table class="data"><caption>' + esc(caption || '模擬資料：工單（work_orders）') + '</caption><thead><tr>' +
    '<th>工單號</th><th>狀態</th><th>數量</th><th>交期</th><th>工作中心</th><th>預定生產日</th><th>派工人／時間</th><th>開工人／時間</th><th>良品</th><th>不良</th><th>完工備註</th><th>回報人／時間</th>' +
    '<th class="derived">交期狀態＊</th><th class="derived">良率＊</th></tr></thead><tbody>' +
    rows.map(r => '<tr><td>' + esc(r.wo_no) + '</td><td>' + esc(r.status) + '</td><td>' + r.qty + '</td><td>' + esc(r.due_date) + '</td><td>' + v(r.wc_name) +
      '</td><td>' + v(r.plan_date) + '</td><td>' + v(r.dispatched_by_name && r.dispatched_by_name + '／' + r.dispatched_at) +
      '</td><td>' + v(r.started_by_name && r.started_by_name + '／' + r.started_at) + '</td><td>' + v(r.good_qty) + '</td><td>' + v(r.ng_qty) +
      '</td><td>' + v(r.close_note) + '</td><td>' + v(r.closed_by_name && r.closed_by_name + '／' + r.closed_at) +
      '</td><td class="derived">' + v(r.due_status) + '</td><td class="derived">' + v(r.yield_rate) + '</td></tr>').join('') +
    '</tbody></table><p class="hint">＊交期狀態與良率是畫面上推導出來的值，不存在資料表裡。</p>';
}

function midtermSettlementHtml(st, topHtml, ids) {
  return '<div class="settle">' + (topHtml || '') +
    '<div class="prompts">' + MIDTERM_PROMPTS.map((p, i) => '<section><h3>' + (i + 1) + '. ' + p.h + '</h3><p>' + p.q + '</p>' +
      (i === 0 ? '<ol class="trail">' + st.trail.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' : '') +
      (i === 1 ? ordersTableHtml(st.db, todayOf(st), ids) : '') + '</section>').join('') + '</div>' +
    '<p class="boundary">遊戲畫面與上面的資料是模擬教材的觀察，不是原系統資料庫的證據。正式分析請以實際系統為準。</p></div>';
}

function predictionRows(st, qs, resultOf) {
  return '<h3>你的預測與系統結果</h3><ol class="pred">' + qs.map(q => '<li>' + esc(q.q) + '<br>你的預測：' + esc(st.predictions[q.id] || '（未作答）') +
    '　系統結果：' + esc(resultOf ? resultOf(q) : q.answer) + '</li>').join('') + '</ol>';
}

const DAY_LEADER_POS = [15, 2];

/* Level 1: one order through one day */
function makeLevel1() {
  const MEMO = { so_no: 'SO-27-0412', product_id: 1, qty: 300, due_date: '2027-10-09', note: '客戶要求 10-09 前出貨' };
  const keyOrder = st => st.flags.created ? findOrder(st.db, st.flags.created) : null;

  function finishQuestions() {
    return [
      { id: 'status', q: '① 送出完工回報後，這張工單的狀態會是？', options: ['生產中', '已完工', '已派工'], answer: '已完工',
        explain: '完工回報一次寫入良品數、不良數、備註、回報人與時間，狀態直接變成「已完工」，之後沒有任何處理動作。' },
      { id: 'yield', q: '② 明細上的良率會顯示多少？', options: ['99.3%', '99.0%', '不會顯示良率'], answer: '99.3%',
        explain: '良率 = 良品 ÷（良品 + 不良）= 298 ÷ 300，取小數一位。良率沒有存在資料表裡，是畫面依良品與不良算出來的。' },
      { id: 'due', q: '③ 交期狀態會顯示什麼？', options: ['準時', '剩 5 天', '延遲 1 天'], answer: '準時',
        explain: '已完工的單改用交期（10-09）和完工日期比；今天 10-04 完工，所以是「準時」。未完工時才會用「今天」算剩幾天。' }
    ];
  }

  function memoMismatch(input) {
    const w = [];
    if (text(input.so_no) && text(input.so_no) !== MEMO.so_no) w.push('訂單號：你填的是 ' + text(input.so_no) + '，便條寫的是 ' + MEMO.so_no);
    if (toId(input.product_id) && toId(input.product_id) !== MEMO.product_id) w.push('產品：便條寫的是 BP-1101 前花鼓殼');
    if (toCount(input.qty, 1, 99999) && toCount(input.qty, 1, 99999) !== MEMO.qty) w.push('數量：你填的是 ' + text(input.qty) + '，便條寫的是 300');
    if (isDate(text(input.due_date)) && text(input.due_date) !== MEMO.due_date) w.push('交期：你填的是 ' + text(input.due_date) + '，便條寫的是 ' + MEMO.due_date);
    return w;
  }

  function finish(st) {
    if (st.done) return;
    st.done = true;
    whenIdle(() => {
      const o = joinOrder(st.db, keyOrder(st), todayOf(st));
      const top = '<p class="ok">通關：' + esc(o.wo_no) + ' 從待派工、已派工、生產中走到已完工。交期狀態「' + esc(o.due_status) + '」、良率 ' + esc(o.yield_rate) +
        '；開立人 ' + esc(o.created_by_name) + '、派工人 ' + esc(o.dispatched_by_name) + '、開工人 ' + esc(o.started_by_name) + '、回報人 ' + esc(o.closed_by_name) + '。</p>' +
        predictionRows(st, finishQuestions());
      openSettlement('第一關結算：觀察—推論—實際系統待查證', midtermSettlementHtml(st, top), [
        { label: '下一關：夜班開工，早班完工', run: () => startMode('level2') },
        { label: '重新開始本關', run: () => startMode('level1') },
        { label: '回到標題', run: showTitle }
      ]);
    });
  }

  return {
    id: 'level1', title: '第一關　一張工單的一天', role: '生管員／組長',
    setup(st) {
      st.db = level1Data();
      st.clock = clockAt(2027, 10, 4, 8, 0);
      st.player = { x: 2, y: 3, dir: 'up' };
      st.identity = 2;
      st.onDuty = 3;
      st.flags = { memo: false, created: null, dispatched: false, triedStart: false, started: false, assigned: false, afternoon: false,
        countGood: false, countNg: false, noteRejected: false, finished: false, reviewed: false };
      st.npcs = { L1: npcDef('L1', '組長 陳俊男', '#0f766e', DAY_LEADER_POS[0], DAY_LEADER_POS[1]) };
    },
    onStart() {
      showTalk([
        { who: '旁白', text: '10 月 4 日（週一）上午 8:00。你是生管員林家豪，在生管辦公室。業務剛把一張需求便條放在你桌上。' },
        { who: '旁白', text: '方向鍵或 WASD 移動；面向電腦、電話、便條、箱子或人按 E 互動。右邊是 CNC 車削組的現場，要從辦公室的門走過去。' },
        { who: '旁白', text: '你在生管電腦上是生管員身分；到工作中心電腦時，由在場的組長登入，你改以組長身分操作。畫面頂端會一直顯示目前身分。' }
      ], [], { closeLabel: '開始' });
    },
    objective(st) {
      const f = st.flags;
      const o = keyOrder(st);
      return {
        title: '把便條變成一張工單，做完並結案', items: [
          { text: '到桌上查看業務送來的需求便條', done: f.memo },
          { text: '在生管電腦「開立工單」，依便條填資料', done: !!o },
          { text: '在工單明細派工給 CNC 車削組，預定生產日是今天', done: f.dispatched },
          { text: '在生管電腦的明細試著送出開工，看系統怎麼回應', done: f.triedStart },
          { text: '走到 CNC 車削組，由組長登入工作中心電腦回報開工', done: f.started },
          { text: '請組長安排作業員上機', done: f.assigned },
          { text: '（下午）到良品箱與不良品箱清點數量', done: f.countGood && f.countNg },
          { text: '以組長身分填完工回報：第一次先不填完工備註送出', done: f.noteRejected },
          { text: '補上不良原因後再送出完工回報', done: f.finished },
          { text: '回生管電腦查看這張工單的明細', done: f.reviewed }
        ]
      };
    },
    hudStats(st) {
      const o = keyOrder(st);
      if (!o) return '<h3>這一關的工單</h3><p>（尚未開立）</p>';
      const j = joinOrder(st.db, o, todayOf(st));
      return '<h3>這一關的工單</h3><p>' + esc(j.wo_no) + '　' + badgeHtml(j.status) + '</p><p>交期狀態：' + esc(j.due_status || '—') + '　良率：' + esc(j.yield_rate || '—') + '</p>';
    },
    npcAttention(st, id) {
      if (id !== 'L1') return false;
      return st.flags.started && !st.flags.assigned;
    },
    computerUser(st, kind) {
      if (kind === 'planner') return { user: userById(st.db, 2) };
      return { user: userById(st.db, st.onDuty) };
    },
    computerOptions() { return { tryReport: true }; },
    onTalk(st, id) {
      if (id !== 'L1') return;
      const f = st.flags;
      if (f.started && !f.assigned) {
        return showTalk([{ who: '陳俊男', text: '開工了。我叫阿德和小芳上 3 號、5 號機，下午應該做得完。' },
          { kind: 'coach', text: '組長口頭分配作業員，這一步是人工；系統裡沒有記錄誰上機、做了幾小時。' }], [{
          label: '好，請組長安排作業員上機',
          run: () => {
            f.assigned = true;
            addTrail(st, '組長口頭分配作業員上機（人工，系統沒有紀錄）');
            whenIdle(() => {
              st.clock = clockAt(2027, 10, 4, 16, 30);
              f.afternoon = true;
              addTrail(st, '時間跳到 16:30，這批做完了');
              log('時間來到 16:30，這批做完了。到良品箱與不良品箱清點數量。', 'scene');
              render();
            });
          }
        }]);
      }
      if (f.finished) return showTalk([{ who: '陳俊男', text: '完工回報送出了，下一張單再麻煩你派。' }]);
      if (f.started) return showTalk([{ who: '陳俊男', text: '機台在跑，做完我再清點。' }]);
      return showTalk([{ who: '陳俊男', text: '生管還沒派工的單，我這邊的電腦看不到。派好了我就能回報開工。' }]);
    },
    onObject(st, kind) {
      const f = st.flags;
      if (kind === 'memo') {
        if (!f.memo) { f.memo = true; addTrail(st, '查看業務需求便條'); }
        showTalk([{ kind: 'memo', text: '業務需求便條：訂單號 SO-27-0412，產品 BP-1101 前花鼓殼，數量 300 件，交期 2027-10-09（5 天後）。備註：客戶要求 10-09 前出貨。' }]);
        return true;
      }
      if (kind === 'goodbin' || kind === 'ngbin') {
        if (!f.afternoon) { showTalk([{ who: '旁白', text: '箱子還是空的，這張單還沒做完。' }]); return true; }
        if (kind === 'goodbin') {
          showTalk([{ kind: 'memo', text: '良品箱（現場清點）：前花鼓殼 298 件。' }], f.countGood ? [] : [{
            label: '記下良品 298 件', run: () => { f.countGood = true; addTrail(st, '人工清點良品箱：298 件'); log('清點：良品 298 件。', 'note'); }
          }]);
        } else {
          showTalk([{ kind: 'memo', text: '不良品箱（現場清點）：前花鼓殼 2 件，外徑尺寸超差。' }], f.countNg ? [] : [{
            label: '記下不良 2 件（外徑尺寸超差）', run: () => { f.countNg = true; addTrail(st, '人工清點不良品箱：2 件，外徑尺寸超差'); log('清點：不良 2 件，原因外徑尺寸超差。', 'note'); }
          }]);
        }
        return true;
      }
      return false;
    },
    onPhone(st, ext) {
      if (ext === '3101') return [{ who: '陳俊男', text: '車削組陳俊男。單子派過來的話，我在現場電腦就看得到。' }];
      return null;
    },
    onSystem(st, evt) {
      const f = st.flags;
      const o = keyOrder(st);
      switch (evt.type) {
        case 'beforeCreate':
          if (!f.memo) return { block: '先到桌上看業務的需求便條，再開立工單。' };
          if (o) return { block: '便條上的工單已經開立了（' + o.wo_no + '），不用再開一張。' };
          { const w = memoMismatch(evt.input); return w.length ? { warn: w } : {}; }
        case 'create':
          if (evt.result.ok) {
            f.created = evt.result.order.id;
            addTrail(st, '開立工單 ' + evt.result.order.wo_no + '（系統依今天的日期與流水號編號），狀態待派工');
            return { coach: '工單號 ' + evt.result.order.wo_no + ' 是系統依開立當天（10-04）加上當天流水號產生的。接著在明細按「派工」。' };
          }
          addTrail(st, '開立工單失敗：' + evt.result.errors.join('；'));
          return {};
        case 'beforeDispatch':
          if (!o || evt.id !== o.id) return { block: '這一關只處理便條上的那張工單。' };
          {
            const w = [];
            if (toId(evt.input.work_center_id) && toId(evt.input.work_center_id) !== 1) w.push('便條上的產品是車削件，應該派給 CNC 車削組');
            if (isDate(text(evt.input.plan_date)) && text(evt.input.plan_date) !== todayOf(st)) w.push('這一關預定今天（' + todayOf(st) + '）生產');
            return w.length ? { warn: w } : {};
          }
        case 'dispatch':
          if (evt.result.ok) {
            const d = evt.result.order;
            if (d.work_center_id === 1 && d.plan_date === todayOf(st)) f.dispatched = true;
            addTrail(st, '派工：' + centerName(st.db, d.work_center_id) + '，預定 ' + d.plan_date + '（派工人 ' + userName(st.db, d.dispatched_by) + '）');
            if (f.dispatched) return { coach: '狀態變成「已派工」，留下派工人與派工時間。接著在這個明細試著送出開工，看看生管人員能不能代組長回報。' };
            return { coach: '派工內容和這一關的安排不同，可以再按「改派」修正。' };
          }
          addTrail(st, '派工失敗：' + evt.result.errors.join('；'));
          return {};
        case 'tryReport':
          if (!f.triedStart && f.dispatched) {
            f.triedStart = true;
            addTrail(st, '以生管員身分送出開工：被系統拒絕（' + evt.result.errors[0] + '）');
            return { coach: '系統拒絕了，狀態沒有改變。開工與完工只能由這張工單所屬工作中心的組長回報。走到 CNC 車削組的工作中心電腦。' };
          }
          return {};
        case 'beforeStart':
          if (!o || evt.id !== o.id) return { block: '這一關只處理便條上的那張工單。' };
          if (!f.triedStart) return { block: '先回生管電腦，在明細試著送出開工，看看生管人員能不能回報。' };
          return {};
        case 'start':
          if (evt.result.ok) {
            f.started = true;
            addTrail(st, '組長陳俊男回報開工，狀態生產中');
            return { coach: '狀態變成「生產中」，留下開工人與開工時間。接著和組長說話，請他安排作業員。' };
          }
          return {};
        case 'beforeFinish': {
          if (!o || evt.id !== o.id) return { block: '這一關只處理便條上的那張工單。' };
          if (!f.countGood || !f.countNg) return { block: '先到良品箱與不良品箱清點數量，再填完工回報。' };
          if (!f.noteRejected && text(evt.input.close_note)) return { block: '這一關請先不填完工備註送出一次，看看系統怎麼檢核。' };
          if (!st.predictions.status) {
            return {
              intercept: proceed => openQuiz('完工前先預測', '按下送出之前，先預測三件事。選完會看到說明，可以改選，不計分。',
                finishQuestions(), st.predictions, '繼續送出', proceed)
            };
          }
          const w = [];
          if (toCount(evt.input.good_qty, 0, 99999) !== null && toCount(evt.input.good_qty, 0, 99999) !== 298) w.push('良品數：清點的是 298 件');
          if (toCount(evt.input.ng_qty, 0, 99999) !== null && toCount(evt.input.ng_qty, 0, 99999) !== 2) w.push('不良數：清點的是 2 件');
          return w.length ? { warn: w } : {};
        }
        case 'finish':
          if (!evt.result.ok) {
            addTrail(st, '完工回報被拒：' + evt.result.errors[0]);
            if (evt.result.errors[0].indexOf('完工備註') >= 0 && !f.noteRejected) {
              f.noteRejected = true;
              return { coach: '有不良品時，系統要求完工備註必填。補上不良原因（例如「不良 2 件為外徑尺寸超差」）再送出。' };
            }
            return {};
          }
          f.finished = true;
          addTrail(st, '組長陳俊男完工回報：良品 ' + evt.result.order.good_qty + '、不良 ' + evt.result.order.ng_qty + '，狀態已完工');
          return { coach: '已完工。回到生管辦公室，在生管電腦查看這張單的明細。' };
        case 'viewDetail':
          if (f.finished && o && evt.id === o.id && st.identity === 2 && !f.reviewed) {
            f.reviewed = true;
            addTrail(st, '生管員查看明細：已完工、交期狀態與良率由畫面推導');
            finish(st);
            return { coach: '這張單已完工：交期狀態與良率是畫面依交期、完工日期與數量推導出來的。關閉電腦後會看到結算。' };
          }
          return {};
      }
      return {};
    },
    finishHelper(st) { return st.flags.noteRejected ? { label: '帶入清點結果', values: { good_qty: '298', ng_qty: '2', close_note: '不良 2 件為外徑尺寸超差' } } : null; }
  };
}

/* Level 2: redispatch, night shift starts, day shift finishes */
function makeLevel2() {
  const ID = 1;
  const NIGHT = { good: 282, ng: 5, reason: '夾痕' };
  const DAY = { good: 310, ng: 3, reason: '刀痕' };
  const key = st => findOrder(st.db, ID);

  function redispatchQuestions() {
    return [{
      id: 'redispatch', q: '改派之後，明細上還看得到原本的預定生產日（10-04）、派工人（吳淑惠）與派工時間（10-01 10:30）嗎？',
      options: ['看得到，系統會保留前一次派工', '看不到，這幾個欄位會被新的值蓋掉'], answer: '看不到，這幾個欄位會被新的值蓋掉',
      explain: '改派直接覆蓋工作中心、預定生產日、派工人與派工時間，系統不留前一次的派工紀錄。'
    }];
  }
  function finishQuestions() {
    return [
      { id: 'who', q: '① 送出後，明細上的開工人與回報人會是誰？', options: ['都是陳俊男', '開工人許志明、回報人陳俊男', '都是許志明'], answer: '開工人許志明、回報人陳俊男',
        explain: '開工與完工各記一位回報人。同一個工作中心的任一位組長都能回報，所以開工人與回報人可以不同。' },
      { id: 'where', q: '② 夜班、早班各自做了多少，會存在哪裡？', options: ['各有獨立的欄位', '只能寫進完工備註', '系統會把兩次回報自動加總'], answer: '只能寫進完工備註',
        explain: '完工回報只有一次，只記一組良品數與不良數。兩班各做多少，只能用文字寫在完工備註。' },
      { id: 'sum', q: '③ 如果良品加不良不等於工單數量 600 件，系統接不接受？', options: ['不接受，要求等於工單數量', '接受'], answer: '接受',
        explain: '原系統規定良品與不良不能都是 0，但兩者相加不必等於工單數量。' }
    ];
  }

  function jumpNight(st) {
    whenIdle(() => {
      st.clock = clockAt(2027, 10, 5, 20, 0);
      st.flags.night = true;
      hideNpc('L1');
      showNpc('L2', DAY_LEADER_POS[0], DAY_LEADER_POS[1]);
      st.onDuty = 4;
      addTrail(st, '時間跳到 10-05 20:00，夜班上工');
      showTalk([{ who: '旁白', text: '時間來到 10 月 5 日 20:00。夜班組長許志明到了 CNC 車削組，準備開工 WO-271001-02。' }]);
    });
  }
  function jumpMorning(st) {
    whenIdle(() => {
      st.clock = clockAt(2027, 10, 6, 7, 50);
      st.flags.dawn = true;
      showNpc('L1', 16, 3);
      addTrail(st, '時間跳到 10-06 07:50，夜班結束');
      showTalk([{ who: '旁白', text: '10 月 6 日 07:50，夜班結束。早班組長陳俊男來交接。和夜班組長許志明說話，完成交接班。' }]);
    });
  }
  function jumpCall(st) {
    whenIdle(() => {
      st.clock = clockAt(2027, 10, 6, 9, 0);
      st.flags.morning = true;
      st.player = { x: 1, y: 2, dir: 'up' };
      addTrail(st, '09:00 業務來電，問 WO-271001-02 做了幾件');
      Sound.sfx('ring');
      showTalk([{ who: '旁白', text: '09:00，你回到生管辦公室。電話響了。' },
        { who: '業務', text: '林家豪嗎？客戶問 WO-271001-02 那 600 件曲柄現在做了幾件，週四能不能交？' },
        { kind: 'coach', text: '先在生管電腦打開這張單的明細，看看系統能告訴你什麼。' }]);
      render();
    });
  }
  function jumpAfternoon(st) {
    whenIdle(() => {
      st.clock = clockAt(2027, 10, 6, 15, 30);
      st.flags.afternoon = true;
      addTrail(st, '時間跳到 15:30，早班做完剩下的數量');
      log('時間來到 15:30，早班做完了。到良品箱、不良品箱清點早班的數量，再看看交接班單。', 'scene');
      render();
    });
  }
  function finish(st) {
    if (st.done) return;
    st.done = true;
    whenIdle(() => openSettlement('第二關結算：現場實際發生與系統記錄', settlementHtml(st), [
      { label: '重新開始本關', run: () => startMode('level2') },
      { label: '回到第一關', run: () => startMode('level1') },
      { label: '回到標題', run: showTitle }
    ]));
  }
  function settlementHtml(st) {
    const o = joinOrder(st.db, key(st), todayOf(st));
    const rows = [
      ['夜班做多少', '良品 ' + NIGHT.good + '、不良 ' + NIGHT.ng + '（' + NIGHT.reason + '）；寫在紙本交接班單', '只在完工備註的文字裡', '沒有'],
      ['早班做多少', '良品 ' + DAY.good + '、不良 ' + DAY.ng + '（' + DAY.reason + '）；組長清點', '只在完工備註的文字裡', '沒有'],
      ['兩班合計', '良品 592、不良 8', '良品數 ' + (o.good_qty === null ? '（空）' : o.good_qty) + '、不良數 ' + (o.ng_qty === null ? '（空）' : o.ng_qty), '有（良品數、不良數各一個）'],
      ['誰開工、誰完工', '夜班許志明開工，早班陳俊男完工', '開工人 ' + (o.started_by_name || '（空）') + '、回報人 ' + (o.closed_by_name || '（空）'), '有（開工人、回報人）'],
      ['改派前的派工內容', '10-01 10:30 吳淑惠派工，預定 10-04 生產', '派工人 ' + o.dispatched_by_name + '、派工時間 ' + o.dispatched_at + '、預定 ' + o.plan_date, '沒有（被改派覆蓋）'],
      ['兩種不良原因各幾件', '夾痕 5、刀痕 3', '完工備註：' + (o.close_note || '（空）'), '沒有']
    ];
    const top = '<table class="data compare"><caption>現場實際發生與系統記錄（模擬資料）</caption><thead><tr><th>項目</th><th>現場實際發生</th><th>系統記錄</th><th>有沒有獨立欄位</th></tr></thead><tbody>' +
      rows.map(r => '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>').join('') + '</tbody></table>' +
      predictionRows(st, redispatchQuestions().concat(finishQuestions()));
    return midtermSettlementHtml(st, top, [ID]);
  }

  return {
    id: 'level2', title: '第二關　夜班開工，早班完工', role: '生管員／組長',
    setup(st) {
      st.db = level2Data();
      st.clock = clockAt(2027, 10, 4, 13, 30);
      st.player = { x: 2, y: 3, dir: 'right' };
      st.identity = 2;
      st.onDuty = 3;
      st.sheet = null;
      st.flags = { briefed: false, redispatched: false, night: false, nightStarted: false, dawn: false, handover: false, morning: false,
        sawBlank: false, called: false, afternoon: false, countGood: false, countNg: false, sawSheet: false, finished: false, triedFix: false };
      st.npcs = {
        boss: npcDef('boss', '生管課長 吳淑惠', '#9333ea', 4, 3),
        L1: npcDef('L1', '組長 陳俊男', '#0f766e', DAY_LEADER_POS[0], DAY_LEADER_POS[1]),
        L2: npcDef('L2', '夜班組長 許志明', '#1e40af', 16, 2, false)
      };
    },
    onStart() {
      showTalk([{ who: '旁白', text: '10 月 4 日（週一）13:30。你是生管員林家豪。生管課長吳淑惠好像有事找你。' }], [], { closeLabel: '開始' });
    },
    objective(st) {
      const f = st.flags;
      return {
        title: '一張 600 件的單跨了兩個班', items: [
          { text: '和生管課長吳淑惠談談', done: f.briefed },
          { text: '在明細把 WO-271001-02 改派到明天（改派前先預測）', done: f.redispatched },
          { text: '（10-05 20:00）由夜班組長登入工作中心電腦回報開工', done: f.nightStarted },
          { text: '夜班結束：和夜班組長說話，完成交接班', done: f.handover },
          { text: '（09:00）業務問進度：在生管電腦打開這張單的明細', done: f.sawBlank },
          { text: '打電話到 CNC 車削組（分機 3101）問組長', done: f.called },
          { text: '（15:30）清點早班的良品與不良，並查看交接班單', done: f.countGood && f.countNg && f.sawSheet },
          { text: '由早班組長完工回報（送出前先預測），備註寫上兩班數量與不良原因', done: f.finished },
          { text: '想更正完工備註的一個數字：打開明細看看有什麼按鈕', done: f.triedFix }
        ]
      };
    },
    hudStats(st) {
      const j = joinOrder(st.db, key(st), todayOf(st));
      return '<h3>這一關的工單</h3><p>' + esc(j.wo_no) + '　' + badgeHtml(j.status) + '　預定 ' + esc(j.plan_date || '—') + '</p>' +
        '<p>系統上的良品／不良：' + (j.good_qty === null ? '（空）' : j.good_qty) + '／' + (j.ng_qty === null ? '（空）' : j.ng_qty) + '</p>' +
        '<h3>紙本交接班單</h3><p>' + (st.sheet ? esc(st.sheet) : '（還沒有）') + '</p>';
    },
    npcAttention(st, id) {
      const f = st.flags;
      if (id === 'boss') return !f.briefed;
      if (id === 'L2') return f.nightStarted && f.dawn && !f.handover;
      return false;
    },
    computerUser(st, kind) {
      if (kind === 'planner') return { user: userById(st.db, 2) };
      return { user: userById(st.db, st.onDuty) };
    },
    computerOptions() { return { tryReport: true }; },
    onTalk(st, id) {
      const f = st.flags;
      if (id === 'boss') {
        if (!f.briefed) {
          return showTalk([
            { who: '吳淑惠', text: '客戶的急單 WO-271004-01 我剛派給 CNC 車削組了，今天下午就要佔用機台。' },
            { who: '吳淑惠', text: '原本今天要做的 WO-271001-02（600 件曲柄）麻煩你改派到明天（10-05），一樣是 CNC 車削組。' }
          ], [{ label: '好，我去改派', run: () => { f.briefed = true; addTrail(st, '生管課長交代：WO-271001-02 改派到 10-05'); } }]);
        }
        return showTalk([{ who: '吳淑惠', text: f.redispatched ? '改好了就好，交期還是 10-07。' : '改派在工單明細上操作。' }]);
      }
      if (id === 'L2') {
        if (f.nightStarted && f.dawn && !f.handover) {
          return showTalk([
            { who: '許志明', text: '夜班做完了。數量我照慣例寫在交接班單上，交給早班。' },
            { kind: 'memo', text: '交接班單（紙本）：WO-271001-02，10/05 夜班，良品 282 件、不良 5 件（夾痕）。組長 許志明' },
            { kind: 'coach', text: '交接班單是人工紀錄。系統只有一次完工回報，沒有對應「夜班做了多少」的欄位。' }
          ], [{
            label: '請許志明把交接班單交給早班組長陳俊男',
            run: () => {
              f.handover = true;
              st.sheet = '10/05 夜班 良品 282、不良 5（夾痕）';
              Sound.sfx('card');
              addTrail(st, '夜班組長把紙本交接班單交給早班組長（人工）');
              walkNpc('L2', [[16, 4], [17, 4]], () => hideNpc('L2'));
              st.onDuty = 3;
              walkNpc('L1', [[15, 3], [15, 2]]);
              jumpCall(st);
            }
          }]);
        }
        return showTalk([{ who: '許志明', text: f.nightStarted ? '機台在跑，夜班會做到早上。' : '單子在現場電腦上，我登入就能回報開工。' }]);
      }
      if (id === 'L1') {
        if (f.handover && !f.afternoon) return showTalk([{ who: '陳俊男', text: '早班接著做，交接班單在我這裡。' }]);
        if (f.finished) return showTalk([{ who: '陳俊男', text: '回報送出了，這張結案了。' }]);
        return showTalk([{ who: '陳俊男', text: f.redispatched ? '這張改到明天了，今天先做急單。' : '今天下午要先做急單。' }]);
      }
    },
    onObject(st, kind) {
      const f = st.flags;
      if (kind === 'sheet') {
        if (!st.sheet) { showTalk([{ who: '旁白', text: '交接班單夾上還沒有今天的單子。' }]); return true; }
        showTalk([{ kind: 'memo', text: '交接班單（紙本）：WO-271001-02，' + st.sheet + '。' }]);
        if (f.afternoon && !f.sawSheet) { f.sawSheet = true; addTrail(st, '查看紙本交接班單：夜班良品 282、不良 5（夾痕）'); log('交接班單：夜班良品 282、不良 5（夾痕）。', 'note'); }
        return true;
      }
      if (kind === 'board') {
        showTalk([{ kind: 'memo', text: f.afternoon ? '清點板：10/06 早班 WO-271001-02 已清點，數量看良品箱與不良品箱。' : '清點板：（今天還沒寫）' }]);
        Sound.sfx('card');
        return true;
      }
      if (kind === 'goodbin' || kind === 'ngbin') {
        if (!f.afternoon) { showTalk([{ who: '旁白', text: f.nightStarted ? '箱子裡的數量還在變，現在清點沒有意義。' : '箱子是空的。' }]); return true; }
        if (kind === 'goodbin') {
          showTalk([{ kind: 'memo', text: '良品箱（早班清點）：曲柄（左）310 件。夜班的良品已經送到下一站，數量寫在交接班單上。' }], f.countGood ? [] : [{
            label: '記下早班良品 310 件', run: () => { f.countGood = true; addTrail(st, '人工清點早班良品：310 件'); log('清點：早班良品 310 件。', 'note'); }
          }]);
        } else {
          showTalk([{ kind: 'memo', text: '不良品箱（早班清點）：曲柄（左）3 件，刀痕。' }], f.countNg ? [] : [{
            label: '記下早班不良 3 件（刀痕）', run: () => { f.countNg = true; addTrail(st, '人工清點早班不良：3 件，刀痕'); log('清點：早班不良 3 件，原因刀痕。', 'note'); }
          }]);
        }
        return true;
      }
      if (kind === 'memo') { showTalk([{ who: '旁白', text: '桌上沒有新的便條。' }]); return true; }
      return false;
    },
    onPhone(st, ext) {
      const f = st.flags;
      if (ext !== '3101') return null;
      if (f.sawBlank && !f.called) {
        f.called = true;
        addTrail(st, '打電話問組長進度（系統外的人工作業）');
        log('組長口頭回答：夜班交接班單寫良品 282 件；早班到現在大概 90 件。', 'note');
        jumpAfternoon(st);
        return [{ who: '陳俊男', text: '車削組陳俊男。WO-271001-02 嗎？夜班交接班單寫 282 件，早班到現在大概 90 件吧，我沒細數。' },
          { kind: 'coach', text: '系統上看不到這些數字，只能靠電話問。下午早班做完後，再去現場清點。' }];
      }
      if (f.morning) return [{ who: '陳俊男', text: '車削組陳俊男，有什麼事嗎？' }];
      return [{ who: f.night && !f.dawn ? '許志明' : '陳俊男', text: '車削組，有什麼事嗎？' }];
    },
    onSystem(st, evt) {
      const f = st.flags;
      switch (evt.type) {
        case 'beforeDispatch':
          if (evt.id !== ID) return { block: '這一關要處理的是 WO-271001-02。' };
          if (!f.briefed) return { block: '先和生管課長吳淑惠談談，了解要怎麼安排。' };
          if (!st.predictions.redispatch) {
            return { intercept: proceed => openQuiz('改派前先預測', '按下送出之前，先預測一件事。選完會看到說明，可以改選，不計分。', redispatchQuestions(), st.predictions, '繼續改派', proceed) };
          }
          {
            const w = [];
            if (toId(evt.input.work_center_id) && toId(evt.input.work_center_id) !== 1) w.push('課長說一樣派給 CNC 車削組');
            if (isDate(text(evt.input.plan_date)) && text(evt.input.plan_date) !== '2027-10-05') w.push('課長說改到明天（2027-10-05）');
            return w.length ? { warn: w } : {};
          }
        case 'dispatch':
          if (evt.result.ok) {
            const d = evt.result.order;
            addTrail(st, '改派：' + centerName(st.db, d.work_center_id) + '，預定 ' + d.plan_date + '；派工人變成 ' + userName(st.db, d.dispatched_by) + '、派工時間 ' + d.dispatched_at);
            if (d.work_center_id === 1 && d.plan_date === '2027-10-05' && !f.redispatched) {
              f.redispatched = true;
              jumpNight(st);
              return { coach: '派工人、派工時間被改成你和現在的時刻，預定生產日也蓋掉了。原本 10-01 吳淑惠的派工紀錄沒有留下來。關掉電腦後時間會跳到隔天晚上。' };
            }
            if (!f.redispatched) return { coach: '派工內容和課長交代的不同，可以再改派一次。' };
          } else addTrail(st, '改派失敗：' + evt.result.errors[0]);
          return {};
        case 'tryReport':
          addTrail(st, '以生管員身分送出回報：被拒（' + evt.result.errors[0] + '）');
          return { coach: '生管人員不能代組長回報。' };
        case 'beforeStart':
          if (evt.id !== ID) return { block: '這一關要回報的是 WO-271001-02；急單由早班處理。' };
          if (!f.night) return { block: f.redispatched ? '這張單已經改到明天，現在先不開工。' : '課長要把這張單改到明天，現在先不開工。' };
          return {};
        case 'start':
          if (evt.result.ok) {
            f.nightStarted = true;
            addTrail(st, '夜班組長許志明回報開工，狀態生產中');
            jumpMorning(st);
            return { coach: '開工人是夜班組長許志明。關掉電腦後，時間會跳到夜班結束。' };
          }
          return {};
        case 'viewDetail':
          if (evt.id !== ID) return {};
          if (f.morning && !f.sawBlank && st.identity === 2) {
            f.sawBlank = true;
            addTrail(st, '生管員查看明細：只看到生產中，良品數與不良數空白');
            return { coach: '明細只有「生產中」，良品數與不良數都是空白，看不出已經做了幾件。打電話到 CNC 車削組（分機 3101）問組長。' };
          }
          if (f.finished && !f.triedFix) {
            f.triedFix = true;
            addTrail(st, '想更正完工備註：已完工的工單沒有任何處理按鈕');
            finish(st);
            return { coach: '已完工的工單沒有任何處理按鈕，完工備註寫錯也改不了。關閉電腦後會看到結算。' };
          }
          return {};
        case 'beforeFinish': {
          if (evt.id !== ID) return { block: '這一關要回報的是 WO-271001-02。' };
          if (!f.countGood || !f.countNg || !f.sawSheet) return { block: '先清點早班的良品與不良，並查看交接班單上夜班的數量。' };
          if (!st.predictions.who) {
            return { intercept: proceed => openQuiz('完工前先預測', '按下送出之前，先預測三件事。選完會看到說明，可以改選，不計分。', finishQuestions(), st.predictions, '繼續送出', proceed) };
          }
          const w = [];
          if (toCount(evt.input.good_qty, 0, 99999) !== null && toCount(evt.input.good_qty, 0, 99999) !== 592) w.push('良品數：交接班單 282 + 早班 310 = 592');
          if (toCount(evt.input.ng_qty, 0, 99999) !== null && toCount(evt.input.ng_qty, 0, 99999) !== 8) w.push('不良數：夜班 5 + 早班 3 = 8');
          return w.length ? { warn: w } : {};
        }
        case 'finish':
          if (!evt.result.ok) { addTrail(st, '完工回報被拒：' + evt.result.errors[0]); return {}; }
          f.finished = true;
          addTrail(st, '早班組長陳俊男完工回報：良品 ' + evt.result.order.good_qty + '、不良 ' + evt.result.order.ng_qty + '，備註「' + (evt.result.order.close_note || '') + '」');
          return { coach: '已完工。假設你發現備註裡有一個數字打錯，想更正：再按一次這張單的「明細」，看看有什麼按鈕。' };
      }
      return {};
    },
    finishHelper(st) {
      return st.flags.countGood && st.flags.countNg && st.flags.sawSheet
        ? { label: '帶入兩班合計與備註', values: { good_qty: '592', ng_qty: '8', close_note: '夜班 282、早班 310；不良 8 件：夾痕 5、刀痕 3' } } : null;
    }
  };
}

/* ---------- 6. CR scenario controller (final only) ---------- */

let FinalDemo = null;

/* @@FINAL_BEGIN */
const CR_SCENARIOS = {};

CR_SCENARIOS['CR-01'] = {
  title: '分批報工與工時',
  requester: '廠長 鄭國榮',
  summary: '客戶問 1000 件曲柄能不能準時、能不能先出一部分；生管坐在辦公室裡看不出做到哪。',
  keyId: 1,
  setup(st) {
    st.db = {
      work_centers: baseCenters(), users: baseUsers(), products: baseProducts(),
      work_orders: [
        mkOrder({ id: 1, wo_no: 'WO-271105-01', so_no: 'SO-27-0521', product_id: 4, qty: 1000, due_date: '2027-11-12', status: '生產中',
          work_center_id: 1, plan_date: '2027-11-08', dispatched_by: 1, dispatched_at: '2027-11-05 16:00', started_by: 4, started_at: '2027-11-08 20:05',
          created_by: 2, created_at: '2027-11-05 15:40' }),
        mkOrder({ id: 2, wo_no: 'WO-271108-01', so_no: 'SO-27-0530', product_id: 6, qty: 250, due_date: '2027-11-15', status: '已派工',
          work_center_id: 2, plan_date: '2027-11-11', dispatched_by: 2, dispatched_at: '2027-11-08 10:00', created_by: 2, created_at: '2027-11-08 09:40' }),
        mkOrder({ id: 3, wo_no: 'WO-271109-01', so_no: 'SO-27-0533', product_id: 2, qty: 300, due_date: '2027-11-19', status: '待派工', created_by: 2, created_at: '2027-11-09 11:00' }),
        mkOrder({ id: 11, wo_no: 'WO-271001-02', so_no: 'SO-27-0397', product_id: 3, qty: 600, due_date: '2027-10-07', status: '已完工', work_center_id: 1, plan_date: '2027-10-05',
          dispatched_by: 2, dispatched_at: '2027-10-04 13:40', started_by: 4, started_at: '2027-10-05 20:02', good_qty: 592, ng_qty: 8,
          close_note: '夜班 282、早班 310；不良 8 件：夾痕 5、刀痕 3', closed_by: 3, closed_at: '2027-10-06 15:40', created_by: 2, created_at: '2027-10-01 10:05' }),
        mkOrder({ id: 12, wo_no: 'WO-271004-01', so_no: 'SO-27-0405', product_id: 4, qty: 200, due_date: '2027-10-05', status: '已完工', work_center_id: 1, plan_date: '2027-10-04',
          dispatched_by: 1, dispatched_at: '2027-10-04 13:10', started_by: 3, started_at: '2027-10-04 13:30', good_qty: 196, ng_qty: 4,
          close_note: '不良 4 件為夾傷', closed_by: 3, closed_at: '2027-10-05 11:20', created_by: 1, created_at: '2027-10-04 13:00' }),
        mkOrder({ id: 13, wo_no: 'WO-271008-01', so_no: 'SO-27-0418', product_id: 1, qty: 300, due_date: '2027-10-14', status: '已完工', work_center_id: 1, plan_date: '2027-10-11',
          dispatched_by: 2, dispatched_at: '2027-10-08 14:00', started_by: 3, started_at: '2027-10-11 08:00', good_qty: 297, ng_qty: 3,
          close_note: '外徑尺寸超差 3 件', closed_by: 3, closed_at: '2027-10-12 16:10', created_by: 2, created_at: '2027-10-08 13:30' }),
        mkOrder({ id: 14, wo_no: 'WO-271015-01', so_no: 'SO-27-0446', product_id: 2, qty: 450, due_date: '2027-10-22', status: '已完工', work_center_id: 1, plan_date: '2027-10-18',
          dispatched_by: 2, dispatched_at: '2027-10-15 15:00', started_by: 4, started_at: '2027-10-18 20:10', good_qty: 441, ng_qty: 9,
          close_note: '夜班 211、早班 230；夾痕 6、刀痕 3', closed_by: 3, closed_at: '2027-10-20 17:00', created_by: 2, created_at: '2027-10-15 14:20' }),
        mkOrder({ id: 15, wo_no: 'WO-271020-01', so_no: 'SO-27-0459', product_id: 5, qty: 400, due_date: '2027-10-27', status: '已完工', work_center_id: 2, plan_date: '2027-10-22',
          dispatched_by: 2, dispatched_at: '2027-10-20 10:00', started_by: 5, started_at: '2027-10-22 08:10', good_qty: 400, ng_qty: 0,
          close_note: null, closed_by: 5, closed_at: '2027-10-25 16:30', created_by: 2, created_at: '2027-10-20 09:30' }),
        mkOrder({ id: 16, wo_no: 'WO-271022-01', so_no: 'SO-27-0463', product_id: 3, qty: 500, due_date: '2027-10-29', status: '已完工', work_center_id: 1, plan_date: '2027-10-25',
          dispatched_by: 2, dispatched_at: '2027-10-22 16:00', started_by: 3, started_at: '2027-10-25 08:05', good_qty: 489, ng_qty: 11,
          close_note: '早班 250、夜班 239；夾傷 7 件，刀痕 4 件', closed_by: 4, closed_at: '2027-10-27 06:50', created_by: 2, created_at: '2027-10-22 15:30' })
      ]
    };
    st.clock = clockAt(2027, 11, 10, 10, 0);
    st.player = { x: 2, y: 3, dir: 'right' };
    st.identity = null;
    st.onDuty = 3;
    st.npcs = {
      boss: npcDef('boss', '廠長 鄭國榮', '#b91c1c', 4, 3),
      L1: npcDef('L1', '組長 陳俊男', '#0f766e', DAY_LEADER_POS[0], DAY_LEADER_POS[1])
    };
  },
  intro: [
    { who: '旁白', text: '11 月 10 日（週三）10:00。你是系統分析師，今天在生管辦公室觀察。廠長剛接到客戶的電話，走了進來。' },
    { who: '鄭國榮', text: '客戶問 WO-271105-01 那 1000 件曲柄，後天能不能準時交？能不能先出一部分？現在到底做了多少？' },
    { who: '旁白', text: '到生管電腦、電話與 CNC 車削組現場收集「觀察筆記」，再回來向廠長說明。' }
  ],
  cluesA: [
    { id: 'list', hint: '在生管電腦的未完工清單找到這張單', text: '未完工清單上，WO-271105-01 只顯示「生產中」與「剩 2 天」。' },
    { id: 'detail', hint: '打開這張單的明細', text: '明細上良品數與不良數都是空白，看不出已經做了幾件。' },
    { id: 'leader', hint: '問 CNC 車削組的組長（走過去或打分機 3101）', text: '組長只能從清點板報出早班的大約數量；系統上只有一個「完工回報」，按下去整張單就結案。' },
    { id: 'shift', hint: '查看現場的清點板與交接班單', text: '早班的數量只寫在清點板上（約 110 件），前幾班的數量寫在紙本交接班單上，系統裡都沒有。' },
    { id: 'predict', hint: '問組長：如果現在就按完工回報會怎樣（只預測）', text: '如果現在就完工回報，狀態會變成已完工、之後不能再回報；數量不到 1000 件系統也會接受。' }
  ],
  cluesB: [
    { id: 'labor', hint: '在電腦的工單明細找找看工時記在哪', text: '系統上沒有記錄作業員與工時的地方；明細只有開工人與回報人。' },
    { id: 'ngquery', hint: '在「已完工工單查詢（情境示意）」打開兩張有不良的單', text: '已完工工單只有不良數的總數；不良原因要一張張打開明細讀完工備註，而且寫法不一（「夾痕」「夾傷」）。' }
  ],
  followup: [
    { who: '你', text: '系統上只看得到「生產中」，數量要問組長、看清點板和交接班單。現在按完工回報，整張單就結案了。' },
    { who: '鄭國榮', text: '那再問兩件事。這張單到現在花了多少工時？下次排預定生產日要參考。' },
    { who: '鄭國榮', text: '還有，這個月哪一種不良最多？' },
    { kind: 'coach', text: '回到電腦看看系統能不能回答這兩個問題，再回來找廠長。' }
  ],
  requestLines: [
    { who: '鄭國榮', text: '所以生管坐在辦公室裡，看不出一張單做到哪，只能打電話或跑現場。' },
    { who: '鄭國榮', text: '我希望生產中的工單隨時看得到累計做了多少，夜班、早班各做多少也要分得開。' },
    { who: '鄭國榮', text: '工時也要查得到，下次排預定生產日才有依據。不良要查得出哪一種最多。' }
  ],
  requests: [
    '生管人員隨時看得到生產中工單的累計數量，不必到現場問',
    '每一班做了多少，在系統上分得開',
    '查得到一張工單用了多少工時，拿來排下一次的預定生產日',
    '查得出哪一種不良最常發生'
  ],
  statements: [
    { text: '未完工清單與明細上，這張單只看得到「生產中」，看不到已經做了幾件。', cat: 'obs', explain: '這是你在模擬畫面上看到的情形。' },
    { text: '跨班生產時，系統只能由一位組長回報一次完工。', cat: 'obs', explain: '這是現況規則：完工回報只有一次，只記一組數量。' },
    { text: '已完工工單的不良原因只寫在完工備註裡，寫法不一致。', cat: 'obs', explain: '這是你讀完工備註後看到的事實。' },
    { text: '廠長希望生管隨時看得到生產中工單的累計數量。', cat: 'want', explain: '這是需求提出者希望達成的業務結果，還不是系統規格。' },
    { text: '廠長希望查得到一張工單用了多少工時。', cat: 'want', explain: '這是期望；工時要記到多細、誰來記，都還要釐清。' },
    { text: '只要讓每位作業員都有帳號，自己回報數量就好了。', cat: 'infer', explain: '這是解法的猜想；作業員旁邊有沒有電腦、權限怎麼給，都還要查證與決定。' },
    { text: '累計數量到 1000 件時，系統應該自動完工。', cat: 'infer', explain: '這是設計想法，不是現況事實；提案書把它列為待小組決議的問題。' }
  ],
  impacts: {
    '角色': '生管員、組長、作業員的工作各會受到什麼影響？',
    '流程': '現有的開工與完工回報步驟哪裡不夠用？跨班生產時，什麼時候要回報？',
    '功能': '「做到哪了」「用了多少工時」「哪一種不良最多」各需要哪些現在沒有記錄的資訊？',
    '資料': '上線以來已完工的舊工單只有一筆總數，要怎麼看待？',
    '權限': '現有規則（只有所屬工作中心的組長能回報、生管人員不能代報）會不會受影響？',
    '操作環境': '誰會在什麼時候、在哪一台電腦上回報？'
  },
  verify: [
    '在原系統打開 WO-261027-01，查看生產中工單的明細有哪些欄位、良品數與不良數是不是空白。',
    '打開 WO-261020-01、WO-261005-01，讀完工備註裡兩班數量與不良原因的寫法。',
    '在 SQLite 查看 work_orders 的欄位，確認有沒有記錄報工人員、工時或不良原因的地方（只看現況，不先設計新表）。',
    '用生管人員與組長帳號各登入一次，確認誰能回報開工與完工。'
  ],
  guide: [
    '生管員、組長、作業員的工作各會受到什麼影響？',
    '現有的開工與完工回報步驟哪裡不夠用？',
    '「做到哪了」「用了多少工時」「哪一種不良最多」各需要哪些現在沒有記錄的資訊？',
    '誰會在什麼時候、在哪一台電腦上回報？',
    '現有的權限規則（只有所屬工作中心的組長能回報、生管人員不能代報）會不會受影響？',
    '上線以來已完工的舊工單要怎麼看待？'
  ],
  predictQuestions: [
    { id: 'cr-status', q: '① 如果組長現在就按完工回報、填目前的數量，狀態會變成？', options: ['仍是生產中', '已完工', '部分完工'], answer: '已完工',
      explain: '原系統只有一次完工回報，送出後狀態直接變成「已完工」。系統沒有「部分完工」這個狀態。' },
    { id: 'cr-again', q: '② 之後明天、後天的數量還能再回報嗎？', options: ['可以再回報', '不能，已完工的單沒有任何處理動作'], answer: '不能，已完工的單沒有任何處理動作',
      explain: '已完工是終點，沒有任何處理按鈕，也不能刪除工單。' },
    { id: 'cr-short', q: '③ 目前合計大約 830 件，不到工單數量 1000 件，系統會接受嗎？', options: ['會拒絕', '會接受'], answer: '會接受',
      explain: '良品加不良不必等於工單數量，系統照樣接受。' }
  ]
};

FinalDemo = (function () {
  const ORDER = ['CR-01'];
  const CATEGORIES = [
    { id: 'obs', label: '觀察到的問題（現場事實）' },
    { id: 'want', label: '利害關係人的期望' },
    { id: 'infer', label: '尚待查證的推論或設計想法' }
  ];
  const IMPACT_AREAS = ['角色', '流程', '功能', '資料', '權限', '操作環境'];

  function menuHtml() {
    return '<h2>期末：變更需求情境</h2>' +
      '<p class="hint">本題只有一項變更需求，約 5–10 分鐘。你的角色是系統分析師：觀察現場問題、辨識需求與待查證事項，遊戲不提供改善後的系統。</p>' +
      '<div class="cards">' + ORDER.map(id => {
        const sc = CR_SCENARIOS[id];
        return '<button type="button" class="card" data-start="' + id + '"><b>' + id + '　' + esc(sc.title) + '</b><span>需求提出者：' + esc(sc.requester) + '</span><span>' + esc(sc.summary) + '</span></button>';
      }).join('') + '</div>';
  }

  function makeController(id) {
    const sc = CR_SCENARIOS[id];
    const has = (st, c) => st.cr.clues.indexOf(c) >= 0;
    const allA = st => sc.cluesA.every(c => has(st, c.id));
    const allB = st => sc.cluesB.every(c => has(st, c.id));

    function collect(st, clueId) {
      if (has(st, clueId)) return;
      const c = sc.cluesA.concat(sc.cluesB).find(x => x.id === clueId);
      if (!c) return;
      if (sc.cluesB.includes(c) && st.cr.stage !== 'explore2') return;
      st.cr.clues.push(clueId);
      addTrail(st, '觀察：' + c.text);
      log('已記下觀察：' + c.text, 'note');
      if (st.cr.stage === 'explore' && allA(st)) {
        st.cr.stage = 'report';
        log('觀察已足夠，回生管辦公室向廠長說明。', 'scene');
      } else if (st.cr.stage === 'explore2' && allB(st)) {
        st.cr.stage = 'request';
        log('兩個問題都查過了，回去找廠長。', 'scene');
      }
      render();
    }

    function talkLeader(st) {
      const lines = [
        { who: '陳俊男', text: '早班到現在大概 110 件，我是看清點板估的。前幾班做多少要翻交接班單。' },
        { who: '陳俊男', text: '系統上只有一個「完工回報」，現在按下去，整張單就結案了。' }
      ];
      if (st.cr.stage === 'explore2') { lines.push({ who: '陳俊男', text: '作業員是我口頭分配的，誰上了幾小時，系統沒有地方記，我自己有一本小冊子。' }); collect(st, 'labor'); }
      collect(st, 'leader');
      const choices = [];
      if (!has(st, 'predict')) {
        choices.push({
          label: '問組長：如果現在就按完工回報，會發生什麼？（只預測，不送出）',
          run: () => openQuiz('只預測，不送出', '這一步只預測與說明，遊戲不會真的送出完工回報。選完會看到說明，可以改選，不計分。',
            sc.predictQuestions, st.predictions, '記下預測結果', () => { collect(st, 'predict'); })
        });
      }
      showTalk(lines, choices);
    }

    function talkBoss(st) {
      const stage = st.cr.stage;
      if (stage === 'explore') return showTalk([{ who: '鄭國榮', text: '怎麼樣，做了多少？' }, { kind: 'coach', text: '先收集觀察筆記（右側清單），再回來說明。' }]);
      if (stage === 'report') {
        return showTalk(sc.followup, [{ label: '好，我去查', run: () => { st.cr.stage = 'explore2'; addTrail(st, '廠長追問：工時多少？哪一種不良最多？'); render(); } }]);
      }
      if (stage === 'explore2') return showTalk([{ who: '鄭國榮', text: '工時和不良的事，查到了嗎？' }]);
      if (stage === 'request') return showTalk(sc.requestLines, [{ label: '開始需求釐清練習', run: () => openExercise(st) }]);
      return showTalk([{ who: '鄭國榮', text: '謝謝你整理。' }], [
        { label: '重做需求釐清練習', run: () => openExercise(st) },
        { label: '再看一次結算', run: () => openCRSettlement(st) }
      ]);
    }

    function feedback(s, chosen) {
      const ref = CATEGORIES.find(c => c.id === s.cat).label;
      return (chosen === s.cat ? '和參考分類相同。' : '參考分類是「' + ref + '」。') + s.explain;
    }

    function openExercise(st) {
      if (st.cr.stage !== 'done') st.cr.stage = 'exercise';
      openModal(id + ' 需求釐清練習（不計分）', body => {
        const a = st.cr.answers;
        body.innerHTML =
          '<p class="hint">下列說法來自剛才的現場。判斷每一句比較接近哪一類；選完會看到說明，可以改選，不計分、不記錄。</p>' +
          '<ol class="classify">' + sc.statements.map((s, i) =>
            '<li><p>' + esc(s.text) + '</p><div class="radios" role="radiogroup" aria-label="第 ' + (i + 1) + ' 句的分類">' +
            CATEGORIES.map(c => '<label><input type="radio" name="st' + i + '" value="' + c.id + '"' + (a[i] === c.id ? ' checked' : '') + '> ' + c.label + '</label>').join('') +
            '</div><p class="fb" id="fb' + i + '" aria-live="polite">' + (a[i] ? esc(feedback(s, a[i])) : '') + '</p></li>').join('') + '</ol>' +
          '<fieldset class="impacts"><legend>你認為這項需求可能影響哪些面向？（可複選）</legend>' +
          IMPACT_AREAS.map(x => '<label><input type="checkbox" value="' + x + '"' + (st.cr.impacts.indexOf(x) >= 0 ? ' checked' : '') + '> ' + x + '</label>').join('') + '</fieldset>' +
          '<label class="block">寫下你會追問利害關係人的問題（只存在這次遊玩的記憶體中，重新整理就會清除）<textarea id="cr-notes" rows="4">' + esc(st.cr.notes) + '</textarea></label>' +
          '<div class="choices"><button type="button" id="btn-to-settle">看結算</button><span id="ex-remain" class="hint"></span></div>';
        const btn = body.querySelector('#btn-to-settle');
        const remain = body.querySelector('#ex-remain');
        const refresh = () => {
          const left = sc.statements.filter((s, i) => !a[i]).length;
          btn.disabled = left > 0;
          remain.textContent = left > 0 ? '還有 ' + left + ' 句未分類' : '';
        };
        sc.statements.forEach((s, i) => {
          body.querySelectorAll('input[name="st' + i + '"]').forEach(r => r.addEventListener('change', () => {
            a[i] = r.value;
            body.querySelector('#fb' + i).textContent = feedback(s, r.value);
            refresh();
          }));
        });
        body.querySelectorAll('.impacts input').forEach(cb => cb.addEventListener('change', () => {
          st.cr.impacts = Array.from(body.querySelectorAll('.impacts input:checked')).map(x => x.value);
        }));
        body.querySelector('#cr-notes').addEventListener('input', e => { st.cr.notes = e.target.value; });
        btn.addEventListener('click', () => { st.cr.stage = 'done'; st.done = true; openCRSettlement(st); });
        refresh();
      }, { size: 'wide' });
    }

    function openCRSettlement(st) {
      const observed = sc.cluesA.concat(sc.cluesB).filter(c => has(st, c.id)).map(c => '<li>' + esc(c.text) + '</li>').join('');
      const html = '<div class="settle cr">' +
        '<p class="boundary">本情境只呈現現況困難與需求背景，不提供資料表、欄位、畫面或回報方式的答案。合理的做法可能不只一種，請回到原系統查證後，再提出有理由的設計。</p>' +
        '<div class="grid4">' +
        '<section><h3>觀察到的業務事件</h3><ul>' + observed + '</ul></section>' +
        '<section><h3>利害關係人的新要求（' + id + '｜' + esc(sc.requester) + '）</h3><ul>' + sc.requests.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></section>' +
        '<section><h3>可能受影響項目（分類問題）</h3><dl>' + IMPACT_AREAS.map(x =>
          '<dt>' + x + (st.cr.impacts.indexOf(x) >= 0 ? '　<span class="tag-sel">你有勾選</span>' : '') + '</dt><dd>' + esc(sc.impacts[x]) + '</dd>').join('') + '</dl></section>' +
        '<section><h3>回到實際系統確認</h3><ul>' + sc.verify.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></section>' +
        '</div>' +
        '<section><h3>結算引導問題</h3><ol>' + sc.guide.map(g => '<li>' + esc(g) + '</li>').join('') + '</ol></section>' +
        '<section><h3>你寫下的追問</h3><p class="notes">' + (st.cr.notes.trim() ? esc(st.cr.notes) : '（未填寫）') + '</p></section>' +
        '<p class="next">下一步：回到期末報告第二部分，把提案書〈3.4 待小組決議的問題〉逐條做出決議並寫下理由。遊戲不提供這些問題的答案。</p>' +
        '</div>';
      openSettlement(id + ' 結算：' + sc.title, html, [
        { label: '重做需求釐清練習', run: () => openExercise(st) },
        { label: '重新開始此情境', run: () => startMode(id) },
        { label: '回到標題', run: showTitle }
      ]);
    }

    function renderHistory(st, panel) {
      const months = ['2027-10', '2027-11'];
      const m = st.cr.histMonth || '';
      const rows = m ? st.db.work_orders.filter(o => o.status === '已完工' && o.closed_at.slice(0, 7) === m).sort((a, b) => a.closed_at.localeCompare(b.closed_at)).map(o => joinOrder(st.db, o, todayOf(st))) : [];
      panel.innerHTML =
        '<p class="banner warn">情境模擬示意：只讀、固定資料，依完工月份列出已完工工單，用來看現有資料記到多細。這不是完整的查詢模組，也不是原系統的 SQLite 查詢。</p>' +
        '<label>完工月份 <select id="hist-month"><option value="">請選擇</option>' +
        months.map(x => '<option value="' + x + '"' + (x === m ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
        (m ? '<table class="data"><thead><tr><th>工單號</th><th>產品</th><th>數量</th><th>良品數</th><th>不良數</th><th>完工時間</th><th></th></tr></thead><tbody>' +
          (rows.length ? rows.map(r => '<tr><td>' + esc(r.wo_no) + '</td><td>' + esc(r.part_no + ' ' + r.product_name) + '</td><td>' + r.qty + '</td><td>' + r.good_qty + '</td><td>' + r.ng_qty +
            '</td><td>' + esc(r.closed_at) + '</td><td><button type="button" class="small" id="hd-' + r.id + '" data-hdetail="' + r.id + '">明細</button></td></tr>' +
            (st.cr.histDetail === r.id ? '<tr class="detail"><td colspan="7">完工備註：' + esc(r.close_note || '（空）') + '　開工人：' + esc(r.started_by_name) + '　回報人：' + esc(r.closed_by_name) + '</td></tr>' : '')).join('')
            : '<tr><td colspan="7">這個月份沒有已完工的工單。</td></tr>') +
          '</tbody></table><p class="hint">共 ' + rows.length + ' 筆。不良數只有一個總數；原因寫在完工備註裡。</p>' : '');
      panel.querySelector('#hist-month').addEventListener('change', e => { st.cr.histMonth = e.target.value; st.cr.histDetail = null; rerenderComputer('hist-month'); });
      panel.querySelectorAll('[data-hdetail]').forEach(b => b.addEventListener('click', () => {
        const oid = Number(b.dataset.hdetail);
        st.cr.histDetail = st.cr.histDetail === oid ? null : oid;
        const o = findOrder(st.db, oid);
        if (o && o.ng_qty > 0 && st.cr.ngViewed.indexOf(oid) < 0) st.cr.ngViewed.push(oid);
        if (st.cr.ngViewed.length >= 2) collect(st, 'ngquery');
        rerenderComputer('hd-' + oid);
      }));
    }

    return {
      id, title: id + '　' + sc.title, role: '系統分析師（觀察現場）', isCR: true,
      setup(st) {
        sc.setup(st);
        st.cr = { clues: [], answers: {}, impacts: [], notes: '', stage: 'explore', histMonth: '', histDetail: null, ngViewed: [], sawBoard: false, sawSheet: false };
      },
      onStart() { showTalk(sc.intro, [], { closeLabel: '開始觀察' }); },
      objective(st) {
        const stage = st.cr.stage;
        if (stage === 'explore') {
          return { title: '收集現況觀察（' + sc.cluesA.filter(c => has(st, c.id)).length + '/' + sc.cluesA.length + '）', items: sc.cluesA.map(c => ({ text: c.hint, done: has(st, c.id) })), showAll: true };
        }
        if (stage === 'report') return { title: '向廠長說明', items: [{ text: '回生管辦公室，向廠長說明你看到的現況', done: false }] };
        if (stage === 'explore2') {
          return { title: '廠長的兩個追問（' + sc.cluesB.filter(c => has(st, c.id)).length + '/' + sc.cluesB.length + '）', items: sc.cluesB.map(c => ({ text: c.hint, done: has(st, c.id) })), showAll: true };
        }
        if (stage === 'request') return { title: '聽取需求', items: [{ text: '向' + sc.requester + '了解需求', done: false }] };
        if (stage === 'exercise') return { title: '整理需求', items: [{ text: '完成需求釐清練習', done: false }] };
        return { title: '情境完成', items: [{ text: '可以找廠長重看結算，或從暫停選單回到標題', done: true }], showAll: true };
      },
      hudExtra(st) {
        const got = sc.cluesA.concat(sc.cluesB).filter(c => has(st, c.id));
        return '<h3>觀察筆記</h3>' + (got.length ? '<ul class="notes-list">' + got.map(c => '<li>' + esc(c.text) + '</li>').join('') + '</ul>' : '<p class="hint">尚未記下觀察。</p>');
      },
      npcAttention(st, npcId) {
        const stage = st.cr.stage;
        if (npcId === 'boss') return stage === 'report' || stage === 'request';
        if (npcId === 'L1') return stage === 'explore' && (!has(st, 'leader') || !has(st, 'predict'));
        return false;
      },
      onTalk(st, npcId) {
        if (npcId === 'boss') return talkBoss(st);
        if (npcId === 'L1') return talkLeader(st);
      },
      onPhone(st, ext) {
        if (ext !== '3101') return null;
        collect(st, 'leader');
        return [{ who: '陳俊男', text: '車削組陳俊男。WO-271105-01 嗎？早班到現在大概 110 件，看清點板估的；前幾班要翻交接班單。' },
          { who: '陳俊男', text: '系統上只有一個完工回報，現在按下去整張單就結案了。要問細一點的話，可以過來現場。' }];
      },
      onObject(st, kind) {
        if (kind === 'board') {
          st.cr.sawBoard = true;
          showTalk([{ kind: 'memo', text: '清點板（現場白板）：11/10 早班　WO-271105-01　約 110 件（組長目測估計）' }]);
        } else if (kind === 'sheet') {
          st.cr.sawSheet = true;
          Sound.sfx('card');
          showTalk([{ kind: 'memo', text: '交接班單（紙本）：WO-271105-01｜11/08 夜班 良品 240、不良 3（夾痕）｜11/09 早班 良品 250、不良 2（夾傷）｜11/09 夜班 良品 230、不良 4（刀痕）' }]);
        } else if (kind === 'goodbin' || kind === 'ngbin') {
          showTalk([{ who: '旁白', text: '箱子裡的數量一直在變，做好的良品也陸續送到下一站。' }]);
        } else if (kind === 'memo') {
          showTalk([{ who: '旁白', text: '桌上是客戶的出貨需求：WO-271105-01，1000 件，交期 11/12。' }]);
        } else return false;
        if (st.cr.sawBoard && st.cr.sawSheet) collect(st, 'shift');
        return true;
      },
      computerUser(st, kind) { return { user: userById(st.db, kind === 'planner' ? 2 : st.onDuty) }; },
      computerTabs(st, kind) {
        return kind === 'planner'
          ? [{ id: 'open', label: '未完工清單' }, { id: 'search', label: '工單查詢' }, { id: 'detail', label: '工單明細' }, { id: 'history', label: '已完工工單查詢（情境示意）' }]
          : [{ id: 'open', label: '未完工清單' }, { id: 'detail', label: '工單明細' }];
      },
      computerOptions() {
        return {
          readOnly: true,
          banner: '期末情境 CR-01：以下是現況模擬畫面，只供觀察，不送出任何操作。現況系統只有一次完工回報，沒有分批報工、工時或不良原因的欄位。（依修改需求提案書所述現況，實際畫面請回原系統確認）'
        };
      },
      onSystem(st, evt) {
        if (evt.type === 'openTab' && evt.tab === 'open' && evt.kind === 'planner') collect(st, 'list');
        if (evt.type === 'viewDetail') {
          if (evt.id === sc.keyId) collect(st, 'detail');
          if (st.cr.stage === 'explore2') {
            collect(st, 'labor');
            return { coach: '明細上只有開工人、回報人與時間，沒有作業員或工時的欄位。' };
          }
        }
        return {};
      },
      renderExtraTab(st, tab, panel) { if (tab === 'history') renderHistory(st, panel); }
    };
  }

  return { ORDER, menuHtml, makeController, editionLabel: '期末版（含現況回顧）', has: id => !!CR_SCENARIOS[id] };
})();
/* @@FINAL_END */

/* ---------- 6b. sound (Web Audio, synthesized in code, no audio files) ---------- */

const Sound = (function () {
  let ctx = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true, timer = null, nextTime = 0, stepIdx = 0;
  const STEP = 60 / 100 / 2; // eighth note at 100 BPM
  // G major pentatonic loop, 8 bars of eighth notes (0 = rest), one bass note per bar
  const MELODY = [
    67, 0, 71, 0, 74, 0, 71, 69, 67, 0, 64, 0, 67, 0, 0, 0,
    69, 0, 71, 0, 74, 0, 76, 74, 71, 0, 69, 0, 67, 0, 0, 0,
    64, 0, 67, 0, 69, 0, 71, 69, 67, 0, 69, 0, 71, 0, 74, 0,
    76, 0, 74, 0, 71, 0, 69, 67, 69, 0, 0, 0, 67, 0, 0, 0
  ];
  const BASS = [43, 40, 45, 38, 40, 43, 36, 38];
  const SFX = {
    step: [[1100, 0, 0.03, 'square', 0.04]],
    bump: [[140, 0, 0.09, 'square', 0.2]],
    open: [[660, 0, 0.06, 'sine', 0.25], [880, 0.05, 0.08, 'sine', 0.2]],
    ok: [[660, 0, 0.1, 'triangle', 0.4], [990, 0.09, 0.16, 'triangle', 0.4]],
    error: [[220, 0, 0.14, 'sawtooth', 0.2], [165, 0.13, 0.2, 'sawtooth', 0.2]],
    notice: [[740, 0, 0.1, 'sine', 0.3], [587, 0.1, 0.14, 'sine', 0.25]],
    card: [[1800, 0, 0.025, 'square', 0.1], [1300, 0.04, 0.03, 'square', 0.08]],
    chime: [[1047, 0, 0.25, 'sine', 0.25], [1319, 0.08, 0.25, 'sine', 0.22], [1568, 0.16, 0.35, 'sine', 0.2]],
    ring: [[440, 0, 0.35, 'sine', 0.2], [480, 0, 0.35, 'sine', 0.2], [440, 0.5, 0.35, 'sine', 0.2], [480, 0.5, 0.35, 'sine', 0.2]],
    fanfare: [[523, 0, 0.14, 'triangle', 0.35], [659, 0.12, 0.14, 'triangle', 0.35], [784, 0.24, 0.14, 'triangle', 0.35], [1047, 0.36, 0.45, 'triangle', 0.35]]
  };

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // AudioContext must be created after a user gesture (browser autoplay policy).
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try {
      ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.1; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.35; sfxGain.connect(master);
      return true;
    } catch (e) { ctx = null; return false; }
  }

  function tone(dest, freq, start, dur, type, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function sfx(name) {
    if (!sfxOn || !SFX[name] || !ensure()) return;
    const t = ctx.currentTime + 0.01;
    SFX[name].forEach(([f, d, dur, type, vol]) => tone(sfxGain, f, t + d, dur, type, vol));
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.4) {
      const i = stepIdx % MELODY.length;
      if (MELODY[i]) tone(musicGain, midi(MELODY[i]), nextTime, STEP * 1.6, 'triangle', 0.5);
      if (i % 8 === 0) tone(musicGain, midi(BASS[i / 8]), nextTime, STEP * 7, 'sine', 0.6);
      nextTime += STEP;
      stepIdx++;
    }
  }
  function startMusic() {
    if (!musicOn || timer || !ensure()) return;
    nextTime = ctx.currentTime + 0.1;
    stepIdx = 0;
    timer = setInterval(schedule, 150);
    schedule();
  }
  function stopMusic() { if (timer) { clearInterval(timer); timer = null; } }

  return {
    sfx, startMusic, stopMusic,
    setMusic(on) { musicOn = on; if (!on) stopMusic(); },
    setSfx(on) { sfxOn = on; },
    isMusicOn: () => musicOn,
    isSfxOn: () => sfxOn,
    isPlaying: () => !!timer
  };
})();

/* ---------- 7. UI ---------- */

const ui = {
  modalOpen: false, lastFocus: null, onClose: null, idleQueue: [], msgs: [], toastTimer: null, lastMoveAt: 0,
  compKind: null, compUserId: null, compTab: null, compMsg: null, warn: null, detailId: null, mode: null,
  forms: null, openFilter: '', searchResult: null, phoneLog: [], quickKey: ''
};
let ctrl = null;

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function emptyForms() {
  return {
    new: { so_no: '', product_id: '', qty: '', due_date: '', note: '' },
    edit: { so_no: '', product_id: '', qty: '', due_date: '', note: '' },
    dispatch: { work_center_id: '', plan_date: '' },
    cancel: { close_note: '' },
    finish: { good_qty: '', ng_qty: '', close_note: '' },
    search: { keyword: '', status: '', work_center_id: '', from: '', to: '' }
  };
}

function resetUiState() {
  Object.assign(ui, {
    idleQueue: [], msgs: [], compKind: null, compUserId: null, compTab: null, compMsg: null, warn: null, detailId: null, mode: null,
    forms: emptyForms(), openFilter: '', searchResult: null, phoneLog: [], quickKey: ''
  });
}

function emit(type, payload) {
  if (!ctrl || !ctrl.onSystem) return {};
  return ctrl.onSystem(gameState, Object.assign({ type, kind: ui.compKind }, payload || {})) || {};
}

const BADGE_CLASS = { 待派工: 'warn', 已派工: 'info', 生產中: 'run', 已完工: 'ok', 已取消: 'off' };
function badgeHtml(s) { return '<span class="badge ' + (BADGE_CLASS[s] || 'off') + '">' + esc(s) + '</span>'; }
function dueHtml(o) {
  const late = o.overdue || String(o.due_status).indexOf('延遲') === 0;
  return late ? '<span class="late">' + esc(o.due_status) + '</span>' : esc(o.due_status);
}

/* modal */
function openModal(title, build, opts) {
  opts = opts || {};
  const dlg = $('#modal');
  if (!dlg.open) ui.lastFocus = document.activeElement;
  $('#modal-title').textContent = title;
  dlg.className = opts.size || '';
  const body = $('#modal-body');
  body.innerHTML = '';
  build(body);
  ui.onClose = opts.onClose || null;
  if (!dlg.open) { dlg.showModal(); Sound.sfx(opts.sound || 'open'); }
  ui.modalOpen = true;
  const target = body.querySelector('[data-autofocus]') ||
    body.querySelector('input:not([disabled]), select:not([disabled]), textarea, button:not([disabled])');
  if (target) target.focus();
}

function closeModal(skipFlush) {
  const dlg = $('#modal');
  if (!ui.modalOpen && !dlg.open) return;
  ui.modalOpen = false;
  if (dlg.open) dlg.close();
  const cb = ui.onClose;
  ui.onClose = null;
  const lf = ui.lastFocus;
  if (lf && document.contains(lf) && !dlg.contains(lf) && lf.offsetParent !== null) lf.focus();
  else if (!$('#game-screen').hidden) $('#map-wrap').focus();
  if (cb) cb();
  afterAction();
  if (!skipFlush) flushIdle();
}

function whenIdle(fn) { if (ui.modalOpen) ui.idleQueue.push(fn); else fn(); }
function flushIdle() { while (!ui.modalOpen && ui.idleQueue.length) ui.idleQueue.shift()(); }

function afterAction() {
  if (!gameState || !ctrl) return;
  if (ctrl.afterAction) ctrl.afterAction(gameState);
  render();
}

/* talk */
function lineHtml(l) {
  if (l.kind === 'memo') return '<p class="memo">' + esc(l.text) + '</p>';
  if (l.kind === 'coach') return '<p class="coach">教學提示：' + esc(l.text) + '</p>';
  return '<p class="line' + (l.who === '旁白' ? ' narr' : '') + '">' + (l.who && l.who !== '旁白' ? '<b>' + esc(l.who) + '</b>' : '') + esc(l.text) + '</p>';
}

function showTalk(lines, choices, opts) {
  opts = opts || {};
  const list = (choices || []).slice();
  list.push({ label: opts.closeLabel || (list.length ? '先不要' : '結束對話'), run: null, secondary: list.length > 0 });
  openModal(opts.title || '對話', body => {
    body.innerHTML = '<div class="talk">' + lines.map(lineHtml).join('') + '</div><div class="choices">' +
      list.map((c, i) => '<button type="button" class="' + (c.secondary ? 'secondary' : '') + '" data-i="' + i + '">' + esc(c.label) + '</button>').join('') + '</div>';
    $all('.choices button', body).forEach(b => b.addEventListener('click', () => {
      const c = list[Number(b.dataset.i)];
      closeModal(true);
      if (c.run) c.run();
      afterAction();
      flushIdle();
    }));
  });
}
function coachTalk(t) { showTalk([{ kind: 'coach', text: t }]); }

/* messages */
const LOG_KIND = { system: '系統', coach: '提示', scene: '場景', note: '筆記' };
function log(t, kind) {
  kind = kind || 'scene';
  ui.msgs.push({ t: gameState ? fmtHM(gameState.clock) : '', text: t, kind });
  if (ui.msgs.length > 8) ui.msgs.shift();
  if (kind === 'note') Sound.sfx('chime');
  else if (kind === 'coach') Sound.sfx('notice');
  renderLog();
  const toast = $('#toast');
  if (toast) {
    toast.textContent = '［' + LOG_KIND[kind] + '］' + t;
    toast.className = 'show k-' + kind;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { toast.className = ''; }, 4200);
  }
}
function renderLog() {
  const el = $('#hud-log');
  if (!el) return;
  el.innerHTML = ui.msgs.slice().reverse().map(m => '<li class="k-' + m.kind + '"><span>' + m.t + '［' + LOG_KIND[m.kind] + '］</span>' + esc(m.text) + '</li>').join('');
}

/* title and mode start */
function showTitle() {
  RUN_SEQ++;
  Sound.stopMusic();
  if (ui.modalOpen) closeModal(true);
  gameState = null;
  ctrl = null;
  ui.idleQueue = [];
  $('#game-screen').hidden = true;
  $('#title-screen').hidden = false;
  renderTitle();
  const first = $('#title-screen button');
  if (first) first.focus();
}

function renderTitle() {
  const isFinal = EDITION === 'final' && !!FinalDemo;
  $('#edition-tag').textContent = isFinal ? FinalDemo.editionLabel : '期中版';
  $('#menu-midterm').innerHTML =
    '<h2>期中：現況理解（As-Is）</h2><p class="hint">輪流扮演生管員與工作中心組長，體驗原有系統的功能與例外。兩關合計約 10–15 分鐘。</p><div class="cards">' +
    '<button type="button" class="card" data-start="level1"><b>第一關　一張工單的一天</b><span>正常流程：開立、派工、開工、完工回報，以及生管與組長的權限差別。</span></button>' +
    '<button type="button" class="card" data-start="level2"><b>第二關　夜班開工，早班完工</b><span>現有系統的例外：改派、跨班生產，以及只有一次的完工回報。</span></button></div>';
  const fin = $('#menu-final');
  if (isFinal) { fin.hidden = false; fin.innerHTML = FinalDemo.menuHtml(); } else { fin.hidden = true; fin.innerHTML = ''; }
  $all('[data-start]').forEach(b => b.addEventListener('click', () => startMode(b.dataset.start)));
}

function startMode(mode) {
  if (mode === 'level1') ctrl = makeLevel1();
  else if (mode === 'level2') ctrl = makeLevel2();
  else if (FinalDemo && FinalDemo.has(mode)) ctrl = FinalDemo.makeController(mode);
  else return;
  if (ui.modalOpen) closeModal(true);
  gameState = newState(mode);
  resetUiState();
  ctrl.setup(gameState);
  $('#title-screen').hidden = true;
  $('#game-screen').hidden = false;
  $('#mode-title').textContent = ctrl.title;
  buildMap();
  $('#ents').innerHTML = '';
  render();
  renderLog();
  $('#map-wrap').focus();
  Sound.startMusic();
  if (ctrl.onStart) ctrl.onStart(gameState);
}

/* map and entities */
function tileClass(ch, x) {
  switch (ch) {
    case '#': return 'wall';
    case '.': return x <= 5 ? 'floor-office' : 'floor-shop';
    case 'D': return 'door';
    case 'P': return 'obj desk t-computer';
    case 'T': return 'obj desk t-phone';
    case 'N': return 'obj desk t-memo';
    case 'W': return 'obj shop t-computer';
    case 'B': return 'obj shop t-board';
    case 'H': return 'obj shop t-sheet';
    case 'G': return 'obj shop t-good';
    case 'X': return 'obj shop t-ng';
    case 'M': return 'machine';
    case 'O': return 'other';
  }
  return 'floor-shop';
}
function tileLabel(ch, x, y) {
  if (ch === 'P') return '生管電腦';
  if (ch === 'T') return '電話';
  if (ch === 'N') return '便條';
  if (ch === 'W') return '現場電腦';
  if (ch === 'B') return '清點板';
  if (ch === 'H') return '交接班單';
  if (ch === 'G') return '良品箱';
  if (ch === 'X') return '不良品';
  if (ch === 'M' && x === 10 && y === 3) return 'CNC 車床';
  if (ch === 'O' && x === 9) return 'CNC 銑削組';
  if (ch === 'O' && x === 16) return '組裝線';
  if (ch === '.' && x === 3 && y === 7) return '生管辦公室';
  if (ch === '.' && x === 11 && y === 7) return 'CNC 車削組';
  if (ch === 'D') return '門';
  return '';
}
function buildMap() {
  const map = $('#map');
  map.innerHTML = '';
  map.style.gridTemplateColumns = 'repeat(' + MAP_W + ', ' + TILE + 'px)';
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const ch = tileAt(x, y);
      const d = document.createElement('div');
      d.className = 'tile ' + tileClass(ch, x);
      const label = tileLabel(ch, x, y);
      if (label) d.dataset.label = label;
      map.appendChild(d);
    }
  }
}

function npcAt(x, y) {
  if (!gameState) return null;
  return Object.values(gameState.npcs).find(n => n.visible && n.x === x && n.y === y) || null;
}
function showNpc(id, x, y) {
  const n = gameState && gameState.npcs[id];
  if (!n) return;
  n.x = x; n.y = y; n.visible = true;
  renderEntities();
}
function hideNpc(id) {
  const n = gameState && gameState.npcs[id];
  if (n) { n.visible = false; renderEntities(); }
}

function walkNpc(id, waypoints, done) {
  const st = gameState;
  const npc = st.npcs[id];
  const steps = [];
  let cx = npc.x, cy = npc.y;
  waypoints.forEach(([tx, ty]) => {
    while (cx !== tx) { cx += Math.sign(tx - cx); steps.push([cx, cy]); }
    while (cy !== ty) { cy += Math.sign(ty - cy); steps.push([cx, cy]); }
  });
  let i = 0, waits = 0;
  const run = st.runId;
  function tick() {
    if (!gameState || gameState.runId !== run) return;
    if (i >= steps.length) { npc.walking = false; renderEntities(); if (done) done(); return; }
    const [nx, ny] = steps[i];
    const p = gameState.player;
    if (p.x === nx && p.y === ny && waits < 8) { waits++; setTimeout(tick, 250); return; }
    npc.x = nx; npc.y = ny; i++; waits = 0;
    renderEntities();
    setTimeout(tick, 130);
  }
  npc.walking = true;
  setTimeout(tick, 130);
}

function identityText() {
  const st = gameState;
  if (ctrl.isCR) return '目前身分：系統分析師（觀察現場）';
  const u = st.identity ? userById(st.db, st.identity) : null;
  if (!u) return '目前身分：—';
  return '目前身分：' + userLabel(u) + (u.role === ROLE_LEADER ? '（' + centerName(st.db, u.work_center_id) + '，工作中心電腦）' : '（生管電腦）');
}

function renderEntities() {
  const st = gameState;
  const layer = $('#ents');
  if (!st || !layer) return;
  const list = Object.values(st.npcs).filter(n => n.visible).map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, color: n.color, kind: 'npc' }));
  const me = ctrl.isCR ? '你（分析師）' : (() => { const u = userById(st.db, st.identity); return u && u.role === ROLE_LEADER ? '你（以組長身分）' : '你（生管員）'; })();
  list.push({ id: '__player', name: me, x: st.player.x, y: st.player.y, color: '#2563a8', kind: 'player' });
  const seen = new Set();
  list.forEach(e => {
    let el = layer.querySelector('[data-id="' + e.id + '"]');
    const tf = 'translate(' + (e.x * TILE) + 'px, ' + (e.y * TILE) + 'px)';
    if (!el) {
      el = document.createElement('div');
      el.dataset.id = e.id;
      el.innerHTML = '<span class="head"></span><span class="body"></span><span class="tag"></span><span class="mark" aria-hidden="true"></span>';
      el.style.transform = tf;
      layer.appendChild(el);
    }
    el.className = 'ent ' + (e.kind === 'player' ? 'player dir-' + st.player.dir : 'npc');
    el.style.setProperty('--c', e.color);
    el.style.transform = tf;
    el.querySelector('.tag').textContent = e.name;
    const att = e.kind === 'npc' && ctrl.npcAttention && ctrl.npcAttention(st, e.id);
    el.querySelector('.mark').textContent = att ? '！' : '';
    seen.add(e.id);
  });
  $all('.ent', layer).forEach(el => { if (!seen.has(el.dataset.id)) el.remove(); });
}

/* HUD */
function render() {
  if (!gameState || !ctrl) return;
  renderEntities();
  renderHud();
  $('#clock').textContent = '模擬時間 ' + fmtDT(gameState.clock);
  $('#identity').textContent = identityText();
}

function renderHud() {
  const st = gameState;
  $('#hud-role').textContent = '角色：' + ctrl.role;
  const obj = ctrl.objective(st);
  let items = obj.items;
  if (!obj.showAll) {
    const firstOpen = items.findIndex(it => !it.done);
    items = firstOpen < 0 ? items : items.slice(0, firstOpen + 1);
  }
  $('#hud-task').innerHTML = '<h3>' + esc(obj.title) + '</h3><ul class="checklist">' +
    items.map(it => '<li class="' + (it.done ? 'done' : '') + '"><span aria-hidden="true">' + (it.done ? '☑' : '☐') + '</span> ' +
      esc(it.text) + '<span class="sr">' + (it.done ? '（已完成）' : '（未完成）') + '</span></li>').join('') + '</ul>';
  const t = interactTarget();
  $('#hud-near').textContent = t ? '面前：' + t.label + '（按 E 互動）' : '附近沒有可以互動的對象';
  const stats = $('#hud-stats');
  if (ctrl.hudStats) { stats.hidden = false; stats.innerHTML = ctrl.hudStats(st); } else { stats.hidden = true; stats.innerHTML = ''; }
  const extra = $('#hud-extra');
  if (ctrl.hudExtra) { extra.hidden = false; extra.innerHTML = ctrl.hudExtra(st); } else { extra.hidden = true; extra.innerHTML = ''; }
  renderQuick();
}

const QUICK_SPOTS = {
  planner: { x: 1, y: 2, dir: 'up', label: '生管電腦' },
  phone: { x: 3, y: 2, dir: 'up', label: '電話' },
  center: { x: 14, y: 2, dir: 'up', label: '工作中心電腦' },
  board: { x: 17, y: 2, dir: 'up', label: '清點板' },
  sheet: { x: 17, y: 4, dir: 'right', label: '交接班單' },
  goodbin: { x: 14, y: 5, dir: 'down', label: '良品箱' },
  ngbin: { x: 15, y: 5, dir: 'down', label: '不良品箱' }
};
function renderQuick() {
  const st = gameState;
  const keys = Object.keys(QUICK_SPOTS).filter(k => st.visited[k]);
  const k2 = keys.join(',');
  if (k2 === ui.quickKey) return;
  ui.quickKey = k2;
  $('#hud-quick').innerHTML = '<h3>快捷移動</h3>' + (keys.length
    ? keys.map(k => '<button type="button" class="small" data-quick="' + k + '">' + QUICK_SPOTS[k].label + '</button>').join(' ')
    : '<p class="hint">用過電腦、電話、清點板等物件後，可以在這裡直接移過去。</p>');
  $all('[data-quick]').forEach(b => b.addEventListener('click', () => quickMove(b.dataset.quick)));
}
function quickMove(k) {
  const s = QUICK_SPOTS[k];
  if (npcAt(s.x, s.y)) { log('那個位置現在有人。', 'scene'); return; }
  gameState.player = { x: s.x, y: s.y, dir: s.dir };
  render();
  $('#map-wrap').focus();
}

/* movement and interaction */
function isWalkable(x, y) {
  if (BLOCKING.indexOf(tileAt(x, y)) >= 0) return false;
  return !npcAt(x, y);
}
function tryMove(dir) {
  const p = gameState.player;
  p.dir = dir;
  const [dx, dy] = DIRS[dir];
  if (isWalkable(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; Sound.sfx('step'); } else Sound.sfx('bump');
  render();
}
function targetAt(x, y) {
  const npc = npcAt(x, y);
  if (npc) return { kind: 'npc', id: npc.id, label: npc.name };
  const ch = tileAt(x, y);
  if (OBJECTS[ch]) return { kind: 'obj', id: OBJECTS[ch], label: OBJECT_LABELS[OBJECTS[ch]] };
  return null;
}
function interactTarget() {
  if (!gameState) return null;
  const p = gameState.player;
  const order = [p.dir].concat(Object.keys(DIRS).filter(d => d !== p.dir));
  for (const d of order) {
    const t = targetAt(p.x + DIRS[d][0], p.y + DIRS[d][1]);
    if (t) return t;
  }
  return null;
}
function doInteract() {
  const t = interactTarget();
  if (!t) { log('附近沒有可以互動的對象。', 'scene'); return; }
  const st = gameState;
  if (t.kind === 'npc') { ctrl.onTalk(st, t.id); return; }
  st.visited[t.id] = true;
  if (t.id === 'planner' || t.id === 'center') { openComputer(t.id); return; }
  if (t.id === 'phone') { openPhone(); return; }
  if (ctrl.onObject && ctrl.onObject(st, t.id)) return;
  defaultObject(t.id);
}
function defaultObject(kind) {
  const lines = {
    memo: '桌上沒有新的便條。', board: '清點板：（目前沒有寫東西）', sheet: '交接班單夾上沒有單子。',
    goodbin: '良品箱目前是空的。', ngbin: '不良品箱目前是空的。'
  };
  showTalk([{ who: '旁白', text: lines[kind] || '沒有特別的東西。' }]);
}

function onKey(e) {
  if (!gameState || $('#game-screen').hidden || ui.modalOpen) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const move = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' }[e.key];
  if (move) {
    e.preventDefault();
    const now = performance.now();
    if (e.repeat && now - ui.lastMoveAt < 110) return;
    ui.lastMoveAt = now;
    tryMove(move);
    return;
  }
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); if (!e.repeat) doInteract(); return; }
  if (e.key === 'Escape') { e.preventDefault(); openPause(); }
}

/* computers */
function compOptions() { return (ctrl.computerOptions && ctrl.computerOptions(gameState, ui.compKind)) || {}; }
function compUser() { return userById(gameState.db, ui.compUserId); }
function computerTabs(kind) {
  if (ctrl.computerTabs) return ctrl.computerTabs(gameState, kind);
  return kind === 'planner'
    ? [{ id: 'open', label: '未完工清單' }, { id: 'new', label: '開立工單' }, { id: 'search', label: '工單查詢' }, { id: 'detail', label: '工單明細' }]
    : [{ id: 'open', label: '未完工清單' }, { id: 'search', label: '工單查詢' }, { id: 'detail', label: '工單明細' }];
}
function computerTitle() { return ui.compKind === 'planner' ? '生管電腦（生管辦公室）' : '工作中心電腦（CNC 車削組）'; }

function openComputer(kind) {
  const st = gameState;
  const who = ctrl.computerUser(st, kind);
  if (who.block || !who.user) { coachTalk(who.block || '現在沒有組長在場，沒有人能登入工作中心電腦。'); return; }
  if (ui.compKind !== kind) { ui.detailId = null; ui.searchResult = null; ui.compTab = null; }
  ui.compKind = kind;
  ui.compUserId = who.user.id;
  if (!ctrl.isCR && st.identity !== who.user.id) {
    st.identity = who.user.id;
    log(kind === 'center' ? who.user.name + '登入工作中心電腦，你改以「' + userLabel(who.user) + '」的身分操作。' : '你回到生管電腦，以「' + userLabel(who.user) + '」的身分操作。', 'scene');
  }
  const tabs = computerTabs(kind);
  if (!tabs.some(t => t.id === ui.compTab)) ui.compTab = tabs[0].id;
  ui.compMsg = null; ui.warn = null; ui.mode = null;
  openModal(computerTitle(), renderComputerBody, { size: 'wide' });
  emit('openTab', { tab: ui.compTab });
  render();
}
function reopenComputer() { openModal(computerTitle(), renderComputerBody, { size: 'wide' }); }

function rerenderComputer(focusId) {
  if (!ui.modalOpen) return;
  const active = focusId || (document.activeElement && document.activeElement.id);
  renderComputerBody($('#modal-body'));
  const el = active && document.getElementById(active);
  if (el) el.focus();
}

function setMsg(kind, lines) {
  ui.compMsg = { kind, lines: [].concat(lines) };
  if (kind === 'ok') Sound.sfx('ok');
  else if (kind === 'err') Sound.sfx('error');
}
function coachMsg(t) { ui.compMsg = { kind: 'coach', lines: [], coach: t }; Sound.sfx('notice'); }
function addCoach(res) {
  if (!res || !res.coach) return;
  Sound.sfx('notice');
  ui.compMsg = { kind: ui.compMsg ? ui.compMsg.kind : 'coach', lines: ui.compMsg ? ui.compMsg.lines : [], coach: res.coach };
}

function renderComputerBody(body) {
  const st = gameState;
  const tabs = computerTabs(ui.compKind);
  const opt = compOptions();
  const u = compUser();
  body.innerHTML =
    '<div class="sys-bar"><b>工單分派管理系統（遊戲模擬）</b><span>登入：' + esc(u.emp_no + ' ' + u.name) + '（' + esc(u.title) + '／' + (u.role === ROLE_PLANNER ? '生管人員' : '組長') + '）</span><span>系統時間：' + fmtDT(st.clock) + '</span></div>' +
    (opt.banner ? '<p class="banner">' + esc(opt.banner) + '</p>' : '') +
    '<div class="tabs" role="tablist">' + tabs.map(t => '<button type="button" role="tab" id="tab-' + t.id + '" aria-selected="' + (t.id === ui.compTab) + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>').join('') + '</div>' +
    '<div id="comp-msg" aria-live="polite"></div><div class="tabpanel" id="tabpanel" role="tabpanel"></div>';
  $all('[data-tab]', body).forEach(b => b.addEventListener('click', () => {
    ui.compTab = b.dataset.tab; ui.compMsg = null; ui.warn = null; ui.mode = null;
    emit('openTab', { tab: ui.compTab });
    rerenderComputer('tab-' + ui.compTab);
    render();
  }));
  const msg = $('#comp-msg', body);
  if (ui.compMsg) {
    const m = ui.compMsg;
    const head = { ok: '系統訊息', err: '系統訊息', coach: '教學提示（不是系統訊息）', info: '系統訊息' }[m.kind];
    msg.innerHTML = (m.lines.length ? '<div class="msg k-' + m.kind + '"><b>' + head + '</b><ul>' + m.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul></div>' : '') +
      (m.coach ? '<div class="msg k-coach"><b>教學提示（不是系統訊息）</b><p>' + esc(m.coach) + '</p></div>' : '');
  }
  if (ui.warn) {
    const w = ui.warn;
    msg.insertAdjacentHTML('beforeend', '<div class="msg k-warn"><b>教學提示（不是系統訊息）：和現場資訊不一致</b><ul>' +
      w.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul><div class="choices"><button type="button" id="warn-back">回去修改</button><button type="button" class="secondary" id="warn-go">' + esc(w.goLabel) + '</button></div></div>');
    $('#warn-back', body).addEventListener('click', () => { ui.warn = null; rerenderComputer(); });
    $('#warn-go', body).addEventListener('click', () => { const go = w.go; ui.warn = null; go(); });
  }
  const panel = $('#tabpanel', body);
  if (ui.compTab === 'open') renderOpen(panel);
  else if (ui.compTab === 'new') renderNew(panel);
  else if (ui.compTab === 'search') renderSearch(panel);
  else if (ui.compTab === 'detail') renderDetail(panel, opt);
  else if (ctrl.renderExtraTab) ctrl.renderExtraTab(gameState, ui.compTab, panel);
}

// Run one system action: before-hook (block / warn / intercept), the pure rule, then the after-hook.
function runAction(name, payload, exec, goLabel) {
  const st = gameState;
  ui.compMsg = null;
  const pre = emit('before' + name, payload);
  if (pre.block) { coachMsg(pre.block); rerenderComputer(); return; }
  const go = () => {
    const res = exec();
    if (res.ok) { st.db = res.db; advance(st, 1); ui.mode = null; setMsg('ok', res.message); if (res.after) res.after(); }
    else setMsg('err', res.errors);
    addCoach(emit(name.charAt(0).toLowerCase() + name.slice(1), Object.assign({ result: res }, payload)));
    rerenderComputer();
    render();
  };
  if (pre.intercept) { pre.intercept(() => { reopenComputer(); go(); }); return; }
  if (pre.warn && pre.warn.length) { Sound.sfx('notice'); ui.warn = { lines: pre.warn, goLabel: goLabel || '仍要送出', go }; rerenderComputer(); return; }
  go();
}

function bindForm(panel, key) {
  const f = ui.forms[key];
  $all('[data-form="' + key + '"]', panel).forEach(el => {
    const sync = () => { f[el.dataset.f] = el.value; };
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  });
}
function optionTags(items, selected, placeholder) {
  return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') +
    items.map(i => '<option value="' + esc(i.value) + '"' + (String(i.value) === String(selected) ? ' selected' : '') + '>' + esc(i.label) + '</option>').join('');
}
function orderFieldsHtml(key, v, products) {
  return '<label>訂單號 <input id="' + key + '-so" data-form="' + key + '" data-f="so_no" maxlength="20" value="' + esc(v.so_no) + '"></label>' +
    '<label>產品 <select id="' + key + '-product" data-form="' + key + '" data-f="product_id">' +
    optionTags(products.map(p => ({ value: p.id, label: p.part_no + ' ' + p.name })), v.product_id, '請選擇') + '</select></label>' +
    '<label>數量 <input id="' + key + '-qty" data-form="' + key + '" data-f="qty" inputmode="numeric" value="' + esc(v.qty) + '"></label>' +
    '<label>交期 <input id="' + key + '-due" data-form="' + key + '" data-f="due_date" type="date" value="' + esc(v.due_date) + '"></label>' +
    '<label class="wide">備註 <textarea id="' + key + '-note" data-form="' + key + '" data-f="note" rows="2">' + esc(v.note) + '</textarea></label>';
}

function detailButton(id) { return '<button type="button" class="small secondary" id="det-' + id + '" data-detail="' + id + '">明細</button>'; }
function bindDetailButtons(panel) {
  $all('[data-detail]', panel).forEach(b => b.addEventListener('click', () => openDetail(Number(b.dataset.detail))));
}
function openDetail(id) {
  ui.detailId = id;
  ui.compTab = 'detail';
  ui.mode = null;
  ui.warn = null;
  ui.compMsg = null;
  addCoach(emit('viewDetail', { id }));
  rerenderComputer('tab-detail');
  render();
}

function renderOpen(panel) {
  const st = gameState;
  const u = compUser();
  const today = todayOf(st);
  const rows = listOpen(st.db, u, today, { status: ui.openFilter });
  const s = openSummary(st.db, u, today);
  panel.innerHTML =
    '<p class="selected">待派工 ' + s.pending + '｜已派工 ' + s.dispatched + '｜生產中 ' + s.producing + '｜逾期 ' + s.overdue + '</p>' +
    (u.role === ROLE_LEADER ? '<p class="hint">組長只看得到自己工作中心（' + esc(centerName(st.db, u.work_center_id)) + '）已派工與生產中的工單。</p>' : '') +
    '<label>狀態 <select id="open-status">' + optionTags(['待派工', '已派工', '生產中'].map(x => ({ value: x, label: x })), ui.openFilter, '全部') + '</select></label>' +
    (rows.length ? '<table class="data"><thead><tr><th>工單號</th><th>訂單號</th><th>產品</th><th>數量</th><th>交期</th><th>交期狀態</th><th>狀態</th><th>工作中心</th><th>預定生產日</th><th></th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + esc(r.wo_no) + '</td><td>' + esc(r.so_no || '') + '</td><td>' + esc(r.part_no + ' ' + r.product_name) + '</td><td>' + r.qty + '</td><td>' + esc(r.due_date) +
        '</td><td>' + dueHtml(r) + '</td><td>' + badgeHtml(r.status) + '</td><td>' + esc(r.wc_name || '—') + '</td><td>' + esc(r.plan_date || '—') + '</td><td>' + detailButton(r.id) + '</td></tr>').join('') +
      '</tbody></table>' : '<p class="hint">目前沒有未完工的工單。</p>');
  $('#open-status', panel).addEventListener('change', e => { ui.openFilter = e.target.value; rerenderComputer('open-status'); });
  bindDetailButtons(panel);
}

function renderNew(panel) {
  const st = gameState;
  const f = ui.forms.new;
  const products = st.db.products.filter(p => p.active);
  panel.innerHTML = '<form id="f-new" class="grid-form">' + orderFieldsHtml('new', f, products) +
    '<div class="row"><button type="submit">開立工單</button><span class="hint">工單號由系統依開立當天日期與流水號產生；新工單狀態為待派工。</span></div></form>';
  bindForm(panel, 'new');
  $('#f-new', panel).addEventListener('submit', e => {
    e.preventDefault();
    const input = Object.assign({}, f);
    runAction('Create', { input }, () => {
      const res = createOrder(st.db, input, compUser(), nowStr(st));
      if (res.ok) res.after = () => { ui.forms.new = emptyForms().new; ui.detailId = res.order.id; ui.compTab = 'detail'; };
      return res;
    });
  });
}

function renderSearch(panel) {
  const st = gameState;
  const f = ui.forms.search;
  const res = ui.searchResult;
  panel.innerHTML = '<form id="f-search" class="row">' +
    '<label>關鍵字（工單號或訂單號）<input id="s-kw" data-form="search" data-f="keyword" value="' + esc(f.keyword) + '"></label>' +
    '<label>狀態 <select id="s-status" data-form="search" data-f="status">' + optionTags(STATUSES.map(x => ({ value: x, label: x })), f.status, '全部') + '</select></label>' +
    '<label>工作中心 <select id="s-wc" data-form="search" data-f="work_center_id">' + optionTags(st.db.work_centers.map(w => ({ value: w.id, label: w.name + (w.active ? '' : '（停用）') })), f.work_center_id, '全部') + '</select></label>' +
    '<label>交期起 <input id="s-from" type="date" data-form="search" data-f="from" value="' + esc(f.from) + '"></label>' +
    '<label>交期迄 <input id="s-to" type="date" data-form="search" data-f="to" value="' + esc(f.to) + '"></label>' +
    '<button type="submit">查詢</button></form>' +
    (res === null ? '<p class="hint">兩種角色都可以查詢所有工作中心的工單。</p>' :
      res.rows.length ? '<table class="data"><thead><tr><th>工單號</th><th>產品</th><th>數量</th><th>交期</th><th>狀態</th><th>交期狀態</th><th>工作中心</th><th>良品</th><th>不良</th><th>良率</th><th></th></tr></thead><tbody>' +
        res.rows.map(r => '<tr><td>' + esc(r.wo_no) + '</td><td>' + esc(r.part_no + ' ' + r.product_name) + '</td><td>' + r.qty + '</td><td>' + esc(r.due_date) + '</td><td>' + badgeHtml(r.status) +
          '</td><td>' + dueHtml(r) + '</td><td>' + esc(r.wc_name || '—') + '</td><td>' + (r.good_qty === null ? '' : r.good_qty) + '</td><td>' + (r.ng_qty === null ? '' : r.ng_qty) +
          '</td><td>' + esc(r.yield_rate) + '</td><td>' + detailButton(r.id) + '</td></tr>').join('') + '</tbody></table><p class="hint">共 ' + res.rows.length + ' 筆。</p>'
        : '<p class="hint">查無符合條件的工單。</p>');
  bindForm(panel, 'search');
  $('#f-search', panel).addEventListener('submit', e => {
    e.preventDefault();
    const r = searchOrders(st.db, Object.assign({}, f), todayOf(st));
    if (!r.ok) { setMsg('err', r.errors); ui.searchResult = null; }
    else { ui.searchResult = r; ui.compMsg = null; }
    emit('search', { result: r });
    rerenderComputer();
  });
  bindDetailButtons(panel);
}

function kv(label, value, wide) { return '<dt>' + label + '</dt><dd' + (wide ? ' class="wide"' : '') + '>' + value + '</dd>'; }

function renderDetail(panel, opt) {
  const st = gameState;
  const u = compUser();
  const raw = ui.detailId ? findOrder(st.db, ui.detailId) : null;
  if (!raw) { panel.innerHTML = '<p class="hint">請先從未完工清單或工單查詢選一張工單（按「明細」）。</p>'; return; }
  const o = joinOrder(st.db, raw, todayOf(st));
  const blank = '<span class="muted">（空）</span>';
  const val = x => (x === null || x === undefined || x === '') ? blank : esc(x);
  let html = '<h3>工單明細 ' + esc(o.wo_no) + '</h3>' +
    '<dl class="kv">' + kv('工單號', esc(o.wo_no)) + kv('訂單號', val(o.so_no)) + kv('產品', esc(o.part_no + ' ' + o.product_name)) + kv('數量', o.qty) +
    kv('交期', esc(o.due_date)) + kv('交期狀態', dueHtml(o) || blank) + kv('備註', val(o.note), true) +
    kv('開立人', esc(o.created_by_name)) + kv('開立時間', esc(o.created_at)) + kv('最後修改時間', o.updated_at ? esc(o.updated_at) : '<span class="muted">未修改</span>') + '</dl>' +
    '<h3>派工</h3><dl class="kv">' + kv('狀態', badgeHtml(o.status)) + kv('工作中心', val(o.wc_name)) + kv('預定生產日', val(o.plan_date)) +
    kv('派工人', val(o.dispatched_by_name)) + kv('派工時間', val(o.dispatched_at)) + '</dl>' +
    '<h3>報工</h3><dl class="kv">' + kv('開工人', val(o.started_by_name)) + kv('開工時間', val(o.started_at)) + kv('良品數', val(o.good_qty)) + kv('不良數', val(o.ng_qty)) + kv('良率', val(o.yield_rate));
  if (o.status === '已完工') html += kv('完工備註', val(o.close_note), true) + kv('回報人', val(o.closed_by_name)) + kv('完工時間', val(o.closed_at));
  else if (o.status === '已取消') html += kv('取消理由', val(o.close_note), true) + kv('取消人', val(o.closed_by_name)) + kv('取消時間', val(o.closed_at));
  html += '</dl>';

  const acts = actionsFor(u, raw);
  if (opt.readOnly) {
    html += '<div class="actions" id="actions">' + (acts.length ? acts.map(a => '<button type="button" disabled>' + esc(a[1]) + '</button>').join(' ') + ' <span class="hint">本情境只觀察，不送出。</span>' : '<span class="hint">（這個身分在這個狀態沒有處理按鈕）</span>') + '</div>';
  } else {
    html += '<div class="actions" id="actions">' + (acts.length ? acts.map(a => '<button type="button" id="act-' + a[0] + '" data-act="' + a[0] + '">' + esc(a[1]) + '</button>').join(' ') :
      '<span class="hint">（這個身分在這個狀態沒有處理按鈕）</span>') + '</div>';
  }
  if (!opt.readOnly && opt.tryReport && u.role === ROLE_PLANNER && (raw.status === '已派工' || raw.status === '生產中')) {
    html += '<div class="msg k-coach try"><b>教學用（不是系統畫面）</b><p>原系統的明細上，生管人員看不到「開工」「完工回報」按鈕。下面模擬直接送出回報要求時，系統的檢核結果：</p>' +
      '<div class="choices"><button type="button" class="secondary" id="try-start">以目前身分送出開工</button><button type="button" class="secondary" id="try-finish">以目前身分送出完工回報</button></div></div>';
  }
  html += '<div id="form-area">' + detailFormHtml(raw, o) + '</div>';
  panel.innerHTML = html;

  $all('[data-act]', panel).forEach(b => b.addEventListener('click', () => openActionForm(b.dataset.act, raw)));
  const ts = $('#try-start', panel), tf = $('#try-finish', panel);
  const tryReport = which => {
    const res = which === 'start' ? startOrder(st.db, raw.id, u, nowStr(st)) : finishOrder(st.db, raw.id, {}, u, nowStr(st));
    if (res.ok) st.db = res.db;
    setMsg(res.ok ? 'ok' : 'err', res.ok ? res.message : res.errors);
    addCoach(emit('tryReport', { id: raw.id, which, result: res }));
    rerenderComputer();
    render();
  };
  if (ts) ts.addEventListener('click', () => tryReport('start'));
  if (tf) tf.addEventListener('click', () => tryReport('finish'));
  bindDetailForm(panel, raw);
}

function openActionForm(mode, raw) {
  const st = gameState;
  ui.mode = mode;
  ui.compMsg = null;
  ui.warn = null;
  if (mode === 'edit') ui.forms.edit = { so_no: raw.so_no || '', product_id: String(raw.product_id), qty: String(raw.qty), due_date: raw.due_date, note: raw.note || '' };
  if (mode === 'dispatch') {
    const re = raw.status === '已派工';
    ui.forms.dispatch = { work_center_id: re ? String(raw.work_center_id) : '', plan_date: re ? raw.plan_date : todayOf(st) };
  }
  if (mode === 'cancel') ui.forms.cancel = { close_note: '' };
  if (mode === 'finish') ui.forms.finish = { good_qty: '', ng_qty: '', close_note: '' };
  emit('openForm', { id: raw.id, mode });
  rerenderComputer(mode === 'start' ? 'start-yes' : 'form-first');
}

function detailFormHtml(raw, o) {
  const st = gameState;
  const m = ui.mode;
  if (!m) return '';
  if (m === 'start') {
    return '<div class="confirm"><p>確定 ' + esc(o.wo_no) + ' 開工？系統將寫入開工人 <b>' + esc(compUser().name) + '</b>、開工時間 <b>' + nowStr(st) + '</b>。</p>' +
      '<div class="choices"><button type="button" id="start-yes">確定開工</button><button type="button" class="secondary" id="form-cancel">取消</button></div></div>';
  }
  let title = '', fields = '';
  if (m === 'edit') {
    title = '修改工單';
    const products = st.db.products.filter(p => p.active || p.id === raw.product_id);
    fields = orderFieldsHtml('edit', ui.forms.edit, products).replace('id="edit-so"', 'id="form-first" data-alias="edit-so"');
  } else if (m === 'dispatch') {
    const re = raw.status === '已派工';
    title = re ? '改派' : '派工';
    fields = '<label>工作中心 <select id="form-first" data-form="dispatch" data-f="work_center_id">' +
      optionTags(st.db.work_centers.filter(w => w.active).map(w => ({ value: w.id, label: w.name })), ui.forms.dispatch.work_center_id, '請選擇') + '</select></label>' +
      '<label>預定生產日 <input id="d-plan" type="date" data-form="dispatch" data-f="plan_date" value="' + esc(ui.forms.dispatch.plan_date) + '"></label>' +
      (re ? '<p class="hint wide">改派會直接覆蓋工作中心、預定生產日、派工人與派工時間。</p>' : '');
  } else if (m === 'cancel') {
    title = '取消工單';
    fields = '<label class="wide">取消理由 <textarea id="form-first" data-form="cancel" data-f="close_note" rows="2">' + esc(ui.forms.cancel.close_note) + '</textarea></label>';
  } else if (m === 'finish') {
    title = '完工回報';
    const helper = ctrl.finishHelper ? ctrl.finishHelper(st, raw) : null;
    fields = '<label>良品數 <input id="form-first" data-form="finish" data-f="good_qty" inputmode="numeric" value="' + esc(ui.forms.finish.good_qty) + '"></label>' +
      '<label>不良數 <input id="f-ng" data-form="finish" data-f="ng_qty" inputmode="numeric" value="' + esc(ui.forms.finish.ng_qty) + '"></label>' +
      '<label class="wide">完工備註 <textarea id="f-note" data-form="finish" data-f="close_note" rows="2">' + esc(ui.forms.finish.close_note) + '</textarea></label>' +
      (helper ? '<div class="row"><button type="button" class="secondary" id="f-help">' + esc(helper.label) + '</button><span class="hint">教學用：帶入你在現場看到的數字，送出前仍可修改。</span></div>' : '');
  }
  return '<form id="f-action" class="grid-form action-form"><h3 class="wide">' + title + '</h3>' + fields +
    '<div class="row"><button type="submit">送出</button><button type="button" class="secondary" id="form-cancel">取消</button></div></form>';
}

function bindDetailForm(panel, raw) {
  const st = gameState;
  const cancel = $('#form-cancel', panel);
  if (cancel) cancel.addEventListener('click', () => { ui.mode = null; setMsg('info', '已取消，沒有寫入任何資料。'); rerenderComputer(); });
  const yes = $('#start-yes', panel);
  if (yes) yes.addEventListener('click', () => {
    runAction('Start', { id: raw.id }, () => startOrder(st.db, raw.id, compUser(), nowStr(st)));
  });
  const form = $('#f-action', panel);
  if (!form) return;
  const m = ui.mode;
  bindForm(panel, m);
  const help = $('#f-help', panel);
  if (help) help.addEventListener('click', () => { Object.assign(ui.forms.finish, ctrl.finishHelper(st, raw).values); rerenderComputer('form-first'); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = Object.assign({}, ui.forms[m]);
    const u = compUser();
    if (m === 'edit') runAction('Update', { id: raw.id, input }, () => updateOrder(st.db, raw.id, input, u, nowStr(st)));
    else if (m === 'dispatch') runAction('Dispatch', { id: raw.id, input }, () => dispatchOrder(st.db, raw.id, input, u, nowStr(st)), '仍要送出');
    else if (m === 'cancel') runAction('Cancel', { id: raw.id, input }, () => cancelOrder(st.db, raw.id, input, u, nowStr(st)));
    else if (m === 'finish') runAction('Finish', { id: raw.id, input }, () => finishOrder(st.db, raw.id, input, u, nowStr(st)));
  });
}

/* phone */
function defaultPhone(st, ext) {
  const e = PHONE_BOOK.find(x => x.ext === ext);
  if (!e) return [{ who: '電話', text: '（嘟嘟嘟——您撥的分機號碼不存在。）' }];
  if (ext === '3001') return [{ who: '電話', text: '（這就是生管辦公室的分機，你自己的電話。）' }];
  return [{ who: e.name, text: '您好，這裡是' + e.name + '。……喔，不是要找我們？好，沒關係。' }];
}
function openPhone() {
  ui.phoneLog = [];
  openModal('電話（系統以外的人工作業）', renderPhone);
}
function renderPhone(body) {
  body.innerHTML = '<p class="hint">分機表：' + PHONE_BOOK.map(p => p.name + ' ' + p.ext).join('、') + '。電話內容不會留在系統紀錄裡。</p>' +
    '<form id="f-phone" class="row"><label>分機 <input id="in-ext" inputmode="numeric" autocomplete="off" maxlength="6"></label><button type="submit">撥打</button></form>' +
    '<div class="talk" id="phone-log" aria-live="polite">' + ui.phoneLog.map(lineHtml).join('') + '</div>';
  $('#f-phone', body).addEventListener('submit', e => {
    e.preventDefault();
    const st = gameState;
    const ext = $('#in-ext').value.trim();
    if (!/^\d+$/.test(ext)) {
      ui.phoneLog.push({ who: '電話', text: '請輸入數字分機號碼。' });
    } else {
      advance(st, 1);
      Sound.sfx('ring');
      const lines = (ctrl.onPhone && ctrl.onPhone(st, ext)) || defaultPhone(st, ext);
      ui.phoneLog.push({ who: '你', text: '撥打分機 ' + ext });
      ui.phoneLog = ui.phoneLog.concat(lines);
    }
    renderPhone(body);
    $('#in-ext').focus();
    render();
  });
}

/* prediction quiz: explanation after each answer, can re-answer, no score */
function openQuiz(title, intro, questions, store, doneLabel, onDone) {
  openModal(title, body => {
    body.innerHTML = '<p class="hint">' + esc(intro) + '</p><ol class="classify">' + questions.map((q, i) =>
      '<li><p>' + esc(q.q) + '</p><div class="radios" role="radiogroup" aria-label="' + esc(q.q) + '">' +
      q.options.map(o => '<label><input type="radio" name="q' + i + '" value="' + esc(o) + '"' + (store[q.id] === o ? ' checked' : '') + '> ' + esc(o) + '</label>').join('') +
      '</div><p class="fb" id="qfb' + i + '" aria-live="polite"></p></li>').join('') + '</ol>' +
      '<div class="choices"><button type="button" id="quiz-done">' + esc(doneLabel) + '</button></div>';
    const btn = $('#quiz-done', body);
    const fb = (q, i) => {
      const v = store[q.id];
      $('#qfb' + i, body).textContent = v ? (v === q.answer ? '和系統規則相同。' : '和系統規則不同，可以再想想。') + q.explain : '';
    };
    const refresh = () => { btn.disabled = questions.some(q => !store[q.id]); };
    questions.forEach((q, i) => {
      fb(q, i);
      $all('input[name="q' + i + '"]', body).forEach(r => r.addEventListener('change', () => { store[q.id] = r.value; fb(q, i); refresh(); }));
    });
    btn.addEventListener('click', () => { closeModal(true); onDone(); afterAction(); flushIdle(); });
    refresh();
  }, { size: 'wide' });
}

/* settlement */
function openSettlement(title, html, buttons) {
  openModal(title, body => {
    body.innerHTML = html + '<div class="choices">' + buttons.map((b, i) => '<button type="button" class="' + (i ? 'secondary' : '') + '" data-b="' + i + '">' + esc(b.label) + '</button>').join('') + '</div>';
    $all('[data-b]', body).forEach(el => el.addEventListener('click', () => {
      const b = buttons[Number(el.dataset.b)];
      closeModal(true);
      b.run();
    }));
  }, { size: 'wide', sound: 'fanfare' });
}

/* pause and help */
const HELP_HTML = '<table class="data"><tbody>' +
  '<tr><th>WASD／方向鍵</th><td>每次移動一格，只能上下左右，遇到障礙不移動</td></tr>' +
  '<tr><th>E</th><td>和相鄰（優先面向）的角色或物件互動</td></tr>' +
  '<tr><th>Esc</th><td>關閉對話或表單；在場景中開啟暫停選單</td></tr>' +
  '<tr><th>滑鼠、Tab、Enter</th><td>操作表單、選單、對話與問題</td></tr>' +
  '<tr><th>身分</th><td>在生管電腦是生管員；到工作中心電腦，由在場的組長登入，你改以組長身分操作。畫面頂端顯示目前身分</td></tr>' +
  '<tr><th>音樂／音效</th><td>畫面右上角的按鈕可以分別開關；所有狀態與錯誤都有文字，關掉聲音也能完整遊玩</td></tr>' +
  '<tr><th>快捷移動</th><td>右側面板的按鈕，可直接移到用過的電腦、電話、清點板等物件前</td></tr>' +
  '</tbody></table><p class="hint">角色頭上的「！」表示現在和他說話會有進展。所有人名、訂單號與產品資料都是虛構的。遊戲不連網、不儲存資料，重新整理就回到標題。</p>';

function openHelp() { openModal('操作說明', b => { b.innerHTML = HELP_HTML + '<div class="choices"><button type="button" id="h-ok">知道了</button></div>'; $('#h-ok', b).addEventListener('click', () => closeModal()); }); }

function openPause() {
  openModal('暫停', body => {
    body.innerHTML = '<div class="choices col">' +
      '<button type="button" id="p-resume">繼續</button>' +
      '<button type="button" class="secondary" id="p-help">操作說明</button>' +
      '<button type="button" class="secondary" id="p-restart">重新開始本關（資料回到初始狀態）</button>' +
      '<button type="button" class="secondary" id="p-title">回到標題</button></div>';
    $('#p-resume', body).addEventListener('click', () => closeModal());
    $('#p-help', body).addEventListener('click', openHelp);
    $('#p-restart', body).addEventListener('click', () => { const m = gameState.mode; closeModal(true); startMode(m); });
    $('#p-title', body).addEventListener('click', () => { closeModal(true); showTitle(); });
  });
}

function syncSoundButtons() {
  const m = $('#btn-music'), s = $('#btn-sfx');
  m.textContent = '音樂：' + (Sound.isMusicOn() ? '開' : '關');
  m.setAttribute('aria-pressed', String(Sound.isMusicOn()));
  s.textContent = '音效：' + (Sound.isSfxOn() ? '開' : '關');
  s.setAttribute('aria-pressed', String(Sound.isSfxOn()));
}

/* init */
function initUI() {
  const dlg = $('#modal');
  dlg.addEventListener('cancel', e => { e.preventDefault(); closeModal(); });
  dlg.addEventListener('close', () => { if (ui.modalOpen && !dlg.open) closeModal(); });
  $('#modal-close').addEventListener('click', () => closeModal());
  $('#btn-pause').addEventListener('click', openPause);
  $('#btn-music').addEventListener('click', () => {
    Sound.setMusic(!Sound.isMusicOn());
    if (Sound.isMusicOn() && gameState) Sound.startMusic();
    syncSoundButtons();
    $('#map-wrap').focus();
  });
  $('#btn-sfx').addEventListener('click', () => {
    Sound.setSfx(!Sound.isSfxOn());
    syncSoundButtons();
    $('#map-wrap').focus();
  });
  syncSoundButtons();
  $('#btn-help-title').addEventListener('click', openHelp);
  document.addEventListener('keydown', onKey);
  showTitle();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initUI);
