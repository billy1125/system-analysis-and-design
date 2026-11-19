'use strict';
/*
 * Quality issue reporting simulation game (teaching material).
 * Plain HTML/CSS/JS. Opens from file:// with no network and no storage.
 * Sections:
 *   1. constants and helpers
 *   2. issue rules (pure functions, no DOM), taken from SAD-Quality lib/rules.js and routes/issues.js
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
  '#C.T...PP.#M..M..M.#',
  '#.........D........F',
  '#.........#........F',
  '#..BBB....#M..M..M.#',
  '#..BBB....#........#',
  '#.........D........#',
  '#.II......#M..M..M.#',
  '#####GG#############'
];
const MAP_W = MAP_ROWS[0].length;
const MAP_H = MAP_ROWS.length;
const BLOCKING = '#CTPBIMGF';
const OBJECTS = { C: 'computer', T: 'phone' };
const OBJECT_LABELS = { computer: '品管電腦', phone: '電話' };
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

/* ---------- 2. issue rules (pure functions, no DOM) ---------- */

const STATUSES = ['待處理', '處理中', '已結案', '不成立'];
const OPEN_STATUSES = ['待處理', '處理中'];
const STATUS_CLASS = { 待處理: 'pending', 處理中: 'working', 已結案: 'closed', 不成立: 'rejected' };
// Buttons shown on the detail page for each status. Finished issues have none.
const ACTIONS = {
  待處理: [['edit', '修改'], ['assign', '指派'], ['reject', '判定不成立']],
  處理中: [['edit', '修改'], ['assign', '改派'], ['close', '結案'], ['reject', '判定不成立']]
};

