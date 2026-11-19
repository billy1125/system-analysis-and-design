'use strict';
/*
 * Warehouse stocktaking simulation game (teaching material).
 * Plain HTML/CSS/JS. Opens from file:// with no network and no storage.
 * Sections:
 *   1. constants and helpers
 *   2. stocktaking rules (pure functions, no DOM)
 *   3. level data (fixed fictional data)
 *   4. game state and clock
 *   5. level controllers (level 1, level 2)
 *   6. change scenario controller (removed in the midterm build)
 *   6b. sound
 *   7. UI
 */

const EDITION = 'final'; // @@EDITION  build script sets 'midterm' for the midterm zip

/* ---------- 1. constants and helpers ---------- */

const TILE = 40;
const MAP_ROWS = [
  '####################',
  '#C.T.K#.aaaa..bbbb.#',
  '#.....D............#',
  '#.....#.cccc..dddd.#',
  '#.....#............#',
  '#######............#',
  '#######.RRR....XX..#',
  '#######............#',
  '#########GG#########'
];
const MAP_W = MAP_ROWS[0].length;
const MAP_H = MAP_ROWS.length;
const BLOCKING = '#CTKabcdXG';
const OBJECTS = { C: 'computer', T: 'phone', X: 'ship' };
const OBJECT_LABELS = { computer: '倉庫電腦', phone: '分機', ship: '出貨點交台' };
const SHELF_ROWS = { a: 'A', b: 'B', c: 'C', d: 'D' };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

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
// Shelf tile -> storage location code, e.g. 'A-02'
function shelfLoc(ch, x) {
  const base = (ch === 'a' || ch === 'c') ? 7 : 13;
  return SHELF_ROWS[ch] + '-' + pad2(x - base);
}

/* ---------- 2. stocktaking rules (pure functions, no DOM) ---------- */

const ROLE_MANAGER = 0;
const ROLE_STAFF = 1;
const COUNT_TYPES = ['全盤', '抽盤'];
const MOVE_TYPES = ['入庫', '出庫', '盤點調整'];

function nextId(rows) { return rows.reduce((m, r) => Math.max(m, r.id), 0) + 1; }
function text(v) { return v === undefined || v === null ? '' : String(v).trim(); }
// Whole number written with digits only, between min and max; otherwise null
function toIntIn(v, min, max) {
  const s = text(v);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}
// '+5', '−3' (minus sign), '0'
function signed(n) {
  if (n === null || n === undefined) return '';
  if (n > 0) return '+' + n;
  if (n < 0) return '−' + Math.abs(n);
  return '0';
}
function fail(db, message) { return { ok: false, error: message, errors: [message], db }; }
function userById(db, id) { return db.users.find(u => u.id === id) || null; }
function userName(db, id) { const u = userById(db, id); return u ? u.name : ''; }
function itemById(db, id) { return db.items.find(i => i.id === id) || null; }
function itemAtLoc(db, loc) { return db.items.find(i => i.location === loc) || null; }
function countById(db, id) { return db.counts.find(c => c.id === id) || null; }
function byItemNo(a, b) { return a.item_no < b.item_no ? -1 : a.item_no > b.item_no ? 1 : 0; }

// The open count that already holds this item, or null
function openCountOf(db, itemId) {
  const l = db.count_lines.find(x => x.item_id === itemId && (countById(db, x.count_id) || {}).status === '盤點中');
  return l ? countById(db, l.count_id) : null;
}

// IC-YYMM-NN, YYMM from the creation date, sequence within the month
function nextCountNo(db, now) {
  const prefix = 'IC-' + now.slice(2, 4) + now.slice(5, 7) + '-';
  const nums = db.counts.filter(c => c.count_no.indexOf(prefix) === 0).map(c => Number(c.count_no.slice(prefix.length)));
  return prefix + pad2(nums.length ? Math.max.apply(null, nums) + 1 : 1);
}

// Lines with book quantity and difference. Open count: book is the item's book now.
// Closed count: difference is this count's adjustment (0 if none); book = counted - difference.
function countLines(db, count) {
  return db.count_lines.filter(l => l.count_id === count.id).map(l => {
    const it = itemById(db, l.item_id);
    const adj = db.stock_moves.find(m => m.count_id === l.count_id && m.item_id === l.item_id && m.move_type === '盤點調整');
    let book = it.book_qty;
    let diff = l.counted_qty === null ? null : l.counted_qty - it.book_qty;
    if (count.status === '已結案') { diff = adj ? adj.qty_change : 0; book = l.counted_qty - diff; }
    return Object.assign({}, l, {
      item_no: it.item_no, name: it.name, spec: it.spec, unit: it.unit, location: it.location,
      book, diff, counted_by_name: userName(db, l.counted_by)
    });
  }).sort((a, b) => a.location < b.location ? -1 : a.location > b.location ? 1 : byItemNo(a, b));
}

function countSummary(db, count) {
  const lines = countLines(db, count);
  return {
    line_count: lines.length,
    counted_count: lines.filter(l => l.counted_qty !== null).length,
    gain_count: lines.filter(l => l.diff > 0).length,
    loss_count: lines.filter(l => l.diff < 0).length
  };
}

function canEnter(count, user) { return !!user && count.status === '盤點中' && (user.role === ROLE_MANAGER || user.id === count.counter_id); }
function canClose(count, user) { return !!user && count.status === '盤點中' && user.role === ROLE_MANAGER; }

// Mutates db: write one move and change the item's book quantity
function addMove(db, m) {
  const move = Object.assign({ id: nextId(db.stock_moves) }, m);
  db.stock_moves.push(move);
  itemById(db, m.item_id).book_qty += m.qty_change;
  return move;
}