function nextId(rows) { return rows.reduce((m, r) => Math.max(m, r.id), 0) + 1; }
function txt(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function toId(v) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }
function isDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
// 'YYYY-MM-DDTHH:MM' or 'YYYY-MM-DD HH:MM' -> 'YYYY-MM-DD HH:MM', or null
function toMinuteTime(v) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(:00)?$/.exec(v);
  if (!m || !isDate(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  return m[1] + ' ' + m[2] + ':' + m[3];
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function isOpen(issue) { return OPEN_STATUSES.includes(issue.status); }

// Elapsed days are derived, not stored: open issues count to today, finished ones to the closing date.
function issueDays(issue, today) {
  const end = isOpen(issue) ? today : issue.closed_at.slice(0, 10);
  return daysBetween(issue.found_at.slice(0, 10), end);
}

// QI-YYMM-NNN, YYMM from the registration date (not the found date)
function nextIssueNo(db, now) {
  const prefix = 'QI-' + now.slice(2, 4) + now.slice(5, 7) + '-';
  const nums = db.issues.filter(i => i.issue_no.startsWith(prefix)).map(i => Number(i.issue_no.slice(prefix.length)));
  const seq = nums.length ? Math.max.apply(null, nums) + 1 : 1;
  return prefix + String(seq).padStart(3, '0');
}

// Field checks in the original order; stop at the first error (one message at a time).
// old is the issue being edited, or null when registering.
function checkIssueFields(db, input, old, now) {
  const err = message => ({ error: message });
  const foundAt = toMinuteTime(txt(input.found_at));
  if (!foundAt) return err('請輸入正確的發現時間');
  if (foundAt > now) return err('發現時間不能晚於現在');
  const reporter = txt(input.reporter);
  if (!reporter) return err('請輸入回報人');
  if (reporter.length > 20) return err('回報人不可超過 20 字');
  const line = txt(input.line);
  if (!line) return err('請輸入產線');
  if (line.length > 20) return err('產線不可超過 20 字');
  const station = txt(input.station);
  if (station.length > 30) return err('工站或機台不可超過 30 字');
  const productId = toId(input.product_id);
  const product = productId && db.products.find(p => p.id === productId);
  if (!product) return err('請選擇產品');
  if (!product.active && !(old && old.product_id === productId)) return err('產品 ' + product.part_no + ' 已停用，請重新選擇');
  const lotNo = txt(input.lot_no);
  if (lotNo.length > 20) return err('批號不可超過 20 字');
  const typeId = toId(input.defect_type_id);
  const type = typeId && db.defectTypes.find(t => t.id === typeId);
  if (!type) return err('請選擇異常類別');
  if (!type.active && !(old && old.defect_type_id === typeId)) return err('異常類別「' + type.name + '」已停用，請重新選擇');
  const description = txt(input.description);
  if (!description) return err('請輸入異常描述');
  if (description.length > 200) return err('異常描述不可超過 200 字');
  const qtyText = txt(input.qty);
  const qty = Number(qtyText);
  if (!/^\d+$/.test(qtyText) || qty > 99999) return err('影響數量須為 0 到 99999 的整數');
  return {
    value: {
      found_at: foundAt, reporter, line, station: station || null, product_id: productId,
      lot_no: lotNo || null, defect_type_id: typeId, description, qty
    }
  };
}

function findIssue(db, id) { return db.issues.find(i => i.id === id) || null; }
const NOT_FOUND = '找不到這張異常單';

function createIssue(db, input, now, userId) {
  const f = checkIssueFields(db, input, null, now);
  if (f.error) return { ok: false, errors: [f.error], db };
  const next = clone(db);
  const issue = Object.assign({ id: nextId(next.issues), issue_no: nextIssueNo(next, now) }, f.value, {
    status: '待處理', dept_id: null, assigned_by: null, assigned_at: null, resolution: null,
    closed_by: null, closed_at: null, created_by: userId, created_at: now, updated_at: null
  });
  next.issues.push(issue);
  return { ok: true, errors: [], db: next, issue, message: '已登記異常單 ' + issue.issue_no };
}

// Editing writes updated_at; assign, close and reject do not.
function updateIssue(db, id, input, now) {
  const issue = findIssue(db, id);
  if (!issue) return { ok: false, errors: [NOT_FOUND], db };
  if (!isOpen(issue)) return { ok: false, errors: ['這張異常單已結案或判定不成立，不能修改'], db };
  const f = checkIssueFields(db, input, issue, now);
  if (f.error) return { ok: false, errors: [f.error], db };
  const next = clone(db);
  const ni = findIssue(next, id);
  Object.assign(ni, f.value, { updated_at: now });
  return { ok: true, errors: [], db: next, issue: ni, message: '已儲存異常單' };
}

// Assign and reassign share one action. Reassigning overwrites department, assigner and time (no history).
function assignIssue(db, id, deptIdInput, now, userId) {
  const issue = findIssue(db, id);
  if (!issue) return { ok: false, errors: [NOT_FOUND], db };
  if (!isOpen(issue)) return { ok: false, errors: ['這張異常單已結案或判定不成立，不能指派'], db };
  const deptId = toId(deptIdInput);
  const dept = deptId && db.departments.find(d => d.id === deptId);
  if (!dept) return { ok: false, errors: ['請選擇責任單位'], db };
  if (!dept.active) return { ok: false, errors: ['責任單位「' + dept.name + '」已停用，請重新選擇'], db };
  const reassign = issue.status === '處理中';
  if (reassign && issue.dept_id === dept.id) return { ok: false, errors: ['責任單位沒有變更'], db };
  const next = clone(db);
  const ni = findIssue(next, id);
  Object.assign(ni, { status: '處理中', dept_id: dept.id, assigned_by: userId, assigned_at: now });
  return { ok: true, errors: [], db: next, issue: ni, reassign, message: '已' + (reassign ? '改派' : '指派') + '給 ' + dept.name };
}

function closeIssue(db, id, resolutionInput, now, userId) {
  const issue = findIssue(db, id);
  if (!issue) return { ok: false, errors: [NOT_FOUND], db };
  if (issue.status !== '處理中') return { ok: false, errors: ['只有處理中的異常單可以結案'], db };
  const resolution = txt(resolutionInput);
  if (!resolution) return { ok: false, errors: ['請輸入處理對策'], db };
  if (resolution.length > 200) return { ok: false, errors: ['處理對策不可超過 200 字'], db };
  const next = clone(db);
  const ni = findIssue(next, id);
  Object.assign(ni, { status: '已結案', resolution, closed_by: userId, closed_at: now });
  return { ok: true, errors: [], db: next, issue: ni, message: '已結案 ' + ni.issue_no };
}

// Not a real issue. The reason goes into the same field as the countermeasure; department stays as it was.
function rejectIssue(db, id, reasonInput, now, userId) {
  const issue = findIssue(db, id);
  if (!issue) return { ok: false, errors: [NOT_FOUND], db };
  if (!isOpen(issue)) return { ok: false, errors: ['這張異常單已結案或判定不成立'], db };
  const reason = txt(reasonInput);
  if (!reason) return { ok: false, errors: ['請輸入不成立的理由'], db };
  if (reason.length > 200) return { ok: false, errors: ['不成立的理由不可超過 200 字'], db };
  const next = clone(db);
  const ni = findIssue(next, id);
  Object.assign(ni, { status: '不成立', resolution: reason, closed_by: userId, closed_at: now });
  return { ok: true, errors: [], db: next, issue: ni, message: '已判定 ' + ni.issue_no + ' 不成立' };
}

function userName(db, id) { const u = db.users.find(x => x.id === id); return u ? u.name : ''; }

function joinIssue(db, i, today) {
  const p = db.products.find(x => x.id === i.product_id) || {};
  const t = db.defectTypes.find(x => x.id === i.defect_type_id) || {};
  const d = db.departments.find(x => x.id === i.dept_id) || null;
  return Object.assign({}, i, {
    part_no: p.part_no || '?', product_name: p.name || '', customer: p.customer || '',
    defect_name: t.name || '?',
    dept_name: d ? d.name : '', dept_contact: d ? d.contact : '', dept_ext: d ? d.ext : '',
    created_by_name: userName(db, i.created_by), assigned_by_name: userName(db, i.assigned_by),
    closed_by_name: userName(db, i.closed_by), days: issueDays(i, today)
  });
}

// Open list: only 待處理 and 處理中, by found time. The summary ignores the filters.
function listOpen(db, filter, today) {
  filter = filter || {};
  let rows = db.issues.filter(isOpen);
  if (OPEN_STATUSES.includes(filter.status)) rows = rows.filter(i => i.status === filter.status);
  const deptId = toId(filter.dept_id);
  if (deptId) rows = rows.filter(i => i.dept_id === deptId);
  const typeId = toId(filter.defect_type_id);
  if (typeId) rows = rows.filter(i => i.defect_type_id === typeId);
  rows = rows.slice().sort((a, b) => a.found_at.localeCompare(b.found_at) || a.id - b.id).map(i => joinIssue(db, i, today));
  return { rows, summary: summarizeOpen(db) };
}
function summarizeOpen(db) {
  return {
    pending: db.issues.filter(i => i.status === '待處理').length,
    working: db.issues.filter(i => i.status === '處理中').length
  };
}

// Search: the keyword only matches the description.
function searchIssues(db, q, today) {
  q = q || {};
  const from = txt(q.from), to = txt(q.to);
  if (isDate(from) && isDate(to) && from > to) return { ok: false, errors: ['起始日期不可晚於結束日期'], rows: [] };
  let rows = db.issues.slice();
  if (isDate(from)) rows = rows.filter(i => i.found_at.slice(0, 10) >= from);
  if (isDate(to)) rows = rows.filter(i => i.found_at.slice(0, 10) <= to);
  const productId = toId(q.product_id);
  if (productId) rows = rows.filter(i => i.product_id === productId);
  const typeId = toId(q.defect_type_id);
  if (typeId) rows = rows.filter(i => i.defect_type_id === typeId);
  const deptId = toId(q.dept_id);
  if (deptId) rows = rows.filter(i => i.dept_id === deptId);
  if (STATUSES.includes(q.status)) rows = rows.filter(i => i.status === q.status);
  const keyword = txt(q.keyword);
  if (keyword) rows = rows.filter(i => i.description.indexOf(keyword) >= 0);
  rows.sort((a, b) => b.found_at.localeCompare(a.found_at) || b.id - a.id);
  return { ok: true, errors: [], rows: rows.map(i => joinIssue(db, i, today)) };
}

function actionsFor(status) { return ACTIONS[status] || []; }

/* ---------- 3. level data (fixed fictional data) ---------- */

function baseUsers() { return [{ id: 1, name: '吳承翰', role: '品管人員' }]; }
function baseProducts() {
  return [
    { id: 1, part_no: 'AP-5101', name: '車燈外殼（左）', customer: '華晟汽車', active: true },
    { id: 2, part_no: 'AP-5102', name: '車燈外殼（右）', customer: '華晟汽車', active: true },
    { id: 3, part_no: 'AP-5208', name: '門把底座', customer: '志嘉車業', active: true },
    { id: 4, part_no: 'AP-5302', name: '後視鏡外蓋', customer: '志嘉車業', active: true },
    { id: 5, part_no: 'AP-5410', name: '線束卡扣', customer: '華晟汽車', active: true },
    { id: 6, part_no: 'AP-5099', name: '排檔飾蓋（舊款）', customer: '志嘉車業', active: false }
  ];
}
function baseDepartments() {
  return [
    { id: 1, name: '製造一課', contact: '周家豪', ext: '3101', active: true },
    { id: 2, name: '製造二課', contact: '賴怡君', ext: '3201', active: true },
    { id: 3, name: '模具課', contact: '江志明', ext: '3301', active: true },
    { id: 4, name: '設備課', contact: '方俊宇', ext: '3401', active: true },
    { id: 5, name: '採購課', contact: '簡淑惠', ext: '3501', active: true },
    { id: 6, name: '外包管理課', contact: '葉建成', ext: '3701', active: false }
  ];
}
function baseDefectTypes() {
  return [
    { id: 1, name: '尺寸不良', active: true },
    { id: 2, name: '外觀不良', active: true },
    { id: 3, name: '功能不良', active: true },
    { id: 4, name: '材料不良', active: true },
    { id: 5, name: '其他', active: true },
    { id: 6, name: '包裝不良', active: false }
  ];
}
function mkIssue(o) {
  return Object.assign({
    station: null, lot_no: null, status: '待處理', dept_id: null, assigned_by: null, assigned_at: null,
    resolution: null, closed_by: null, closed_at: null, created_by: 1, created_at: o.found_at, updated_at: null
  }, o);
}
function baseDb(issues) {
  return { users: baseUsers(), products: baseProducts(), departments: baseDepartments(), defectTypes: baseDefectTypes(), issues };
}
const CLOSED_OLD = () => mkIssue({
  id: 3, issue_no: 'QI-2710-006', found_at: '2027-10-20 14:00', reporter: '何淑貞', line: '射出二線', station: '射出機 #08',
  product_id: 3, lot_no: 'L271020-01', defect_type_id: 4, description: '門把底座縮水', qty: 30, status: '已結案',
  dept_id: 2, assigned_by: 1, assigned_at: '2027-10-20 14:30', resolution: '更換乾燥後的塑膠粒，首件確認合格',
  closed_by: 1, closed_at: '2027-10-22 09:10', created_at: '2027-10-20 14:15'
});

function level1Data() {
  return baseDb([
    mkIssue({
      id: 1, issue_no: 'QI-2711-001', found_at: '2027-11-04 16:20', reporter: '蘇志偉', line: '組裝線', station: '外觀檢查站',
      product_id: 4, defect_type_id: 2, description: '後視鏡外蓋表面刮傷', qty: 12, created_at: '2027-11-04 16:35'
    }),
    mkIssue({
      id: 2, issue_no: 'QI-2711-002', found_at: '2027-11-03 10:05', reporter: '林秀英', line: '射出三線', station: '射出機 #11',
      product_id: 2, lot_no: 'L271103-05', defect_type_id: 1, description: '車燈外殼（右）卡榫孔位偏移', qty: 40,
      status: '處理中', dept_id: 4, assigned_by: 1, assigned_at: '2027-11-03 10:40', created_at: '2027-11-03 10:20'
    }),
    CLOSED_OLD()
  ]);
}

function level2Data() {
  return baseDb([
    mkIssue({
      id: 1, issue_no: 'QI-2711-001', found_at: '2027-11-03 14:30', reporter: '何淑貞', line: '射出二線', station: '射出機 #08',
      product_id: 3, lot_no: 'L271103-02', defect_type_id: 2, description: '門把底座表面黑點', qty: 150,
      status: '處理中', dept_id: 2, assigned_by: 1, assigned_at: '2027-11-03 15:10', created_at: '2027-11-03 14:50'
    }),
    mkIssue({
      id: 2, issue_no: 'QI-2711-002', found_at: '2027-11-05 08:40', reporter: '邱美華', line: '出貨檢驗', station: '檢驗台',
      product_id: 5, lot_no: 'L271104-03', defect_type_id: 1, description: '線束卡扣寬度超出上限', qty: 200, created_at: '2027-11-05 08:50'
    }),
    CLOSED_OLD()
  ]);
}

/* ---------- 4. game state and clock ---------- */

let gameState = null;
let RUN_SEQ = 0;

function newState(mode) {
  return {
    mode, runId: ++RUN_SEQ, db: null, clock: 0,
    player: { x: 2, y: 2, dir: 'up' },
    npcs: {}, flags: {}, trail: [], notes: [], predictions: {}, cr: null,
    visited: { computer: false, phone: false },
    done: false
  };
}
function advance(st, minutes) { st.clock += minutes * 60000; }
function nowStr(st) { return fmtDT(st.clock); }
function todayStr(st) { return nowStr(st).slice(0, 10); }
function addTrail(st, text) { st.trail.push(fmtHM(st.clock) + '　' + text); }
function addNote(st, text) { st.notes.push(text); log(text, 'note'); }
function npcDef(id, name, color, x, y, visible) {
  return { id, name, color, x, y, visible: visible !== false };
}

/* ---------- 5. level controllers (midterm) ---------- */

const STD_TABS = [
  { id: 'open', label: '未結案清單' },
  { id: 'new', label: '登記異常單' },
  { id: 'search', label: '異常單查詢' }
];

const MIDTERM_PROMPTS = [
  { h: '觀察', q: '品管工程師實際做了哪些事情？班長與責任單位做了哪些事情？系統負責哪些功能、存取與檢核？請把下面的操作紀錄分成「人工工作」與「系統功能」。' },
  { h: '推論', q: '登記、指派、改派、結案、判定不成立各改變哪些狀態與欄位？哪些值是存起來的，哪些是算出來的（例如經過天數）？' },
  { h: '實際系統待查證', q: '如何在真實系統及 SQLite 驗證上述推論？可能對應哪些使用案例、活動圖判斷點與資料表關聯？' }
];

function issuesTableHtml(db, today) {
  const rows = db.issues.map(i => joinIssue(db, i, today));
  const dash = v => v ? esc(v) : '<em>（空）</em>';
  return '<table class="data"><caption>模擬資料：異常單（issues）</caption><thead><tr>' +
    '<th>單號</th><th>狀態</th><th>回報人（文字）</th><th>責任單位</th><th>指派人</th><th>指派時間</th><th>處理對策／不成立理由</th><th>結案人</th><th>結案時間</th><th>登記人</th><th>最後修改</th><th>經過天數（推導）</th>' +
    '</tr></thead><tbody>' + rows.map(r => '<tr><td>' + esc(r.issue_no) + '</td><td>' + esc(r.status) + '</td><td>' + esc(r.reporter) +
      '</td><td>' + dash(r.dept_name) + '</td><td>' + dash(r.assigned_by_name) + '</td><td>' + dash(r.assigned_at) +
      '</td><td>' + dash(r.resolution) + '</td><td>' + dash(r.closed_by_name) + '</td><td>' + dash(r.closed_at) +
      '</td><td>' + esc(r.created_by_name) + '</td><td>' + dash(r.updated_at) + '</td><td>' + r.days + ' 天</td></tr>').join('') +
    '</tbody></table>';
}

function midtermSettlementHtml(st, topHtml) {
  return '<div class="settle">' + (topHtml || '') +
    '<div class="prompts">' + MIDTERM_PROMPTS.map((p, i) => '<section><h3>' + (i + 1) + '. ' + p.h + '</h3><p>' + p.q + '</p>' +
      (i === 0 ? '<ol class="trail">' + st.trail.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' : '') +
      (i === 1 ? issuesTableHtml(st.db, todayStr(st)) : '') + '</section>').join('') + '</div>' +
    '<p class="boundary">遊戲畫面與上面的資料是模擬教材的觀察，不是原系統資料庫的證據。正式分析請以實際系統為準。</p></div>';
}

function notesHud(st) {
  return '<h3>筆記（系統以外的資訊）</h3>' + (st.notes.length ? '<ul class="notes-list">' + st.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '<p class="hint">尚未記下筆記。</p>');
}

function deptOf(db, id) { return db.departments.find(d => d.id === id) || null; }

/* Level 1: normal flow */
function makeLevel1() {
  const REPORT = {
    found: '2027-11-05 08:10', reporter: '鄭國良', line: '射出一線', station: '射出機 #05', productId: 1,
    lot: 'L271105-01', typeId: 2, desc: '車燈外殼分模線有毛邊', qty: '80'
  };
  const CALLBACK = '調整保壓時間，首件確認合格；80 件修邊後入庫';
  const ours = st => st.flags.issueId ? findIssue(st.db, st.flags.issueId) : null;

  function maybeCallback(st) {
    const f = st.flags;
    if (!f.assigned || !f.called || f.callbackScheduled) return;
    f.callbackScheduled = true;
    whenIdle(() => {
      if (gameState !== st) return;
      st.clock = clockAt(2027, 11, 5, 14, 20);
      Sound.sfx('ring');
      f.callback = true;
      addTrail(st, '接聽製造一課周家豪回電：' + CALLBACK + '（系統外）');
      addNote(st, '製造一課回電：' + CALLBACK);
      showTalk([
        { who: '旁白', text: '（時間來到 14:20）電話響了。' },
        { who: '周家豪', text: '我是製造一課周家豪。射出機 #05 的毛邊，我們把保壓時間調整了，首件確認合格。' },
        { who: '周家豪', text: '那 80 件已經修邊，入庫了。這樣可以結了吧？' }
      ], [], { closeLabel: '記下回覆內容' });
      render();
    });
  }

  function mismatch(db, input) {
    const w = [];
    const found = toMinuteTime(txt(input.found_at));
    if (found && found !== REPORT.found) w.push('發現時間：你填的是 ' + found + '，班長說的是 ' + REPORT.found);
    if (txt(input.reporter) && txt(input.reporter) !== REPORT.reporter) w.push('回報人：你填的是「' + txt(input.reporter) + '」，口頭回報的是' + REPORT.reporter);
    if (txt(input.line) && txt(input.line) !== REPORT.line) w.push('產線：你填的是「' + txt(input.line) + '」，班長說的是' + REPORT.line);
    if (toId(input.product_id) && toId(input.product_id) !== REPORT.productId) w.push('產品：班長說的是 AP-5101 車燈外殼（左）');
    if (txt(input.lot_no) !== REPORT.lot) w.push('批號：班長說的是 ' + REPORT.lot);
    if (toId(input.defect_type_id) && toId(input.defect_type_id) !== REPORT.typeId) {
      const t = db.defectTypes.find(x => x.id === toId(input.defect_type_id));
      w.push('異常類別：你選的是「' + (t ? t.name : '?') + '」。毛邊是外觀上的問題，品保課通常歸在「外觀不良」');
    }
    if (txt(input.qty) && txt(input.qty) !== REPORT.qty) w.push('影響數量：你填的是 ' + txt(input.qty) + '，班長說的是約 ' + REPORT.qty + ' 件');
    return w;
  }

  function finish(st) {
    st.done = true;
    st.flags.phase = 'done';
    whenIdle(() => {
      const i = joinIssue(st.db, ours(st), todayStr(st));
      const s = summarizeOpen(st.db);
      const top = '<p class="ok">通關：' + esc(i.issue_no) + ' 已結案；未結案清單摘要回到「待處理 ' + s.pending + ' 件、處理中 ' + s.working + ' 件」。</p>' +
        '<table class="data compare"><caption>「實際發生」與「系統記錄」</caption><thead><tr><th></th><th>實際發生</th><th>系統記錄</th></tr></thead><tbody>' +
        '<tr><th>誰發現、誰回報</th><td>班長鄭國良走進品保課口頭回報</td><td>回報人欄位是一段文字「' + esc(i.reporter) + '」；登記人是你的帳號（' + esc(i.created_by_name) + '）</td></tr>' +
        '<tr><th>照片</th><td>傳到品管 LINE 群組</td><td>系統沒有地方放照片</td></tr>' +
        '<tr><th>通知責任單位</th><td>你打分機 3101 給製造一課周家豪</td><td>只記錄指派：' + esc(i.dept_name) + '、指派人 ' + esc(i.assigned_by_name) + '、' + esc(i.assigned_at) + '</td></tr>' +
        '<tr><th>處理對策</th><td>周家豪下午來電口頭回覆</td><td>你登錄的處理對策，加上結案人 ' + esc(i.closed_by_name) + '、結案時間 ' + esc(i.closed_at) + '</td></tr>' +
        '<tr><th>經過天數</th><td>—</td><td>' + i.days + ' 天（由發現日與結案日相減算出，沒有存在欄位裡）</td></tr>' +
        '</tbody></table>';
      openSettlement('第一關結算：觀察—推論—實際系統待查證', midtermSettlementHtml(st, top), [
        { label: '下一關：這不是我們的問題', run: () => startMode('level2') },
        { label: '重新開始本關', run: () => startMode('level1') },
        { label: '回到標題', run: showTitle }
      ]);
    });
  }

  const blockOther = '這一關先處理剛登記的毛邊異常單。其他單子的處理不在本關範圍。';

  return {
    id: 'level1', title: '第一關　早班的毛邊', role: '品管工程師 吳承翰', showSummary: true,
    setup(st) {
      st.db = level1Data();
      st.clock = clockAt(2027, 11, 5, 8, 30);
      st.player = { x: 2, y: 2, dir: 'right' };
      st.flags = { phase: 'report', talked: false, issueId: null, sawContacts: false, called: false, assigned: false, callbackScheduled: false, callback: false, closed: false };
      st.npcs = { lead: npcDef('lead', '射出一線班長 鄭國良', '#d97706', 5, 8) };
    },
    onStart() {
      walkNpc('lead', [[5, 6], [7, 6], [7, 3]]);
      showTalk([
        { who: '旁白', text: '11 月 5 日上午 8:30。你是品保課的品管工程師吳承翰，剛坐到位子上。射出一線的班長走進品保課。' },
        { who: '旁白', text: '方向鍵或 WASD 移動；面向角色、電腦或電話按 E 互動。對話與表單可用滑鼠或 Tab、Enter 操作。' }
      ], [], { closeLabel: '開始' });
    },
    objective(st) {
      const f = st.flags;
      const i = ours(st);
      return {
        title: '射出一線的毛邊', items: [
          { text: '和班長對話，記下口頭回報的內容', done: f.talked },
          { text: '到電腦「登記異常單」，依筆記填寫並送出', done: !!i },
          { text: '打開新單的明細，在「指派」看責任單位的窗口與分機', done: f.sawContacts },
          { text: '用電話聯絡製造一課窗口，說明狀況', done: f.called },
          { text: '回電腦在明細指派給製造一課', done: f.assigned },
          { text: '等製造一課回覆處理對策', done: f.callback },
          { text: '在明細按「結案」，輸入處理對策送出', done: f.closed }
        ]
      };
    },
    hudExtra: notesHud,
    npcAttention(st, id) { return id === 'lead' && !st.flags.talked; },
    onTalk(st, id) {
      const f = st.flags;
      if (id !== 'lead') return;
      if (f.talked) return showTalk([{ who: '鄭國良', text: '單子登記好就好，我先回線上了。' }]);
      showTalk([
        { who: '鄭國良', text: '品管，射出一線 #05 那台的車燈外殼（左），分模線有毛邊。' },
        { who: '鄭國良', text: '早上 08:10 首件做完發現的，批號 L271105-01，大概 80 件。' },
        { who: '鄭國良', text: '照片我已經傳到品管 LINE 群組了。射出一線歸製造一課管，要找他們處理。' }
      ], [{
        label: '記下口頭回報',
        run: () => {
          f.talked = true;
          advance(st, 2);
          addTrail(st, '聽班長鄭國良口頭回報，記下內容（系統外）');
          addNote(st, '鄭國良（射出一線班長）口頭回報：' + REPORT.found + ' 發現，射出一線 射出機 #05，AP-5101 車燈外殼（左），批號 ' + REPORT.lot + '，分模線有毛邊，約 80 件；照片在 LINE 群組');
          walkNpc('lead', [[7, 6], [5, 6], [5, 8]], () => hideNpc('lead'));
        }
      }]);
    },
    onPhone(st, ext) {
      const f = st.flags;
      if (ext !== '3101') return null;
      if (!f.issueId) return [{ who: '周家豪', text: '製造一課周家豪。毛邊？好，我先過去看。異常單登記好之後，再把單號給我。' }];
      const no = ours(st).issue_no;
      if (f.called) return [{ who: '周家豪', text: '好，我知道了，下午回你。' }];
      f.called = true;
      addTrail(st, '撥打分機 3101 通知製造一課周家豪（系統外）');
      maybeCallback(st);
      return [{ who: '周家豪', text: '喂，製造一課周家豪。射出一線 #05 的車燈外殼有毛邊？單號 ' + no + '，好，我馬上過去看，下午回你。' }];
    },
    computerTabs() { return STD_TABS; },
    registerFill() {
      return { found: REPORT.found.replace(' ', 'T'), reporter: REPORT.reporter, line: REPORT.line, station: REPORT.station, product: String(REPORT.productId), lot: REPORT.lot, type: '', desc: REPORT.desc, qty: REPORT.qty };
    },
    textFill(st, mode, issue) { return mode === 'close' && issue.id === st.flags.issueId && st.flags.callback ? CALLBACK : null; },
    onSystem(st, evt) {
      const f = st.flags;
      const mine = evt.issue && evt.issue.id === f.issueId;
      switch (evt.type) {
        case 'beforeCreate':
          if (!f.talked) return { block: '先和班長談過、記下口頭回報的內容，再登記。' };
          if (f.issueId) return { block: '這件毛邊已經登記成 ' + ours(st).issue_no + ' 了。系統不會擋重複登記，但同一件事會變成兩張單。' };
          { const w = mismatch(st.db, evt.input); return w.length ? { warn: w } : {}; }
        case 'create':
          if (evt.result.ok) {
            f.issueId = evt.result.issue.id;
            addTrail(st, '送出登記：系統產生 ' + evt.result.issue.issue_no + '，狀態「待處理」');
            return { coach: '系統產生單號 ' + evt.result.issue.issue_no + '，狀態「待處理」。登記人是你的帳號；回報人鄭國良只是一段文字，他沒有系統帳號。' };
          }
          addTrail(st, '送出登記失敗：' + evt.result.errors.join('；'));
          return {};
        case 'openAction':
          if (evt.mode === 'assign' && mine && !f.sawContacts) {
            f.sawContacts = true;
            addTrail(st, '在指派下拉選單看到各責任單位的窗口與分機');
            return { coach: '下拉選單裡看得到各單位的窗口與分機。系統只記錄「指派給誰」，不會通知對方；聯絡要靠你自己打電話。' };
          }
          return {};
        case 'beforeAssign':
          if (!mine) return { block: blockOther };
          if (toId(evt.deptId) && toId(evt.deptId) !== 1) return { block: '班長說射出一線歸製造一課管。這一關請指派給製造一課。' };
          return {};
        case 'assign':
          if (evt.result.ok && mine) {
            f.assigned = true;
            addTrail(st, '指派給製造一課：狀態變為「處理中」，寫入指派人與指派時間');
            maybeCallback(st);
            if (!f.called) return { coach: '系統完成指派，狀態變為「處理中」。不過你還沒打電話：系統不會通知製造一課。' };
            return { coach: '狀態變為「處理中」，系統寫入了指派人與指派時間。製造一課處理完會打電話回覆。' };
          }
          if (!evt.result.ok) addTrail(st, '指派失敗：' + evt.result.errors.join('；'));
          return {};
        case 'beforeClose':
          if (!mine) return { block: blockOther };
          if (!f.callback) return { block: '製造一課還沒回覆處理對策。系統其實允許處理中的單隨時結案，但對策要等責任單位處理後才知道。' };
          return {};
        case 'close':
          if (evt.result.ok && mine) {
            f.closed = true;
            addTrail(st, '登錄處理對策並結案：寫入結案人與結案時間');
            return { coach: '狀態變為「已結案」，寫入結案人與結案時間。明細上的操作按鈕全部消失：已結案是終點，不能再修改或重新開啟。' };
          }
          if (!evt.result.ok) addTrail(st, '結案失敗：' + evt.result.errors.join('；'));
          return {};
        case 'beforeReject':
          if (!mine) return { block: blockOther };
          return { block: '毛邊是真的發生了，不需要判定不成立。' };
      }
      return {};
    },
    afterAction(st) {
      if (st.done || !st.flags.closed) return;
      const s = summarizeOpen(st.db);
      if (s.pending === 1 && s.working === 1) finish(st);
    }
  };
}

/* Level 2: reassigning overwrites the previous department */
function makeLevel2() {
  const A = 1, B = 2;
  const CALL = '製造二課賴怡君來電：查了兩天，機台與製程正常，是這批塑膠粒裡有雜質，不是製程問題，要轉給採購課';
  const REJECT_REASON = '卡尺未歸零，歸零後重新量測 200 件全數合格';

  function predictionQuestions() {
    return [
      {
        id: 'dept', q: '① 改派完成後，明細上的「責任單位」會顯示什麼？',
        options: ['製造二課', '採購課', '製造二課與採購課都列出'], answer: '採購課',
        explain: '異常單只有一個責任單位欄位，改派直接覆蓋成這一次選的單位，前一個單位不會留下。'
      },
      {
        id: 'time', q: '② 改派完成後，「指派時間」會是哪一個？',
        options: ['保留 11-03 15:10 第一次指派的時間', '變成這次改派的操作時刻', '兩個時間都保留'], answer: '變成這次改派的操作時刻',
        explain: '指派與改派共用同一個動作，指派人、指派時間都寫入這一次的值。第一次指派的時間被蓋掉。'
      },
      {
        id: 'trace', q: '③ 製造二課這兩天的處理經過（查出原料雜質）會出現在哪裡？',
        options: ['明細上的指派紀錄', '處理對策欄位', '系統裡看不到，只在電話和人的記憶裡'], answer: '系統裡看不到，只在電話和人的記憶裡',
        explain: '系統沒有指派歷程，處理對策要到結案才填。製造二課查了什麼、花了幾天，系統裡沒有地方留下。'
      }
    ];
  }

  function finish(st) {
    if (st.done) return;
    st.done = true;
    whenIdle(() => openSettlement('第二關結算：實際發生與系統記錄', settlementHtml(st), [
      { label: '重新開始本關', run: () => startMode('level2') },
      { label: '回到第一關', run: () => startMode('level1') },
      { label: '回到標題', run: showTitle }
    ]));
  }

  function settlementHtml(st) {
    const a = joinIssue(st.db, findIssue(st.db, A), todayStr(st));
    const b = joinIssue(st.db, findIssue(st.db, B), todayStr(st));
    const qs = predictionQuestions();
    const result = { dept: a.dept_name, time: a.assigned_at + '（這次改派的操作時刻）', trace: '系統裡沒有紀錄' };
    const pred = qs.map(q => '<li>' + esc(q.q) + '<br>你的預測：' + esc(st.predictions[q.id] || '（未作答）') + '　系統結果：' + esc(result[q.id]) + '</li>').join('');
    const top =
      '<table class="data compare"><caption>黑點那張單 ' + esc(a.issue_no) + '：實際發生與系統記錄</caption><thead><tr><th></th><th>實際發生</th><th>系統記錄</th></tr></thead><tbody>' +
      '<tr><th>經手的責任單位</th><td>製造二課（11-03 起查了兩天）→ 採購課</td><td>' + esc(a.dept_name) + '（只留最後一次）</td></tr>' +
      '<tr><th>指派時間</th><td>第一次 2027-11-03 15:10；改派 ' + esc(a.assigned_at) + '</td><td>' + esc(a.assigned_at) + '</td></tr>' +
      '<tr><th>製造二課查到什麼</th><td>機台與製程正常，原料批次有雜質（電話口述）</td><td>系統沒有地方記錄</td></tr>' +
      '<tr><th>狀態與經過天數</th><td>—</td><td>' + esc(a.status) + '；' + a.days + ' 天（仍從發現日 ' + esc(a.found_at.slice(0, 10)) + ' 算起，改派不會重算）</td></tr>' +
      '</tbody></table>' +
      '<table class="data compare"><caption>卡扣那張單 ' + esc(b.issue_no) + '：實際發生與系統記錄</caption><thead><tr><th></th><th>實際發生</th><th>系統記錄</th></tr></thead><tbody>' +
      '<tr><th>結果</th><td>卡尺沒有歸零，複量後全數合格</td><td>狀態「' + esc(b.status) + '」</td></tr>' +
      '<tr><th>理由寫在哪裡</th><td>—</td><td>和處理對策同一個欄位：「' + esc(b.resolution || '') + '」</td></tr>' +
      '<tr><th>責任單位</th><td>沒有指派過</td><td>' + (b.dept_name ? esc(b.dept_name) : '（空）') + '：沒有指派過也能直接判定不成立</td></tr>' +
      '</tbody></table>' +
      '<h3>你的預測與系統結果</h3><ol class="pred">' + pred + '</ol>';
    return midtermSettlementHtml(st, top);
  }

  return {
    id: 'level2', title: '第二關　這不是我們的問題', role: '品管工程師 吳承翰', showSummary: true,
    setup(st) {
      st.db = level2Data();
      st.clock = clockAt(2027, 11, 5, 9, 0);
      st.player = { x: 2, y: 2, dir: 'right' };
      st.flags = { heardCall: false, viewedA: false, reassigned: false, predicted: false, inspTalked: false, rejected: false };
      st.npcs = { insp: npcDef('insp', '出貨檢驗員 邱美華', '#7c3aed', 4, 7) };
    },
    onStart(st) {
      showTalk([
        { who: '旁白', text: '11 月 5 日上午 9:00。你是品管工程師吳承翰。未結案清單上有一張門把底座黑點的單，兩天前指派給製造二課；另一張是出貨檢驗剛回報的卡扣尺寸問題。' }
      ], [], { closeLabel: '開始' });
      whenIdle(() => {
        if (gameState !== st) return;
        Sound.sfx('ring');
        st.flags.heardCall = true;
        advance(st, 2);
        addTrail(st, '接聽製造二課賴怡君來電：原料雜質，要轉給採購課（系統外）');
        addNote(st, CALL);
        showTalk([
          { who: '旁白', text: '電話響了。' },
          { who: '賴怡君', text: '品管你好，我是製造二課賴怡君。門把底座黑點那張單，我們查了兩天。' },
          { who: '賴怡君', text: '機台跟製程都正常，是這批塑膠粒裡面有雜質。這不是我們的問題，要轉給採購課去跟供應商處理。' }
        ], [], { closeLabel: '記下來電內容' });
        render();
      });
    },
    objective(st) {
      const f = st.flags;
      return {
        title: '改派與判定不成立', items: [
          { text: '接聽製造二課的來電', done: f.heardCall },
          { text: '在未結案清單打開 QI-2711-001（黑點）的明細', done: f.viewedA },
          { text: '用「改派」把它改給採購課（送出前先預測）', done: f.reassigned },
          { text: '到檢驗台向出貨檢驗員確認卡扣的複量結果', done: f.inspTalked },
          { text: '對 QI-2711-002（卡扣）判定不成立', done: f.rejected }
        ]
      };
    },
    hudExtra: notesHud,
    npcAttention(st, id) { return id === 'insp' && st.flags.reassigned && !st.flags.inspTalked; },
    onTalk(st, id) {
      const f = st.flags;
      if (id !== 'insp') return;
      if (f.inspTalked) return showTalk([{ who: '邱美華', text: '卡尺我已經歸零了，之後會先檢查。' }]);
      if (!f.reassigned) return showTalk([{ who: '邱美華', text: '卡扣那批我正在重新量，等一下跟你說。' }]);
      f.inspTalked = true;
      advance(st, 3);
      addTrail(st, '到檢驗台聽邱美華說明：卡尺沒歸零，複量全數合格（系統外）');
      addNote(st, '出貨檢驗員邱美華：' + REJECT_REASON);
      showTalk([
        { who: '邱美華', text: '我重新量過了，是卡尺沒有歸零。歸零之後，200 件全部都在規格內。' },
        { who: '邱美華', text: '所以那張卡扣的單，不是真的異常。' }
      ], [], { closeLabel: '記下複量結果' });
    },
    onPhone(st, ext) {
      if (ext === '3201') return [{ who: '賴怡君', text: '黑點那張就麻煩你轉給採購課了。' }];
      if (ext === '3501') {
        addTrail(st, '撥打分機 3501 通知採購課簡淑惠（系統外）');
        return [{ who: '簡淑惠', text: '採購課簡淑惠。塑膠粒有雜質？好，我先聯絡供應商。之前製造二課查到什麼，可以再跟我說一次嗎？' }];
      }
      return null;
    },
    computerTabs() { return STD_TABS; },
    textFill(st, mode, issue) { return mode === 'reject' && issue.id === B && st.flags.inspTalked ? REJECT_REASON : null; },
    onSystem(st, evt) {
      const f = st.flags;
      const id = evt.issue ? evt.issue.id : null;
      switch (evt.type) {
        case 'openDetail':
          if (id === A && !f.viewedA) { f.viewedA = true; addTrail(st, '打開 QI-2711-001 的明細：責任單位製造二課，指派時間 11-03 15:10'); }
          return {};
        case 'beforeCreate':
          return { block: '這一關不需要登記新的異常單。' };
        case 'beforeAssign':
          if (id === B) return { block: '卡扣這張單還在等檢驗員複量的結果，先不要指派。' };
          if (id !== A) return {};
          if (toId(evt.deptId) && toId(evt.deptId) !== evt.issue.dept_id) {
            if (toId(evt.deptId) !== 5) return { block: '製造二課說要轉給採購課，請改派給採購課。' };
            if (!f.predicted) {
              return {
                intercept: proceed => openQuiz('改派前先預測', '按下送出之前，先預測三件事。選完會看到說明，可以改選，不計分。',
                  predictionQuestions(), st.predictions, '繼續改派', () => { f.predicted = true; proceed(); })
              };
            }
          }
          return {};
        case 'assign':
          if (!evt.result.ok) {
            addTrail(st, '改派失敗：' + evt.result.errors.join('；'));
            if (evt.result.errors[0] === '責任單位沒有變更') return { coach: '系統拒絕了，資料沒有改變。改派時下拉選單預設是目前的單位，要選一個不同的單位才能送出。' };
            return {};
          }
          if (id === A) {
            f.reassigned = true;
            addTrail(st, '改派給採購課：責任單位、指派人、指派時間被覆蓋成 ' + evt.result.issue.assigned_at);
            return { coach: '責任單位、指派人、指派時間都直接覆蓋成這一次的值（' + evt.result.issue.assigned_at + '），狀態仍是「處理中」。明細上已經看不到製造二課曾經經手。' };
          }
          return {};
        case 'beforeReject':
          if (id === A) return { block: '黑點是真的異常，已經查出原料雜質，不是不成立。' };
          if (id === B && !f.inspTalked) return { block: '先到檢驗台向出貨檢驗員確認複量結果，再判定。' };
          return {};
        case 'reject':
          if (!evt.result.ok) { addTrail(st, '判定不成立失敗：' + evt.result.errors.join('；')); return {}; }
          if (id === B) {
            f.rejected = true;
            addTrail(st, '判定 QI-2711-002 不成立：理由寫入處理對策欄位');
            return { coach: '狀態變為「不成立」。理由寫在和處理對策同一個欄位；責任單位仍是空的，明細上不再有操作按鈕。' };
          }
          return {};
        case 'beforeClose':
          if (id === A) return { block: '採購課還沒處理，現在不是結案的時候。' };
          if (id === B) return {};
          return {};
      }
      return {};
    },
    afterAction(st) { if (!st.done && st.flags.reassigned && st.flags.rejected) finish(st); }
  };
}

/* ---------- 6. CR scenario controller (final only) ---------- */

let FinalDemo = null;

/* @@FINAL_BEGIN */
const CR_SCENARIOS = {};

function cr01Data() {
  return baseDb([
    mkIssue({
      id: 1, issue_no: 'QI-2709-004', found_at: '2027-09-14 09:20', reporter: '鄭國良', line: '射出一線', station: '射出機 #05',
      product_id: 1, lot_no: 'L270914-02', defect_type_id: 2, description: '車燈外殼分模線有毛邊', qty: 60, status: '已結案',
      dept_id: 1, assigned_by: 1, assigned_at: '2027-09-14 10:00', resolution: '調整射出壓力與保壓時間，首件確認合格',
      closed_by: 1, closed_at: '2027-09-15 16:30', created_at: '2027-09-14 09:40'
    }),
    mkIssue({
      id: 2, issue_no: 'QI-2710-002', found_at: '2027-10-07 13:40', reporter: '鄭國良', line: '射出一線', station: '射出機 #05',
      product_id: 1, lot_no: 'L271007-03', defect_type_id: 2, description: '分模線毛邊，邊緣刮手', qty: 95, status: '已結案',
      dept_id: 1, assigned_by: 1, assigned_at: '2027-10-07 14:10', resolution: '調整射速與模溫，修邊後入庫',
      closed_by: 1, closed_at: '2027-10-08 11:00', created_at: '2027-10-07 13:55'
    }),
    mkIssue({
      id: 3, issue_no: 'QI-2710-005', found_at: '2027-10-12 08:50', reporter: '何淑貞', line: '射出二線', station: '射出機 #08',
      product_id: 3, lot_no: 'L271012-01', defect_type_id: 4, description: '門把底座表面黑點', qty: 140, status: '已結案',
      dept_id: 5, assigned_by: 1, assigned_at: '2027-10-18 09:30', resolution: '更換塑膠粒批次，不良批退回供應商',
      closed_by: 1, closed_at: '2027-10-25 15:00', created_at: '2027-10-12 09:05'
    }),
    mkIssue({
      id: 4, issue_no: 'QI-2711-002', found_at: '2027-11-06 10:15', reporter: '鄭國良', line: '射出一線', station: '射出機 #05',
      product_id: 1, lot_no: 'L271106-01', defect_type_id: 2, description: '車燈外殼分模線毛邊，客戶來料檢驗也發現', qty: 120,
      status: '處理中', dept_id: 1, assigned_by: 1, assigned_at: '2027-11-06 10:40', created_at: '2027-11-06 10:30'
    }),
    mkIssue({
      id: 5, issue_no: 'QI-2711-001', found_at: '2027-11-04 16:20', reporter: '蘇志偉', line: '組裝線', station: '外觀檢查站',
      product_id: 4, defect_type_id: 2, description: '後視鏡外蓋表面刮傷', qty: 12, created_at: '2027-11-04 16:35'
    })
  ]);
}

CR_SCENARIOS['CR-01'] = {
  title: '對策確認與退回',
  requester: '品保課長 曾雅琪',
  requesterNpc: 'mgr',
  summary: '同一個毛邊問題三個月發生三次，每次登錄對策就結案；客戶下週要來稽核。',
  tabs: [{ id: 'open', label: '未結案清單' }, { id: 'search', label: '異常單查詢' }],
  computerOptions: {
    readOnly: true,
    banner: '期末情境 CR-01：以下是現況模擬畫面，只供觀察，不辦理任何操作。現況系統登錄處理對策就結案，沒有對策確認、退回或指派歷程。（依修改需求提案書所述現況，實際畫面請回原系統確認）'
  },
  setup(st) {
    st.db = cr01Data();
    st.clock = clockAt(2027, 11, 8, 10, 0);
    st.player = { x: 2, y: 2, dir: 'right' };
    st.flags = { pointed: false, viewed3: false };
    st.npcs = {
      mgr: npcDef('mgr', '品保課長 曾雅琪', '#0f766e', 9, 1),
      mfg: npcDef('mfg', '製造一課 周家豪', '#ca8a04', 12, 3),
      mold: npcDef('mold', '模具課 江志明', '#be123c', 16, 5)
    };
  },
  intro: [
    { who: '旁白', text: '11 月 8 日上午 10:00。你是系統分析師，來到品保課。' },
    { who: '曾雅琪', text: '客戶剛來電，說這個月又收到分模線毛邊的車燈外殼，下週要來稽核。' },
    { who: '曾雅琪', text: '麻煩你幫我整理：這個問題這三個月處理過幾次、對策是什麼、有沒有效。' },
    { who: '旁白', text: '用品管電腦查資料，到射出現場（右側）和窗口談談，收集「觀察筆記」後再回來找課長。' }
  ],
  clues: [
    { id: 'search', hint: '用「異常單查詢」以關鍵字「毛邊」查詢', text: '「異常單查詢」以關鍵字「毛邊」查到 3 張單：同一產品 AP-5101、同一台射出機 #05；9 月、10 月兩張已結案，對策都是調整射出參數，11 月又發生。' },
    { id: 'closed', hint: '打開一張已結案的毛邊單', text: '已結案的異常單明細上沒有任何操作按鈕：不能退回、不能重新開啟，對策沒效只能另開新單。' },
    { id: 'nolink', hint: '打開 11 月那張仍在處理中的毛邊單', text: '11 月的新單和前兩張舊單之間，明細上看不出任何關聯。' },
    { id: 'mfg', hint: '到射出現場和製造一課窗口談談', text: '製造一課窗口說「回覆了就算結了」：登錄處理對策就直接結案，沒有人事後確認對策有沒有效。' },
    { id: 'mold', hint: '到射出現場和模具課窗口談談', text: '模具課窗口說真正原因是分模面磨耗，調參數只是先壓住：先讓產線動起來的處置和根本改善，混在同一個處理對策欄位。' },
    { id: 'reassign', hint: '問課長還有什麼要注意的，再打開她提到的那張單', text: '原料黑點那張單 QI-2710-005：發現 10-12、指派 10-18，明細只看得到最後的採購課；課長說它先派給製造二課，這 6 天在系統上沒有紀錄。' }
  ],
  talk: {
    mfg(st, api) {
      api.collect(st, 'mfg');
      showTalk([
        { who: '周家豪', text: '毛邊喔？上次調完參數就好了啊。' },
        { who: '周家豪', text: '我們把對策回覆給品管，品管登錄進去就結了。之後有沒有再發生，我們這邊不會知道。' }
      ]);
    },
    mold(st, api) {
      api.collect(st, 'mold');
      showTalk([
        { who: '江志明', text: '其實是分模面磨耗了。調參數只是先壓住，讓產線先跑。' },
        { who: '江志明', text: '真的要解決，模具要拆下來修，大概要兩週。可是單子上只寫「調整參數」，看起來就像已經解決了。' }
      ]);
    }
  },
  requesterExplore(st, api) {
    const got = id => st.cr.clues.indexOf(id) >= 0;
    if (!got('search')) return showTalk([{ who: '曾雅琪', text: '先用電腦的「異常單查詢」，關鍵字打「毛邊」看看。' }]);
    if (!got('mfg') || !got('mold')) return showTalk([{ who: '曾雅琪', text: '去射出現場問問製造一課跟模具課的窗口，他們怎麼看這個問題。' }]);
    if (!st.flags.pointed) {
      st.flags.pointed = true;
      addTrail(st, '課長點出 QI-2710-005：先派給製造二課，6 天後才改派採購課（口述）');
      if (st.flags.viewed3) api.collect(st, 'reassign');
    }
    showTalk([
      { who: '曾雅琪', text: '還有一張你也看一下，QI-2710-005，門把底座的黑點。' },
      { who: '曾雅琪', text: '那張其實先派給製造二課，他們查了 6 天，才發現是原料問題、改派給採購課。你打開明細，看系統上留下了什麼。' }
    ]);
  },
  attention(st, npcId) {
    const got = id => st.cr.clues.indexOf(id) >= 0;
    if (npcId === 'mfg') return !got('mfg');
    if (npcId === 'mold') return !got('mold');
    if (npcId === 'mgr') return got('search') && got('mfg') && got('mold') && !st.flags.pointed;
    return false;
  },
  onSystem(st, evt, api) {
    if (evt.type === 'search' && evt.result.ok && txt(evt.q.keyword).indexOf('毛邊') >= 0 && evt.result.rows.length === 3) api.collect(st, 'search');
    if (evt.type === 'openDetail') {
      const id = evt.issue.id;
      if (id === 1 || id === 2) api.collect(st, 'closed');
      if (id === 4) api.collect(st, 'nolink');
      if (id === 3) { st.flags.viewed3 = true; if (st.flags.pointed) api.collect(st, 'reassign'); }
    }
    return {};
  },
  onCluesDone() { log('觀察收齊了。回去找課長曾雅琪談談她的需求。', 'scene'); },
  requestLines: [
    { who: '曾雅琪', text: '同一個問題三個月發生三次，每次都說調好了就結案。客戶來稽核，我拿不出對策有效的證據。' },
    { who: '曾雅琪', text: '我希望結案前要有人確認對策真的有效；沒效的話可以退回原來那張單繼續處理，不要每次另開新單。' },
    { who: '曾雅琪', text: '還有，一張單轉過幾個單位、每個單位做了什麼，我要看得到。先擋住的處置跟真正的改善，也要分開寫。' }
  ],
  requests: [
    '結案前要有人確認對策有效',
    '確認對策沒效時可以退回原單繼續處理，原本的處理紀錄保留',
    '看得出一張單轉過幾手、每一手做了什麼',
    '暫時處置與長期改善分開登記'
  ],
  statements: [
    { text: '關鍵字「毛邊」查到 3 張單，同一產品、同一台射出機，前兩張已結案。', cat: 'obs', explain: '這是你在模擬畫面上查到的結果。' },
    { text: '已結案的異常單明細上沒有任何操作按鈕。', cat: 'obs', explain: '這是你打開明細後看到的現況。' },
    { text: 'QI-2710-005 的發現與指派相差 6 天，明細上只看得到採購課。', cat: 'obs', explain: '時間差是畫面上的事實；「先派給製造二課」則是課長的口述，系統裡查不到。' },
    { text: '課長希望結案前有人確認對策有效。', cat: 'want', explain: '這是需求提出者希望達成的業務結果，還不是系統規格。由誰確認、等多久，都還要釐清。' },
    { text: '課長希望對策沒效時可以退回原單，而不是另開新單。', cat: 'want', explain: '這是利害關係人的期望；退回後回到哪一步、原本的對策怎麼處理，還沒有定義。' },
    { text: '只要讓責任單位登入系統自己結案，問題就解決了。', cat: 'infer', explain: '這是解法的猜想。現在使用系統的只有品保課，責任單位是否登入、能做什麼，都還要查證與決定。' },
    { text: '指派紀錄應該另外建一張資料表。', cat: 'infer', explain: '這是資料設計的想法，不是現況事實；合理的做法可能不只一種。' },
    { text: '把處理對策欄位加長，就能把暫時處置和長期改善寫清楚。', cat: 'infer', explain: '這是解法的猜想。兩種對策常由不同的人、在不同時間完成，是否分開登記要由小組決定。' }
  ],
  impacts: {
    '角色': '誰最清楚對策有沒有效？確認的工作要交給誰，會不會牽涉現在不使用系統的人（例如回報人、責任單位）？',
    '流程': '「處理完了」和「可以結案了」之間要多哪些步驟？對策要觀察多久？退回之後回到哪一步？判定不成立是否也要確認？',
    '功能': '現有的指派、改派、結案、判定不成立各做了什麼？哪些動作之後就不能再改？',
    '資料': '退回之後原本的對策還要不要看得到？一張單轉過幾手要怎麼留下來？上線以來已結案的單，改版後怎麼看待？',
    '權限': '責任單位現在不登入系統，若要讓他們參與，能做哪些事？「這不是我們的問題」該由誰決定？',
    '操作環境': '系統裝在品保課的一台電腦、廠內電腦以瀏覽器連線；現場與其他課的人要從哪裡使用？'
  },
  verify: [
    '在實際系統用任一帳號登入，「異常單查詢」以關鍵字「毛邊」查詢，再打開 QI-2610-003 比對發現時間與指派時間（提案書〈3.1〉的重現步驟）。遊戲內的單號與資料是虛構的，不能拿來代替這一步。',
    '打開一張已結案的單與一張處理中的單，確認明細上各有哪些操作按鈕。',
    '確認主管與品管人員兩種角色登入後各能使用哪些畫面。',
    '在 SQLite 查看 issues 表目前記錄哪些與指派、結案有關的欄位（只看現況，不先設計新表）。'
  ],
  guide: [
    '誰最清楚對策有沒有效？確認結案的工作要交給誰，會不會牽涉現在不使用系統的人（例如回報人）？',
    '對策要觀察多久才知道有沒有效？單子停在等待確認多久算卡住，要讓誰知道？',
    '退回之後，單子要回到哪一步？原本的對策還要不要看得到？',
    '責任單位現在不登入系統，若要讓他們參與，權限與系統的使用地點有什麼限制？「這不是我們的問題」該由誰決定？',
    '一張單轉過幾手要怎麼留下來？這會不會改變資料表的結構？',
    '暫時處置與長期改善要怎麼登記？只有暫時處置的單能不能結案？',
    '判定不成立是否也需要有人確認？',
    '上線以來已經結案的單，改版後要怎麼看待？'
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
      '<p class="hint">這一題的期末只有一項變更需求：CR-01，約 5–10 分鐘。你的角色是系統分析師：觀察現場問題、辨識需求與待查證事項，遊戲不提供改善後的系統。</p>' +
      '<div class="cards">' + ORDER.map(id => {
        const sc = CR_SCENARIOS[id];
        return '<button type="button" class="card" data-start="' + id + '"><b>' + id + '　' + esc(sc.title) + '</b><span>需求提出者：' + esc(sc.requester) + '</span><span>' + esc(sc.summary) + '</span></button>';
      }).join('') + '</div>';
  }

  function makeController(id) {
    const sc = CR_SCENARIOS[id];
    const required = sc.clues.filter(c => !c.optional);
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
        sc.onCluesDone(st, api);
      }
      render();
    }

    function talkRequester(st) {
      if (st.cr.stage === 'explore') return sc.requesterExplore(st, api);
      if (st.cr.stage === 'request') return showTalk(sc.requestLines, [{ label: '開始需求釐清練習', run: () => openExercise(st) }]);
      return showTalk([{ who: sc.requester, text: '謝謝你整理。' }], [
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
        '<p class="boundary">本情境只呈現現況困難與需求背景，不提供答案：確認結案由誰執行、等待確認的期限、退回後回到哪個狀態、處理對策保留歷史或覆蓋、責任單位是否登入、指派紀錄的資料結構、兩種對策是否必填、判定不成立是否需要確認、既有已結案資料怎麼轉換，以及新的狀態值、欄位與資料表，都由小組回到原系統查證後自行決議並說明理由（提案書〈3.4 待小組決議的問題〉）。</p>' +
        '<div class="grid4">' +
        '<section><h3>觀察到的業務事件</h3><ul>' + observed + '</ul></section>' +
        '<section><h3>利害關係人的新要求（' + id + '｜' + esc(sc.requester) + '）</h3><ul>' + sc.requests.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></section>' +
        '<section><h3>可能受影響項目（分類問題）</h3><dl>' + IMPACT_AREAS.map(x =>
          '<dt>' + x + (st.cr.impacts.indexOf(x) >= 0 ? '　<span class="tag-sel">你有勾選</span>' : '') + '</dt><dd>' + esc(sc.impacts[x]) + '</dd>').join('') + '</dl></section>' +
        '<section><h3>回到實際系統確認</h3><ul>' + sc.verify.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></section>' +
        '</div>' +
        '<section><h3>結算引導問題</h3><ol>' + sc.guide.map(g => '<li>' + esc(g) + '</li>').join('') + '</ol></section>' +
        '<section><h3>你寫下的追問</h3><p class="notes">' + (st.cr.notes.trim() ? esc(st.cr.notes) : '（未填寫）') + '</p></section>' +
        '<p class="hint">接下來在修改建議書裡，把這一項寫成「現況問題、需求釐清、影響範圍、修改建議、驗收條件」。</p>' +
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
        if (npcId === sc.requesterNpc && st.cr.stage === 'request') return true;
        if (st.cr.stage !== 'explore') return false;
        return sc.attention(st, npcId);
      },
      onTalk(st, npcId) {
        if (npcId === sc.requesterNpc) return talkRequester(st);
        const h = sc.talk[npcId];
        if (h) return h(st, api);
        showTalk([{ who: (st.npcs[npcId] || {}).name || '', text: '……' }]);
      },
      onPhone() { return [{ who: '旁白', text: '（這個情境不需要打電話。）' }]; },
      computerTabs() { return sc.tabs; },
      computerOptions() { return sc.computerOptions; },
      onSystem(st, evt) { return (sc.onSystem && sc.onSystem(st, evt, api)) || {}; }
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
  // Original A minor pentatonic loop, 8 bars of eighth notes (0 = rest), one bass note per bar
  const MELODY = [
    69, 0, 72, 0, 74, 0, 72, 69, 67, 0, 69, 0, 0, 0, 64, 0,
    69, 0, 72, 0, 76, 0, 74, 72, 74, 0, 0, 0, 72, 0, 0, 0,
    76, 0, 74, 0, 72, 0, 69, 0, 67, 0, 69, 72, 69, 0, 0, 0,
    64, 0, 67, 0, 69, 0, 72, 74, 72, 0, 67, 0, 69, 0, 0, 0
  ];
  const BASS = [45, 43, 41, 40, 45, 43, 41, 45];
  const SFX = {
    step: [[1100, 0, 0.03, 'square', 0.04]],
    bump: [[140, 0, 0.09, 'square', 0.2]],
    open: [[660, 0, 0.06, 'sine', 0.25], [880, 0.05, 0.08, 'sine', 0.2]],
    ok: [[660, 0, 0.1, 'triangle', 0.4], [990, 0.09, 0.16, 'triangle', 0.4]],
    error: [[220, 0, 0.14, 'sawtooth', 0.2], [165, 0.13, 0.2, 'sawtooth', 0.2]],
    notice: [[740, 0, 0.1, 'sine', 0.3], [587, 0.1, 0.14, 'sine', 0.25]],
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
  compTab: 'open', compMsg: null, warn: null, detailId: null, actionMode: null, actionText: '', actionDept: '',
  newDraft: null, editDraft: null, openFilter: '', searchQ: null, searchRes: null, phoneLog: [], quickKey: ''
};
let ctrl = null;

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function emptySearch() { return { from: '', to: '', product_id: '', defect_type_id: '', dept_id: '', status: '', keyword: '' }; }

function resetUiState() {
  Object.assign(ui, {
    idleQueue: [], msgs: [], compTab: null, compMsg: null, warn: null, detailId: null, actionMode: null,
    actionText: '', actionDept: '', newDraft: null, editDraft: null, openFilter: '', searchQ: emptySearch(), searchRes: null,
    phoneLog: [], quickKey: ''
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
  if (l.kind === 'memo') return '<p class="memo">筆記：' + esc(l.text) + '</p>';
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
function coachTalk(text) { showTalk([{ kind: 'coach', text }]); }

/* messages */
const LOG_KIND = { system: '系統', coach: '提示', scene: '場景', note: '筆記' };
function log(text, kind) {
  kind = kind || 'scene';
  ui.msgs.push({ t: gameState ? fmtHM(gameState.clock) : '', text, kind });
  if (ui.msgs.length > 8) ui.msgs.shift();
  if (kind === 'note') Sound.sfx('chime');
  else if (kind === 'coach') Sound.sfx('notice');
  renderLog();
  const toast = $('#toast');
  if (toast) {
    toast.textContent = '［' + LOG_KIND[kind] + '］' + text;
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
    '<h2>期中：現況理解（As-Is）</h2><p class="hint">扮演品管工程師，體驗原有系統的功能與例外。兩關合計約 10–15 分鐘。</p><div class="cards">' +
    '<button type="button" class="card" data-start="level1"><b>第一關　早班的毛邊</b><span>正常流程：口頭回報、登記異常單、打電話給責任單位、指派、登錄對策結案。</span></button>' +
    '<button type="button" class="card" data-start="level2"><b>第二關　這不是我們的問題</b><span>現有系統的行為：責任單位說不是他們的問題，改派之後系統留下了什麼？</span></button></div>';
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
    case '.': return x <= 9 ? 'floor-office' : 'floor-plant';
    case 'D': return 'door';
    case 'C': return 'obj t-computer';
    case 'T': return 'obj t-phone';
    case 'P': return 'desk';
    case 'B': return 'table';
    case 'I': return 'bench';
    case 'M': return 'machine';
    case 'G': return 'gate';
    case 'F': return 'entrance';
  }
  return 'floor-office';
}
function tileLabel(ch, x, y) {
  if (ch === 'C') return '電腦';
  if (ch === 'T') return '電話';
  if (ch === 'P' && x === 7) return '課長座位';
  if (ch === 'B' && x === 4 && y === 5) return '會議桌';
  if (ch === 'I' && x === 2) return '檢驗台';
  if (ch === 'G' && x === 5) return '品保課門口';
  if (ch === 'D' && y === 2) return '往現場';
  if (ch === 'F' && y === 2) return '射出現場';
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

function renderEntities() {
  const st = gameState;
  const layer = $('#ents');
  if (!st || !layer) return;
  const list = Object.values(st.npcs).filter(n => n.visible).map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, color: n.color, kind: 'npc' }));
  list.push({ id: '__player', name: ctrl.isCR ? '你（分析師）' : '你（品管工程師）', x: st.player.x, y: st.player.y, color: '#2563a8', kind: 'player' });
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
  if (ctrl.showSummary) {
    const s = summarizeOpen(st.db);
    stats.hidden = false;
    stats.innerHTML = '<h3>未結案摘要（依系統未結案清單）</h3><p>待處理 ' + s.pending + ' 件、處理中 ' + s.working + ' 件</p>';
  } else { stats.hidden = true; stats.innerHTML = ''; }
  const extra = $('#hud-extra');
  if (ctrl.hudExtra) { extra.hidden = false; extra.innerHTML = ctrl.hudExtra(st); } else { extra.hidden = true; extra.innerHTML = ''; }
  renderQuick();
}

const QUICK_SPOTS = {
  computer: { x: 1, y: 2, dir: 'up', label: '電腦' },
  phone: { x: 3, y: 2, dir: 'up', label: '電話' }
};
function renderQuick() {
  const st = gameState;
  const keys = Object.keys(QUICK_SPOTS).filter(k => st.visited[k]);
  const key = keys.join(',');
  if (key === ui.quickKey) return;
  ui.quickKey = key;
  $('#hud-quick').innerHTML = '<h3>快捷移動</h3>' + (keys.length
    ? keys.map(k => '<button type="button" class="small" data-quick="' + k + '">' + QUICK_SPOTS[k].label + '</button>').join(' ')
    : '<p class="hint">用過電腦或電話後，可以在這裡直接移過去。</p>');
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
  if (t.id === 'computer') openComputer();
  else if (t.id === 'phone') openPhone();
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
function compOptions() { return (ctrl.computerOptions && ctrl.computerOptions(gameState)) || {}; }

function openComputer() {
  const tabs = ctrl.computerTabs(gameState);
  if (!tabs.some(t => t.id === ui.compTab)) ui.compTab = tabs[0].id;
  ui.compMsg = null; ui.warn = null; ui.detailId = null; ui.actionMode = null;
  openModal('品管電腦', renderComputerBody, { size: 'wide' });
  emit('openTab', { tab: ui.compTab });
  render();
}
function reopenComputer() { openModal('品管電腦', renderComputerBody, { size: 'wide' }); }

function rerenderComputer(focusId) {
  if (!ui.modalOpen) return;
  const active = focusId || (document.activeElement && document.activeElement.id);
  renderComputerBody($('#modal-body'));
  const el = active && document.getElementById(active);
  if (el) el.focus();
}

// A focused field edited by the user fires change when a re-render removes it.
// Blur it first so its sync runs before a handler writes new values into the draft.
function flushFocus() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur();
}

function setMsg(kind, lines) {
  ui.compMsg = { kind, lines: [].concat(lines) };
  if (kind === 'ok') Sound.sfx('ok');
  else if (kind === 'err') Sound.sfx('error');
}
function coachMsg(text) { ui.compMsg = { kind: 'coach', lines: [], coach: text }; Sound.sfx('notice'); }
function addCoach(res) {
  if (!res || !res.coach) return;
  Sound.sfx('notice');
  ui.compMsg = { kind: ui.compMsg ? ui.compMsg.kind : 'coach', lines: ui.compMsg ? ui.compMsg.lines : [], coach: res.coach };
}

function badge(status) { return '<span class="badge s-' + STATUS_CLASS[status] + '">' + esc(status) + '</span>'; }
function optionTags(items, selected, placeholder) {
  return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') +
    items.map(o => '<option value="' + o.value + '"' + (String(o.value) === String(selected) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('');
}

function renderComputerBody(body) {
  const st = gameState;
  const tabs = ctrl.computerTabs(st);
  const opt = compOptions();
  const u = st.db.users[0];
  body.innerHTML =
    '<div class="sys-bar"><b>品質異常回報管理系統（遊戲模擬）</b><span>登入：' + esc(u.name) + '（' + esc(u.role) + '）</span><span>系統時間：' + fmtDT(st.clock) + '</span></div>' +
    (opt.banner ? '<p class="banner">' + esc(opt.banner) + '</p>' : '') +
    '<div class="tabs" role="tablist">' + tabs.map(t => '<button type="button" role="tab" id="tab-' + t.id + '" aria-selected="' + (t.id === ui.compTab && !ui.detailId) + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>').join('') + '</div>' +
    '<div id="comp-msg" aria-live="polite"></div><div class="tabpanel" id="tabpanel" role="tabpanel"></div>';
  $all('[data-tab]', body).forEach(b => b.addEventListener('click', () => {
    ui.compTab = b.dataset.tab; ui.compMsg = null; ui.warn = null; ui.detailId = null; ui.actionMode = null;
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
  if (ui.detailId) renderDetail(panel, opt);
  else if (ui.compTab === 'open') renderOpen(panel);
  else if (ui.compTab === 'new') renderNew(panel);
  else if (ui.compTab === 'search') renderSearch(panel);
}

function issueRowsHtml(rows, cols) {
  return '<table class="data"><thead><tr>' + cols.map(c => '<th>' + c[0] + '</th>').join('') + '<th></th></tr></thead><tbody>' +
    rows.map(r => '<tr>' + cols.map(c => '<td' + (c[2] ? ' class="' + c[2] + '"' : '') + '>' + c[1](r) + '</td>').join('') +
      '<td><button type="button" class="small secondary" id="det-' + r.id + '" data-detail="' + r.id + '">明細</button></td></tr>').join('') +
    '</tbody></table>';
}
function bindDetailButtons(panel) {
  $all('[data-detail]', panel).forEach(b => b.addEventListener('click', () => openDetail(Number(b.dataset.detail))));
}
function openDetail(id) {
  const st = gameState;
  ui.detailId = id; ui.actionMode = null; ui.compMsg = null; ui.warn = null;
  advance(st, 1);
  addCoach(emit('openDetail', { issue: findIssue(st.db, id) }));
  rerenderComputer('det-back');
  render();
}

function renderOpen(panel) {
  const st = gameState;
  const res = listOpen(st.db, { status: ui.openFilter }, todayStr(st));
  const s = res.summary;
  panel.innerHTML =
    '<p class="selected">待處理 ' + s.pending + ' 件、處理中 ' + s.working + ' 件</p>' +
    '<div class="filters"><label>狀態<select id="of-status">' + optionTags(OPEN_STATUSES.map(x => ({ value: x, label: x })), ui.openFilter, '全部') + '</select></label>' +
    '<span class="hint">上方件數不受篩選影響。清單只列待處理與處理中，依發現時間排序。</span></div>' +
    (res.rows.length === 0 ? '<p class="hint">沒有符合條件的未結案異常單。</p>' : issueRowsHtml(res.rows, [
      ['異常單號', r => esc(r.issue_no)], ['發現時間', r => esc(r.found_at)], ['產線', r => esc(r.line)],
      ['產品', r => esc(r.part_no + ' ' + r.product_name)], ['異常類別', r => esc(r.defect_name)], ['異常描述', r => esc(r.description), 'desc'],
      ['影響數量', r => r.qty], ['狀態', r => badge(r.status)], ['責任單位', r => esc(r.dept_name || '—')], ['經過天數', r => r.days + ' 天']
    ]));
  $('#of-status', panel).addEventListener('change', e => { ui.openFilter = e.target.value; rerenderComputer('of-status'); });
  bindDetailButtons(panel);
}

function blankForm(st) { return { found: nowStr(st).replace(' ', 'T'), reporter: '', line: '', station: '', product: '', lot: '', type: '', desc: '', qty: '' }; }
function draftFromIssue(i) {
  return { found: i.found_at.replace(' ', 'T'), reporter: i.reporter, line: i.line, station: i.station || '', product: String(i.product_id), lot: i.lot_no || '', type: String(i.defect_type_id), desc: i.description, qty: String(i.qty) };
}
function draftToInput(d) {
  return { found_at: d.found, reporter: d.reporter, line: d.line, station: d.station, product_id: d.product, lot_no: d.lot, defect_type_id: d.type, description: d.desc, qty: d.qty };
}
// Shared field block for register and edit. Edit keeps the current product or type even if disabled.
function issueFieldsHtml(p, d, keep) {
  const st = gameState;
  const products = st.db.products.filter(x => x.active || (keep && x.id === keep.product_id)).map(x => ({ value: x.id, label: x.part_no + ' ' + x.name }));
  const types = st.db.defectTypes.filter(x => x.active || (keep && x.id === keep.defect_type_id)).map(x => ({ value: x.id, label: x.name }));
  return '<label>發現時間 <input type="datetime-local" id="' + p + '-found" value="' + esc(d.found) + '"></label>' +
    '<label>回報人 <input id="' + p + '-reporter" value="' + esc(d.reporter) + '"></label>' +
    '<label>產線 <input id="' + p + '-line" value="' + esc(d.line) + '"></label>' +
    '<label>工站或機台 <input id="' + p + '-station" value="' + esc(d.station) + '"></label>' +
    '<label>產品 <select id="' + p + '-product">' + optionTags(products, d.product, '請選擇') + '</select></label>' +
    '<label>批號 <input id="' + p + '-lot" value="' + esc(d.lot) + '"></label>' +
    '<label>異常類別 <select id="' + p + '-type">' + optionTags(types, d.type, '請選擇') + '</select></label>' +
    '<label>影響數量 <input id="' + p + '-qty" inputmode="numeric" value="' + esc(d.qty) + '"></label>' +
    '<label class="wide">異常描述 <textarea id="' + p + '-desc" rows="2">' + esc(d.desc) + '</textarea></label>';
}
function bindIssueFields(root, p, d) {
  const keys = ['found', 'reporter', 'line', 'station', 'product', 'lot', 'type', 'qty', 'desc'];
  const sync = () => { if (!root.isConnected) return; keys.forEach(k => { d[k] = $('#' + p + '-' + k, root).value; }); };
  keys.forEach(k => { const el = $('#' + p + '-' + k, root); el.addEventListener('input', sync); el.addEventListener('change', sync); });
  return sync;
}

function renderNew(panel) {
  const st = gameState;
  if (!ui.newDraft) ui.newDraft = blankForm(st);
  const d = ui.newDraft;
  const fill = ctrl.registerFill ? ctrl.registerFill(st) : null;
  panel.innerHTML = '<form id="f-new" class="grid-form">' + issueFieldsHtml('nw', d, null) +
    '<div class="row">' + (fill ? '<button type="button" class="secondary" id="nw-fill">依筆記代填（異常類別仍要自己選）</button>' : '') +
    '<button type="submit">送出登記</button></div></form><p class="hint">回報人、產線是文字欄位；系統只列出啟用中的產品與異常類別。</p>';
  const sync = bindIssueFields(panel, 'nw', d);
  const fb = $('#nw-fill', panel);
  if (fb) fb.addEventListener('click', () => { flushFocus(); Object.assign(d, fill); rerenderComputer('nw-type'); });
  $('#f-new', panel).addEventListener('submit', e => {
    e.preventDefault();
    sync();
    const input = draftToInput(d);
    const doCreate = () => {
      const res = createIssue(st.db, input, nowStr(st), st.db.users[0].id);
      if (!res.ok) setMsg('err', res.errors);
      else {
        st.db = res.db;
        advance(st, 3);
        ui.newDraft = null;
        setMsg('ok', res.message);
      }
      addCoach(emit('create', { result: res, input }));
      rerenderComputer();
      render();
    };
    if (checkIssueFields(st.db, input, null, nowStr(st)).error) { doCreate(); return; }
    const r = emit('beforeCreate', { input });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    if (r.warn && r.warn.length) { Sound.sfx('notice'); ui.warn = { lines: r.warn, goLabel: '仍要送出', go: doCreate }; rerenderComputer(); return; }
    doCreate();
  });
}

function renderSearch(panel) {
  const st = gameState;
  const q = ui.searchQ;
  const res = ui.searchRes;
  panel.innerHTML = '<form id="f-search" class="filters">' +
    '<label>發現日期起<input type="date" id="sq-from" value="' + esc(q.from) + '"></label>' +
    '<label>發現日期迄<input type="date" id="sq-to" value="' + esc(q.to) + '"></label>' +
    '<label>產品<select id="sq-product">' + optionTags(st.db.products.map(p => ({ value: p.id, label: p.part_no + ' ' + p.name + (p.active ? '' : '（停用）') })), q.product_id, '全部') + '</select></label>' +
    '<label>異常類別<select id="sq-type">' + optionTags(st.db.defectTypes.map(t => ({ value: t.id, label: t.name + (t.active ? '' : '（停用）') })), q.defect_type_id, '全部') + '</select></label>' +
    '<label>責任單位<select id="sq-dept">' + optionTags(st.db.departments.map(d => ({ value: d.id, label: d.name + (d.active ? '' : '（停用）') })), q.dept_id, '全部') + '</select></label>' +
    '<label>狀態<select id="sq-status">' + optionTags(STATUSES.map(s => ({ value: s, label: s })), q.status, '全部') + '</select></label>' +
    '<label>關鍵字<input id="sq-keyword" placeholder="比對異常描述" value="' + esc(q.keyword) + '"></label>' +
    '<button type="submit">查詢</button></form>' +
    (res === null ? '<p class="hint">設定條件後按查詢。關鍵字只比對異常描述。</p>' : !res.ok ? '' :
      res.rows.length === 0 ? '<p class="hint">查無符合條件的異常單。</p>' :
        '<p class="selected">共 ' + res.rows.length + ' 筆</p>' + issueRowsHtml(res.rows, [
          ['異常單號', r => esc(r.issue_no)], ['發現時間', r => esc(r.found_at)], ['產品', r => esc(r.part_no + ' ' + r.product_name)],
          ['異常類別', r => esc(r.defect_name)], ['異常描述', r => esc(r.description), 'desc'], ['狀態', r => badge(r.status)],
          ['責任單位', r => esc(r.dept_name || '—')], ['經過天數', r => r.days + ' 天'], ['結案時間', r => esc(r.closed_at || '—')]
        ]));
  const map = { from: 'sq-from', to: 'sq-to', product_id: 'sq-product', defect_type_id: 'sq-type', dept_id: 'sq-dept', status: 'sq-status', keyword: 'sq-keyword' };
  const sync = () => { if (panel.isConnected) Object.keys(map).forEach(k => { q[k] = $('#' + map[k], panel).value; }); };
  Object.values(map).forEach(id => { const el = $('#' + id, panel); el.addEventListener('input', sync); el.addEventListener('change', sync); });
  $('#f-search', panel).addEventListener('submit', e => {
    e.preventDefault();
    sync();
    const r = searchIssues(st.db, q, todayStr(st));
    ui.searchRes = r;
    advance(st, 1);
    if (r.ok) setMsg('info', '查到 ' + r.rows.length + ' 筆異常單');
    else setMsg('err', r.errors);
    addCoach(emit('search', { q: Object.assign({}, q), result: r }));
    rerenderComputer('sq-keyword');
    render();
  });
  bindDetailButtons(panel);
}

function field(label, value, wide) { return '<dt>' + label + '</dt><dd' + (wide ? ' class="wide"' : '') + '>' + value + '</dd>'; }
function dashText(v) { return v ? esc(v) : '<span class="muted">—</span>'; }

function renderDetail(panel, opt) {
  const st = gameState;
  const raw = findIssue(st.db, ui.detailId);
  const i = joinIssue(st.db, raw, todayStr(st));
  const ro = !!opt.readOnly;
  const resultLabel = i.status === '不成立' ? '不成立理由' : '處理對策';
  const acts = actionsFor(i.status);
  panel.innerHTML =
    '<div class="row"><button type="button" class="small secondary" id="det-back">回到清單</button></div>' +
    '<h3>異常單明細 ' + esc(i.issue_no) + '</h3>' +
    '<section class="panel"><h4>登記資料</h4><dl class="detail">' + [
      field('異常單號', esc(i.issue_no)), field('發現時間', esc(i.found_at)),
      field('回報人', esc(i.reporter)), field('產線', esc(i.line)),
      field('工站或機台', dashText(i.station)), field('產品', esc(i.part_no + ' ' + i.product_name) + (i.customer ? '<span class="muted">（' + esc(i.customer) + '）</span>' : '')),
      field('批號', dashText(i.lot_no)), field('異常類別', esc(i.defect_name)),
      field('影響數量', String(i.qty)), field('', ''),
      field('異常描述', esc(i.description), true),
      field('登記人', esc(i.created_by_name)), field('登記時間', esc(i.created_at)),
      field('最後修改時間', i.updated_at ? esc(i.updated_at) : '<span class="muted">未修改</span>'), field('', '')
    ].join('') + '</dl></section>' +
    '<section class="panel"><h4>處理狀況</h4><dl class="detail">' + [
      field('狀態', badge(i.status)), field('經過天數', i.days + ' 天'),
      field('責任單位', i.dept_name ? esc(i.dept_name + '（' + i.dept_contact + ' ' + i.dept_ext + '）') : '—'), field('', ''),
      field('指派人', dashText(i.assigned_by_name)), field('指派時間', dashText(i.assigned_at)),
      field(resultLabel, dashText(i.resolution), true),
      field('結案人', dashText(i.closed_by_name)), field('結案時間', dashText(i.closed_at))
    ].join('') + '</dl></section>' +
    '<div class="actions" id="act-row">' + acts.map(([k, label]) => '<button type="button" id="act-' + k + '" data-act="' + k + '"' + (ro ? ' disabled' : '') + '>' + label + '</button>').join('') +
    (ro && acts.length ? '<span class="hint">本情境只觀察，不操作。</span>' : '') +
    (!acts.length ? '<span class="hint">這張單的狀態是「' + esc(i.status) + '」，明細上沒有任何操作按鈕。</span>' : '') + '</div>' +
    (ui.actionMode && !ro ? actionFormHtml(raw) : '');
  $('#det-back', panel).addEventListener('click', () => { ui.detailId = null; ui.actionMode = null; ui.compMsg = null; ui.warn = null; rerenderComputer('tab-' + ui.compTab); });
  $all('[data-act]', panel).forEach(b => b.addEventListener('click', () => {
    if (ro) return;
    ui.actionMode = b.dataset.act; ui.compMsg = null; ui.warn = null;
    ui.actionText = '';
    ui.actionDept = ui.actionMode === 'assign' && raw.status === '處理中' ? String(raw.dept_id) : '';
    if (ui.actionMode === 'edit') ui.editDraft = draftFromIssue(raw);
    addCoach(emit('openAction', { mode: ui.actionMode, issue: raw }));
    rerenderComputer(ui.actionMode === 'assign' ? 'ac-dept' : ui.actionMode === 'edit' ? 'ed-found' : 'ac-text');
    render();
  }));
  if (ui.actionMode && !ro) bindActionForm(panel, raw);
}

function actionFormHtml(issue) {
  const st = gameState;
  const m = ui.actionMode;
  let title, fields;
  if (m === 'edit') {
    title = '修改登記資料';
    fields = '<div class="grid-form">' + issueFieldsHtml('ed', ui.editDraft, issue) + '</div>';
  } else if (m === 'assign') {
    title = issue.status === '處理中' ? '改派責任單位' : '指派責任單位';
    const depts = st.db.departments.filter(d => d.active).map(d => ({ value: d.id, label: d.name + '（' + d.contact + ' ' + d.ext + '）' }));
    fields = '<div class="row"><label>責任單位 <select id="ac-dept">' + optionTags(depts, ui.actionDept, '請選擇') + '</select></label></div>';
  } else {
    const label = m === 'close' ? '處理對策' : '不成立理由';
    title = m === 'close' ? '結案' : '判定不成立';
    const fill = ctrl.textFill ? ctrl.textFill(st, m, issue) : null;
    fields = '<div class="row"><label class="block">' + label + '<textarea id="ac-text" rows="3" cols="60">' + esc(ui.actionText) + '</textarea></label></div>' +
      (fill ? '<div class="row"><button type="button" class="secondary small" id="ac-fill">依筆記帶入</button></div>' : '');
  }
  return '<form id="f-action" class="panel"><h4>' + title + '</h4>' + fields +
    '<div class="row"><button type="submit">送出</button><button type="button" class="secondary" id="ac-cancel">取消</button></div></form>';
}

function bindActionForm(panel, issue) {
  const st = gameState;
  const m = ui.actionMode;
  let sync = () => {};
  if (m === 'edit') sync = bindIssueFields(panel, 'ed', ui.editDraft);
  else if (m === 'assign') { const s = $('#ac-dept', panel); sync = () => { if (s.isConnected) ui.actionDept = s.value; }; s.addEventListener('change', sync); }
  else {
    const t = $('#ac-text', panel);
    sync = () => { if (t.isConnected) ui.actionText = t.value; };
    t.addEventListener('input', sync);
    const fb = $('#ac-fill', panel);
    if (fb) fb.addEventListener('click', () => { flushFocus(); ui.actionText = ctrl.textFill(st, m, issue); rerenderComputer('ac-text'); });
  }
  $('#ac-cancel', panel).addEventListener('click', () => { ui.actionMode = null; setMsg('info', '已取消，沒有寫入任何資料。'); rerenderComputer('det-back'); });
  $('#f-action', panel).addEventListener('submit', e => {
    e.preventDefault();
    sync();
    const id = issue.id;
    const run = () => {
      const now = nowStr(st), uid = st.db.users[0].id;
      let res, evtName;
      if (m === 'edit') { res = updateIssue(st.db, id, draftToInput(ui.editDraft), now); evtName = 'edit'; }
      else if (m === 'assign') { res = assignIssue(st.db, id, ui.actionDept, now, uid); evtName = 'assign'; }
      else if (m === 'close') { res = closeIssue(st.db, id, ui.actionText, now, uid); evtName = 'close'; }
      else { res = rejectIssue(st.db, id, ui.actionText, now, uid); evtName = 'reject'; }
      if (res.ok) { st.db = res.db; advance(st, 1); ui.actionMode = null; setMsg('ok', res.message); }
      else setMsg('err', res.errors);
      addCoach(emit(evtName, { result: res, issue: findIssue(st.db, id) || issue }));
      rerenderComputer(res.ok ? 'det-back' : null);
      render();
    };
    const before = { edit: 'beforeEdit', assign: 'beforeAssign', close: 'beforeClose', reject: 'beforeReject' }[m];
    const r = emit(before, { issue, deptId: ui.actionDept, text: ui.actionText });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    if (r.intercept) { r.intercept(() => { reopenComputer(); run(); }); return; }
    if (r.warn && r.warn.length) { Sound.sfx('notice'); ui.warn = { lines: r.warn, goLabel: '仍要送出', go: run }; rerenderComputer(); return; }
    run();
  });
}

/* phone */
function defaultPhone(st, ext) {
  const d = st.db.departments.find(x => x.ext === ext);
  if (!d) return [{ who: '電話', text: '（嘟嘟嘟——您撥的分機號碼不存在。）' }];
  if (!d.active) return [{ who: '電話', text: '（這支分機目前沒有人使用。）' }];
  return [{ who: d.contact, text: '您好，' + d.name + d.contact + '。……喔，不是要找我們？好，沒關係。' }];
}
function openPhone() {
  ui.phoneLog = [];
  openModal('電話（系統以外的人工作業）', renderPhone);
}
function renderPhone(body) {
  body.innerHTML = '<p class="hint">輸入分機號碼後撥打。各單位的分機可以在異常單明細「指派／改派」的下拉選單看到。電話聯絡不會留在系統紀錄裡。</p>' +
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
  '<tr><th>WASD／方向鍵</th><td>每次移動一格，只能上下左右，遇到障礙不移動</td></tr>' +
  '<tr><th>E</th><td>和相鄰（優先面向）的角色或物件互動：電腦、電話、人</td></tr>' +
  '<tr><th>Esc</th><td>關閉對話或表單；在場景中開啟暫停選單</td></tr>' +
  '<tr><th>滑鼠、Tab、Enter</th><td>操作表單、選單、對話與問題</td></tr>' +
  '<tr><th>音樂／音效</th><td>畫面右上角的「音樂」「音效」兩個按鈕可以分別開關，預設都開</td></tr>' +
  '<tr><th>快捷移動</th><td>右側面板的按鈕，可直接移到用過的電腦或電話</td></tr>' +
  '</tbody></table><p class="hint">角色頭上的「！」表示現在和他說話會有進展。所有人名、分機、料號、客戶與批號都是虛構的。遊戲不連網、不儲存資料，重新整理就回到標題。聲音只是輔助，所有狀態與錯誤都有文字。</p>';

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