// Create a count (manager only). Checks in the original order; stops at the first error.
function createCount(db, input, now, userId) {
  const user = userById(db, userId);
  if (!user || user.role !== ROLE_MANAGER) return fail(db, '只有主管可以使用這個功能');
  const name = text(input.name);
  if (!name) return fail(db, '請輸入盤點單名稱');
  if (name.length > 30) return fail(db, '盤點單名稱不可超過 30 字');
  const type = text(input.count_type);
  if (!COUNT_TYPES.includes(type)) return fail(db, '請選擇盤點類別');
  if (text(input.counter_id) === '') return fail(db, '請選擇盤點人員');
  const counter = userById(db, Number(input.counter_id));
  if (!counter || !counter.active) return fail(db, '盤點人員必須是啟用中的帳號');
  let items;
  if (type === '全盤') {
    items = db.items.filter(i => i.active).slice().sort(byItemNo);
  } else {
    const ids = Array.from(new Set((input.item_ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
    if (ids.length === 0) return fail(db, '抽盤請至少選擇一個料號');
    items = ids.map(id => itemById(db, id));
    if (items.some(i => !i)) return fail(db, '找不到這個料號');
    items.sort(byItemNo);
    const off = items.find(i => !i.active);
    if (off) return fail(db, '料號 ' + off.item_no + ' 已停用，不能加入盤點');
  }
  for (const i of items) {
    const open = openCountOf(db, i.id);
    if (open) return fail(db, '料號 ' + i.item_no + ' 已在盤點單 ' + open.count_no + ' 盤點中');
  }
  const next = clone(db);
  const count = {
    id: nextId(next.counts), count_no: nextCountNo(next, now), name, count_type: type, counter_id: counter.id,
    status: '盤點中', created_by: userId, created_at: now, closed_by: null, closed_at: null
  };
  next.counts.push(count);
  items.forEach(i => next.count_lines.push({
    id: nextId(next.count_lines), count_id: count.id, item_id: i.id, counted_qty: null, remark: null, counted_by: null, counted_at: null
  }));
  return { ok: true, errors: [], db: next, count, message: '已建立盤點單 ' + count.count_no + '，共 ' + items.length + ' 項' };
}

// Enter a counted quantity. Entering again overwrites quantity, remark, counter and time.
function enterLine(db, lineId, input, now, userId) {
  const line = db.count_lines.find(l => l.id === lineId);
  if (!line) return fail(db, '找不到這個盤點項目');
  const count = countById(db, line.count_id);
  if (count.status !== '盤點中') return fail(db, '這張盤點單已結案，不能再輸入');
  const user = userById(db, userId);
  if (!user || (user.role !== ROLE_MANAGER && user.id !== count.counter_id)) return fail(db, '只有被指派的盤點人員或主管可以輸入');
  const qty = toIntIn(input.counted_qty, 0, 99999);
  if (qty === null) return fail(db, '實盤數量須為 0 到 99999 的整數');
  const remark = text(input.remark);
  if (remark.length > 100) return fail(db, '差異說明不可超過 100 字');
  const next = clone(db);
  const nl = next.count_lines.find(l => l.id === lineId);
  Object.assign(nl, { counted_qty: qty, remark: remark || null, counted_by: userId, counted_at: now });
  const item = itemById(db, line.item_id);
  return { ok: true, errors: [], db: next, line: nl, message: '已儲存 ' + item.item_no + '：實盤 ' + qty + '，盤差 ' + signed(qty - item.book_qty) };
}

// Close a count (manager only). Every line differing from the book right now gets one adjustment.
function closeCount(db, countId, now, userId) {
  const user = userById(db, userId);
  if (!user || user.role !== ROLE_MANAGER) return fail(db, '只有主管可以使用這個功能');
  const count = countById(db, countId);
  if (!count) return fail(db, '找不到這張盤點單');
  if (count.status !== '盤點中') return fail(db, '這張盤點單已結案');
  const lines = db.count_lines.filter(l => l.count_id === count.id);
  const left = lines.filter(l => l.counted_qty === null).length;
  if (left > 0) return fail(db, '還有 ' + left + ' 項沒有盤點，不能結案');
  const next = clone(db);
  let adjusted = 0;
  lines.slice().sort((a, b) => a.id - b.id).forEach(l => {
    const it = itemById(next, l.item_id);
    const diff = l.counted_qty - it.book_qty;
    if (diff === 0) return;
    addMove(next, { item_id: it.id, move_type: '盤點調整', qty_change: diff, note: count.count_no + ' 盤點調整', count_id: count.id, created_by: userId, created_at: now });
    adjusted++;
  });
  const nc = countById(next, count.id);
  nc.status = '已結案'; nc.closed_by = userId; nc.closed_at = now;
  return { ok: true, errors: [], db: next, adjusted, message: '已結案 ' + count.count_no + '，調整 ' + adjusted + ' 個料號的帳面數量' };
}

// Register stock in or out. Time is always now. An open count does not block this.
function createMove(db, input, now, userId) {
  const item = itemById(db, Number(input.item_id));
  if (!item) return fail(db, '請選擇料號');
  if (!item.active) return fail(db, '料號 ' + item.item_no + ' 已停用，不能登錄異動');
  const type = text(input.move_type);
  if (type !== '入庫' && type !== '出庫') return fail(db, '請選擇異動類別');
  const qty = toIntIn(input.qty, 1, 99999);
  if (qty === null) return fail(db, '數量須為 1 到 99999 的整數');
  if (type === '出庫' && qty > item.book_qty) return fail(db, '庫存不足：' + item.item_no + ' 帳面只有 ' + item.book_qty + ' ' + item.unit);
  const note = text(input.note);
  if (note.length > 50) return fail(db, '說明不可超過 50 字');
  const change = type === '入庫' ? qty : -qty;
  const next = clone(db);
  const move = addMove(next, { item_id: item.id, move_type: type, qty_change: change, note: note || null, count_id: null, created_by: userId, created_at: now });
  return { ok: true, errors: [], db: next, move, message: '已登錄' + type + '：' + item.item_no + ' ' + signed(change) + '，帳面 ' + (item.book_qty + change) };
}

function listMoves(db, filter) {
  filter = filter || {};
  return db.stock_moves
    .filter(m => !filter.item_id || m.item_id === Number(filter.item_id))
    .filter(m => !MOVE_TYPES.includes(filter.move_type) || m.move_type === filter.move_type)
    .map(m => { const it = itemById(db, m.item_id); return Object.assign({}, m, { item_no: it.item_no, item_name: it.name, created_by_name: userName(db, m.created_by) }); })
    .sort((a, b) => a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id);
}

/* ---------- 3. level data (fixed fictional data) ---------- */

const ITEM_DEFS = [
  [1, 'PL-1101', '美耐板', '1830×915 mm', '張', 'A-01'],
  [2, 'PL-1102', '塑合板', '18 mm 厚', '張', 'A-02'],
  [3, 'PL-1103', '封邊條', '22 mm 寬', '捲', 'A-03'],
  [4, 'ST-2201', '方管', '25×25 mm，長 6 m', '支', 'B-01'],
  [5, 'ST-2202', '圓管', 'φ32 mm，長 6 m', '支', 'B-02'],
  [6, 'HW-3301', '自攻螺絲', '4×16，100 支裝', '盒', 'C-01'],
  [7, 'HW-3302', '隱藏鉸鏈', '35 mm', '個', 'C-02'],
  [8, 'HW-3303', '氣壓棒', '行程 100 mm', '支', 'C-03'],
  [9, 'HW-3304', '抽屜滑軌', '400 mm', '組', 'C-04'],
  [10, 'PK-4401', '紙箱', '60×40×40 cm', '個', 'D-01'],
  [11, 'PK-4402', '氣泡布', '寬 1.2 m', '捲', 'D-02'],
  [12, 'PK-4403', '護角', '50 mm', '個', 'D-03'],
  [13, 'PK-4409', '舊款護角', '40 mm', '個', 'D-04']
];
const INACTIVE_ITEMS = [13];
const MGR_ID = 1;
const PLAYER_ID = 2;

function baseUsers() {
  return [
    { id: 1, emp_no: 'E7001', name: '陳振宇', title: '倉庫課長', role: ROLE_MANAGER, active: true },
    { id: 2, emp_no: 'E7101', name: '吳宜蓁', title: '倉管員', role: ROLE_STAFF, active: true },
    { id: 3, emp_no: 'E7102', name: '黃志明', title: '倉管員', role: ROLE_STAFF, active: true },
    { id: 4, emp_no: 'E7103', name: '周美華', title: '倉管員', role: ROLE_STAFF, active: false }
  ];
}
function mkCount(id, no, name, type, counter, createdAt, closedAt) {
  return {
    id, count_no: no, name, count_type: type, counter_id: counter, status: closedAt ? '已結案' : '盤點中',
    created_by: MGR_ID, created_at: createdAt, closed_by: closedAt ? MGR_ID : null, closed_at: closedAt || null
  };
}
function mkLine(id, countId, itemId, qty, remark, by, at) {
  return { id, count_id: countId, item_id: itemId, counted_qty: qty, remark: remark || null, counted_by: qty === null ? null : by, counted_at: qty === null ? null : at };
}
// Build a database whose book quantities equal `books`; the opening stock move makes up the rest.
// later: [time, item id, type, change, note, count id, user id]
function makeDb(books, counts, lines, later) {
  const items = ITEM_DEFS.map(([id, no, name, spec, unit, loc]) => ({
    id, item_no: no, name, spec, unit, location: loc, book_qty: books[id] || 0, active: !INACTIVE_ITEMS.includes(id)
  }));
  const sum = {};
  later.forEach(m => { sum[m[1]] = (sum[m[1]] || 0) + m[3]; });
  const moves = [];
  items.forEach(i => {
    const open = i.book_qty - (sum[i.id] || 0);
    if (open > 0) moves.push({ item_id: i.id, move_type: '入庫', qty_change: open, note: '系統上線期初庫存', count_id: null, created_by: MGR_ID, created_at: '2027-09-01 08:00' });
  });
  later.forEach(([at, itemId, type, change, note, countId, by]) => moves.push({ item_id: itemId, move_type: type, qty_change: change, note, count_id: countId, created_by: by, created_at: at }));
  moves.forEach((m, i) => { m.id = i + 1; });
  return { users: baseUsers(), items, counts, count_lines: lines, stock_moves: moves };
}

const BOOKS_L1 = { 1: 60, 2: 46, 3: 30, 4: 120, 5: 80, 6: 35, 7: 15, 8: 40, 9: 22, 10: 240, 11: 12, 12: 500 };
const LATER_L1 = [
  ['2027-10-08 10:00', 4, '出庫', -30, '領料單 PR-1008-02', null, 3],
  ['2027-10-20 14:00', 10, '入庫', 120, '採購單 PO-2710-05', null, 2],
  ['2027-10-29 16:00', 3, '盤點調整', -1, 'IC-2710-01 盤點調整', 1, 1],
  ['2027-11-12 09:30', 7, '出庫', -10, '領料單 PR-1112-01', null, 2]
];
function countsL1() { return [mkCount(1, 'IC-2710-01', '十月抽盤（板材與五金）', '抽盤', 3, '2027-10-29 08:30', '2027-10-29 16:00')]; }
function linesL1() { return [mkLine(1, 1, 3, 30, null, 3, '2027-10-29 09:10'), mkLine(2, 1, 6, 35, null, 3, '2027-10-29 09:30')]; }

function level1Data() { return makeDb(BOOKS_L1, countsL1(), linesL1(), LATER_L1); }

const BOOKS_L2 = Object.assign({}, BOOKS_L1, { 4: 118, 7: 18 });
const LATER_L2 = LATER_L1.concat([
  ['2027-11-30 16:10', 4, '盤點調整', -2, 'IC-2711-01 盤點調整', 2, 1],
  ['2027-11-30 16:10', 7, '盤點調整', 3, 'IC-2711-01 盤點調整', 2, 1],
  ['2027-12-03 13:20', 10, '出庫', -80, '出貨單 SO-1203-02', null, 2],
  ['2027-12-10 09:00', 10, '入庫', 80, '採購單 PO-2712-01', null, 3]
]);
function countsL2() {
  return countsL1().concat([
    mkCount(2, 'IC-2711-01', '十一月月底抽盤', '抽盤', 2, '2027-11-30 10:05', '2027-11-30 16:10'),
    mkCount(3, 'IC-2712-01', '十二月抽盤（五金與包材）', '抽盤', 2, '2027-12-15 08:30', null)
  ]);
}
function linesL2() {
  return linesL1().concat([
    mkLine(3, 2, 2, 46, null, 2, '2027-11-30 10:40'),
    mkLine(4, 2, 4, 118, null, 2, '2027-11-30 10:55'),
    mkLine(5, 2, 7, 18, null, 2, '2027-11-30 11:20'),
    mkLine(6, 2, 11, 12, null, 2, '2027-11-30 11:30'),
    mkLine(7, 3, 6, null),
    mkLine(8, 3, 9, null),
    mkLine(9, 3, 10, 240, null, 2, '2027-12-15 10:20')
  ]);
}
function level2Data() { return makeDb(BOOKS_L2, countsL2(), linesL2(), LATER_L2); }

function shelfFrom(db, overrides) {
  const s = {};
  db.items.forEach(i => { s[i.location] = i.book_qty; });
  return Object.assign(s, overrides || {});
}

/* ---------- 4. game state and clock ---------- */

let gameState = null;
let RUN_SEQ = 0;

function newState(mode) {
  return {
    mode, runId: ++RUN_SEQ, db: null, clock: 0, loginId: PLAYER_ID,
    player: { x: 3, y: 2, dir: 'down' },
    npcs: {}, flags: {}, trail: [], predictions: {}, cr: null, notes: {}, shelf: {},
    visited: {}, done: false
  };
}
function advance(st, minutes) { st.clock += minutes * 60000; }
function nowStr(st) { return fmtDT(st.clock); }
function addTrail(st, t) { st.trail.push(fmtHM(st.clock) + '　' + t); }
function npcDef(id, name, color, x, y, visible) { return { id, name, color, x, y, visible: visible !== false }; }

/* ---------- 5. level controllers ---------- */

const MIDTERM_PROMPTS = [
  { h: '觀察', q: '倉管員與課長實際做了哪些事情？系統負責哪些功能、存取與檢核？哪些操作只有主管能做？請把下面的操作紀錄分成「人工工作」與「系統功能」。' },
  { h: '推論', q: '建立盤點單、輸入實盤、出庫、結案各影響哪些狀態與紀錄？盤差是存下來的，還是算出來的？' },
  { h: '實際系統待查證', q: '如何在真實倉庫盤點系統及 SQLite 驗證上述推論？可能對應哪些使用案例、活動圖判斷點與資料表關聯？' }
];

function countsTableHtml(db) {
  return '<table class="data"><caption>模擬資料：盤點單（counts）</caption><thead><tr><th>單號</th><th>名稱</th><th>類別</th><th>盤點人員</th><th>狀態</th><th>結案人／時間</th></tr></thead><tbody>' +
    db.counts.map(c => '<tr><td>' + esc(c.count_no) + '</td><td>' + esc(c.name) + '</td><td>' + c.count_type + '</td><td>' + esc(userName(db, c.counter_id)) +
      '</td><td>' + c.status + '</td><td>' + (c.closed_at ? esc(userName(db, c.closed_by)) + '　' + esc(c.closed_at) : '') + '</td></tr>').join('') + '</tbody></table>';
}
function movesTableHtml(db, filter, caption) {
  const rows = listMoves(db, filter);
  return '<table class="data">' + (caption ? '<caption>' + esc(caption) + '</caption>' : '') + '<thead><tr><th>時間</th><th>料號</th><th>品名</th><th>類別</th><th>數量變化</th><th>說明</th><th>登錄人</th></tr></thead><tbody>' +
    (rows.length ? rows.map(m => '<tr><td>' + esc(m.created_at) + '</td><td>' + esc(m.item_no) + '</td><td>' + esc(m.item_name) + '</td><td>' + m.move_type +
      '</td><td>' + signed(m.qty_change) + '</td><td>' + esc(m.note || '') + '</td><td>' + esc(m.created_by_name) + '</td></tr>').join('') : '<tr><td colspan="7">（沒有紀錄）</td></tr>') +
    '</tbody></table>';
}

function midtermSettlementHtml(st, topHtml, dataHtml) {
  return '<div class="settle">' + (topHtml || '') +
    '<div class="prompts">' + MIDTERM_PROMPTS.map((p, i) => '<section><h3>' + (i + 1) + '. ' + p.h + '</h3><p>' + p.q + '</p>' +
      (i === 0 ? '<ol class="trail">' + st.trail.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' : '') +
      (i === 1 ? (dataHtml || '') : '') + '</section>').join('') + '</div>' +
    '<p class="boundary">遊戲畫面與上面的資料是模擬教材的觀察，不是原系統資料庫的證據。正式分析請以實際系統為準。</p></div>';
}

function predictionListHtml(st, qs, results) {
  return '<h3>你的預測與系統結果</h3><ol class="pred">' + qs.map(q => '<li>' + esc(q.q) + '<br>你的預測：' + esc(st.predictions[q.id] || '（未作答）') +
    '　系統結果：' + esc(results[q.id]) + '</li>').join('') + '</ol>';
}

// Manager walks between the desk (4,1) and the computer (2,1)
function mgrGo(st, where, then) {
  const n = st.npcs.mgr;
  st.flags.mgrPos = 'moving';
  const path = where === 'pc' ? [[n.x, 2], [2, 2], [2, 1]] : [[n.x, 2], [4, 2], [4, 1]];
  walkNpc('mgr', path, () => { st.flags.mgrPos = where; render(); if (then) whenIdle(then); });
}

// Shared shelf count dialog: count the shelf and write the number in the notebook
function countShelf(st, loc, qty, lines, after) {
  const it = itemAtLoc(st.db, loc);
  showTalk(lines || [{ who: '旁白', text: '你逐一清點儲位 ' + loc + ' 的' + it.name + '：共 ' + qty + ' ' + it.unit + '。' }], [{
    label: '記在盤點筆記：' + it.name + ' ' + qty + ' ' + it.unit,
    run: () => {
      st.notes[loc] = { qty, at: fmtHM(st.clock) };
      advance(st, 3);
      Sound.sfx('tick');
      addTrail(st, '到貨架清點 ' + loc + ' ' + it.name + '，筆記記下 ' + qty + ' ' + it.unit);
      log('盤點筆記：' + loc + ' ' + it.name + ' ' + qty + ' ' + it.unit + '（場景紀錄，不是系統資料）', 'scene');
      if (after) after();
    }
  }]);
}

function noteMismatch(st, lineId, input) {
  const l = st.db.count_lines.find(x => x.id === lineId);
  const it = itemById(st.db, l.item_id);
  const n = st.notes[it.location];
  if (!n) return { block: '你還沒到 ' + it.location + ' 貨架清點' + it.name + '。先到現場數過、記在盤點筆記，再回來輸入。' };
  if (Number(text(input.counted_qty)) !== n.qty) return { warn: ['你輸入的是 ' + text(input.counted_qty) + '，盤點筆記上記的是 ' + n.qty + '。'] };
  return {};
}

/* Level 1: monthly spot count, normal flow */
function makeLevel1() {
  const COUNT_ITEMS = [2, 4, 7, 11];
  const HINGE = 7;
  const myCount = st => st.flags.countId ? countById(st.db, st.flags.countId) : null;
  const lineOf = (st, itemId) => { const c = myCount(st); return c ? st.db.count_lines.find(l => l.count_id === c.id && l.item_id === itemId) : null; };
  const countedN = st => { const c = myCount(st); return c ? countSummary(st.db, c).counted_count : 0; };
  const notesN = st => COUNT_ITEMS.filter(id => st.notes[itemById(st.db, id).location]).length;
  const hingeOk = st => { const l = lineOf(st, HINGE); return !!l && l.counted_qty === st.shelf['C-02']; };
  const bigDiff = st => { const c = myCount(st); return c ? countLines(st.db, c).find(l => l.diff !== null && Math.abs(l.diff) >= 10) : null; };

  function predictionQuestions(st) {
    const lines = countLines(st.db, myCount(st));
    const n = lines.filter(l => l.diff !== 0).length;
    const tube = lines.find(l => l.item_id === 4);
    const opts = (arr, ans) => arr.indexOf(ans) >= 0 ? arr : arr.concat([ans]);
    return [
      {
        id: 'items', q: '① 結案後，會有幾個料號的帳面數量被調整？', options: opts(['0 個', '1 個', '2 個', '4 個'], n + ' 個'), answer: n + ' 個',
        explain: '結案時逐項比對「實盤－當下帳面」，盤差不為 0 的才寫一筆盤點調整、改帳面；盤差 0 的項目不會產生異動。'
      },
      {
        id: 'tube', q: '② 方管 ST-2201 結案後的帳面數量是多少？', options: opts([String(tube.book), String(tube.counted_qty), String(tube.book + (tube.book - tube.counted_qty))].filter((v, i, a) => a.indexOf(v) === i), String(tube.counted_qty)),
        answer: String(tube.counted_qty),
        explain: '結案寫入的盤點調整等於盤差（' + signed(tube.diff) + '），帳面從 ' + tube.book + ' 變成實盤數量 ' + tube.counted_qty + '。'
      },
      {
        id: 'moves', q: '③ 庫存異動會多出幾筆「盤點調整」？', options: opts(['0 筆', '1 筆', '2 筆', '4 筆'], n + ' 筆'), answer: n + ' 筆',
        explain: '每個有盤差的料號一筆，登錄人是按下結案的課長。帳面數量只會透過異動改變。'
      }
    ];
  }

  function openMgrPc(st, tab) {
    st.loginId = MGR_ID;
    ui.compTab = tab;
    ui.countId = tab === 'counts' ? st.flags.countId : null;
    if (tab === 'new' && !ui.newDraft.prefilled) {
      ui.newDraft = { name: '十一月月底抽盤', count_type: '抽盤', counter_id: String(PLAYER_ID), item_ids: COUNT_ITEMS.slice(), prefilled: true };
    }
    openComputerModal('倉庫電腦（課長登入中）', () => { st.loginId = PLAYER_ID; sessionEnd(st); });
  }

  function sessionEnd(st) {
    const f = st.flags;
    if (f.created && !f.mgrBackAfterCreate) {
      f.mgrBackAfterCreate = true;
      mgrGo(st, 'desk', () => log('課長回座位了。現在用你自己的身分打開電腦，看看盤點單明細。', 'coach'));
    } else if (f.earlyTried && !f.mgrBackAfterEarly) {
      f.mgrBackAfterEarly = true;
      log('課長：「還有一項沒盤？好，全部盤完再叫我。」', 'scene');
      mgrGo(st, 'desk');
    } else if (f.closed && !f.mgrBackAfterClose) {
      f.mgrBackAfterClose = true;
      log('結案了。用你自己的身分打開電腦，到「庫存異動」看看多了哪些紀錄；看完關閉畫面就會進入結算。', 'coach');
      mgrGo(st, 'desk');
    }
  }

  function finish(st) {
    if (st.done) return;
    st.done = true;
    const c = myCount(st);
    const lines = countLines(st.db, c);
    const qs = predictionQuestions(st);
    const n = lines.filter(l => l.diff !== 0).length;
    const tube = lines.find(l => l.item_id === 4);
    const top = '<p class="ok">通關：盤點單 ' + esc(c.count_no) + ' 已結案，調整 ' + n + ' 個料號的帳面數量。</p>' +
      '<table class="data compare"><caption>盤點結果（模擬資料）</caption><thead><tr><th>料號</th><th>品名</th><th>結案前帳面</th><th>實盤</th><th>盤差（盤點調整）</th><th>結案後帳面</th></tr></thead><tbody>' +
      lines.map(l => '<tr><td>' + l.item_no + '</td><td>' + esc(l.name) + '</td><td>' + l.book + '</td><td>' + l.counted_qty + '</td><td>' + signed(l.diff) + '</td><td>' + itemById(st.db, l.item_id).book_qty + '</td></tr>').join('') +
      '</tbody></table>' + predictionListHtml(st, qs, { items: n + ' 個', tube: String(itemById(st.db, 4).book_qty), moves: listMoves(st.db, { move_type: '盤點調整' }).filter(m => m.count_id === c.id).length + ' 筆' }) +
      '<p class="hint">方管結案前帳面 ' + tube.book + '、實盤 ' + tube.counted_qty + '。鉸鏈那一項，前一次輸入的數字已經被覆蓋，系統裡查不到。</p>';
    const data = countsTableHtml(st.db) + movesTableHtml(st.db, { move_type: '盤點調整' }, '模擬資料：盤點調整的異動紀錄');
    whenIdle(() => openSettlement('第一關結算：觀察—推論—實際系統待查證', midtermSettlementHtml(st, top, data), [
      { label: '下一關：數完之後，貨又出去了', run: () => startMode('level2') },
      { label: '重新開始本關', run: () => startMode('level1') },
      { label: '回到標題', run: showTitle }
    ]));
  }

  return {
    id: 'level1', title: '第一關　月底抽盤', role: '倉管員 吳宜蓁',
    setup(st) {
      st.db = level1Data();
      st.clock = clockAt(2027, 11, 30, 9, 30);
      st.player = { x: 3, y: 3, dir: 'up' };
      st.shelf = shelfFrom(st.db, { 'B-01': 118, 'C-02': 18 });
      st.flags = { ringing: false, called: false, created: false, countId: null, viewedAsStaff: false, earlyDue: false, earlyTried: false, predicted: false, closed: false, viewedMoves: false, hingeSaved: 0, hingeRecounted: false, mgrPos: 'out' };
      st.npcs = { mgr: npcDef('mgr', '陳振宇課長', '#0f766e', 6, 2, false) };
    },
    onStart(st) {
      showTalk([
        { who: '旁白', text: '11 月 30 日上午 9:30。你是資材倉庫的倉管員吳宜蓁，在倉庫辦公室。' },
        { who: '旁白', text: '方向鍵或 WASD 移動；面向電腦、分機、貨架、出貨點交台或人物按 E 互動。對話與表單可用滑鼠或 Tab、Enter 操作。' }
      ], [], { closeLabel: '開始' });
      whenIdle(() => {
        st.flags.ringing = true;
        Sound.sfx('ring');
        log('分機響了，是課長打來的。走到分機旁按 E 接聽。', 'scene');
        render();
      });
    },
    objective(st) {
      const f = st.flags;
      return {
        title: '十一月月底抽盤', showAll: true, items: [
          { text: '接聽課長的分機', done: f.called },
          { text: '看課長在電腦建立盤點單', done: f.created },
          { text: '用你自己的身分打開電腦，查看盤點單明細', done: f.viewedAsStaff },
          { text: '到 4 個儲位的貨架清點，記在盤點筆記（' + notesN(st) + '/4）', done: notesN(st) === 4 },
          { text: '回電腦逐項輸入實盤數量（' + countedN(st) + '/4）', done: countedN(st) === 4 },
          { text: '課長想先結案：看看系統怎麼回應', done: f.earlyTried },
          { text: '盤差異常的項目：回貨架再數一次，重新輸入', done: hingeOk(st) },
          { text: '請課長結案（結案前先預測）', done: f.closed },
          { text: '用自己的身分到「庫存異動」查看盤點調整', done: f.viewedMoves }
        ]
      };
    },
    npcAttention(st, id) {
      const f = st.flags;
      if (id !== 'mgr' || f.mgrPos === 'moving') return false;
      if (!f.created) return f.mgrPos === 'pc';
      if (f.earlyDue && !f.earlyTried) return f.mgrPos === 'pc';
      return countedN(st) === 4 && f.earlyTried && !f.closed && !bigDiff(st);
    },
    onPhoneObject(st) {
      const f = st.flags;
      if (!f.ringing) return false;
      showTalk([
        { who: '陳振宇', text: '宜蓁，我是陳課長。月底了，幫我抽盤四個料號：A-02 塑合板、B-01 方管、C-02 鉸鏈、D-02 氣泡布。' },
        { who: '陳振宇', text: '我現在回辦公室開盤點單，盤點人員指派給你。' }
      ], [{
        label: '好，我知道了',
        run: () => {
          f.ringing = false; f.called = true;
          advance(st, 2);
          addTrail(st, '接聽課長分機：交辦抽盤 4 個料號（口頭）');
          showNpc('mgr', 6, 2);
          mgrGo(st, 'pc', () => log('課長走到電腦旁了。去和課長說話。', 'scene'));
        }
      }], { title: '分機' });
      return true;
    },
    onTalk(st, id) {
      const f = st.flags;
      if (id !== 'mgr') return;
      if (f.mgrPos === 'moving') return showTalk([{ who: '陳振宇', text: '（正在走過來）' }]);
      if (!f.created) {
        return showTalk([{ who: '陳振宇', text: '我來開盤點單：抽盤，四個料號，指派給你。你在旁邊看。' }],
          [{ label: '看課長在電腦建立盤點單', run: () => openMgrPc(st, 'new') }]);
      }
      if (f.earlyDue && !f.earlyTried) {
        return showTalk([{ who: '陳振宇', text: '盤得差不多了吧？我先把這張結案。' }],
          [{ label: '看課長按結案', run: () => openMgrPc(st, 'counts') }]);
      }
      if (f.closed) return showTalk([{ who: '陳振宇', text: '結案了，帳面已經照盤點結果調整。' }]);
      if (countedN(st) === 4 && f.earlyTried) {
        const big = bigDiff(st);
        if (big) return showTalk([{ who: '陳振宇', text: big.name + '盤差 ' + signed(big.diff) + '？差這麼多，先回 ' + big.location + ' 貨架再確認一次。' }]);
        const go = () => {
          if (f.mgrPos === 'pc') openMgrPc(st, 'counts');
          else mgrGo(st, 'pc', () => openMgrPc(st, 'counts'));
        };
        if (f.predicted) return showTalk([{ who: '陳振宇', text: '好，我來結案。' }], [{ label: '請課長結案', run: go }]);
        return showTalk([{ who: '陳振宇', text: '都盤完了？我來結案。' }], [{
          label: '請課長結案（結案前先預測）',
          run: () => openQuiz('結案前先預測', '課長按下結案之前，先預測三件事。選完會看到說明，可以改選，不計分。', predictionQuestions(st), st.predictions, '繼續：請課長結案', () => {
            f.predicted = true;
            addTrail(st, '結案前預測：' + Object.keys(st.predictions).map(k => st.predictions[k]).join('／'));
            go();
          })
        }]);
      }
      showTalk([{ who: '陳振宇', text: '盤點單在電腦上，你是盤點人員。盤完再叫我。' }]);
    },
    onShelf(st, loc) {
      const f = st.flags;
      const it = itemAtLoc(st.db, loc);
      if (!it || !COUNT_ITEMS.includes(it.id)) return null;
      if (!f.created) return showTalk([{ kind: 'coach', text: '盤點單還沒建立。先接課長的電話、等盤點單建好，再開始清點。' }]);
      if (it.id === HINGE) {
        if (!st.notes[loc]) {
          return countShelf(st, loc, 81, [{ who: '旁白', text: '你很快數過一遍儲位 C-02 的隱藏鉸鏈，在筆記上寫下「81」。（寫得有點急，字跡潦草）' }]);
        }
        if (f.hingeSaved && !f.hingeRecounted) {
          return countShelf(st, loc, st.shelf[loc], [{ who: '旁白', text: '你放慢速度，一個一個再數一次：共 ' + st.shelf[loc] + ' 個。剛才把 18 寫成 81 了。' }], () => { f.hingeRecounted = true; });
        }
        return showTalk([{ who: '旁白', text: '盤點筆記：隱藏鉸鏈 ' + st.notes[loc].qty + ' 個。' }]);
      }
      if (st.notes[loc]) return showTalk([{ who: '旁白', text: '盤點筆記：' + it.name + ' ' + st.notes[loc].qty + ' ' + it.unit + '（已清點）。' }]);
      return countShelf(st, loc, st.shelf[loc]);
    },
    computerTabs(st) { return stdTabs(st); },
    computerOptions(st) {
      return st.loginId === MGR_ID ? { banner: '目前是課長陳振宇的登入畫面（主管身分）。你在旁邊看課長操作：畫面上的按鈕代表課長按下的動作。' } : {};
    },
    onSystem(st, evt) {
      const f = st.flags;
      switch (evt.type) {
        case 'openTab':
          if (evt.tab === 'moves' && f.closed && st.loginId === PLAYER_ID && !f.viewedMoves) {
            f.viewedMoves = true;
            addTrail(st, '用倉管員身分查看庫存異動：多了盤點調整');
            return { coach: '結案產生的「盤點調整」在這裡：數量變化等於盤差，登錄人是按下結案的課長。異動紀錄沒有修改或刪除的按鈕。' };
          }
          return {};
        case 'viewCount':
          if (f.created && evt.countId === f.countId && st.loginId === PLAYER_ID && !f.viewedAsStaff) {
            f.viewedAsStaff = true;
            addTrail(st, '用倉管員身分查看盤點單明細');
            return { coach: '你是倉管員：畫面上沒有「建立盤點單」分頁，也沒有「結案」按鈕；但你是這張單的盤點人員，所以可以輸入實盤數量。' };
          }
          return {};
        case 'beforeCreate': {
          const i = evt.input;
          const ids = (i.item_ids || []).map(Number).sort((a, b) => a - b).join();
          if (i.count_type !== '抽盤' || Number(i.counter_id) !== PLAYER_ID || ids !== COUNT_ITEMS.join()) {
            return { block: '課長交辦的是：抽盤、盤點人員吳宜蓁、四個料號（A-02 塑合板、B-01 方管、C-02 鉸鏈、D-02 氣泡布）。請照交辦內容填寫。' };
          }
          return {};
        }
        case 'create':
          if (evt.result.ok) {
            f.created = true; f.countId = evt.result.count.id;
            addTrail(st, '課長建立盤點單 ' + evt.result.count.count_no + '（系統：狀態盤點中，進度已盤 0／共 4 項）');
            return { coach: '盤點單建好了：狀態「盤點中」、進度「已盤 0／共 4 項」。盤點單和料號是分開的資料，一張單有 4 個盤點項目。關閉畫面讓課長回座位。' };
          }
          return {};
        case 'beforeEnter': {
          if (st.loginId === MGR_ID) return { block: '這是課長的登入畫面。盤點數量請用你自己的身分輸入。' };
          const line = st.db.count_lines.find(l => l.id === evt.lineId);
          if (line.counted_qty === null && countedN(st) === 3 && !f.earlyTried) {
            return { block: '課長剛好走過來，想先結案。先關閉電腦畫面，和課長談談。' };
          }
          return noteMismatch(st, evt.lineId, evt.input);
        }
        case 'enter': {
          const r = evt.result;
          if (!r.ok) { addTrail(st, '輸入實盤失敗：' + r.error); return {}; }
          const it = itemById(st.db, r.line.item_id);
          const wasSaved = it.id === HINGE && f.hingeSaved > 0;
          if (it.id === HINGE) f.hingeSaved++;
          addTrail(st, '輸入 ' + it.item_no + ' 實盤 ' + r.line.counted_qty + '（系統計算盤差 ' + signed(r.line.counted_qty - it.book_qty) + '）');
          let coach = '';
          if (it.id === HINGE && Math.abs(r.line.counted_qty - it.book_qty) >= 10) coach = '盤差 ' + signed(r.line.counted_qty - it.book_qty) + '？差這麼多，可能是筆記記錯了。回 C-02 貨架再數一次。';
          else if (wasSaved) coach = '系統直接用新的數字蓋掉前一次的輸入，盤點人與盤點時間也一起更新；畫面上看不到前一次的數字。';
          if (countedN(st) === 3 && !f.earlyDue) {
            f.earlyDue = true;
            whenIdle(() => mgrGo(st, 'pc', () => log('課長走到電腦旁：「盤得差不多了吧？我先結案。」去和課長說話。', 'scene')));
          }
          return coach ? { coach } : {};
        }
        case 'close': {
          const r = evt.result;
          if (!r.ok) {
            addTrail(st, '課長按結案，系統拒絕：' + r.error);
            if (r.error.indexOf('沒有盤點') >= 0) { f.earlyTried = true; return { coach: '系統擋下了：整張盤點單要全部盤完才能結案，沒有產生任何異動。關閉畫面，把剩下的盤完。' }; }
            return {};
          }
          f.closed = true;
          addTrail(st, '課長結案：系統依盤差寫入 ' + r.adjusted + ' 筆盤點調整，改帳面');
          return { coach: '結案完成，這張單不能再輸入。關閉畫面，用你自己的身分到「庫存異動」查看。' };
        }
        case 'beforeMove':
          return { block: '這一關不需要登錄入庫或出庫。' };
      }
      return {};
    },
    afterAction(st) {
      if (!st.done && st.flags.viewedMoves) finish(st);
    }
  };
}

/* Level 2: stock goes out while the count is still open */
function makeLevel2() {
  const COUNT_ID = 3;
  const BOX = 10;
  const BOX_LINE = 9;
  const OTHER_LINES = [7, 8];
  const count = st => countById(st.db, COUNT_ID);
  const boxLine = st => st.db.count_lines.find(l => l.id === BOX_LINE);
  const othersDone = st => OTHER_LINES.filter(id => st.db.count_lines.find(l => l.id === id).counted_qty !== null).length;
  const ready = st => st.flags.moved && st.flags.handed && othersDone(st) === 2;
  const boxOut = st => listMoves(st.db, { item_id: BOX, move_type: '出庫' }).find(m => m.created_at >= '2027-12-15 14:00') || null;

  function predictionQuestions() {
    return [
      {
        id: 'now', q: '① 紙箱 PK-4401 這一項，現在的帳面數量與盤差是多少？',
        options: ['帳面 240，盤差 0', '帳面 180，盤差 +60', '帳面 180，盤差 0'], answer: '帳面 180，盤差 +60',
        explain: '盤點中的單，帳面讀的是料號「當下」的帳面。下午出庫 60 個後帳面變成 180，上午記下的實盤 240 沒有跟著減少，所以盤差變成 +60。'
      },
      {
        id: 'close', q: '② 如果現在直接結案，紙箱的帳面會變成多少？',
        options: ['180', '240', '120'], answer: '240',
        explain: '結案依「實盤－當下帳面」寫入盤點調整：+60，帳面回到 240。剛出庫的 60 個等於被加回帳面。'
      },
      {
        id: 'undo', q: '③ 結案產生的那筆「盤點調整」，之後能不能修改或刪除？',
        options: ['可以刪除', '可以修改數量', '不能修改，也不能刪除'], answer: '不能修改，也不能刪除',
        explain: '異動紀錄沒有修改或刪除的功能；帳面只能透過新的異動改變。'
      }
    ];
  }

  function openMgrPc(st) {
    st.loginId = MGR_ID;
    ui.compTab = 'counts';
    ui.countId = COUNT_ID;
    openComputerModal('倉庫電腦（課長登入中）', () => {
      st.loginId = PLAYER_ID;
      if (st.flags.closed) finish(st);
    });
  }
  function closeByMgr(st) {
    if (st.flags.mgrPos === 'pc') openMgrPc(st);
    else mgrGo(st, 'pc', () => openMgrPc(st));
  }

  function decide(st) {
    const f = st.flags;
    showTalk([
      { who: '陳振宇', text: '紙箱這一項你要怎麼處理？' },
      { kind: 'coach', text: '上午記下的 240 是出貨前的數字。系統不會提醒你，現況也沒有回復盤點調整的功能。' }
    ], [
      { label: '先回 D-01 重新清點紙箱', run: () => { f.decided = 'recount'; addTrail(st, '決定：回貨架重新清點紙箱'); log('課長：「好，重盤完、重新輸入後再叫我。」', 'scene'); } },
      { label: '不重盤，直接請課長結案', run: () => { f.decided = 'direct'; addTrail(st, '決定：不重盤，直接請課長結案'); closeByMgr(st); } }
    ]);
  }

  function finish(st) {
    if (st.done) return;
    st.done = true;
    const c = count(st);
    const out = boxOut(st);
    const adj = st.db.stock_moves.find(m => m.count_id === COUNT_ID && m.item_id === BOX && m.move_type === '盤點調整');
    const bl = boxLine(st);
    const book = itemById(st.db, BOX).book_qty;
    const actual = st.shelf['D-01'];
    const qs = predictionQuestions();
    const results = { now: '帳面 ' + (240 + out.qty_change) + '，盤差 ' + signed(240 - (240 + out.qty_change)), close: '240', undo: '不能修改，也不能刪除' };
    const branch = st.flags.decided === 'recount' && !adj
      ? '<p class="ok">重盤後紙箱的實盤改成 ' + bl.counted_qty + '，盤差 0，結案沒有產生紙箱的盤點調整，帳面與貨架一致。</p>'
      : '<p class="err-note">帳面比貨架多出 ' + (book - actual) + ' 個：結案把剛出庫的數量加回帳面了。現況系統沒有回復這筆盤點調整的功能，可以重新開始本關，試另一個做法。</p>';
    const top = branch +
      '<table class="data compare"><caption>紙箱 PK-4401 的三個時點（模擬資料）</caption><thead><tr><th>時點</th><th>系統記錄的實盤</th><th>帳面</th><th>盤差</th><th>貨架上的實際數量</th></tr></thead><tbody>' +
      '<tr><th>上午 10:20 實盤記錄</th><td>240</td><td>240</td><td>0</td><td>240</td></tr>' +
      '<tr><th>下午 ' + esc(out.created_at.slice(11)) + ' 出庫 ' + signed(out.qty_change) + '</th><td>240</td><td>' + (240 + out.qty_change) + '</td><td>' + signed(240 - (240 + out.qty_change)) + '</td><td>' + (240 + out.qty_change) + '</td></tr>' +
      '<tr><th>結案 ' + esc((c.closed_at || '').slice(11)) + '</th><td>' + bl.counted_qty + '</td><td>' + book + '</td><td>' + (adj ? '盤點調整 ' + signed(adj.qty_change) : '無盤點調整') + '</td><td>' + actual + '</td></tr>' +
      '</tbody></table>' +
      '<table class="data compare"><caption>「貨架上的實際數量」與「系統記錄」</caption><tbody>' +
      '<tr><th>貨架上的實際數量</th><td>' + actual + ' 個</td></tr><tr><th>系統帳面（結案後）</th><td>' + book + ' 個</td></tr></tbody></table>' +
      predictionListHtml(st, qs, results) +
      '<p class="boundary">這一關只做現況理解：呈現系統現在怎麼運作，不討論應該怎麼改。' + ((typeof FinalDemo !== 'undefined' && FinalDemo && FinalDemo.l2Note) || '') + '</p>';
    const data = movesTableHtml(st.db, { item_id: BOX }, '模擬資料：紙箱 PK-4401 的庫存異動');
    whenIdle(() => openSettlement('第二關結算：貨架上的數量與系統記錄', midtermSettlementHtml(st, top, data), [
      { label: '重新開始本關', run: () => startMode('level2') },
      { label: '回到第一關', run: () => startMode('level1') },
      { label: '回到標題', run: showTitle }
    ]));
  }

  return {
    id: 'level2', title: '第二關　數完之後，貨又出去了', role: '倉管員 吳宜蓁',
    setup(st) {
      st.db = level2Data();
      st.clock = clockAt(2027, 12, 15, 14, 0);
      st.player = { x: 3, y: 3, dir: 'up' };
      st.shelf = shelfFrom(st.db);
      st.notes = { 'D-01': { qty: 240, at: '10:20' } };
      st.flags = { ringing: false, called: false, rejected: false, confirmed: false, moved: false, handed: false, predicted: false, decided: '', recounted: false, closed: false, mgrPos: 'desk' };
      st.npcs = {
        mgr: npcDef('mgr', '陳振宇課長', '#0f766e', 4, 1),
        ship: npcDef('ship', '出貨組 李冠廷', '#7c3aed', 17, 6)
      };
    },
    onStart(st) {
      showTalk([
        { who: '旁白', text: '12 月 15 日下午 2:00。你是倉管員吳宜蓁。盤點單 IC-2712-01 還在盤點中：紙箱上午 10:20 已經盤完（240 個，和帳面相同），另外兩項還沒盤。' }
      ], [], { closeLabel: '開始' });
      whenIdle(() => {
        st.flags.ringing = true;
        Sound.sfx('ring');
        log('分機響了，是出貨組打來的。走到分機旁按 E 接聽。', 'scene');
        render();
      });
    },
    objective(st) {
      const f = st.flags;
      const items = [
        { text: '接聽出貨組的分機', done: f.called },
        { text: '在電腦「庫存異動」登錄紙箱出庫', done: f.moved },
        { text: '到出貨區點交紙箱給出貨同仁', done: f.handed },
        { text: '到貨架清點剩下的 2 個料號，回電腦輸入（' + othersDone(st) + '/2）', done: othersDone(st) === 2 },
        { text: '請課長結案；結案前先預測三件事', done: f.predicted }
      ];
      if (f.decided === 'recount') items.push({ text: '回 D-01 重新清點紙箱，用現在的數量重新輸入', done: boxLine(st).counted_qty === st.shelf['D-01'] });
      items.push({ text: '課長結案', done: f.closed });
      return { title: '盤點中的出貨', showAll: true, items };
    },
    npcAttention(st, id) {
      const f = st.flags;
      if (id === 'ship') return st.npcs.ship.visible && ((f.rejected && !f.confirmed) || (f.moved && !f.handed));
      if (id === 'mgr') return f.mgrPos !== 'moving' && ready(st) && !f.closed && (!f.predicted || f.decided !== 'recount' || boxLine(st).counted_qty === st.shelf['D-01']);
      return false;
    },
    onPhoneObject(st) {
      const f = st.flags;
      if (!f.ringing) return false;
      showTalk([
        { who: '李冠廷', text: '宜蓁，我出貨組李冠廷。客戶要紙箱 PK-4401，出貨單上寫兩百六十個。' },
        { who: '李冠廷', text: '麻煩在系統登錄出庫，我在出貨區等你點交。' }
      ], [{
        label: '好，我來登錄',
        run: () => { f.ringing = false; f.called = true; advance(st, 1); addTrail(st, '接聽出貨組分機：紙箱出庫 260 個（口頭）'); }
      }], { title: '分機' });
      return true;
    },
    onTalk(st, id) {
      const f = st.flags;
      if (id === 'ship') {
        if (!f.called) return showTalk([{ who: '李冠廷', text: '我等一下打分機給你。' }]);
        if (!f.moved && !f.confirmed) {
          return showTalk([
            { who: '李冠廷', text: '（看了一眼出貨單）……啊，抱歉，電話裡說錯了。是 60 個，260 是整張訂單的總件數。' },
            { kind: 'memo', text: '出貨單 SO-1215-07：PK-4401 紙箱 60 個' }
          ], [{ label: '知道了，回去登錄 60 個', run: () => { f.confirmed = true; addTrail(st, '到出貨區確認出貨單：紙箱 60 個'); } }]);
        }
        if (!f.moved) return showTalk([{ who: '李冠廷', text: '系統登錄好出庫，我再來點交。' }, { kind: 'memo', text: '出貨單 SO-1215-07：PK-4401 紙箱 60 個' }]);
        if (!f.handed) return this.onShip(st);
        return showTalk([{ who: '李冠廷', text: '謝謝，我拿去裝車了。' }]);
      }
      if (id === 'mgr') {
        if (f.mgrPos === 'moving') return showTalk([{ who: '陳振宇', text: '（正在走過去）' }]);
        if (f.closed) return showTalk([{ who: '陳振宇', text: '這張結案了。' }]);
        if (!ready(st)) return showTalk([{ who: '陳振宇', text: '盤點單 IC-2712-01 還有事情沒做完，盤完再叫我結案。' }]);
        if (!f.predicted) {
          return showTalk([{ who: '陳振宇', text: '都盤完了？那我來結案。' }], [{
            label: '結案前先預測',
            run: () => openQuiz('結案前先預測', '課長按下結案之前，先預測三件事。選完會看到說明，可以改選，不計分。', predictionQuestions(), st.predictions, '繼續', () => {
              f.predicted = true;
              addTrail(st, '結案前預測：' + Object.keys(st.predictions).map(k => st.predictions[k]).join('／'));
              decide(st);
            })
          }]);
        }
        if (f.decided === 'recount' && boxLine(st).counted_qty !== st.shelf['D-01']) {
          return showTalk([{ who: '陳振宇', text: '紙箱重盤完、重新輸入後再叫我。' }], [{ label: '不重盤了，直接請課長結案', run: () => { f.decided = 'direct'; addTrail(st, '改變決定：直接請課長結案'); closeByMgr(st); } }]);
        }
        if (!f.decided) return decide(st);
        return showTalk([{ who: '陳振宇', text: '好，我來結案。' }], [{ label: '請課長結案', run: () => closeByMgr(st) }]);
      }
    },
    onShip(st) {
      const f = st.flags;
      if (!st.npcs.ship.visible || f.handed) return showTalk([{ who: '旁白', text: '出貨點交台，目前沒有待點交的出貨單。' }]);
      if (!f.moved) return showTalk([{ who: '李冠廷', text: '系統還沒登錄出庫喔，登錄好再點交。' }]);
      showTalk([{ who: '李冠廷', text: '出貨單 SO-1215-07，紙箱 60 個，我們一起點一下。' }], [{
        label: '點交紙箱 60 個',
        run: () => {
          f.handed = true;
          st.shelf['D-01'] -= 60;
          advance(st, 5);
          Sound.sfx('tick');
          addTrail(st, '在出貨區點交紙箱 60 個給出貨組（實體點交）');
          log('紙箱 60 個點交完成。D-01 貨架上的紙箱少了 60 個。', 'scene');
          walkNpc('ship', [[17, 7], [10, 7], [10, 8]], () => hideNpc('ship'));
        }
      }]);
    },
    onShelf(st, loc) {
      const f = st.flags;
      const it = itemAtLoc(st.db, loc);
      if (!it) return null;
      if (it.id === BOX) {
        if (f.decided === 'recount' && !f.recounted) {
          return countShelf(st, loc, st.shelf[loc], [{ who: '旁白', text: '你重新清點儲位 D-01 的紙箱：現在是 ' + st.shelf[loc] + ' 個。' }], () => { f.recounted = true; });
        }
        return showTalk([{ who: '旁白', text: '紙箱上午 10:20 已經盤過了（盤點筆記：' + st.notes[loc].qty + ' 個）。' + (f.handed ? '架上看起來少了一些，是剛剛出貨的那 60 個。' : '') }]);
      }
      const line = st.db.count_lines.find(l => l.count_id === COUNT_ID && l.item_id === it.id);
      if (!line) return null;
      if (st.notes[loc]) return showTalk([{ who: '旁白', text: '盤點筆記：' + it.name + ' ' + st.notes[loc].qty + ' ' + it.unit + '（已清點）。' }]);
      return countShelf(st, loc, st.shelf[loc]);
    },
    computerTabs(st) { return stdTabs(st); },
    computerOptions(st) {
      return st.loginId === MGR_ID ? { banner: '目前是課長陳振宇的登入畫面（主管身分）。你在旁邊看課長操作：畫面上的按鈕代表課長按下的動作。' } : {};
    },
    onSystem(st, evt) {
      const f = st.flags;
      switch (evt.type) {
        case 'beforeMove': {
          const i = evt.input;
          if (Number(i.item_id) !== BOX || i.move_type !== '出庫') return { block: '這次只需要登錄紙箱 PK-4401 的出庫。' };
          if (f.moved) return { block: '紙箱的出庫已經登錄過了。異動紀錄不能修改或刪除，重複登錄會讓帳面再少一次。' };
          if (Number(text(i.qty)) !== 60) return { block: '數量和出貨單還沒對上。先到出貨區問李冠廷。' };
          return {};
        }
        case 'move': {
          const r = evt.result;
          if (!r.ok) {
            addTrail(st, '登錄出庫失敗：' + r.error);
            if (r.error.indexOf('庫存不足') === 0) { f.rejected = true; return { coach: '系統擋下了：出庫不能超過帳面，沒有產生任何異動。到出貨區找李冠廷確認出貨單上的數量。' }; }
            return {};
          }
          f.moved = true;
          addTrail(st, '登錄紙箱出庫 ' + signed(r.move.qty_change) + '（系統：帳面變成 ' + itemById(st.db, BOX).book_qty + '）');
          return { coach: '登錄成功。紙箱正在盤點單 IC-2712-01 盤點中，系統沒有因此擋下出庫。接著到出貨區點交。' };
        }
        case 'beforeEnter': {
          if (st.loginId === MGR_ID) return { block: '這是課長的登入畫面。盤點數量請用你自己的身分輸入。' };
          if (evt.lineId === BOX_LINE) {
            if (f.decided !== 'recount') return { block: '紙箱上午已經盤完了（實盤 240）。先把其他項目盤完，結案前再一起檢查。' };
            if (!f.recounted) return { block: '先回 D-01 貨架重新清點紙箱，再輸入。' };
          }
          return noteMismatch(st, evt.lineId, evt.input);
        }
        case 'enter': {
          const r = evt.result;
          if (!r.ok) { addTrail(st, '輸入實盤失敗：' + r.error); return {}; }
          const it = itemById(st.db, r.line.item_id);
          addTrail(st, '輸入 ' + it.item_no + ' 實盤 ' + r.line.counted_qty + '（系統計算盤差 ' + signed(r.line.counted_qty - it.book_qty) + '）');
          if (r.line.id === BOX_LINE) return { coach: '上午的 240 被現在的數字蓋掉了，盤點人與時間也更新。紙箱的盤差回到 ' + signed(r.line.counted_qty - it.book_qty) + '。' };
          return {};
        }
        case 'close': {
          const r = evt.result;
          if (!r.ok) { addTrail(st, '課長按結案，系統拒絕：' + r.error); return {}; }
          f.closed = true;
          addTrail(st, '課長結案：系統寫入 ' + r.adjusted + ' 筆盤點調整');
          return { coach: '結案完成。關閉畫面看結算。' };
        }
      }
      return {};
    }
  };
}

/* ---------- 6. change scenario controller (removed in the midterm build) ---------- */

let FinalDemo = null;

/* @@FINAL_BEGIN */
const CR_SCENARIOS = {};

function crData() {
  const books = Object.assign({}, BOOKS_L2, { 10: 300, 6: 42 });
  const later = LATER_L2.concat([
    ['2027-12-15 14:10', 10, '出庫', -60, '出貨單 SO-1215-07', null, 2],
    ['2027-12-18 15:00', 6, '入庫', 7, '採購單 PO-2712-04', null, 3],
    ['2027-12-20 10:00', 10, '入庫', 120, '採購單 PO-2712-06', null, 3]
  ]);
  const counts = countsL1().concat([
    mkCount(2, 'IC-2711-01', '十一月月底抽盤', '抽盤', 2, '2027-11-30 10:05', '2027-11-30 16:10'),
    mkCount(3, 'IC-2712-01', '十二月抽盤（五金與包材）', '抽盤', 2, '2027-12-15 08:30', '2027-12-15 16:30'),
    mkCount(4, 'IC-2712-02', '第四季全盤', '全盤', 3, '2027-12-30 08:00', null)
  ]);
  const lines = linesL1().concat([
    mkLine(3, 2, 2, 46, null, 2, '2027-11-30 10:40'), mkLine(4, 2, 4, 118, null, 2, '2027-11-30 10:55'),
    mkLine(5, 2, 7, 18, null, 2, '2027-11-30 11:20'), mkLine(6, 2, 11, 12, null, 2, '2027-11-30 11:30'),
    mkLine(7, 3, 6, 35, null, 2, '2027-12-15 14:30'), mkLine(8, 3, 9, 22, null, 2, '2027-12-15 14:40'),
    mkLine(9, 3, 10, 180, null, 2, '2027-12-15 15:50')
  ]);
  const counted = { 6: 41, 10: 298, 8: null };
  const times = ['09:05', '09:20', '09:40', '10:00', '10:15', '10:40', '11:00', '15:00', '11:20', '14:40', '13:30', '13:50'];
  for (let id = 1; id <= 12; id++) {
    const qty = Object.prototype.hasOwnProperty.call(counted, id) ? counted[id] : books[id];
    lines.push(mkLine(9 + id, 4, id, qty, null, 3, '2027-12-30 ' + times[id - 1]));
  }
  return makeDb(books, counts, lines, later);
}

// Fixed snippet: earlier closed counts and their adjustments (not a full query feature)
const CR_HISTORY = [
  ['IC-2710-01', 'PL-1103 封邊條', '−1', '', '黃志明', '2027-10-29 16:00'],
  ['IC-2711-01', 'ST-2201 方管', '−2', '', '吳宜蓁', '2027-11-30 16:10'],
  ['IC-2711-01', 'HW-3302 隱藏鉸鏈', '+3', '', '吳宜蓁', '2027-11-30 16:10'],
  ['IC-2709-02', 'HW-3301 自攻螺絲', '−4', '領料單漏登', '黃志明', '2027-09-29 15:40'],
  ['IC-2709-02', 'PK-4402 氣泡布', '+1', '', '黃志明', '2027-09-29 15:40'],
  ['IC-2708-01', 'ST-2202 圓管', '−6', '切料損耗未扣帳', '周美華', '2027-08-28 16:20']
];

CR_SCENARIOS['CR-01'] = {
  title: '覆盤與差異核准',
  requester: '倉庫課長 陳振宇',
  requesterNpc: 'mgr',
  summary: '季末全盤當天：重數的數字直接蓋掉、大盤差沒有原因、一項卡住整張結不了案。',
  setup(st) {
    st.db = crData();
    st.clock = clockAt(2027, 12, 30, 15, 30);
    st.player = { x: 3, y: 2, dir: 'down' };
    st.shelf = shelfFrom(st.db, { 'C-01': 41, 'D-01': 298, 'C-03': 36 });
    st.npcs = {
      counter: npcDef('counter', '倉管員 黃志明', '#b45309', 14, 4),
      qc: npcDef('qc', '品檢員 林雅琪', '#be185d', 9, 7),
      mgr: npcDef('mgr', '陳振宇課長', '#0f766e', 6, 2, false)
    };
  },
  intro: [
    { who: '旁白', text: '12 月 30 日下午 3:30，第四季全盤當天。你是系統分析師，到倉庫觀察盤點作業。' },
    { who: '旁白', text: '和盤點人員、品檢員談談，查看貨架與倉庫電腦，收集「觀察筆記」。電腦畫面只能看，不能輸入或結案。' }
  ],
  clues: [
    { id: 'big', hint: '和盤點人員黃志明談談（D 排包材附近）', text: '紙箱第一次數到 250，和帳面 300 差 50 個；盤點人員覺得數錯，重數後直接改成 298 存檔。' },
    { id: 'detail', hint: '在倉庫電腦查看第四季全盤的盤點單明細', text: '盤點單明細只看得到最後一次的數字（紙箱實盤 298），差異說明空白，盤點人與時間是最後一次輸入的；看不出這一項數過幾次。' },
    { id: 'small', hint: '查看 C-01 自攻螺絲的貨架', text: '自攻螺絲帳面 42、實盤 41，差 1 盒，同樣直接存檔、沒有差異說明。差 1 盒與差 50 個，在現況系統裡的處理方式相同。' },
    { id: 'stuck', hint: '和收貨／品檢區的品檢員談談', text: '氣壓棒有一箱放在品檢區，盤點人員不確定要不要算，遲遲沒有輸入；還有 1 項沒盤，整張盤點單就不能結案。' },
    { id: 'hist', hint: '在倉庫電腦查看已結案盤點的資訊片段', text: '前幾次已結案盤點的盤點調整，有的有差異說明、有的空白，看不出有沒有人查過原因。' }
  ],
  requesterWaiting: [{ who: '陳振宇', text: '……' }],
  talk: {
    counter(st, api) {
      api.collect(st, 'big');
      showTalk([
        { who: '黃志明', text: '紙箱我第一次數 250 個，跟帳面 300 差了 50 個。差太多了，我想一定是我數錯，又重數一次，是 298，就直接改成 298 存檔。' },
        { who: '黃志明', text: '第一次的 250？沒地方寫啊，畫面上一個項目就一格實盤數量。' },
        { who: '黃志明', text: '這張全盤只指派我一個人，其他人來幫忙數，最後也是我輸入。' }
      ]);
    },
    qc(st, api) {
      api.collect(st, 'stuck');
      showTalk([
        { who: '林雅琪', text: '這箱氣壓棒是上週進來的，還在等品檢，還沒判定合不合格。' },
        { who: '林雅琪', text: '倉庫盤點要不要把它算進去，我也不確定。志明說那一項先空著。' }
      ]);
    }
  },
  onShelf(st, loc, api) {
    const it = itemAtLoc(st.db, loc);
    if (!it) return null;
    if (loc === 'C-01') {
      api.collect(st, 'small');
      return showTalk([{ who: '旁白', text: '貨架上的盤點標籤：HW-3301 自攻螺絲，實盤 41 盒（帳面 42），黃志明 09:05 已輸入。差異說明那一欄沒有寫。' }]);
    }
    if (loc === 'C-03') {
      api.collect(st, 'stuck');
      return showTalk([{ who: '旁白', text: '氣壓棒：架上 36 支，另有一箱放在收貨／品檢區。盤點單上這一項還沒輸入。' }]);
    }
    if (loc === 'D-01') return showTalk([{ who: '旁白', text: '貨架上的盤點標籤：PK-4401 紙箱，實盤 298 個（黃志明 14:40）。標籤上看不到第一次數的 250。' }]);
    return showTalk([{ who: '旁白', text: '儲位 ' + loc + '：' + it.name + '，盤點標籤顯示已輸入。' }]);
  },
  tabs: [{ id: 'crdetail', label: '盤點單明細（唯讀）' }, { id: 'crhist', label: '已結案盤點（資訊片段）' }],
  computerOptions: {
    observer: true, readOnly: true,
    banner: '期末情境 CR-01：以下是現況模擬畫面，只供觀察，不能輸入或結案。現況：一張盤點單只能指派一位盤點人員；主管也能在任何一張盤點中的單輸入實盤數量；輸入畫面看得到帳面數量。現況系統沒有覆盤紀錄、差異容許範圍與核准功能。（依原始碼與提案書整理，實際畫面請回原系統確認）'
  },
  onSystem(st, evt, api) {
    if (evt.type === 'openTab' && evt.tab === 'crdetail') api.collect(st, 'detail');
    if (evt.type === 'openTab' && evt.tab === 'crhist') api.collect(st, 'hist');
    return {};
  },
  renderExtraTab(st, tab, panel) {
    if (tab === 'crdetail') {
      panel.innerHTML = countDetailHtml(st, countById(st.db, 4), { readOnly: true, noBack: true });
      return;
    }
    if (tab === 'crhist') {
      panel.innerHTML = '<p class="hint">情境模擬示意：固定資料的資訊片段，不是完整查詢功能，也不是原系統 SQLite 的查詢結果。</p>' +
        '<table class="data"><thead><tr><th>盤點單號</th><th>料號</th><th>盤點調整</th><th>差異說明</th><th>盤點人</th><th>結案時間</th></tr></thead><tbody>' +
        CR_HISTORY.map(r => '<tr><td>' + r[0] + '</td><td>' + esc(r[1]) + '</td><td>' + r[2] + '</td><td>' + (r[3] ? esc(r[3]) : '<em>（空白）</em>') + '</td><td>' + esc(r[4]) + '</td><td>' + r[5] + '</td></tr>').join('') +
        '</tbody></table>';
    }
  },
  onCluesDone(st) {
    showNpc('mgr', 6, 2);
    walkNpc('mgr', [[8, 2]]);
    log('陳振宇課長走進倉庫了。去和課長談談。', 'scene');
  },
  requestLines: [
    { who: '陳振宇', text: '今天全盤卡在氣壓棒那一項。確定的十一項我想先調帳，系統不讓我，只能整張一起結。' },
    { who: '陳振宇', text: '我更在意的是：每一次數到多少要留下來。紙箱第一次差 50，到底是數錯還是真的少了，現在看不出來。' },
    { who: '陳振宇', text: '盤差大的，要嘛覆盤，要嘛寫原因。調帳之前要有人核准，誰核准、為什麼准，以後要查得到。' }
  ],
  requests: [
    '每一次清點的數量都要留下來',
    '盤差大的項目要覆盤或寫明原因',
    '調帳前要有人核准',
    '核准的人與理由事後查得到',
    '不要因為一項有疑問，就讓其他確定的項目都無法處理（怎麼做待釐清）'
  ],
  statements: [
    { text: '紙箱重數後直接覆蓋，第一次數到的 250 沒有留在系統裡。', cat: 'obs', explain: '這是你在現場與畫面上看到的情形。' },
    { text: '螺絲差 1 盒、紙箱差 50 個，都只要輸入數字就能存檔，不必寫原因。', cat: 'obs', explain: '這是現況系統的行為，你在貨架標籤與明細畫面上都看得到。' },
    { text: '氣壓棒還沒輸入，整張盤點單就不能結案。', cat: 'obs', explain: '這是現況限制：結案時只要還有未盤項目就會被拒絕。' },
    { text: '課長希望每一次數到多少都留下紀錄。', cat: 'want', explain: '這是需求提出者希望達成的業務結果，還不是系統規格。' },
    { text: '課長希望調帳前有人核准，而且事後查得到核准的人與理由。', cat: 'want', explain: '這是利害關係人的期望；誰能核准、怎麼記錄，還需要釐清。' },
    { text: '差異超過 5% 就要強制覆盤。', cat: 'infer', explain: '這是門檻的設計想法，不是現況事實；用數量、百分比還是金額，每個料號是否相同，都要先釐清。' },
    { text: '盤點人員輸入時不應該看到帳面數量。', cat: 'infer', explain: '這是做法的猜想。現況輸入畫面看得到帳面，要不要改還需要查證與討論。' }
  ],
  impacts: {
    '角色': '盤點人員、覆盤的人、核准的人各是誰？主管現在能做哪些事？',
    '流程': '輸入實盤之後、結案之前，現在有哪些步驟？「有疑問的項目」現在怎麼處理？',
    '功能': '現有的輸入實盤與結案兩個功能，各自在什麼條件下可以使用？',
    '資料': '現在每個盤點項目記下哪些資訊？重新輸入時哪些會被蓋掉？已結案的舊盤點單有哪些資料？',
    '權限': '現在誰能輸入、誰能結案？一張盤點單能指派幾位盤點人員？'
  },
  verify: [
    '打開種子資料中盤點中與已結案的盤點單，查看差異說明欄。',
    '查看已結案盤點單產生的「盤點調整」異動紀錄。',
    '分別用主管與倉管人員登入，嘗試輸入實盤數量與結案。',
    '對同一個盤點項目重新輸入一次，觀察數量、盤點人與時間怎麼變。',
    '在 SQLite 查看盤點項目與庫存異動目前記錄哪些欄位（只看現況，不先設計新表）。'
  ],
  guide: [
    '哪一個現有操作步驟讓第一次的數字消失？',
    '盤差「大」要由誰、用什麼標準判斷，需要先問哪些人？',
    '覆盤與核准會牽動哪些角色的工作與權限？',
    '一張單只能結案一次，對有疑問的項目造成什麼影響？',
    '上線以來已結案的盤點資料，在改版後要怎麼看？'
  ]
};

FinalDemo = (function () {
  const ORDER = ['CR-01'];
  const CATEGORIES = [
    { id: 'obs', label: '觀察到的問題（現場事實）' },
    { id: 'want', label: '利害關係人的期望' },
    { id: 'infer', label: '尚待查證的推論或設計想法' }
  ];
  const IMPACT_AREAS = ['角色', '流程', '功能', '資料', '權限'];

  function menuHtml() {
    return '<h2>期末：變更需求情境</h2>' +
      '<p class="hint">本題的期末變更需求只有一項。你的角色是系統分析師：觀察現場問題、辨識需求與待查證事項，遊戲不提供改善後的系統。約 5–10 分鐘。</p>' +
      '<div class="cards">' + ORDER.map(id => {
        const sc = CR_SCENARIOS[id];
        return '<button type="button" class="card" data-start="' + id + '"><b>' + id + '　' + esc(sc.title) + '</b><span>需求提出者：' + esc(sc.requester) + '</span><span>' + esc(sc.summary) + '</span></button>';
      }).join('') + '</div>';
  }

  function makeController(id) {
    const sc = CR_SCENARIOS[id];
    const required = sc.clues;
    const requiredDone = st => required.every(c => st.cr.clues.indexOf(c.id) >= 0);
    const api = { collect };

    function collect(st, clueId) {
      if (st.cr.clues.indexOf(clueId) >= 0) return;
      const c = sc.clues.find(x => x.id === clueId);
      if (!c) return;
      st.cr.clues.push(clueId);
      addTrail(st, '觀察：' + c.text);
      log('已記下觀察：' + c.text, 'note');
      if (st.cr.stage === 'explore' && requiredDone(st)) {
        st.cr.stage = 'request';
        whenIdle(() => sc.onCluesDone(st, api));
      }
      render();
    }

    function talkRequester(st) {
      if (st.cr.stage === 'explore') return showTalk(sc.requesterWaiting.concat([{ kind: 'coach', text: '先在現場收集觀察筆記（右側清單），再回來聽需求說明。' }]));
      if (st.cr.stage === 'request') return showTalk(sc.requestLines, [{ label: '開始需求釐清練習', run: () => openExercise(st) }]);
      return showTalk([{ who: '陳振宇', text: '謝謝你整理。' }], [
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
      const observed = sc.clues.filter(c => st.cr.clues.indexOf(c.id) >= 0).map(c => '<li>' + esc(c.text) + '</li>').join('');
      const html = '<div class="settle cr">' +
        '<p class="boundary">本情境只呈現現況困難與需求背景，不提供差異門檻、覆盤方式、核准權限、盤點項目狀態、資料表、欄位或畫面的答案。合理的做法可能不只一種，請回到原系統查證後，再提出有理由的設計。</p>' +
        '<div class="grid4">' +
        '<section><h3>觀察到的業務事件</h3><ul>' + observed + '</ul></section>' +
        '<section><h3>利害關係人的新要求（' + id + '｜' + esc(sc.requester) + '）</h3><ul>' + sc.requests.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></section>' +
        '<section><h3>可能受影響項目（分類問題）</h3><dl>' + IMPACT_AREAS.map(x =>
          '<dt>' + x + (st.cr.impacts.indexOf(x) >= 0 ? '　<span class="tag-sel">你有勾選</span>' : '') + '</dt><dd>' + esc(sc.impacts[x]) + '</dd>').join('') + '</dl></section>' +
        '<section><h3>回到實際系統確認</h3><ul>' + sc.verify.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></section>' +
        '</div>' +
        '<section><h3>結算引導問題</h3><ol>' + sc.guide.map(g => '<li>' + esc(g) + '</li>').join('') + '</ol></section>' +
        '<section><h3>你寫下的追問</h3><p class="notes">' + (st.cr.notes.trim() ? esc(st.cr.notes) : '（未填寫）') + '</p></section>' +
        '<p class="hint">接著回到修改需求提案書與實際系統，寫出「現況問題、需求釐清、影響範圍、驗收需求」，再對照期末修改建議書的架構。</p>' +
        '</div>';
      openSettlement(id + ' 結算：' + sc.title, html, [
        { label: '重做需求釐清練習', run: () => openExercise(st) },
        { label: '重新開始此情境', run: () => startMode(id) },
        { label: '回到標題', run: showTitle }
      ]);
    }

    return {
      id, title: id + '　' + sc.title, role: '系統分析師（觀察現場）', isCR: true,
      setup(st) {
        sc.setup(st);
        st.cr = { clues: [], answers: {}, impacts: [], notes: '', stage: 'explore' };
      },
      onStart() { showTalk(sc.intro, [], { closeLabel: '開始觀察' }); },
      objective(st) {
        if (st.cr.stage === 'explore') {
          return {
            title: '收集現況觀察（' + required.filter(c => st.cr.clues.indexOf(c.id) >= 0).length + '/' + required.length + '）',
            items: sc.clues.map(c => ({ text: c.hint, done: st.cr.clues.indexOf(c.id) >= 0 })), showAll: true
          };
        }
        if (st.cr.stage === 'request') return { title: '聽取需求', items: [{ text: '向' + sc.requester + '了解需求', done: false }] };
        if (st.cr.stage === 'exercise') return { title: '整理需求', items: [{ text: '完成需求釐清練習', done: false }] };
        return { title: '情境完成', items: [{ text: '可以找' + sc.requester + '重看結算，或從暫停選單回到標題', done: true }], showAll: true };
      },
      hudExtra(st) {
        const got = sc.clues.filter(c => st.cr.clues.indexOf(c.id) >= 0);
        return '<h3>觀察筆記</h3>' + (got.length ? '<ul class="notes-list">' + got.map(c => '<li>' + esc(c.text) + '</li>').join('') + '</ul>' : '<p class="hint">尚未記下觀察。</p>');
      },
      npcAttention(st, npcId) {
        if (npcId === sc.requesterNpc) return st.cr.stage === 'request' && !st.npcs.mgr.walking;
        if (st.cr.stage !== 'explore') return false;
        const map = { counter: 'big', qc: 'stuck' };
        return !!map[npcId] && st.cr.clues.indexOf(map[npcId]) < 0;
      },
      onTalk(st, npcId) {
        if (npcId === sc.requesterNpc) return talkRequester(st);
        const h = sc.talk[npcId];
        if (h) return h(st, api);
        showTalk([{ who: (st.npcs[npcId] || {}).name || '', text: '……' }]);
      },
      onShelf(st, loc) { return sc.onShelf(st, loc, api); },
      onShip() { showTalk([{ who: '旁白', text: '出貨點交台，今天全盤，暫停出貨。' }]); },
      computerTabs() { return sc.tabs; },
      computerOptions() { return sc.computerOptions; },
      onSystem(st, evt) { return (sc.onSystem && sc.onSystem(st, evt, api)) || {}; },
      renderExtraTab(st, tab, panel) { if (sc.renderExtraTab) sc.renderExtraTab(st, tab, panel, api); }
    };
  }

  return {
    ORDER, menuHtml, makeController, editionLabel: '期末版（含現況回顧）', has: x => !!CR_SCENARIOS[x],
    l2Note: '盤點期間的入庫出庫怎麼處理，修改需求提案書列為範圍外；這一關不是期末 CR-01 的內容。'
  };
})();
/* @@FINAL_END */

/* ---------- 6b. sound (Web Audio, synthesized in code, no audio files) ---------- */

const Sound = (function () {
  let ctx = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true, timer = null, nextTime = 0, stepIdx = 0;
  const STEP = 60 / 92 / 2; // eighth note at 92 BPM
  // C major pentatonic loop, 8 bars of eighth notes (0 = rest), one bass note per bar
  const MELODY = [
    72, 0, 74, 0, 76, 0, 79, 76, 74, 0, 72, 0, 69, 0, 0, 0,
    72, 0, 76, 0, 79, 0, 81, 0, 79, 76, 74, 0, 76, 0, 0, 0,
    69, 0, 72, 0, 74, 0, 72, 69, 67, 0, 69, 0, 72, 0, 74, 0,
    76, 0, 79, 0, 76, 74, 72, 0, 74, 0, 0, 0, 72, 0, 0, 0
  ];
  const BASS = [48, 45, 41, 43, 45, 48, 41, 43];
  const SFX = {
    step: [[1100, 0, 0.03, 'square', 0.04]],
    bump: [[140, 0, 0.09, 'square', 0.2]],
    open: [[660, 0, 0.06, 'sine', 0.25], [880, 0.05, 0.08, 'sine', 0.2]],
    ok: [[660, 0, 0.1, 'triangle', 0.4], [990, 0.09, 0.16, 'triangle', 0.4]],
    error: [[220, 0, 0.14, 'sawtooth', 0.2], [165, 0.13, 0.2, 'sawtooth', 0.2]],
    notice: [[740, 0, 0.1, 'sine', 0.3], [587, 0.1, 0.14, 'sine', 0.25]],
    tick: [[1800, 0, 0.025, 'square', 0.1], [1300, 0.04, 0.03, 'square', 0.08]],
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
  compTab: null, compMsg: null, warn: null, countId: null, pendingClose: false,
  lineDraft: {}, newDraft: null, moveDraft: null, moveFilter: null, phoneLog: [], quickKey: ''
};
let ctrl = null;

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function emptyNewDraft() { return { name: '', count_type: '', counter_id: '', item_ids: [], prefilled: false }; }
function emptyMoveDraft() { return { item_id: '', move_type: '', qty: '', note: '' }; }

function resetUiState() {
  Object.assign(ui, {
    idleQueue: [], msgs: [], compTab: null, compMsg: null, warn: null, countId: null, pendingClose: false,
    lineDraft: {}, newDraft: emptyNewDraft(), moveDraft: emptyMoveDraft(), moveFilter: { item_id: '', move_type: '' }, phoneLog: [], quickKey: ''
  });
}

function emit(type, payload) {
  if (!ctrl || !ctrl.onSystem) return {};
  return ctrl.onSystem(gameState, Object.assign({ type }, payload || {})) || {};
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
    '<h2>期中：現況理解（As-Is）</h2><p class="hint">扮演倉管員，體驗原有系統的盤點、入庫出庫與例外。兩關合計約 10–15 分鐘。</p><div class="cards">' +
    '<button type="button" class="card" data-start="level1"><b>第一關　月底抽盤</b><span>正常流程：建立盤點單、到貨架清點、輸入實盤、結案調帳。</span></button>' +
    '<button type="button" class="card" data-start="level2"><b>第二關　數完之後，貨又出去了</b><span>現有系統的例外：盤點還沒結案，盤過的料號又出庫了。</span></button></div>';
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
function tileClass(ch, x, y) {
  switch (ch) {
    case '#': return 'wall';
    case '.': return x <= 5 ? 'floor-office' : 'floor-wh';
    case 'D': return 'door';
    case 'K': return 'desk';
    case 'C': return 'obj t-computer';
    case 'T': return 'obj t-phone';
    case 'X': return 'ship';
    case 'R': return 'recv';
    case 'G': return 'gate';
  }
  if (SHELF_ROWS[ch]) return 'shelf row-' + ch;
  return 'floor-wh';
}
function tileLabel(ch, x, y) {
  if (ch === 'C') return '電腦';
  if (ch === 'T') return '分機';
  if (ch === 'K') return '課長座位';
  if (ch === 'D') return '門';
  if (SHELF_ROWS[ch]) return shelfLoc(ch, x);
  if (ch === 'X' && x === 15) return '出貨區';
  if (ch === 'R' && x === 9) return '收貨／品檢區';
  if (ch === 'G' && x === 9) return '倉庫大門';
  if (ch === '.' && x === 7 && y === 1) return '板材';
  if (ch === '.' && x === 13 && y === 1) return '鋼管';
  if (ch === '.' && x === 7 && y === 3) return '五金';
  if (ch === '.' && x === 13 && y === 3) return '包材';
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
      let cls = 'tile ' + tileClass(ch, x, y);
      if (SHELF_ROWS[ch] && !itemAtLoc(gameState.db, shelfLoc(ch, x))) cls += ' empty-slot';
      d.className = cls;
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

function renderEntities() {
  const st = gameState;
  const layer = $('#ents');
  if (!st || !layer || !ctrl) return;
  const list = Object.values(st.npcs).filter(n => n.visible).map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, color: n.color, kind: 'npc' }));
  list.push({ id: '__player', name: ctrl.isCR ? '你（分析師）' : '你（倉管員）', x: st.player.x, y: st.player.y, color: '#2563a8', kind: 'player' });
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
  if (!ctrl.isCR) {
    const u = userById(st.db, st.loginId);
    const locs = Object.keys(st.notes).sort();
    stats.hidden = false;
    stats.innerHTML = '<h3>電腦目前登入者</h3><p>' + esc(u.name) + '（' + roleLabel(u) + '）</p>' +
      '<h3>盤點筆記（場景紀錄，不是系統資料）</h3>' + (locs.length ? '<ul class="notebook">' + locs.map(l => {
        const it = itemAtLoc(st.db, l);
        return '<li>' + l + ' ' + esc(it.name) + '：' + st.notes[l].qty + ' ' + esc(it.unit) + '（' + st.notes[l].at + '）</li>';
      }).join('') + '</ul>' : '<p class="hint">（尚未記錄）</p>');
  } else { stats.hidden = true; stats.innerHTML = ''; }
  const extra = $('#hud-extra');
  if (ctrl.hudExtra) { extra.hidden = false; extra.innerHTML = ctrl.hudExtra(st); } else { extra.hidden = true; extra.innerHTML = ''; }
  renderQuick();
}

const QUICK_SPOTS = {
  computer: { x: 1, y: 2, dir: 'up', label: '電腦' },
  phone: { x: 3, y: 2, dir: 'up', label: '分機' },
  A: { x: 9, y: 2, dir: 'up', label: 'A 排板材' },
  B: { x: 15, y: 2, dir: 'up', label: 'B 排鋼管' },
  C: { x: 9, y: 4, dir: 'up', label: 'C 排五金' },
  D: { x: 15, y: 4, dir: 'up', label: 'D 排包材' },
  ship: { x: 16, y: 5, dir: 'down', label: '出貨區' }
};
function renderQuick() {
  const st = gameState;
  const keys = Object.keys(QUICK_SPOTS).filter(k => st.visited[k]);
  const key = keys.join(',');
  if (key === ui.quickKey) return;
  ui.quickKey = key;
  $('#hud-quick').innerHTML = '<h3>快捷移動</h3>' + (keys.length
    ? keys.map(k => '<button type="button" class="small" data-quick="' + k + '">' + QUICK_SPOTS[k].label + '</button>').join(' ')
    : '<p class="hint">用過電腦、分機、各排貨架或出貨區後，可以在這裡直接移過去。</p>');
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
  if (SHELF_ROWS[ch]) {
    const loc = shelfLoc(ch, x);
    const it = gameState && itemAtLoc(gameState.db, loc);
    return { kind: 'shelf', id: loc, row: SHELF_ROWS[ch], label: '貨架 ' + loc + (it ? '（' + it.name + '）' : '（空儲位）') };
  }
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
function defaultShelf(st, loc) {
  const it = itemAtLoc(st.db, loc);
  if (!it) return showTalk([{ who: '旁白', text: '儲位 ' + loc + '：空儲位。' }]);
  showTalk([{ who: '旁白', text: '儲位 ' + loc + '：' + it.item_no + ' ' + it.name + '（' + it.spec + '），架上約 ' + st.shelf[loc] + ' ' + it.unit + '。這個料號不在這次的盤點範圍。' + (it.active ? '' : '（系統裡這個料號已停用）') }]);
}
function doInteract() {
  const t = interactTarget();
  if (!t) { log('附近沒有可以互動的對象。', 'scene'); return; }
  const st = gameState;
  if (t.kind === 'npc') { ctrl.onTalk(st, t.id); return; }
  if (t.kind === 'shelf') {
    st.visited[t.row] = true;
    const handled = ctrl.onShelf ? ctrl.onShelf(st, t.id) : null;
    if (handled === null) defaultShelf(st, t.id);
    return;
  }
  st.visited[t.id] = true;
  if (t.id === 'computer') openComputer();
  else if (t.id === 'phone') { if (!(ctrl.onPhoneObject && ctrl.onPhoneObject(st))) openPhone(); }
  else if (t.id === 'ship') { if (ctrl.onShip) ctrl.onShip(st); else showTalk([{ who: '旁白', text: '出貨點交台，目前沒有待點交的出貨單。' }]); }
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

/* computer */
function roleLabel(u) { return u.role === ROLE_MANAGER ? '主管' : '倉管人員'; }
function stdTabs(st) {
  const u = userById(st.db, st.loginId);
  const t = [{ id: 'counts', label: '盤點單' }];
  if (u.role === ROLE_MANAGER) t.push({ id: 'new', label: '建立盤點單' });
  t.push({ id: 'moves', label: '庫存異動' }, { id: 'items', label: '料號與帳面' });
  return t;
}
function compOptions() { return (ctrl.computerOptions && ctrl.computerOptions(gameState)) || {}; }

function openComputerModal(title, onClose) {
  const tabs = ctrl.computerTabs(gameState);
  if (!tabs.some(t => t.id === ui.compTab)) ui.compTab = tabs[0].id;
  ui.compMsg = null; ui.warn = null; ui.pendingClose = false;
  openModal(title, renderComputerBody, { size: 'wide', onClose });
  const r = emit('openTab', { tab: ui.compTab });
  let r2 = {};
  if (ui.compTab === 'counts' && ui.countId) r2 = emit('viewCount', { countId: ui.countId });
  if (r.coach || r2.coach) { addCoach(r.coach ? r : r2); rerenderComputer(); }
  render();
}
// Opened by the player from the map: always the player's own login
function openComputer() {
  gameState.loginId = PLAYER_ID;
  openComputerModal('倉庫電腦');
}

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
  const tabs = ctrl.computerTabs(st);
  const opt = compOptions();
  const u = opt.observer ? null : userById(st.db, st.loginId);
  body.innerHTML =
    '<div class="sys-bar"><b>倉庫盤點管理系統（遊戲模擬）</b><span id="sys-login">目前登入者：' + (u ? esc(u.name) + '（' + roleLabel(u) + '）' : '（觀察用畫面，未登入）') + '</span><span>系統時間：' + fmtDT(st.clock) + '</span></div>' +
    (opt.banner ? '<p class="banner">' + esc(opt.banner) + '</p>' : '') +
    '<div class="tabs" role="tablist">' + tabs.map(t => '<button type="button" role="tab" id="tab-' + t.id + '" aria-selected="' + (t.id === ui.compTab) + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>').join('') + '</div>' +
    '<div id="comp-msg" aria-live="polite"></div><div class="tabpanel" id="tabpanel" role="tabpanel"></div>';
  $all('[data-tab]', body).forEach(b => b.addEventListener('click', () => {
    ui.compTab = b.dataset.tab; ui.compMsg = null; ui.warn = null; ui.pendingClose = false;
    addCoach(emit('openTab', { tab: ui.compTab }));
    if (ui.compTab === 'counts' && ui.countId) addCoach(emit('viewCount', { countId: ui.countId }));
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
  if (ui.compTab === 'counts') renderCounts(panel, opt);
  else if (ui.compTab === 'new') renderNew(panel);
  else if (ui.compTab === 'moves') renderMoves(panel);
  else if (ui.compTab === 'items') renderItems(panel);
  else if (ctrl.renderExtraTab) ctrl.renderExtraTab(st, ui.compTab, panel);
}

function renderCounts(panel, opt) {
  const st = gameState;
  const c = ui.countId ? countById(st.db, ui.countId) : null;
  if (c) { panel.innerHTML = countDetailHtml(st, c, opt); bindCountDetail(panel, c); return; }
  const rows = st.db.counts.slice().sort((a, b) => a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id);
  panel.innerHTML = '<table class="data"><thead><tr><th>盤點單號</th><th>名稱</th><th>類別</th><th>盤點人員</th><th>狀態</th><th>進度</th><th>建立時間</th><th></th></tr></thead><tbody>' +
    rows.map(r => { const s = countSummary(st.db, r); return '<tr><td>' + esc(r.count_no) + '</td><td>' + esc(r.name) + '</td><td>' + r.count_type + '</td><td>' + esc(userName(st.db, r.counter_id)) +
      '</td><td>' + badge(r.status) + '</td><td>已盤 ' + s.counted_count + '／共 ' + s.line_count + ' 項</td><td>' + esc(r.created_at) + '</td><td><button type="button" class="small secondary" id="det-' + r.id + '" data-detail="' + r.id + '">明細</button></td></tr>'; }).join('') +
    '</tbody></table>';
  $all('[data-detail]', panel).forEach(b => b.addEventListener('click', () => {
    ui.countId = Number(b.dataset.detail); ui.compMsg = null; ui.pendingClose = false;
    addCoach(emit('viewCount', { countId: ui.countId }));
    rerenderComputer('back-list');
    render();
  }));
}

function badge(status) { return '<span class="badge' + (status === '已結案' ? ' closed' : '') + '">' + status + '</span>'; }

function countDetailHtml(st, c, opt) {
  opt = opt || {};
  const u = opt.observer ? null : userById(st.db, st.loginId);
  const lines = countLines(st.db, c);
  const s = countSummary(st.db, c);
  const edit = !opt.readOnly && canEnter(c, u);
  const close = !opt.readOnly && canClose(c, u);
  const f = (k, v) => '<dt>' + k + '</dt><dd>' + v + '</dd>';
  return (opt.noBack ? '' : '<div class="row"><button type="button" class="small secondary" id="back-list">← 回盤點單清單</button></div>') +
    '<h3>盤點單明細 ' + esc(c.count_no) + '</h3><dl class="info">' +
    f('盤點單號', esc(c.count_no)) + f('名稱', esc(c.name)) + f('類別', c.count_type) + f('盤點人員', esc(userName(st.db, c.counter_id))) +
    f('狀態', badge(c.status)) + f('進度', '已盤 ' + s.counted_count + '／共 ' + s.line_count + ' 項') + f('建立人', esc(userName(st.db, c.created_by))) + f('建立時間', esc(c.created_at)) +
    f('結案人', esc(userName(st.db, c.closed_by))) + f('結案時間', esc(c.closed_at || '')) + f('盤盈項數', s.gain_count) + f('盤虧項數', s.loss_count) + '</dl>' +
    (close ? '<div class="row"><button type="button" id="btn-close">結案</button></div>' : '') +
    (close && ui.pendingClose ? '<div class="msg k-info" id="close-confirm"><p>確定結案？有盤差的料號會把帳面數量改成實盤數量。</p><div class="choices"><button type="button" id="close-yes">確定結案</button><button type="button" class="secondary" id="close-no">取消</button></div></div>' : '') +
    '<table class="data"><thead><tr><th>儲位</th><th>料號</th><th>品名</th><th>規格</th><th>單位</th><th>帳面</th><th>實盤</th><th>盤差</th><th>差異說明</th><th>盤點人</th><th>盤點時間</th>' + (edit ? '<th></th>' : '') + '</tr></thead><tbody>' +
    lines.map(l => {
      const d = ui.lineDraft[l.id];
      const q = d ? d.q : (l.counted_qty === null ? '' : String(l.counted_qty));
      const r = d ? d.r : (l.remark || '');
      return '<tr><td>' + esc(l.location) + '</td><td>' + esc(l.item_no) + '</td><td>' + esc(l.name) + '</td><td>' + esc(l.spec) + '</td><td>' + esc(l.unit) + '</td><td>' + l.book + '</td>' +
        '<td>' + (edit ? '<input class="qty" id="q-' + l.id + '" inputmode="numeric" autocomplete="off" aria-label="' + esc(l.item_no) + ' 實盤數量" value="' + esc(q) + '">' : (l.counted_qty === null ? '' : l.counted_qty)) + '</td>' +
        '<td>' + signed(l.diff) + '</td>' +
        '<td>' + (edit ? '<input class="rmk" id="r-' + l.id + '" maxlength="120" aria-label="' + esc(l.item_no) + ' 差異說明" value="' + esc(r) + '">' : esc(l.remark || '')) + '</td>' +
        '<td>' + esc(l.counted_by_name) + '</td><td>' + esc(l.counted_at || '') + '</td>' +
        (edit ? '<td><button type="button" class="small" id="save-' + l.id + '" data-save="' + l.id + '">儲存</button></td>' : '') + '</tr>';
    }).join('') + '</tbody></table>';
}

function bindCountDetail(panel, c) {
  const st = gameState;
  const back = $('#back-list', panel);
  if (back) back.addEventListener('click', () => { ui.countId = null; ui.compMsg = null; ui.pendingClose = false; rerenderComputer(); });
  $all('input.qty, input.rmk', panel).forEach(inp => inp.addEventListener('input', () => {
    const id = Number(inp.id.slice(2));
    ui.lineDraft[id] = { q: $('#q-' + id).value, r: $('#r-' + id).value };
  }));
  $all('[data-save]', panel).forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.save);
    const input = { counted_qty: $('#q-' + id).value, remark: $('#r-' + id).value };
    ui.lineDraft[id] = { q: input.counted_qty, r: input.remark };
    const commit = () => {
      const res = enterLine(st.db, id, input, nowStr(st), st.loginId);
      if (res.ok) { st.db = res.db; advance(st, 1); setMsg('ok', res.message); delete ui.lineDraft[id]; }
      else setMsg('err', res.errors);
      addCoach(emit('enter', { result: res, lineId: id, input }));
      rerenderComputer('save-' + id);
      render();
    };
    if (!enterLine(st.db, id, input, nowStr(st), st.loginId).ok) { commit(); return; }
    ui.compMsg = null;
    const r = emit('beforeEnter', { lineId: id, input });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    if (r.warn && r.warn.length) { Sound.sfx('notice'); ui.warn = { lines: r.warn, goLabel: '仍要儲存', go: commit }; rerenderComputer(); return; }
    commit();
  }));
  const btn = $('#btn-close', panel);
  if (btn) btn.addEventListener('click', () => {
    ui.compMsg = null;
    const r = emit('beforeClose', { countId: c.id });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    ui.pendingClose = true;
    rerenderComputer('close-yes');
  });
  const yes = $('#close-yes', panel);
  if (yes) {
    yes.addEventListener('click', () => {
      ui.pendingClose = false;
      const res = closeCount(st.db, c.id, nowStr(st), st.loginId);
      if (res.ok) { st.db = res.db; advance(st, 1); setMsg('ok', res.message); } else setMsg('err', res.errors);
      addCoach(emit('close', { result: res, countId: c.id }));
      rerenderComputer();
      render();
    });
    $('#close-no', panel).addEventListener('click', () => { ui.pendingClose = false; setMsg('info', '已取消，沒有寫入任何資料。'); rerenderComputer(); });
  }
}

function renderNew(panel) {
  const st = gameState;
  const d = ui.newDraft;
  const users = st.db.users.filter(u => u.active);
  const items = st.db.items.filter(i => i.active).slice().sort(byItemNo);
  panel.innerHTML = (d.prefilled ? '<p class="hint">課長已經填好表單。檢查內容後按「建立」，代表課長送出。</p>' : '') +
    '<form id="f-new" class="grid-form">' +
    '<label>盤點單名稱 <input id="nc-name" value="' + esc(d.name) + '"></label>' +
    '<label>盤點類別 <select id="nc-type"><option value="">請選擇</option>' + COUNT_TYPES.map(t => '<option' + (t === d.count_type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
    '<label>盤點人員 <select id="nc-counter"><option value="">請選擇</option>' + users.map(u => '<option value="' + u.id + '"' + (String(u.id) === String(d.counter_id) ? ' selected' : '') + '>' + esc(u.emp_no + ' ' + u.name) + '（' + esc(u.title) + '）</option>').join('') + '</select></label>' +
    '<div class="wide"><p class="hint">抽盤要勾選料號；全盤自動納入所有啟用中的料號。</p><div class="checks">' + items.map(i => {
      const open = openCountOf(st.db, i.id);
      return '<label><input type="checkbox" name="nc-item" id="nc-item-' + i.id + '" value="' + i.id + '"' + (d.item_ids.map(Number).indexOf(i.id) >= 0 ? ' checked' : '') + '> ' +
        esc(i.item_no + ' ' + i.name) + '（' + esc(i.location) + '，帳面 ' + i.book_qty + ' ' + esc(i.unit) + '）' + (open ? ' <span class="busy">已在 ' + esc(open.count_no) + ' 盤點中</span>' : '') + '</label>';
    }).join('') + '</div></div>' +
    '<div class="row"><button type="submit">建立</button></div></form>';
  const sync = () => {
    d.name = $('#nc-name').value; d.count_type = $('#nc-type').value; d.counter_id = $('#nc-counter').value;
    d.item_ids = $all('input[name="nc-item"]:checked').map(x => Number(x.value));
  };
  $all('#f-new input, #f-new select', panel).forEach(i => { i.addEventListener('input', sync); i.addEventListener('change', sync); });
  $('#f-new', panel).addEventListener('submit', e => {
    e.preventDefault();
    sync();
    const input = { name: d.name, count_type: d.count_type, counter_id: d.counter_id, item_ids: d.item_ids.slice() };
    const commit = () => {
      const res = createCount(st.db, input, nowStr(st), st.loginId);
      if (res.ok) {
        st.db = res.db; advance(st, 2);
        ui.newDraft = emptyNewDraft();
        ui.compTab = 'counts'; ui.countId = res.count.id;
        setMsg('ok', res.message);
      } else setMsg('err', res.errors);
      addCoach(emit('create', { result: res, input }));
      rerenderComputer();
      render();
    };
    if (!createCount(st.db, input, nowStr(st), st.loginId).ok) { commit(); return; }
    ui.compMsg = null;
    const r = emit('beforeCreate', { input });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    commit();
  });
}

function renderMoves(panel) {
  const st = gameState;
  const d = ui.moveDraft;
  const fl = ui.moveFilter;
  const active = st.db.items.filter(i => i.active).slice().sort(byItemNo);
  const all = st.db.items.slice().sort(byItemNo);
  panel.innerHTML =
    '<h3>登錄入庫／出庫</h3><form id="f-move" class="grid-form">' +
    '<label>料號 <select id="mv-item"><option value="">請選擇</option>' + active.map(i => '<option value="' + i.id + '"' + (String(i.id) === String(d.item_id) ? ' selected' : '') + '>' + esc(i.item_no + ' ' + i.name) + '（帳面 ' + i.book_qty + ' ' + esc(i.unit) + '）</option>').join('') + '</select></label>' +
    '<label>異動類別 <select id="mv-type"><option value="">請選擇</option><option' + (d.move_type === '入庫' ? ' selected' : '') + '>入庫</option><option' + (d.move_type === '出庫' ? ' selected' : '') + '>出庫</option></select></label>' +
    '<label>數量 <input id="mv-qty" inputmode="numeric" autocomplete="off" value="' + esc(d.qty) + '"></label>' +
    '<label>說明 <input id="mv-note" value="' + esc(d.note) + '"></label>' +
    '<div class="row"><button type="submit">登錄</button></div></form>' +
    '<h3>異動紀錄</h3><form id="f-filter" class="row"><label>料號 <select id="mf-item"><option value="">全部</option>' + all.map(i => '<option value="' + i.id + '"' + (String(i.id) === String(fl.item_id) ? ' selected' : '') + '>' + esc(i.item_no + ' ' + i.name) + (i.active ? '' : '（停用）') + '</option>').join('') + '</select></label>' +
    '<label>類別 <select id="mf-type"><option value="">全部</option>' + MOVE_TYPES.map(t => '<option' + (t === fl.move_type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label></form>' +
    movesTableHtml(st.db, fl, '');
  const sync = () => { d.item_id = $('#mv-item').value; d.move_type = $('#mv-type').value; d.qty = $('#mv-qty').value; d.note = $('#mv-note').value; };
  $all('#f-move input, #f-move select', panel).forEach(i => { i.addEventListener('input', sync); i.addEventListener('change', sync); });
  $all('#f-filter select', panel).forEach(s => s.addEventListener('change', () => { fl.item_id = $('#mf-item').value; fl.move_type = $('#mf-type').value; rerenderComputer(s.id); }));
  $('#f-move', panel).addEventListener('submit', e => {
    e.preventDefault();
    sync();
    const input = Object.assign({}, d);
    const commit = () => {
      const res = createMove(st.db, input, nowStr(st), st.loginId);
      if (res.ok) { st.db = res.db; advance(st, 2); setMsg('ok', res.message); ui.moveDraft = emptyMoveDraft(); }
      else setMsg('err', res.errors);
      addCoach(emit('move', { result: res, input }));
      rerenderComputer();
      render();
    };
    if (!createMove(st.db, input, nowStr(st), st.loginId).ok) { commit(); return; }
    ui.compMsg = null;
    const r = emit('beforeMove', { input });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    commit();
  });
}

function renderItems(panel) {
  const st = gameState;
  panel.innerHTML = '<table class="data"><thead><tr><th>料號</th><th>品名</th><th>規格</th><th>單位</th><th>儲位</th><th>帳面數量</th><th>狀態</th><th>盤點中</th></tr></thead><tbody>' +
    st.db.items.slice().sort(byItemNo).map(i => { const o = openCountOf(st.db, i.id); return '<tr><td>' + esc(i.item_no) + '</td><td>' + esc(i.name) + '</td><td>' + esc(i.spec) + '</td><td>' + esc(i.unit) + '</td><td>' + esc(i.location) +
      '</td><td>' + i.book_qty + '</td><td>' + (i.active ? '啟用' : '停用') + '</td><td>' + (o ? esc(o.count_no) : '') + '</td></tr>'; }).join('') +
    '</tbody></table><p class="hint">帳面數量只能經由庫存異動改變，這個畫面不能直接修改。（遊戲中不重做料號維護）</p>';
}

/* phone (dialing out) */
const PHONE_BOOK = { '2201': '陳振宇', '2210': '出貨組' };
function openPhone() {
  ui.phoneLog = [];
  openModal('分機（系統以外的人工作業）', renderPhone);
}
function renderPhone(body) {
  body.innerHTML = '<p class="hint">輸入分機號碼後撥打。電話內容不會留在系統紀錄裡。常用分機：課長 2201、出貨組 2210。</p>' +
    '<form id="f-phone" class="row"><label>分機 <input id="in-ext" inputmode="numeric" autocomplete="off" maxlength="6"></label><button type="submit">撥打</button></form>' +
    '<div class="talk" id="phone-log" aria-live="polite">' + ui.phoneLog.map(lineHtml).join('') + '</div>';
  $('#f-phone', body).addEventListener('submit', e => {
    e.preventDefault();
    const st = gameState;
    const ext = $('#in-ext').value.trim();
    if (!/^\d+$/.test(ext)) ui.phoneLog.push({ who: '電話', text: '請輸入數字分機號碼。' });
    else {
      advance(st, 1);
      Sound.sfx('ring');
      const lines = (ctrl.onPhone && ctrl.onPhone(st, ext)) ||
        (PHONE_BOOK[ext] ? [{ who: PHONE_BOOK[ext], text: '喂？……喔，沒事啊？好。' }] : [{ who: '電話', text: '（嘟嘟嘟——您撥的分機號碼不存在。）' }]);
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
    btn.addEventListener('click', () => { closeModal(true); onDone(); });
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
  '<tr><th>WASD／方向鍵</th><td>每次移動一格，只能上下左右，遇到貨架或牆不移動</td></tr>' +
  '<tr><th>E</th><td>和相鄰（優先面向）的人物、貨架、電腦、分機或出貨點交台互動</td></tr>' +
  '<tr><th>Esc</th><td>關閉對話或表單；在場景中開啟暫停選單</td></tr>' +
  '<tr><th>滑鼠、Tab、Enter</th><td>操作表單、選單、對話與問題</td></tr>' +
  '<tr><th>音樂／音效</th><td>畫面右上角的「音樂」「音效」按鈕可以分別開關，預設為開</td></tr>' +
  '<tr><th>快捷移動</th><td>右側面板的按鈕，可直接移到用過的電腦、分機、各排貨架或出貨區</td></tr>' +
  '</tbody></table><p class="hint">人物頭上的「！」表示現在和他說話會有進展。所有人名、料號、單號與數量都是虛構的。遊戲不連網、不儲存資料，重新整理就回到標題。</p>';

function openPause() {
  openModal('暫停', body => {
    body.innerHTML = '<div class="choices col">' +
      '<button type="button" id="p-resume">繼續</button>' +
      '<button type="button" class="secondary" id="p-help">操作說明</button>' +
      '<button type="button" class="secondary" id="p-restart">重新開始本關（資料回到初始狀態）</button>' +
      '<button type="button" class="secondary" id="p-title">回到標題</button></div>';
    $('#p-resume', body).addEventListener('click', () => closeModal());
    $('#p-help', body).addEventListener('click', () => openModal('操作說明', b => { b.innerHTML = HELP_HTML + '<div class="choices"><button type="button" id="h-ok">知道了</button></div>'; $('#h-ok', b).addEventListener('click', () => closeModal()); }));
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
  $('#btn-help-title').addEventListener('click', () => openModal('操作說明', b => { b.innerHTML = HELP_HTML + '<div class="choices"><button type="button" id="h-ok">知道了</button></div>'; $('#h-ok', b).addEventListener('click', () => closeModal()); }));
  document.addEventListener('keydown', onKey);
  showTitle();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initUI);
