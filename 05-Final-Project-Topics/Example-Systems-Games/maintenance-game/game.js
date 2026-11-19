'use strict';
/*
 * Equipment maintenance simulation game (teaching material, GAME-04).
 * Plain HTML/CSS/JS. Opens from file:// with no network and no storage.
 * Sections:
 *   1. constants and helpers
 *   2. maintenance rules (pure functions, no DOM)
 *   3. level data (fixed fictional data)
 *   4. game state and clock
 *   5. level controllers (level 1, level 2)
 *   6. change request scenario (removed in the midterm build)
 *   6b. sound (Web Audio, no audio files)
 *   7. UI
 */

const EDITION = 'final'; // @@EDITION  build script sets 'midterm' for the midterm zip

/* ---------- 1. constants and helpers ---------- */

const TILE = 40;
const MAP_ROWS = [
  '####################',
  '#C.T.R#............#',
  '#.....D............#',
  '#.....#..1.....3...#',
  '#.....#............#',
  '#.....#..2.....4...#',
  '#.....D............#',
  '#.....#............#',
  '####################'
];
const MAP_W = MAP_ROWS[0].length;
const MAP_H = MAP_ROWS.length;
const BLOCKING = '#CTR1234';
const OBJECTS = { C: 'computer', T: 'phone', R: 'rack' };
const OBJECT_LABELS = { computer: '設備課電腦', phone: '電話', rack: '吊牌架' };
// Machine tiles on the map -> equipment number
const MACHINES = {
  1: { no: 'EQ-101', label: '油壓沖床' },
  2: { no: 'EQ-102', label: '110 噸沖床' },
  3: { no: 'EQ-201', label: 'CNC 車床' },
  4: { no: 'EQ-202', label: 'CNC 立式加工機' }
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const PHONE_BOOK = [
  { name: '沖壓線班長 江明德', ext: '3101' },
  { name: '加工線班長 蔡佳玲', ext: '3201' },
  { name: '設備課長 鄭國榮', ext: '2501' }
];
const PLAYER_ID = 3;

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function pad2(n) { return String(n).padStart(2, '0'); }
function clockAt(y, mo, d, h, mi) { return Date.UTC(y, mo - 1, d, h, mi); }
function fmtDate(ms) {
  const t = new Date(ms);
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
}
function fmtDT(ms) {
  const t = new Date(ms);
  return fmtDate(ms) + ' ' + pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes());
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

/* ---------- 2. maintenance rules (pure functions, no DOM) ---------- */
// Follows SAD-Maintenance lib/rules.js, lib/validate.js, routes/due.js and routes/records.js.

const SOON_DAYS = 7;
const ITEM_RESULTS = ['正常', '異常', '未執行'];
const ROLE_NAMES = { 0: '主管', 1: '保養人員' };

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }

// 'YYYY-MM-DD' and a real calendar date
function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function utcOf(date) { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDays(date, n) { return new Date(utcOf(date) + n * 86400000).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((utcOf(b) - utcOf(a)) / 86400000); }
function splitItems(value) { return text(value).split(/\r?\n/).map(s => s.trim()).filter(Boolean); }
function nextId(rows) { return rows.reduce((m, r) => Math.max(m, r.id), 0) + 1; }

function userName(db, id) { const u = db.users.find(x => x.id === id); return u ? u.name : ''; }

function lastDone(db, planId) {
  return db.pm_records.filter(r => r.plan_id === planId).reduce((m, r) => (m && m > r.done_date ? m : r.done_date), null);
}

// Plan joined with equipment, owner name and last done date
function joinPlan(db, p) {
  const e = db.equipment.find(x => x.id === p.equipment_id) || {};
  return Object.assign({}, p, {
    equip_no: e.equip_no, equip_name: e.name, line: e.line, location: e.location, equip_active: !!e.active,
    owner_name: userName(db, p.owner_id), last_done: lastDone(db, p.id)
  });
}

// Add next due date, days left and due status. None of these are stored.
function withDueState(plan, day) {
  const nextDue = plan.last_done ? addDays(plan.last_done, plan.cycle_days) : plan.first_due_date;
  const daysLeft = daysBetween(day, nextDue);
  let dueStatus = '未到期';
  if (daysLeft < 0) dueStatus = '逾期';
  else if (daysLeft <= SOON_DAYS) dueStatus = '即將到期';
  return Object.assign({}, plan, { next_due: nextDue, days_left: daysLeft, due_status: dueStatus });
}

function planState(db, planId, day) {
  const p = db.pm_plans.find(x => x.id === planId);
  return p ? withDueState(joinPlan(db, p), day) : null;
}

// Due list: active plans on active equipment. Summary counts ignore the filters.
function listDue(db, day, filter) {
  const f = filter || {};
  const all = db.pm_plans.map(p => withDueState(joinPlan(db, p), day)).filter(p => p.active && p.equip_active);
  const summary = {
    overdue: all.filter(p => p.due_status === '逾期').length,
    soon: all.filter(p => p.due_status === '即將到期').length
  };
  const ownerId = Number(f.owner) || null;
  const rows = all
    .filter(p => (!ownerId || p.owner_id === ownerId) && (!f.line || p.line === f.line) && (!f.status || p.due_status === f.status))
    .sort((a, b) => a.next_due.localeCompare(b.next_due) || a.equip_no.localeCompare(b.equip_no));
  return { rows, summary };
}

function daysText(n) {
  if (n < 0) return '逾期 ' + (-n) + ' 天';
  if (n === 0) return '今天';
  return n + ' 天';
}

function blockedReason(plan) {
  if (!plan.active) return '這個保養計畫已停用，不能登錄保養';
  if (!plan.equip_active) return '設備 ' + plan.equip_no + ' 已停用，不能登錄保養';
  return null;
}

// Steps 4-6: maintenance date
function checkDoneDate(value, previous, day) {
  const date = text(value);
  if (!isDate(date)) return { error: '請輸入正確的保養日期' };
  if (date > day) return { error: '保養日期不能晚於今天' };
  if (previous && date <= previous) return { error: '保養日期必須晚於上一次保養日（' + previous + '）' };
  return { date };
}

// Steps 7-11: item results and note
function checkItemResults(list, expectedCount, countMessage, noteValue) {
  if (!Array.isArray(list) || list.length !== expectedCount) return { error: countMessage };
  const items = list.map(i => ({ result: text(i && i.result), remark: text(i && i.remark) }));
  for (let n = 0; n < items.length; n++) {
    if (!ITEM_RESULTS.includes(items[n].result)) return { error: '第 ' + (n + 1) + ' 項還沒選結果' };
  }
  for (let n = 0; n < items.length; n++) {
    if (items[n].result !== '正常' && !items[n].remark) return { error: '第 ' + (n + 1) + ' 項為異常或未執行，請填寫說明' };
  }
  for (let n = 0; n < items.length; n++) {
    if (items[n].remark.length > 100) return { error: '第 ' + (n + 1) + ' 項的說明不可超過 100 字' };
  }
  const note = text(noteValue);
  if (note.length > 200) return { error: '備註不可超過 200 字' };
  return { items: items.map(i => ({ result: i.result, remark: i.remark || null })), note: note || null };
}

// Checks in the original order; returns only the first error, like the original system.
function validateRecord(db, planId, input, day) {
  const plan = planState(db, planId, day);
  if (!plan) return { ok: false, errors: ['找不到這個保養計畫'] };
  const blocked = blockedReason(plan);
  if (blocked) return { ok: false, errors: [blocked], plan };
  const d = checkDoneDate(input.doneDate, plan.last_done, day);
  if (d.error) return { ok: false, errors: [d.error], plan };
  const planItems = splitItems(plan.items);
  const it = checkItemResults(input.items, planItems.length, '保養項目已變更，請重新開啟這個頁面', input.note);
  if (it.error) return { ok: false, errors: [it.error], plan };
  return { ok: true, errors: [], plan, doneDate: d.date, items: it.items, note: it.note, planItems };
}

// Record maintenance. Item text is copied so later plan edits do not change this record.
function createRecord(db, planId, input, day, userId, now) {
  const v = validateRecord(db, planId, input, day);
  if (!v.ok) return { ok: false, errors: v.errors, db };
  const next = clone(db);
  const record = { id: nextId(next.pm_records), plan_id: planId, done_date: v.doneDate, done_by: userId, note: v.note, created_at: now };
  next.pm_records.push(record);
  let itemId = nextId(next.pm_record_items);
  v.items.forEach((i, n) => {
    next.pm_record_items.push({ id: itemId++, record_id: record.id, seq: n + 1, item: v.planItems[n], result: i.result, remark: i.remark });
  });
  const nextDue = addDays(v.doneDate, v.plan.cycle_days);
  return {
    ok: true, errors: [], db: next, record, nextDue,
    message: '已登錄保養：' + v.plan.equip_no + ' ' + v.plan.plan_type + '（' + v.doneDate + '），下次應保養日 ' + nextDue
  };
}

function recordItems(db, recordId) {
  return db.pm_record_items.filter(i => i.record_id === recordId).sort((a, b) => a.seq - b.seq);
}

// Record result: 有異常 / 部分未執行 / 正常 (derived, not stored)
function recordResult(db, recordId) {
  const items = recordItems(db, recordId);
  if (items.some(i => i.result === '異常')) return '有異常';
  if (items.some(i => i.result === '未執行')) return '部分未執行';
  return '正常';
}

function joinRecord(db, r) {
  const p = db.pm_plans.find(x => x.id === r.plan_id) || {};
  const e = db.equipment.find(x => x.id === p.equipment_id) || {};
  return Object.assign({}, r, {
    plan_type: p.plan_type, equipment_id: e.id, equip_no: e.equip_no, equip_name: e.name,
    done_by_name: userName(db, r.done_by), result: recordResult(db, r.id)
  });
}

function sortRecords(rows) {
  return rows.sort((a, b) => b.done_date.localeCompare(a.done_date) || b.created_at.localeCompare(a.created_at));
}

// Record search: date range, equipment, worker, result
function listRecords(db, q) {
  q = q || {};
  const from = text(q.from), to = text(q.to);
  const eq = Number(q.equipment) || null, by = Number(q.doneBy) || null, res = text(q.result);
  const rows = db.pm_records.map(r => joinRecord(db, r)).filter(r =>
    (!isDate(from) || r.done_date >= from) && (!isDate(to) || r.done_date <= to) &&
    (!eq || r.equipment_id === eq) && (!by || r.done_by === by) && (!res || r.result === res));
  return sortRecords(rows);
}

// Equipment detail page: plans with due state and all records of the equipment
function equipmentHistory(db, equipmentId, day) {
  const equipment = db.equipment.find(e => e.id === equipmentId) || null;
  if (!equipment) return null;
  const plans = db.pm_plans.filter(p => p.equipment_id === equipmentId).sort((a, b) => a.id - b.id)
    .map(p => withDueState(joinPlan(db, p), day));
  const records = sortRecords(db.pm_records.map(r => joinRecord(db, r)).filter(r => r.equipment_id === equipmentId));
  return { equipment, plans, records };
}

/* ---------- 3. level data (fixed fictional data) ---------- */

const PRESS_ITEMS = ['檢查潤滑油位並補充', '清潔滑塊導軌', '檢查離合器與煞車作動', '檢查安全光柵功能'];
const PRESS_Q_ITEMS = ['更換液壓油', '檢查曲軸與連桿間隙', '校正下死點精度'];
const LATHE_ITEMS = ['清潔切屑與排屑機', '檢查切削液濃度與液位', '檢查主軸潤滑油位', '檢查夾頭夾持力'];
const LATHE_H_ITEMS = ['更換切削液過濾網', '檢查刀塔定位精度', '檢查皮帶張力'];
const MILL_ITEMS = ['清潔切屑與排屑機', '檢查切削液濃度與液位', '檢查主軸潤滑油位', '清潔刀庫'];
const AIR_ITEMS = ['更換空氣濾芯', '檢查冷卻器散熱片並清潔', '排放油水分離器積水'];

function baseUsers() {
  return [
    { id: 1, emp_no: 'M7001', name: '鄭國榮', title: '設備課長', role: 0, active: true },
    { id: 2, emp_no: 'M7002', name: '邱美惠', title: '設備副課長', role: 0, active: true },
    { id: 3, emp_no: 'M7101', name: '何俊德', title: '保養技術員', role: 1, active: true },
    { id: 4, emp_no: 'M7102', name: '王怡婷', title: '保養技術員', role: 1, active: true },
    { id: 5, emp_no: 'M7103', name: '許志遠', title: '保養技術員', role: 1, active: true },
    { id: 6, emp_no: 'M7104', name: '劉文傑', title: '保養技術員', role: 1, active: false }
  ];
}
function baseEquipment() {
  const e = (id, no, name, model, maker, line, location, active) => ({ id, equip_no: no, name, model, maker, line, location, active });
  return [
    e(1, 'EQ-101', '160 噸油壓沖床', 'HP-160', '永興機械', '沖壓線', 'A 區 1 號', true),
    e(2, 'EQ-102', '110 噸沖床', 'SP-110', '永興機械', '沖壓線', 'A 區 2 號', true),
    e(3, 'EQ-103', '80 噸沖床', 'SP-80', '永興機械', '沖壓線', 'A 區 5 號', false),
    e(4, 'EQ-201', 'CNC 車床', 'TL-30', '宏達精機', '加工線', 'B 區 1 號', true),
    e(5, 'EQ-202', 'CNC 立式加工機', 'VM-760', '宏達精機', '加工線', 'B 區 2 號', true),
    e(6, 'EQ-301', '螺旋式空壓機', 'AC-30', '大川氣體設備', '公用設備', '空壓機房', true)
  ];
}
function basePlans(p3Owner) {
  const p = (id, eq, type, cycle, items, owner, first, active) => ({
    id, equipment_id: eq, plan_type: type, cycle_days: cycle, items: items.join('\n'), owner_id: owner, first_due_date: first, active
  });
  return [
    p(1, 1, '月保養', 30, PRESS_ITEMS, 3, '2027-05-25', true),
    p(2, 1, '季保養', 90, PRESS_Q_ITEMS, 5, '2027-05-12', true),
    p(3, 2, '月保養', 30, PRESS_ITEMS, p3Owner, '2027-06-01', true),
    p(4, 4, '月保養', 30, LATHE_ITEMS, 3, '2027-05-28', true),
    p(5, 5, '月保養', 30, MILL_ITEMS, 4, '2027-06-10', true),
    p(6, 6, '季保養', 90, AIR_ITEMS, 5, '2027-06-01', true),
    p(7, 3, '月保養', 30, PRESS_ITEMS, 5, '2027-06-15', true),
    p(8, 4, '半年保養', 180, LATHE_H_ITEMS, 5, '2027-05-01', false)
  ];
}
// Build past records, all items normal. list: [planId, date, doneBy, note]
function withRecords(db, list) {
  list.forEach(([planId, date, by, note]) => {
    const plan = db.pm_plans.find(p => p.id === planId);
    const rec = { id: db.pm_records.length + 1, plan_id: planId, done_date: date, done_by: by, note: note || null, created_at: date + ' 16:00' };
    db.pm_records.push(rec);
    splitItems(plan.items).forEach((item, n) => {
      db.pm_record_items.push({ id: db.pm_record_items.length + 1, record_id: rec.id, seq: n + 1, item, result: '正常', remark: null });
    });
  });
  return db;
}
function emptyDb(p3Owner) {
  return { users: baseUsers(), equipment: baseEquipment(), pm_plans: basePlans(p3Owner), pm_records: [], pm_record_items: [] };
}

// Level 1, today 2027-10-20
function level1Data() {
  return withRecords(emptyDb(5), [
    [1, '2027-07-24', 3], [1, '2027-08-23', 3], [1, '2027-09-22', 3],
    [2, '2027-05-12', 5], [2, '2027-08-10', 5],
    [3, '2027-09-08', 5], [3, '2027-10-08', 5],
    [4, '2027-08-26', 3], [4, '2027-09-25', 3],
    [5, '2027-08-16', 4], [5, '2027-09-15', 4],
    [6, '2027-06-01', 5], [6, '2027-08-30', 5],
    [7, '2027-07-15', 5], [8, '2027-05-01', 5]
  ]);
}

// Level 2, today 2027-11-05
function level2Data() {
  return withRecords(emptyDb(3), [
    [1, '2027-08-23', 3], [1, '2027-09-22', 3], [1, '2027-10-20', 3],
    [2, '2027-05-12', 5], [2, '2027-08-10', 5],
    [3, '2027-08-29', 3], [3, '2027-09-28', 3],
    [4, '2027-09-25', 3], [4, '2027-10-20', 3],
    [5, '2027-09-15', 4], [5, '2027-10-15', 4],
    [6, '2027-06-01', 5], [6, '2027-08-30', 5],
    [7, '2027-07-15', 5], [8, '2027-05-01', 5]
  ]);
}

/* ---------- 4. game state and clock ---------- */

let gameState = null;
let RUN_SEQ = 0;

function newState(mode) {
  return {
    mode, runId: ++RUN_SEQ, db: null, clock: 0,
    player: { x: 3, y: 4, dir: 'up' },
    npcs: {}, cards: {}, flags: {}, trail: [], predictions: {}, cr: null,
    visited: { computer: false, phone: false, rack: false },
    done: false
  };
}
function advance(st, minutes) { st.clock += minutes * 60000; }
function nowStr(st) { return fmtDT(st.clock); }
function todayStr(st) { return fmtDate(st.clock); }
function addTrail(st, text) { st.trail.push(fmtHM(st.clock) + '　' + text); }
function npcDef(id, name, color, x, y, visible) { return { id, name, color, x, y, visible: visible !== false }; }
function equipByNo(db, no) { return db.equipment.find(e => e.equip_no === no) || null; }

/* ---------- 5. level controllers ---------- */

function heldCards(st) { return Object.keys(st.cards).filter(c => st.cards[c] === 'player').sort(); }
function tagOn(st, equipNo) { return Object.keys(st.cards).find(c => st.cards[c] === equipNo) || null; }

const MIDTERM_PROMPTS = [
  { h: '觀察', q: '保養技術員實際做了哪些事情？系統負責哪些推算、檢查與紀錄？請把下面的操作紀錄分成「人工工作」與「系統功能」。' },
  { h: '推論', q: '登錄保養、延後保養各影響哪些狀態與紀錄？哪些值存起來，哪些是每次算出來的？（下次應保養日、剩餘天數、保養狀態、紀錄結果）' },
  { h: '實際系統待查證', q: '如何在真實保養系統及 SQLite 驗證上述推論？可能對應哪些使用案例、活動圖判斷點與資料表關聯？' }
];

function recordsTableHtml(db, recordIds, caption) {
  const rows = db.pm_records.filter(r => recordIds.includes(r.id)).map(r => joinRecord(db, r));
  const items = db.pm_record_items.filter(i => recordIds.includes(i.record_id));
  return '<table class="data"><caption>' + esc(caption || '模擬資料：保養紀錄（pm_records）') + '</caption><thead><tr>' +
    '<th>紀錄#</th><th>計畫#</th><th>設備</th><th>保養類別</th><th>保養日期</th><th>執行人</th><th>備註</th><th>登錄時間</th><th>紀錄結果（推算）</th></tr></thead><tbody>' +
    rows.map(r => '<tr><td>' + r.id + '</td><td>' + r.plan_id + '</td><td>' + esc(r.equip_no + ' ' + r.equip_name) + '</td><td>' + esc(r.plan_type) +
      '</td><td>' + esc(r.done_date) + '</td><td>' + esc(r.done_by_name) + '</td><td>' + esc(r.note || '（空）') + '</td><td>' + esc(r.created_at) +
      '</td><td>' + esc(r.result) + '</td></tr>').join('') + '</tbody></table>' +
    '<table class="data"><caption>模擬資料：保養項目結果（pm_record_items）</caption><thead><tr><th>紀錄#</th><th>項次</th><th>保養項目（登錄時複製）</th><th>結果</th><th>說明</th></tr></thead><tbody>' +
    items.map(i => '<tr><td>' + i.record_id + '</td><td>' + i.seq + '</td><td>' + esc(i.item) + '</td><td>' + esc(i.result) + '</td><td>' + esc(i.remark || '') + '</td></tr>').join('') +
    '</tbody></table>';
}

function dueSnapshotHtml(db, day, caption) {
  const r = listDue(db, day, {});
  return '<table class="data"><caption>' + esc(caption) + '（逾期 ' + r.summary.overdue + ' 項、7 天內到期 ' + r.summary.soon + ' 項）</caption><thead><tr>' +
    '<th>設備</th><th>保養類別</th><th>上次保養日</th><th>下次應保養日</th><th>剩餘天數</th><th>保養狀態</th><th>負責人</th></tr></thead><tbody>' +
    r.rows.map(p => '<tr><td>' + esc(p.equip_no + ' ' + p.equip_name) + '</td><td>' + esc(p.plan_type) + '</td><td>' + esc(p.last_done || '') + '</td><td>' + esc(p.next_due) +
      '</td><td>' + esc(daysText(p.days_left)) + '</td><td>' + esc(p.due_status) + '</td><td>' + esc(p.owner_name) + '</td></tr>').join('') +
    '</tbody></table><p class="hint">「下次應保養日」「剩餘天數」「保養狀態」都沒有存在資料表裡，是依最後一筆保養日期與模擬日期每次算出來的。</p>';
}

function midtermSettlementHtml(st, topHtml, dataHtml) {
  return '<div class="settle">' + (topHtml || '') +
    '<div class="prompts">' + MIDTERM_PROMPTS.map((p, i) => '<section><h3>' + (i + 1) + '. ' + p.h + '</h3><p>' + p.q + '</p>' +
      (i === 0 ? '<ol class="trail">' + st.trail.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' : '') +
      (i === 1 ? (dataHtml || '') : '') + '</section>').join('') + '</div>' +
    '<p class="boundary">遊戲畫面與上面的資料是模擬教材的觀察，不是原系統資料庫的證據。正式分析請以實際系統為準。</p></div>';
}

function predictionListHtml(st, qs, sysResult) {
  return '<h3>你的預測與系統結果</h3><ol class="pred">' + qs.map(q => '<li>' + esc(q.q) + '<br>你的預測：' + esc(st.predictions[q.id] || '（未作答）') +
    '　系統規則：' + esc(sysResult(q)) + '</li>').join('') + '</ol>';
}

// Ask the player to pick a tag to hang, or explain what is missing
function hangChoices(st, equipNo, onHang) {
  return heldCards(st).map(code => ({
    label: '掛上保養中吊牌 ' + code,
    run: () => {
      st.cards[code] = equipNo;
      Sound.sfx('card');
      advance(st, 1);
      addTrail(st, '在 ' + equipNo + ' 掛上保養中吊牌 ' + code);
      log('在 ' + equipNo + ' 掛上「保養中」吊牌 ' + code + '。', 'scene');
      if (onHang) onHang(code);
    }
  }));
}
function removeChoice(st, equipNo, code, onRemove) {
  return [{
    label: '取下保養中吊牌 ' + code,
    run: () => {
      st.cards[code] = 'player';
      Sound.sfx('card');
      advance(st, 1);
      addTrail(st, '從 ' + equipNo + ' 取下吊牌 ' + code + '，機台恢復生產');
      log('取下吊牌 ' + code + '，機台恢復生產。記得把吊牌放回吊牌架。', 'scene');
      if (onRemove) onRemove();
    }
  }];
}

// Compare selected results with what was seen at the machine
function resultMismatch(planItems, expected, input) {
  const w = [];
  expected.forEach((exp, n) => {
    const got = input.items[n] && input.items[n].result;
    if (got && got !== exp) w.push('第 ' + (n + 1) + ' 項「' + planItems[n] + '」：你選的是「' + got + '」，現場檢查的結果是「' + exp + '」');
  });
  return w;
}

function backfillBlock(st, input) {
  if (text(input.doneDate) === todayStr(st)) return null;
  return '系統會接受這個日期（只檢查日期格式、不晚於今天、晚於上一次保養日），但保養實際上是今天做的。本關請以實際保養日 ' + todayStr(st) + ' 登錄。';
}

/* Level 1: normal flow */
function makeLevel1() {
  const JOBS = {
    'EQ-101': {
      planId: 1, line: 'press', leader: '沖壓線班長 江明德', ext: '3101', name: '160 噸油壓沖床',
      expected: ['正常', '正常', '正常', '正常'],
      observe: ['潤滑油位在標線內，補充少量。', '滑塊導軌清潔完成。', '離合器與煞車作動正常。', '遮斷安全光柵後，機台立即停止，功能正常。'],
      memo: '油壓沖床檢查備忘：四項都正常'
    },
    'EQ-201': {
      planId: 4, line: 'mach', leader: '加工線班長 蔡佳玲', ext: '3201', name: 'CNC 車床',
      expected: ['正常', '異常', '正常', '正常'],
      observe: ['切屑與排屑機清潔完成。', '切削液濃度偏低（量測 3%，標準 5–8%），已現場補充原液。', '主軸潤滑油位正常。', '夾頭夾持力正常。'],
      memo: 'CNC 車床檢查備忘：第 2 項切削液濃度偏低，已現場補充；其餘三項正常'
    }
  };
  const jobByPlan = id => Object.keys(JOBS).find(k => JOBS[k].planId === id);
  const fresh = () => ({ inspected: false, recordId: null, removed: false });

  function predictionQuestions() {
    return [
      {
        id: 'next', q: '① 送出 CNC 車床這筆紀錄後，系統算出的下次應保養日是哪一天？',
        options: ['2027-11-24（原訂 10-25 再加 30 天）', '2027-11-19（今天 10-20 再加 30 天）', '2027-10-25（不變）'],
        answer: '2027-11-19（今天 10-20 再加 30 天）',
        explain: '下次應保養日 = 最後一筆紀錄的保養日期 + 週期天數。系統用實際保養日（今天）往後推，不用原訂的 10-25。'
      },
      {
        id: 'result', q: '② 這筆紀錄的「紀錄結果」會是什麼？',
        options: ['正常（已經現場補充，問題排除了）', '有異常（有一項選了「異常」）', '部分未執行'],
        answer: '有異常（有一項選了「異常」）',
        explain: '紀錄結果不是存起來的欄位，是依各項結果推算：有任一項「異常」就是「有異常」，不看是否已經處理。'
      }
    ];
  }

  function finish(st) {
    if (st.done) return;
    st.done = true;
    st.flags.finished = true;
    whenIdle(() => {
      const ids = Object.keys(JOBS).map(k => st.flags.jobs[k].recordId);
      const lathe = st.db.pm_records.find(r => r.id === st.flags.jobs['EQ-201'].recordId);
      const qs = predictionQuestions();
      const top = '<p class="ok">通關：兩個月保養計畫都已登錄，吊牌也回到吊牌架。兩個計畫在待保養清單上從「即將到期」變成「未到期」。</p>' +
        predictionListHtml(st, qs, q => q.id === 'next' ? planState(st.db, 4, todayStr(st)).next_due : recordResult(st.db, lathe.id));
      const data = recordsTableHtml(st.db, ids, '模擬資料：本關新增的保養紀錄（pm_records）') + dueSnapshotHtml(st.db, todayStr(st), '模擬資料：目前的待保養清單');
      openSettlement('第一關結算：觀察—推論—實際系統待查證', midtermSettlementHtml(st, top, data), [
        { label: '下一關：趕貨的那個月', run: () => startMode('level2') },
        { label: '重新開始本關', run: () => startMode('level1') },
        { label: '回到標題', run: showTitle }
      ]);
    });
  }

  return {
    id: 'level1', title: '第一關　早班巡保', role: '保養技術員 何俊德', showSummary: true,
    setup(st) {
      st.db = level1Data();
      st.clock = clockAt(2027, 10, 20, 8, 40);
      st.player = { x: 3, y: 4, dir: 'up' };
      st.flags = { viewedList: false, filtered: false, called: { press: false, mach: false }, jobs: { 'EQ-101': fresh(), 'EQ-201': fresh() }, predicted: false, coachedFilter: false };
      st.npcs = { chief: npcDef('chief', '設備課長 鄭國榮', '#0f766e', 2, 6) };
      st.cards = { 'T-1': 'rack', 'T-2': 'rack' };
    },
    onStart() {
      showTalk([
        { who: '旁白', text: '10 月 20 日上午 8:40。你是設備課的保養技術員何俊德。今天要處理自己負責、快到期的保養計畫。' },
        { who: '旁白', text: '方向鍵或 WASD 移動；面向電腦、電話、吊牌架、機台或人按 E 互動。對話與表單可用滑鼠或 Tab、Enter 操作。' }
      ], [], { closeLabel: '開始' });
    },
    objective(st) {
      const f = st.flags, j = f.jobs;
      return {
        title: '今天的保養工作', showAll: true, items: [
          { text: '在設備課電腦打開待保養清單', done: f.viewedList },
          { text: '用「負責人」篩選出自己的計畫', done: f.filtered },
          { text: '打電話給沖壓線班長，確認油壓沖床能停機', done: f.called.press },
          { text: '在油壓沖床掛上「保養中」吊牌並逐項檢查', done: j['EQ-101'].inspected },
          { text: '在電腦登錄油壓沖床的月保養', done: !!j['EQ-101'].recordId },
          { text: '打電話給加工線班長，確認 CNC 車床能停機', done: f.called.mach },
          { text: '在 CNC 車床掛上「保養中」吊牌並逐項檢查', done: j['EQ-201'].inspected },
          { text: '在電腦登錄 CNC 車床的月保養（送出前先預測）', done: !!j['EQ-201'].recordId },
          { text: '取下兩台機台的吊牌，放回吊牌架', done: j['EQ-101'].removed && j['EQ-201'].removed && st.cards['T-1'] === 'rack' && st.cards['T-2'] === 'rack' }
        ]
      };
    },
    hudExtra(st) {
      const notes = Object.keys(JOBS).filter(k => st.flags.jobs[k].inspected).map(k => JOBS[k].memo);
      return '<h3>現場檢查備忘（不在系統裡）</h3>' + (notes.length ? '<ul class="notes-list">' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '<p class="hint">還沒有檢查紀錄。</p>');
    },
    npcAttention() { return false; },
    onTalk(st, id) {
      if (id === 'chief') {
        showTalk([
          { who: '鄭國榮', text: '早。你負責的油壓沖床和 CNC 車床，月保養都快到了。先看待保養清單。' },
          { who: '鄭國榮', text: '停機前一定要先打給產線班長，分機表貼在電話旁邊。做完記得把吊牌拿回來。' }
        ]);
      }
    },
    onPhone(st, ext) {
      if (ext === '3101') {
        if (!st.flags.called.press) { st.flags.called.press = true; addTrail(st, '撥打分機 3101，和沖壓線班長確認油壓沖床可以停機'); }
        return [{ who: '江明德', text: '沖壓線江明德。油壓沖床？剛好在換模，可以停一個小時，你過來吧。' }];
      }
      if (ext === '3201') {
        if (!st.flags.called.mach) { st.flags.called.mach = true; addTrail(st, '撥打分機 3201，和加工線班長確認 CNC 車床可以停機'); }
        return [{ who: '蔡佳玲', text: '加工線蔡佳玲。CNC 車床這批剛做完，現在可以停。' }];
      }
      return null;
    },
    onMachine(st, equipNo) {
      const job = JOBS[equipNo];
      if (!job) {
        const e = equipByNo(st.db, equipNo);
        return showTalk([{ who: '旁白', text: (e ? e.name : '這台機台') + '正在生產。今天不需要保養這台。' }]);
      }
      const s = st.flags.jobs[equipNo];
      const code = tagOn(st, equipNo);
      if (!s.inspected) {
        if (!st.flags.called[job.line]) return coachTalk('還沒和' + job.leader + '確認能不能停機。這通電話在系統之外，系統不會提醒；分機表貼在電話旁。');
        if (!code) {
          const ch = hangChoices(st, equipNo);
          if (!ch.length) return coachTalk('先到吊牌架取一塊「保養中」吊牌，掛到機台上，再開始檢查。');
          return showTalk([{ who: '旁白', text: job.name + '已經停機。開始保養前先掛上「保養中」吊牌。' }], ch);
        }
        return showTalk([{ who: '旁白', text: '逐項檢查 ' + job.name + '：' }].concat(job.observe.map((o, n) => ({ who: '第 ' + (n + 1) + ' 項', text: o }))), [{
          label: '完成逐項檢查',
          run: () => {
            s.inspected = true;
            advance(st, 25);
            addTrail(st, '在 ' + job.name + ' 旁逐項檢查（' + job.memo.split('：')[1] + '）');
            log(job.memo + '。回設備課電腦登錄保養。', 'note');
          }
        }]);
      }
      if (!s.recordId) return showTalk([{ kind: 'memo', text: job.memo }, { kind: 'coach', text: '檢查做完了，但系統還沒有這筆保養紀錄。回設備課電腦登錄，登錄後再回來取下吊牌。' }]);
      if (code) return showTalk([{ who: '旁白', text: '保養已登錄完成。' }], removeChoice(st, equipNo, code, () => { s.removed = true; }));
      return showTalk([{ who: '旁白', text: job.name + '已恢復生產。' }]);
    },
    computerTabs() { return STD_TABS; },
    onSystem(st, evt) {
      const f = st.flags;
      switch (evt.type) {
        case 'openTab':
          if (evt.tab === 'due' && !f.viewedList) {
            f.viewedList = true;
            addTrail(st, '在電腦打開待保養清單');
            return { coach: '清單上方的件數是全部計畫的統計。「剩餘天數」與「保養狀態」是用今天日期算出來的。' };
          }
          return {};
        case 'dueFilter':
          if (Number(evt.filter.owner) === PLAYER_ID && !f.filtered) {
            f.filtered = true;
            addTrail(st, '用負責人「何俊德」篩選待保養清單');
            return { coach: '篩選後只剩你的計畫，但上方「逾期」「7 天內到期」的件數沒有變：件數統計不受篩選影響。' };
          }
          return {};
        case 'openRecordForm': {
          const key = jobByPlan(evt.planId);
          if (!key) {
            const p = planState(st.db, evt.planId, todayStr(st));
            if (p && p.owner_id !== PLAYER_ID) return { block: '系統允許任何人替任何啟用中的計畫登錄（不檢查是不是負責人），但這個計畫的負責人是' + p.owner_name + '，你今天也沒有實際保養這台，不要登錄。' };
            return { block: '這個計畫還沒到期，今天不需要保養。' };
          }
          if (!f.jobs[key].inspected) return { block: '系統隨時都能開登錄畫面，但你還沒到 ' + JOBS[key].name + ' 旁逐項檢查。先完成現場檢查，再登錄結果。' };
          if (f.jobs[key].recordId) return { block: '這個計畫今天已經登錄過了。' };
          return {};
        }
        case 'beforeRecord': {
          const key = jobByPlan(evt.planId);
          if (!key) return {};
          const b = backfillBlock(st, evt.input);
          if (b) return { block: b };
          const plan = planState(st.db, evt.planId, todayStr(st));
          const w = resultMismatch(splitItems(plan.items), JOBS[key].expected, evt.input);
          return w.length ? { warn: w } : {};
        }
        case 'recordIntercept':
          if (evt.planId === 4 && !f.predicted) {
            return { intercept: proceed => openQuiz('送出前先預測', '按下「登錄」之前，先預測兩件事。選完會看到說明，可以改選，不計分。', predictionQuestions(), st.predictions, '繼續登錄', () => { f.predicted = true; proceed(); }) };
          }
          return {};
        case 'record': {
          const key = jobByPlan(evt.planId);
          if (!key || !evt.result.ok) return {};
          f.jobs[key].recordId = evt.result.record.id;
          const res = recordResult(st.db, evt.result.record.id);
          addTrail(st, '登錄 ' + JOBS[key].name + ' 月保養：紀錄 #' + evt.result.record.id + '，紀錄結果「' + res + '」，系統算出下次應保養日 ' + evt.result.nextDue);
          return { coach: '系統從今天往後推 30 天，算出下次應保養日 ' + evt.result.nextDue + '，這個計畫在清單上變成「未到期」。紀錄結果「' + res + '」是依各項結果推算出來的。保養項目文字也一併複製到這筆紀錄。' };
        }
        case 'recordFailed':
          addTrail(st, '登錄失敗：' + evt.errors.join('；'));
          return {};
      }
      return {};
    },
    onRack(st, action, code) { addTrail(st, (action === 'take' ? '從吊牌架取出吊牌 ' : '把吊牌 ') + code + (action === 'take' ? '' : ' 放回吊牌架')); },
    afterAction(st) {
      const j = st.flags.jobs;
      if (!st.done && j['EQ-101'].removed && j['EQ-201'].removed && st.cards['T-1'] === 'rack' && st.cards['T-2'] === 'rack') finish(st);
    }
  };
}

const STD_TABS = [
  { id: 'due', label: '待保養清單' },
  { id: 'history', label: '設備保養履歷' },
  { id: 'records', label: '保養紀錄查詢' }
];

/* Level 2: overdue because the line could not stop */
function makeLevel2() {
  const EQ = 'EQ-102';
  const PLAN = 3;
  const OBSERVE = ['潤滑油位在標線內。', '滑塊導軌清潔完成。', '離合器與煞車作動正常。', '遮斷安全光柵後，機台立即停止，功能正常。'];

  function predictionQuestions() {
    return [
      {
        id: 'next', q: '① 以今天日期送出後，系統算出的下次應保養日是哪一天？',
        options: ['2027-11-27（原訂 10-28 再加 30 天）', '2027-12-05（今天 11-05 再加 30 天）', '2027-11-05（今天）'],
        answer: '2027-12-05（今天 11-05 再加 30 天）',
        explain: '系統一律從最後一次實際保養日往後推週期天數，不記得原訂的 10-28。'
      },
      {
        id: 'status', q: '② 送出後，這個計畫在待保養清單上的保養狀態是什麼？',
        options: ['逾期', '即將到期', '未到期'], answer: '未到期',
        explain: '下次應保養日變成 12-05，剩 30 天，超過 7 天就是「未到期」。逾期的狀態是當下算出來的，不是存下來的。'
      },
      {
        id: 'history', q: '③ 送出後，在設備保養履歷上能不能看出這次曾經逾期 8 天？',
        options: ['看得出來：系統會記下逾期天數', '看不出來：只看得到保養日期 11-05 與備註'],
        answer: '看不出來：只看得到保養日期 11-05 與備註',
        explain: '系統沒有原訂日欄位，也沒有存逾期天數。做完之後，唯一的痕跡是技術員自己寫的備註文字。'
      },
      {
        id: 'backfill', q: '④ 如果把保養日期填成原訂日 2027-10-28，系統會不會接受？',
        options: ['會被拒絕：日期早於今天', '會被接受：系統只檢查格式、不晚於今天、晚於上一次保養日'],
        answer: '會被接受：系統只檢查格式、不晚於今天、晚於上一次保養日',
        explain: '上一次保養日是 09-28，10-28 晚於它也不晚於今天，所以系統會接受，紀錄看起來就像按時完成，下次應保養日也會變成 11-27。這裡只說明現況行為；本關仍請以實際保養日登錄。'
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
    const eq = equipByNo(st.db, EQ);
    const h = equipmentHistory(st.db, eq.id, todayStr(st));
    const rec = st.db.pm_records.find(r => r.id === st.flags.recordId);
    const plan = planState(st.db, PLAN, todayStr(st));
    const qs = predictionQuestions();
    const sys = { next: plan.next_due, status: plan.due_status, history: '看不出來：只看得到保養日期與備註', backfill: '會被接受（日期格式正確、不晚於今天、晚於 09-28）' };
    const top =
      '<table class="data"><caption>設備保養履歷：' + esc(eq.equip_no + ' ' + eq.name) + '（模擬畫面）</caption><thead><tr><th>保養日期</th><th>保養類別</th><th>執行人</th><th>紀錄結果</th><th>備註</th></tr></thead><tbody>' +
      h.records.map(r => '<tr><td>' + esc(r.done_date) + '</td><td>' + esc(r.plan_type) + '</td><td>' + esc(r.done_by_name) + '</td><td>' + esc(r.result) + '</td><td>' + esc(r.note || '') + '</td></tr>').join('') +
      '</tbody></table>' +
      '<table class="data compare"><caption>「實際發生」與「系統記錄」</caption><thead><tr><th></th><th>實際發生</th><th>系統記錄</th></tr></thead><tbody>' +
      '<tr><th>原訂應保養日</th><td>2027-10-28（09-28 再加 30 天）</td><td>沒有欄位；只在當時的清單上算出來，做完就看不到</td></tr>' +
      '<tr><th>實際保養日</th><td>2027-11-05 下午</td><td>保養日期 ' + esc(rec ? rec.done_date : '') + '</td></tr>' +
      '<tr><th>逾期天數</th><td>8 天</td><td>沒有記錄</td></tr>' +
      '<tr><th>延後的原因與決定</th><td>沖壓線趕貨不能停機；課長口頭說「做完寫備註」</td><td>備註：' + esc(rec && rec.note ? rec.note : '（空）') + '</td></tr>' +
      '<tr><th>下次應保養日</th><td>—</td><td>' + esc(plan.next_due) + '（從實際保養日往後推）</td></tr>' +
      '</tbody></table>' + predictionListHtml(st, qs, q => sys[q.id]);
    return midtermSettlementHtml(st, top, dueSnapshotHtml(st.db, todayStr(st), '模擬資料：目前的待保養清單'));
  }

  function maybeAfternoon(st) {
    const f = st.flags;
    if (gameState !== st || f.afternoon || !f.called || !f.askedDelay) return;
    f.afternoon = true;
    whenIdle(() => {
      st.clock = clockAt(2027, 11, 5, 14, 0);
      addTrail(st, '下午 2:00，沖壓線停機');
      showTalk([{ who: '旁白', text: '（時間來到下午 2:00）沖壓線那批貨做完，110 噸沖床停機了。可以開始保養。' }]);
      render();
    });
  }

  return {
    id: 'level2', title: '第二關　趕貨的那個月', role: '保養技術員 何俊德', showSummary: true,
    setup(st) {
      st.db = level2Data();
      st.clock = clockAt(2027, 11, 5, 8, 30);
      st.player = { x: 3, y: 4, dir: 'up' };
      st.flags = { viewedList: false, called: false, askedDelay: false, afternoon: false, inspected: false, recordId: null, removed: false, predicted: false, triedFuture: false };
      st.npcs = { chief: npcDef('chief', '設備課長 鄭國榮', '#0f766e', 2, 6) };
      st.cards = { 'T-1': 'rack', 'T-2': 'rack' };
    },
    onStart() {
      showTalk([{ who: '旁白', text: '11 月 5 日上午 8:30。你是保養技術員何俊德。這個月沖壓線一直在趕貨。' }], [], { closeLabel: '開始' });
    },
    objective(st) {
      const f = st.flags;
      return {
        title: '逾期的 110 噸沖床', items: [
          { text: '打開待保養清單，找到逾期的 110 噸沖床', done: f.viewedList },
          { text: '打電話給沖壓線班長，問能不能停機', done: f.called },
          { text: '問設備課長能不能先申請延期', done: f.askedDelay },
          { text: '停機後掛上「保養中」吊牌並逐項檢查', done: f.inspected },
          { text: '登錄保養（日期用今天、備註寫延後原因；送出前先預測）', done: !!f.recordId },
          { text: '取下吊牌，放回吊牌架', done: f.removed && st.cards['T-1'] === 'rack' && st.cards['T-2'] === 'rack' }
        ]
      };
    },
    npcAttention(st, id) { return id === 'chief' && st.flags.called && !st.flags.askedDelay; },
    onTalk(st, id) {
      if (id !== 'chief') return;
      const f = st.flags;
      if (!f.called) return showTalk([{ who: '鄭國榮', text: '110 噸沖床逾期了吧？先打給沖壓線班長，看什麼時候能停。' }]);
      if (!f.askedDelay) {
        return showTalk([
          { who: '你', text: '110 噸沖床的月保養已經逾期 8 天，班長說下午才能停。可以在系統上先申請延期嗎？' },
          { who: '鄭國榮', text: '系統沒有延期這個功能。做完在備註寫一下就好。' },
          { kind: 'coach', text: '這是現況：原有系統沒有延期的申請或核准，遊戲也不提供延期操作。延期的決定與理由，只會留在口頭和備註裡。' }
        ], [], { closeLabel: '知道了', onDone: () => { f.askedDelay = true; addTrail(st, '問設備課長能否申請延期：系統沒有這個功能，「做完在備註寫一下」'); maybeAfternoon(st); } });
      }
      showTalk([{ who: '鄭國榮', text: '做完記得在備註寫一下為什麼晚了。' }]);
    },
    onPhone(st, ext) {
      if (ext !== '3101') return null;
      const f = st.flags;
      if (f.afternoon) return [{ who: '江明德', text: '已經停了，你過來吧。' }];
      if (!f.called) { f.called = true; addTrail(st, '撥打分機 3101：沖壓線班長說上午不能停，下午兩點才能停機'); }
      setTimeout(() => maybeAfternoon(st), 0);
      return [{ who: '江明德', text: '這個月一直在趕貨，上午真的不能停。下午兩點那批做完，我再停給你。' }];
    },
    onMachine(st, equipNo) {
      const f = st.flags;
      if (equipNo !== EQ) {
        const e = equipByNo(st.db, equipNo);
        return showTalk([{ who: '旁白', text: (e ? e.name : '這台機台') + '正在生產。今天不需要保養這台。' }]);
      }
      const code = tagOn(st, EQ);
      if (!f.inspected) {
        if (!f.called) return coachTalk('還沒和沖壓線班長確認能不能停機。這通電話在系統之外；分機表貼在電話旁。');
        if (!f.afternoon) return coachTalk('班長說下午兩點才能停機，現在 110 噸沖床還在生產。' + (f.askedDelay ? '' : '可以先問問設備課長延後的事。'));
        if (!code) {
          const ch = hangChoices(st, EQ);
          if (!ch.length) return coachTalk('先到吊牌架取一塊「保養中」吊牌，掛到機台上，再開始檢查。');
          return showTalk([{ who: '旁白', text: '110 噸沖床已經停機。開始保養前先掛上「保養中」吊牌。' }], ch);
        }
        return showTalk([{ who: '旁白', text: '逐項檢查 110 噸沖床：' }].concat(OBSERVE.map((o, n) => ({ who: '第 ' + (n + 1) + ' 項', text: o }))), [{
          label: '完成逐項檢查',
          run: () => { f.inspected = true; advance(st, 30); addTrail(st, '在 110 噸沖床旁逐項檢查（四項都正常）'); log('110 噸沖床檢查備忘：四項都正常。回設備課電腦登錄保養。', 'note'); }
        }]);
      }
      if (!f.recordId) return coachTalk('檢查做完了，但系統還沒有這筆保養紀錄。回設備課電腦登錄。');
      if (code) return showTalk([{ who: '旁白', text: '保養已登錄完成。' }], removeChoice(st, EQ, code, () => { f.removed = true; }));
      return showTalk([{ who: '旁白', text: '110 噸沖床已恢復生產。' }]);
    },
    computerTabs() { return STD_TABS; },
    onSystem(st, evt) {
      const f = st.flags;
      switch (evt.type) {
        case 'openTab':
          if (evt.tab === 'due' && !f.viewedList) {
            f.viewedList = true;
            addTrail(st, '在待保養清單看到 110 噸沖床月保養「逾期 8 天」');
            return { coach: '110 噸沖床的月保養顯示「逾期」，剩餘天數「逾期 8 天」。這是用上一次保養日 09-28 加 30 天、再和今天比出來的。' };
          }
          return {};
        case 'openRecordForm':
          if (evt.planId !== PLAN) return { block: '今天要處理的是 110 噸沖床的月保養。' };
          if (!f.inspected) return { block: '系統隨時都能開登錄畫面，但 110 噸沖床還沒保養。先停機、掛吊牌、逐項檢查，再登錄。' };
          if (f.recordId) return { block: '這個計畫今天已經登錄過了。' };
          return {};
        case 'beforeRecord': {
          if (evt.planId !== PLAN) return {};
          const b = backfillBlock(st, evt.input);
          if (b) return { block: b };
          if (!text(evt.input.note)) return { warn: ['課長說要在備註寫一下延後的原因，現在備註是空的。'] };
          return {};
        }
        case 'recordIntercept':
          if (evt.planId === PLAN && !f.predicted) {
            return { intercept: proceed => openQuiz('送出前先預測', '按下「登錄」之前，先預測四件事。選完會看到說明，可以改選，不計分。', predictionQuestions(), st.predictions, '繼續登錄', () => { f.predicted = true; proceed(); }) };
          }
          return {};
        case 'recordFailed':
          addTrail(st, '登錄失敗（系統拒絕，沒有新增紀錄）：' + evt.errors.join('；'));
          if (evt.errors[0] === '保養日期不能晚於今天') f.triedFuture = true;
          return {};
        case 'record':
          if (evt.planId === PLAN && evt.result.ok) {
            f.recordId = evt.result.record.id;
            addTrail(st, '登錄 110 噸沖床月保養：保養日期 ' + evt.result.record.done_date + '，系統算出下次應保養日 ' + evt.result.nextDue);
            return { coach: '系統只記下保養日期 ' + evt.result.record.done_date + ' 與備註，下次應保養日從今天往後推，是 ' + evt.result.nextDue + '。原訂的 10-28 與逾期 8 天都沒有存下來。' };
          }
          return {};
      }
      return {};
    },
    onRack(st, action, code) { addTrail(st, (action === 'take' ? '從吊牌架取出吊牌 ' : '把吊牌 ') + code + (action === 'take' ? '' : ' 放回吊牌架')); },
    afterAction(st) {
      if (!st.done && st.flags.removed && st.cards['T-1'] === 'rack' && st.cards['T-2'] === 'rack') finish(st);
    }
  };
}

/* ---------- 6. change request scenario ---------- */

let FinalDemo = null;

/* @@FINAL_BEGIN */
function crData() {
  return withRecords(emptyDb(3), [
    [1, '2027-06-24', 3], [1, '2027-07-25', 3], [1, '2027-08-23', 3], [1, '2027-09-22', 3], [1, '2027-10-20', 3],
    [2, '2027-05-12', 5], [2, '2027-08-15', 5],
    [3, '2027-06-30', 3], [3, '2027-07-30', 3], [3, '2027-08-29', 3], [3, '2027-09-28', 3], [3, '2027-11-05', 3, '沖壓線趕貨，下午才停機；原訂 10-28'],
    [4, '2027-06-27', 3], [4, '2027-07-27', 3], [4, '2027-08-29', 3, '換線趕貨，晚 3 天'], [4, '2027-09-28', 3], [4, '2027-10-28', 3],
    [5, '2027-07-10', 4], [5, '2027-08-09', 4], [5, '2027-09-08', 4], [5, '2027-10-08', 4],
    [6, '2027-06-01', 5], [6, '2027-08-30', 5],
    [7, '2027-07-15', 5], [8, '2027-05-01', 5]
  ]);
}

const CR01 = {
  id: 'CR-01',
  title: '年度保養計畫與逾期紀錄',
  requester: '品保部 羅雅文',
  requesterNpc: 'qa',
  summary: '客戶下週來稽核，品保部要全年保養計畫表與第三季的按時完成次數；系統排不出來，也算不出來。',
  computerOptions: {
    recordReadOnly: true,
    banner: 'CR-01 情境：以下是現況模擬畫面，只供觀察，不辦理保養登錄。現況系統沒有年度計畫表、原訂日、延期或達成率功能。（依修改需求提案書與原始碼所述現況，實際畫面請回原系統確認）'
  },
  setup(st) {
    st.db = crData();
    st.clock = clockAt(2027, 11, 10, 10, 0);
    st.player = { x: 3, y: 4, dir: 'up' };
    st.npcs = {
      qa: npcDef('qa', '品保部 羅雅文', '#9333ea', 4, 5),
      chief: npcDef('chief', '設備課長 鄭國榮', '#0f766e', 2, 6),
      tech: npcDef('tech', '技術員 王怡婷', '#db2777', 16, 5)
    };
    st.cards = { 'T-1': 'rack', 'T-2': 'rack' };
  },
  intro: [
    { who: '旁白', text: '11 月 10 日上午 10:00。你是系統分析師，今天到設備課了解保養系統。品保部的羅雅文也來了。' },
    { who: '羅雅文', text: '客戶下週來稽核。我要兩樣東西：明年度的全年保養計畫表，還有今年第三季月保養應該做幾次、按時做了幾次。' },
    { who: '旁白', text: '查看設備課電腦，和品保工程師、保養技術員談談，收集「觀察筆記」後再回來找羅雅文。' }
  ],
  clues: [
    { id: 'next', hint: '查看電腦的待保養清單', text: '待保養清單上，每個計畫只看得到「下一次」應保養日，看不到之後的日期。' },
    { id: 'history', hint: '查看一台設備的保養履歷', text: '設備保養履歷只列出已經做過的保養日期，沒有原訂的應保養日。' },
    { id: 'excel', hint: '看看品保工程師帶來的 Excel 計畫表', text: '' },
    { id: 'gone', hint: '技術員登錄 CNC 加工機的保養後，再看一次待保養清單', text: 'CNC 立式加工機原本逾期 3 天；技術員登錄保養後，它就從逾期清單消失，履歷上只看得到保養日期。' },
    { id: 'delay', hint: '再和技術員談談延期的事', text: '產線班長問能不能把保養往後延，技術員說自己往後排、做完寫備註；沒有申請或核准，課長事後才知道。' },
    { id: 'rate', hint: '用保養紀錄查詢查第三季（2027-07-01 到 2027-09-30）', text: '' }
  ],
  excelText(st) {
    const p = planState(st.db, 3, todayStr(st));
    return '品保部 Excel 排的 110 噸沖床月保養，11 月是 2027-11-28；系統的下次應保養日是 ' + p.next_due + '，兩邊對不上。系統每次都從實際保養日往後推。';
  },
  excelHtml(st) {
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
    const p = planState(st.db, 3, todayStr(st));
    return '<p class="banner warn">現行人工作法：品保部自己用 Excel 排的計畫表。只讀、固定資料，不是保養系統的畫面，也不是修改後計畫表的範本。</p>' +
      '<table class="data excel"><caption>2027 年度保養計畫（品保部 Excel）</caption><thead><tr><th>設備</th><th>保養類別</th>' + months.map(m => '<th>' + Number(m) + ' 月</th>').join('') + '</tr></thead><tbody>' +
      '<tr><td>EQ-102 110 噸沖床</td><td>月保養</td>' + months.map(m => '<td>' + m + '-28</td>').join('') + '</tr>' +
      '<tr><td>EQ-202 CNC 立式加工機</td><td>月保養</td>' + months.map(m => '<td>' + m + '-08</td>').join('') + '</tr>' +
      '</tbody></table><p class="hint">對照：保養系統上 EQ-102 月保養的下次應保養日是 ' + esc(p.next_due) + '。</p>';
  },
  requesterWaiting(st, api) {
    api.collect(st, 'excel');
    showTalk([
      { who: '羅雅文', text: '這是我自己用 Excel 排的計畫表，每個月固定一天。系統排不出全年的，我只好自己排。' },
      { kind: 'html', html: CR01.excelHtml(st) },
      { who: '羅雅文', text: '可是我排的日期，跟系統上的下次應保養日已經對不上了。你先去看看系統現在能查到什麼。' }
    ], [], { title: '品保部的 Excel 計畫表（現行人工作法）' });
  },
  talk: {
    tech(st, api) {
      const f = st.cr;
      if (!f.techDone) {
        return showTalk([
          { who: '王怡婷', text: '這台 CNC 立式加工機的月保養逾期 3 天了，前幾天產線一直不讓停。今天終於停了，我剛做完。' },
          { who: '王怡婷', text: '我現在就用設備課電腦登錄，跟平常一樣。' }
        ], [{
          label: '請她照平常方式登錄（使用原有登錄功能）',
          run: () => {
            const plan = planState(st.db, 5, todayStr(st));
            const items = splitItems(plan.items).map(() => ({ result: '正常', remark: '' }));
            const r = createRecord(st.db, 5, { doneDate: todayStr(st), note: '', items }, todayStr(st), 4, nowStr(st));
            if (r.ok) {
              st.db = r.db;
              f.techDone = true;
              advance(st, 5);
              addTrail(st, '王怡婷登錄 CNC 立式加工機月保養（' + r.record.done_date + '），系統算出下次應保養日 ' + r.nextDue);
              log('王怡婷登錄了 CNC 立式加工機的月保養。再看一次待保養清單的逾期件數。', 'scene');
            }
          }
        }]);
      }
      if (st.cr.clues.indexOf('delay') < 0) {
        Sound.sfx('ring');
        api.collect(st, 'delay');
        return showTalk([
          { who: '旁白', text: '（王怡婷的手機響了，是加工線班長蔡佳玲。）' },
          { who: '蔡佳玲', text: '下週要趕一批急單，CNC 車床的保養能不能往後延？' },
          { who: '王怡婷', text: '好，我自己往後排，做完再在備註寫一下。' },
          { who: '王怡婷', text: '（掛掉電話）延期這種事，課長通常是事後看備註才知道。系統裡也沒有地方申請。' }
        ]);
      }
      showTalk([{ who: '王怡婷', text: '有問題再問我。' }]);
    },
    chief(st) {
      showTalk([{ who: '鄭國榮', text: '延期的事我大多是事後才知道，看備註或聽技術員講。系統只看得到現在逾期的。' }]);
    }
  },
  onSystem(st, evt, api) {
    const f = st.cr;
    if (evt.type === 'openTab' && evt.tab === 'due') {
      api.collect(st, 'next');
      if (f.techDone) api.collect(st, 'gone');
    }
    if (evt.type === 'viewHistory') {
      api.collect(st, 'history');
      const eq = equipByNo(st.db, 'EQ-202');
      if (f.techDone && eq && evt.equipmentId === eq.id) api.collect(st, 'gone');
    }
    if (evt.type === 'queryRecords') {
      const q = evt.query;
      if (isDate(q.from) && isDate(q.to) && q.from >= '2027-07-01' && q.from <= '2027-07-31' && q.to >= '2027-09-01' && q.to <= '2027-09-30') {
        f.rateCount = evt.rows.length;
        api.collect(st, 'rate');
      }
    }
    return {};
  },
  clueText(st, c) {
    if (c.id === 'excel') return CR01.excelText(st);
    if (c.id === 'rate') return '用保養紀錄查詢查 2027 年第三季，查得到做了 ' + (st.cr.rateCount == null ? 'n' : st.cr.rateCount) + ' 筆紀錄；查不出「應該做幾次」，也分不出哪幾次是按時做的。';
    return c.text;
  },
  onCluesDone() { log('觀察已足夠，回設備課找品保部羅雅文。', 'scene'); },
  requestLines: [
    { who: '羅雅文', text: '所以系統只排得出「下一次」，而且每次晚做，日期就一路往後漂，我的 Excel 怎麼排都對不上。' },
    { who: '羅雅文', text: '逾期過的那一次，做完就看不出來；延期也沒有人事先核准，理由只寫在備註。' },
    { who: '羅雅文', text: '我希望系統排得出全年的保養計畫，每一次應該保養的都看得到結果；延期要先申請、由主管核准；稽核問達成率時，系統要算得出來。' }
  ],
  requests: [
    '排得出全年的應保養日期，客戶稽核直接看系統，不必另用 Excel',
    '每一次應該保養的那一次，事後都查得到結果，逾期過的也查得到逾期幾天',
    '產線不能停機時，延期要事前申請、由主管核准，理由與核准人查得到',
    '依期間與設備統計保養達成率'
  ],
  statements: [
    { text: '待保養清單上，每個計畫只看得到下一次的應保養日。', cat: 'obs', explain: '這是你在模擬畫面上看到的範圍。' },
    { text: 'CNC 立式加工機登錄保養後，就從逾期清單上消失了。', cat: 'obs', explain: '這是你看著技術員操作後實際發生的結果。' },
    { text: '保養紀錄查詢查得出第三季做了幾筆，查不出應該做幾次。', cat: 'obs', explain: '這是你查詢後看到的事實。' },
    { text: '品保部希望客戶稽核時，直接用系統看全年保養計畫。', cat: 'want', explain: '這是需求提出者希望達成的業務結果，還不是系統規格。' },
    { text: '品保部希望延期要事前有人核准，理由事後查得到。', cat: 'want', explain: '這是利害關係人的期望；由誰核准、可以延多久，都還要釐清。' },
    { text: '把品保部的 Excel 匯入系統，問題就解決了。', cat: 'infer', explain: '這是解法的猜想。Excel 是現行人工作法，不是修改後計畫表的範本；月保養要排固定日還是每 30 天，也還沒有決定。' },
    { text: '延期核准過的那一次，不應該算進達成率的分母。', cat: 'infer', explain: '這是待小組決議的問題之一，不是現況事實，也沒有唯一答案。' }
  ],
  impactAreas: ['角色', '流程', '功能', '資料', '權限', '既有紀錄'],
  impacts: {
    '角色': '品保部、設備課主管、保養技術員、產線班長，各自需要從這件事得到什麼？哪些人現在不使用系統？',
    '流程': '保養從排定、通知停機、延後到完成，現在有哪些步驟在系統外？延期要放在流程的哪裡？',
    '功能': '待保養清單、保養登錄、設備保養履歷、保養紀錄查詢，哪些會受影響？',
    '資料': '原訂日、實際保養日、逾期天數，哪些現在有存、哪些是算出來的、哪些根本沒記錄？',
    '權限': '延期現在由誰決定？若改成事前核准，牽涉哪些角色與權限？',
    '既有紀錄': '上線以來的舊紀錄沒有原訂日，改版後會遇到什麼問題？'
  },
  verify: [
    '在原系統打開待保養清單，確認每個計畫顯示哪些日期、剩餘天數怎麼算。',
    '打開設備明細與保養計畫，看保養履歷列出哪些欄位、看不看得到原訂日。',
    '用保養紀錄查詢依日期區間查詢，確認查得出什麼、查不出什麼。',
    '在 SQLite 查看 pm_plans 與 pm_records 目前存了哪些欄位（只看現況，不先設計新表）。'
  ],
  guide: [
    '品保部、設備課主管、保養技術員、產線班長，各自需要從這件事得到什麼？哪些人現在不使用系統？',
    '「下次應保養日」現在怎麼算？哪個畫面、哪個值可以證明？',
    '原訂日、實際保養日、逾期天數，哪些現在有存、哪些是算出來的、哪些根本沒記錄？',
    '延期現在由誰決定、留在哪裡？若要改成事前核准，牽涉哪些角色與權限？',
    '上線以來的舊紀錄，改版後會遇到什麼問題？'
  ],
  openQuestions: [
    '下次應保養日要從原訂日還是實際保養日往後推？兩種都支援時由誰決定、記在哪裡？',
    '年度計畫表上的月保養，要排在每月固定一天，還是每 30 天一次？',
    '「應該保養的那一次」要不要先存成一筆資料？何時產生、產生多遠？',
    '主管改了保養週期，已排好的未來日期要不要重排？',
    '延期可以延到哪天、延幾次？延期後下一次從哪天起算？',
    '「按時」怎麼定義？提前做算不算按時？',
    '達成率的分母是什麼？停用設備與延期核准過的那一次要不要算？',
    '舊紀錄沒有原訂日，改版後要怎麼補？'
  ]
};

FinalDemo = (function () {
  const sc = CR01;
  const CATEGORIES = [
    { id: 'obs', label: '觀察到的問題（現場事實）' },
    { id: 'want', label: '利害關係人的期望' },
    { id: 'infer', label: '尚待查證的推論或設計想法' }
  ];

  function menuHtml() {
    return '<h2>期末：變更需求情境</h2>' +
      '<p class="hint">本題只有一項變更需求 CR-01，約 5–10 分鐘。你的角色是系統分析師：觀察現場問題、辨識需求與待查證事項，遊戲不提供改善後的系統。</p>' +
      '<div class="cards"><button type="button" class="card" data-start="CR-01"><b>CR-01　' + esc(sc.title) + '</b><span>需求提出者：' + esc(sc.requester) + '</span><span>' + esc(sc.summary) + '</span></button></div>';
  }

  function makeController() {
    const api = { collect };
    const clueText = (st, c) => sc.clueText(st, c);

    function collect(st, clueId) {
      if (st.cr.clues.indexOf(clueId) >= 0) return;
      const c = sc.clues.find(x => x.id === clueId);
      if (!c) return;
      st.cr.clues.push(clueId);
      const t = clueText(st, c);
      addTrail(st, '觀察：' + t);
      log('已記下觀察：' + t, 'note');
      if (st.cr.stage === 'explore' && sc.clues.every(x => st.cr.clues.indexOf(x.id) >= 0)) {
        st.cr.stage = 'request';
        sc.onCluesDone(st, api);
      }
      render();
    }

    function talkRequester(st) {
      if (st.cr.stage === 'explore') {
        if (st.cr.clues.indexOf('excel') < 0) return sc.requesterWaiting(st, api);
        return showTalk([{ who: '羅雅文', text: '麻煩你先看看系統現在能查到什麼。' }, { kind: 'coach', text: '先在現場收集觀察筆記（右側清單），再回來聽需求說明。' }]);
      }
      if (st.cr.stage === 'request') return showTalk(sc.requestLines, [{ label: '開始需求釐清練習', run: () => openExercise(st) }]);
      return showTalk([{ who: '羅雅文', text: '謝謝你整理。' }], [
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
      openModal(sc.id + ' 需求釐清練習（不計分）', body => {
        const a = st.cr.answers;
        body.innerHTML =
          '<p class="hint">下列說法來自剛才的現場。判斷每一句比較接近哪一類；選完會看到說明，可以改選，不計分、不記錄。</p>' +
          '<ol class="classify">' + sc.statements.map((s, i) =>
            '<li><p>' + esc(s.text) + '</p><div class="radios" role="radiogroup" aria-label="第 ' + (i + 1) + ' 句的分類">' +
            CATEGORIES.map(c => '<label><input type="radio" name="st' + i + '" value="' + c.id + '"' + (a[i] === c.id ? ' checked' : '') + '> ' + c.label + '</label>').join('') +
            '</div><p class="fb" id="fb' + i + '" aria-live="polite">' + (a[i] ? esc(feedback(s, a[i])) : '') + '</p></li>').join('') + '</ol>' +
          '<fieldset class="impacts"><legend>你認為這項需求可能影響哪些面向？（可複選）</legend>' +
          sc.impactAreas.map(x => '<label><input type="checkbox" value="' + x + '"' + (st.cr.impacts.indexOf(x) >= 0 ? ' checked' : '') + '> ' + x + '</label>').join('') + '</fieldset>' +
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
      const observed = sc.clues.filter(c => st.cr.clues.indexOf(c.id) >= 0).map(c => '<li>' + esc(clueText(st, c)) + '</li>').join('');
      const html = '<div class="settle cr">' +
        '<p class="boundary">本情境只呈現現況困難與需求背景，不提供資料表、欄位、畫面或計算公式的答案。合理的做法可能不只一種，請回到原系統查證後，再提出有理由的設計。</p>' +
        '<div class="grid4">' +
        '<section><h3>觀察到的業務事件</h3><ul>' + observed + '</ul></section>' +
        '<section><h3>利害關係人的新要求（' + sc.id + '｜' + esc(sc.requester) + '）</h3><ul>' + sc.requests.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></section>' +
        '<section><h3>可能受影響項目（分類問題）</h3><dl>' + sc.impactAreas.map(x =>
          '<dt>' + x + (st.cr.impacts.indexOf(x) >= 0 ? '　<span class="tag-sel">你有勾選</span>' : '') + '</dt><dd>' + esc(sc.impacts[x]) + '</dd>').join('') + '</dl></section>' +
        '<section><h3>回到實際系統確認</h3><ul>' + sc.verify.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></section>' +
        '</div>' +
        '<section><h3>結算引導問題</h3><ol>' + sc.guide.map(g => '<li>' + esc(g) + '</li>').join('') + '</ol></section>' +
        '<section><h3>待小組決議的問題（遊戲只提出，不作答）</h3><ul class="open-q">' + sc.openQuestions.map(q => '<li>' + esc(q) + '</li>').join('') + '</ul>' +
        '<p class="hint">這些問題沒有標準答案，你們的選擇與理由要寫進修改建議書。</p></section>' +
        '<section><h3>你寫下的追問</h3><p class="notes">' + (st.cr.notes.trim() ? esc(st.cr.notes) : '（未填寫）') + '</p></section>' +
        '<p class="next-step">接著回到修改需求提案書〈三〉，照提案書給的操作步驟，在實際系統上重現 EQ-001 與 EQ-012 的狀況，確認自己看到的是同一個問題。</p>' +
        '</div>';
      openSettlement(sc.id + ' 結算：' + sc.title, html, [
        { label: '重做需求釐清練習', run: () => openExercise(st) },
        { label: '重新開始此情境', run: () => startMode(sc.id) },
        { label: '回到標題', run: showTitle }
      ]);
    }

    return {
      id: sc.id, title: sc.id + '　' + sc.title, role: '系統分析師（觀察現場）', isCR: true, rackReadOnly: true,
      setup(st) {
        sc.setup(st);
        st.cr = { clues: [], answers: {}, impacts: [], notes: '', stage: 'explore', techDone: false, rateCount: null };
      },
      onStart() { showTalk(sc.intro, [], { closeLabel: '開始觀察' }); },
      objective(st) {
        if (st.cr.stage === 'explore') {
          return {
            title: '收集現況觀察（' + st.cr.clues.length + '/' + sc.clues.length + '）',
            items: sc.clues.map(c => ({ text: c.hint, done: st.cr.clues.indexOf(c.id) >= 0 })), showAll: true
          };
        }
        if (st.cr.stage === 'request') return { title: '聽取需求', items: [{ text: '向' + sc.requester + '了解需求', done: false }] };
        if (st.cr.stage === 'exercise') return { title: '整理需求', items: [{ text: '完成需求釐清練習', done: false }] };
        return { title: '情境完成', items: [{ text: '可以找' + sc.requester + '重看結算，或從暫停選單回到標題', done: true }], showAll: true };
      },
      hudExtra(st) {
        const got = sc.clues.filter(c => st.cr.clues.indexOf(c.id) >= 0);
        return '<h3>觀察筆記</h3>' + (got.length ? '<ul class="notes-list">' + got.map(c => '<li>' + esc(clueText(st, c)) + '</li>').join('') + '</ul>' : '<p class="hint">尚未記下觀察。</p>');
      },
      npcAttention(st, npcId) {
        if (npcId === 'qa') return st.cr.stage === 'request' || (st.cr.stage === 'explore' && st.cr.clues.indexOf('excel') < 0);
        if (npcId === 'tech') return st.cr.stage === 'explore' && (!st.cr.techDone || st.cr.clues.indexOf('delay') < 0);
        return false;
      },
      onTalk(st, npcId) {
        if (npcId === sc.requesterNpc) return talkRequester(st);
        const h = sc.talk[npcId];
        if (h) return h(st, api);
        showTalk([{ who: (st.npcs[npcId] || {}).name || '', text: '……' }]);
      },
      onPhone() { return null; },
      onMachine(st, equipNo) {
        const e = equipByNo(st.db, equipNo);
        showTalk([{ who: '旁白', text: (e ? e.name : '這台機台') + '正在生產。' }]);
      },
      computerTabs() { return STD_TABS; },
      computerOptions() { return sc.computerOptions; },
      onSystem(st, evt) {
        if (evt.type === 'openRecordForm') return {};
        return sc.onSystem(st, evt, api) || {};
      }
    };
  }

  return { menuHtml, makeController, editionLabel: '期末版（含現況回顧）', has: id => id === sc.id };
})();
/* @@FINAL_END */

/* ---------- 6b. sound (Web Audio, synthesized in code, no audio files) ---------- */

const Sound = (function () {
  let ctx = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true, timer = null, nextTime = 0, stepIdx = 0;
  const STEP = 60 / 88 / 2; // eighth note at 88 BPM
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
  compTab: 'due', compMsg: null, warn: null, dueFilter: { owner: '', line: '', status: '' }, rec: null,
  histEq: '', histDetail: null, query: null, queryRows: null, phoneLog: [], quickKey: ''
};
let ctrl = null;

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function resetUiState() {
  Object.assign(ui, {
    idleQueue: [], msgs: [], compTab: null, compMsg: null, warn: null, dueFilter: { owner: '', line: '', status: '' }, rec: null,
    histEq: '', histDetail: null, query: { from: '', to: '', equipment: '', doneBy: '', result: '' }, queryRows: null, phoneLog: [], quickKey: ''
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
  if (l.kind === 'memo') return '<p class="memo">檢查備忘：' + esc(l.text) + '</p>';
  if (l.kind === 'coach') return '<p class="coach">教學提示：' + esc(l.text) + '</p>';
  if (l.kind === 'html') return '<div class="frag">' + l.html + '</div>';
  return '<p class="line' + (l.who === '旁白' ? ' narr' : '') + '">' + (l.who && l.who !== '旁白' ? '<b>' + esc(l.who) + '</b>' : '') + esc(l.text) + '</p>';
}

// opts.onDone runs when the close button is pressed
function showTalk(lines, choices, opts) {
  opts = opts || {};
  const list = (choices || []).slice();
  list.push({ label: opts.closeLabel || (list.length ? '先不要' : '結束對話'), run: opts.onDone || null, secondary: list.length > 0 });
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
  }, { size: opts.title ? 'wide' : '' });
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
  const hasCR = EDITION === 'final' && !!FinalDemo;
  $('#edition-tag').textContent = hasCR ? FinalDemo.editionLabel : '期中版';
  $('#menu-midterm').innerHTML =
    '<h2>期中：現況理解（As-Is）</h2><p class="hint">扮演保養技術員，體驗原有系統的功能與例外。兩關合計約 10–15 分鐘。</p><div class="cards">' +
    '<button type="button" class="card" data-start="level1"><b>第一關　早班巡保</b><span>正常流程：兩個快到期的月保養，從確認停機、掛吊牌、逐項檢查到登錄。</span></button>' +
    '<button type="button" class="card" data-start="level2"><b>第二關　趕貨的那個月</b><span>現有系統的例外：產線不能停機，保養逾期 8 天才做完。</span></button></div>';
  const fin = $('#menu-final');
  if (hasCR) { fin.hidden = false; fin.innerHTML = FinalDemo.menuHtml(); } else { fin.hidden = true; fin.innerHTML = ''; }
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
  if (ch === '#') return 'wall';
  if (ch === 'D') return 'door';
  if (ch === 'C') return 'obj t-computer';
  if (ch === 'T') return 'obj t-phone';
  if (ch === 'R') return 'obj t-rack';
  if (MACHINES[ch]) return 'machine m-' + ch + (x >= 13 ? ' mach' : ' press');
  if (x <= 5) return 'floor-office';
  if (x === 12) return 'aisle';
  return x < 12 ? 'floor-press' : 'floor-mach';
}
function tileLabel(ch, x, y) {
  if (ch === 'C') return '電腦';
  if (ch === 'T') return '電話';
  if (ch === 'R') return '吊牌架';
  if (MACHINES[ch]) return MACHINES[ch].label;
  if (ch === 'D') return '門';
  if (x === 9 && y === 1) return '沖壓線';
  if (x === 15 && y === 1) return '加工線';
  if (x === 3 && y === 7) return '設備課';
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
      if (MACHINES[ch]) d.dataset.equip = MACHINES[ch].no;
      map.appendChild(d);
    }
  }
}

function renderMachineTags() {
  if (!gameState) return;
  $all('#map [data-equip]').forEach(d => d.classList.toggle('tagged', !!tagOn(gameState, d.dataset.equip)));
}

function npcAt(x, y) {
  if (!gameState) return null;
  return Object.values(gameState.npcs).find(n => n.visible && n.x === x && n.y === y) || null;
}

function renderEntities() {
  const st = gameState;
  const layer = $('#ents');
  if (!st || !layer) return;
  const list = Object.values(st.npcs).filter(n => n.visible).map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, color: n.color, kind: 'npc' }));
  list.push({ id: '__player', name: ctrl.isCR ? '你（分析師）' : '你（技術員）', x: st.player.x, y: st.player.y, color: '#2563a8', kind: 'player' });
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
  renderMachineTags();
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
    const s = listDue(st.db, todayStr(st), {}).summary;
    const hung = Object.keys(st.cards).filter(c => /^EQ-/.test(st.cards[c])).map(c => c + '（' + st.cards[c] + '）');
    stats.hidden = false;
    stats.innerHTML = '<h3>待保養統計（依系統待保養清單）</h3><p>逾期 ' + s.overdue + ' 項、7 天內到期 ' + s.soon + ' 項</p>' +
      '<h3>保養中吊牌</h3><p>手上：' + (heldCards(st).join('、') || '（無）') + '；掛在機台：' + (hung.join('、') || '（無）') + '</p>';
  } else { stats.hidden = true; stats.innerHTML = ''; }
  const extra = $('#hud-extra');
  if (ctrl.hudExtra) { extra.hidden = false; extra.innerHTML = ctrl.hudExtra(st); } else { extra.hidden = true; extra.innerHTML = ''; }
  renderQuick();
}

const QUICK_SPOTS = {
  computer: { x: 1, y: 2, dir: 'up', label: '電腦' },
  phone: { x: 3, y: 2, dir: 'up', label: '電話' },
  rack: { x: 5, y: 2, dir: 'up', label: '吊牌架' }
};
function renderQuick() {
  const st = gameState;
  const keys = Object.keys(QUICK_SPOTS).filter(k => st.visited[k]);
  const key = keys.join(',');
  if (key === ui.quickKey) return;
  ui.quickKey = key;
  $('#hud-quick').innerHTML = '<h3>快捷移動</h3>' + (keys.length
    ? keys.map(k => '<button type="button" class="small" data-quick="' + k + '">' + QUICK_SPOTS[k].label + '</button>').join(' ')
    : '<p class="hint">用過電腦、電話或吊牌架後，可以在這裡直接移過去。</p>');
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
  if (MACHINES[ch]) {
    const e = gameState.db && equipByNo(gameState.db, MACHINES[ch].no);
    return { kind: 'machine', id: MACHINES[ch].no, label: MACHINES[ch].no + ' ' + (e ? e.name : MACHINES[ch].label) };
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
function doInteract() {
  const t = interactTarget();
  if (!t) { log('附近沒有可以互動的對象。', 'scene'); return; }
  const st = gameState;
  if (t.kind === 'npc') { ctrl.onTalk(st, t.id); return; }
  if (t.kind === 'machine') { if (ctrl.onMachine) ctrl.onMachine(st, t.id); return; }
  st.visited[t.id] = true;
  if (t.id === 'computer') openComputer();
  else if (t.id === 'phone') openPhone();
  else if (t.id === 'rack') openRack();
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
  ui.compMsg = null; ui.warn = null;
  openModal('設備課電腦', renderComputerBody, { size: 'wide' });
  addCoach(emit('openTab', { tab: ui.compTab }));
  rerenderComputer();
  render();
}
function reopenComputer() { openModal('設備課電腦', renderComputerBody, { size: 'wide' }); }

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
function coachMsg(textValue) { ui.compMsg = { kind: 'coach', lines: [], coach: textValue }; Sound.sfx('notice'); }
function addCoach(res) {
  if (!res || !res.coach) return;
  Sound.sfx('notice');
  ui.compMsg = { kind: ui.compMsg ? ui.compMsg.kind : 'coach', lines: ui.compMsg ? ui.compMsg.lines : [], coach: res.coach };
}

const BADGE = { '逾期': 'b-over', '即將到期': 'b-soon', '未到期': 'b-ok', '有異常': 'b-over', '部分未執行': 'b-soon', '正常': 'b-ok' };
function badge(v) { return '<span class="badge ' + (BADGE[v] || '') + '">' + esc(v) + '</span>'; }

function renderComputerBody(body) {
  const st = gameState;
  const tabs = ctrl.computerTabs(st);
  const opt = compOptions();
  const u = st.db.users.find(x => x.id === PLAYER_ID);
  body.innerHTML =
    '<div class="sys-bar"><b>設備保養紀錄管理系統（遊戲模擬）</b><span>' + (ctrl.isCR ? '觀察用畫面（未登入操作）' : '登入：' + esc(u.name) + '（' + ROLE_NAMES[u.role] + '）') + '</span><span>系統日期：' + todayStr(st) + '</span></div>' +
    (opt.banner ? '<p class="banner">' + esc(opt.banner) + '</p>' : '') +
    '<div class="tabs" role="tablist">' + tabs.map(t => '<button type="button" role="tab" id="tab-' + t.id + '" aria-selected="' + (t.id === ui.compTab) + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>').join('') + '</div>' +
    '<div id="comp-msg" aria-live="polite"></div><div class="tabpanel" id="tabpanel" role="tabpanel"></div>';
  $all('[data-tab]', body).forEach(b => b.addEventListener('click', () => {
    ui.compTab = b.dataset.tab; ui.compMsg = null; ui.warn = null; ui.rec = null;
    addCoach(emit('openTab', { tab: ui.compTab }));
    rerenderComputer('tab-' + ui.compTab);
    render();
  }));
  const msg = $('#comp-msg', body);
  if (ui.compMsg) {
    const m = ui.compMsg;
    const head = m.kind === 'coach' ? '教學提示（不是系統訊息）' : '系統訊息';
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
  if (ui.compTab === 'due') { if (ui.rec) renderRecordForm(panel, opt); else renderDue(panel); }
  else if (ui.compTab === 'history') renderHistory(panel);
  else if (ui.compTab === 'records') renderRecords(panel);
}

function optionTags(list, selected, allLabel) {
  return '<option value="">' + esc(allLabel) + '</option>' + list.map(o => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(selected) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('');
}

function renderDue(panel) {
  const st = gameState;
  const f = ui.dueFilter;
  const r = listDue(st.db, todayStr(st), f);
  const owners = st.db.users.filter(u => u.active).map(u => ({ value: u.id, label: u.name }));
  const lines = Array.from(new Set(st.db.equipment.filter(e => e.active).map(e => e.line))).sort().map(l => ({ value: l, label: l }));
  panel.innerHTML =
    '<p class="summary">逾期 <strong>' + r.summary.overdue + '</strong> 項、7 天內到期 <strong>' + r.summary.soon + '</strong> 項</p>' +
    '<div class="row"><label>負責人 <select id="f-owner">' + optionTags(owners, f.owner, '全部') + '</select></label>' +
    '<label>產線 <select id="f-line">' + optionTags(lines, f.line, '全部') + '</select></label>' +
    '<label>保養狀態 <select id="f-status">' + optionTags(['逾期', '即將到期', '未到期'].map(s => ({ value: s, label: s })), f.status, '全部') + '</select></label></div>' +
    '<table class="data"><thead><tr><th>設備編號</th><th>設備名稱</th><th>產線</th><th>保養類別</th><th>週期</th><th>上次保養日</th><th>下次應保養日</th><th>剩餘天數</th><th>保養狀態</th><th>負責人</th><th>操作</th></tr></thead><tbody>' +
    (r.rows.length === 0 ? '<tr><td colspan="11" class="empty">沒有符合條件的保養計畫</td></tr>' :
      r.rows.map(p => '<tr><td>' + esc(p.equip_no) + '</td><td>' + esc(p.equip_name) + '</td><td>' + esc(p.line) + '</td><td>' + esc(p.plan_type) + '</td><td>' + p.cycle_days + ' 天</td><td>' +
        esc(p.last_done || '') + '</td><td>' + esc(p.next_due) + '</td><td>' + esc(daysText(p.days_left)) + '</td><td>' + badge(p.due_status) + '</td><td>' + esc(p.owner_name) +
        '</td><td><button type="button" class="small" id="rec-' + p.id + '" data-plan="' + p.id + '">登錄保養</button></td></tr>').join('')) +
    '</tbody></table>';
  ['owner', 'line', 'status'].forEach(k => $('#f-' + k, panel).addEventListener('change', e => {
    f[k] = e.target.value;
    ui.compMsg = null;
    addCoach(emit('dueFilter', { filter: Object.assign({}, f) }));
    rerenderComputer('f-' + k);
    render();
  }));
  $all('[data-plan]', panel).forEach(b => b.addEventListener('click', () => {
    const planId = Number(b.dataset.plan);
    const res = emit('openRecordForm', { planId });
    ui.compMsg = null;
    if (res.block) { coachMsg(res.block); rerenderComputer(); return; }
    const plan = planState(st.db, planId, todayStr(st));
    ui.rec = { planId, date: todayStr(st), note: '', items: splitItems(plan.items).map(() => ({ result: '', remark: '' })) };
    rerenderComputer('rf-date');
  }));
}

function renderRecordForm(panel, opt) {
  const st = gameState;
  const d = ui.rec;
  const plan = planState(st.db, d.planId, todayStr(st));
  const items = splitItems(plan.items);
  const ro = !!opt.recordReadOnly;
  const blocked = blockedReason(plan);
  panel.innerHTML =
    '<h3>保養登錄</h3><dl class="detail">' +
    '<dt>設備</dt><dd>' + esc(plan.equip_no + ' ' + plan.equip_name) + '</dd>' +
    '<dt>產線／位置</dt><dd>' + esc(plan.line + '／' + plan.location) + '</dd>' +
    '<dt>保養類別</dt><dd>' + esc(plan.plan_type + '（每 ' + plan.cycle_days + ' 天）') + '</dd>' +
    '<dt>負責人</dt><dd>' + esc(plan.owner_name) + '</dd>' +
    '<dt>上次保養日</dt><dd>' + esc(plan.last_done || '尚無紀錄') + '</dd>' +
    '<dt>下次應保養日</dt><dd>' + esc(plan.next_due) + ' ' + badge(plan.due_status) + '</dd></dl>' +
    (blocked ? '<div class="msg k-err">' + esc(blocked) + '</div>' :
      '<form id="f-record" novalidate><div class="row"><label>保養日期 <input id="rf-date" type="date" value="' + esc(d.date) + '"></label>' +
      '<label class="grow">備註 <textarea id="rf-note" rows="2" maxlength="200">' + esc(d.note) + '</textarea></label></div>' +
      '<div class="row"><button type="button" class="secondary" id="rf-allnormal"' + (ro ? ' disabled' : '') + '>全部設為正常</button></div>' +
      '<table class="data"><thead><tr><th>項次</th><th>保養項目</th><th>結果</th><th>說明（異常或未執行時必填）</th></tr></thead><tbody>' +
      items.map((it, n) => '<tr><td>' + (n + 1) + '</td><td>' + esc(it) + '</td><td class="nowrap">' +
        ITEM_RESULTS.map(r => '<label class="inline"><input type="radio" name="res-' + n + '" value="' + r + '"' + (d.items[n].result === r ? ' checked' : '') + (ro ? ' disabled' : '') + '>' + r + '</label>').join(' ') +
        '</td><td><input id="rm-' + n + '" maxlength="100" value="' + esc(d.items[n].remark) + '"' + (ro ? ' disabled' : '') + '></td></tr>').join('') +
      '</tbody></table><div class="row"><button type="submit"' + (ro ? ' disabled' : '') + '>登錄</button>' + (ro ? '<span class="hint">本情境只觀察，不辦理登錄。</span>' : '') + '</div></form>') +
    '<p><button type="button" class="secondary small" id="rf-back">回待保養清單</button></p>';
  $('#rf-back', panel).addEventListener('click', () => { ui.rec = null; ui.compMsg = null; ui.warn = null; rerenderComputer(); });
  const form = $('#f-record', panel);
  if (!form) return;
  const sync = () => {
    d.date = $('#rf-date').value; d.note = $('#rf-note').value;
    items.forEach((it, n) => {
      const c = panel.querySelector('input[name="res-' + n + '"]:checked');
      d.items[n].result = c ? c.value : '';
      d.items[n].remark = $('#rm-' + n).value;
    });
  };
  $all('input, textarea', form).forEach(i => { i.addEventListener('input', sync); i.addEventListener('change', sync); });
  $('#rf-allnormal', panel).addEventListener('click', () => { d.items.forEach(i => { i.result = '正常'; }); rerenderComputer('rf-allnormal'); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (ro) return;
    sync();
    submitRecord();
  });
}

function recordInput() {
  const d = ui.rec;
  return { doneDate: d.date, note: d.note, items: d.items.map(i => ({ result: i.result, remark: i.remark })) };
}

// System checks first (same messages as the original), then coach hooks, then the write.
function submitRecord() {
  const st = gameState;
  const planId = ui.rec.planId;
  const input = recordInput();
  ui.compMsg = null; ui.warn = null;
  const v = validateRecord(st.db, planId, input, todayStr(st));
  if (!v.ok) {
    setMsg('err', ['登錄失敗，沒有新增保養紀錄'].concat(v.errors));
    addCoach(emit('recordFailed', { planId, errors: v.errors, input }));
    rerenderComputer();
    return;
  }
  const r = emit('beforeRecord', { planId, input });
  if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
  const go = () => {
    const q = emit('recordIntercept', { planId });
    if (q.intercept) { q.intercept(() => { reopenComputer(); doRecord(planId, input); }); return; }
    doRecord(planId, input);
  };
  if (r.warn && r.warn.length) { Sound.sfx('notice'); ui.warn = { lines: r.warn, goLabel: '仍要登錄', go }; rerenderComputer(); return; }
  go();
}

function doRecord(planId, input) {
  const st = gameState;
  const res = createRecord(st.db, planId, input, todayStr(st), PLAYER_ID, nowStr(st));
  if (!res.ok) {
    setMsg('err', ['登錄失敗，沒有新增保養紀錄'].concat(res.errors));
  } else {
    st.db = res.db;
    advance(st, 3);
    setMsg('ok', res.message);
    ui.rec = null;
  }
  addCoach(emit('record', { planId, result: res }));
  rerenderComputer();
  render();
}

function renderHistory(panel) {
  const st = gameState;
  const eqs = st.db.equipment.slice().sort((a, b) => a.equip_no.localeCompare(b.equip_no));
  const h = ui.histEq ? equipmentHistory(st.db, Number(ui.histEq), todayStr(st)) : null;
  panel.innerHTML =
    '<div class="row"><label>設備 <select id="hist-eq">' + optionTags(eqs.map(e => ({ value: e.id, label: e.equip_no + ' ' + e.name + (e.active ? '' : '（停用）') })), ui.histEq, '請選擇') + '</select></label></div>' +
    (h ? '<p class="selected">' + esc(h.equipment.equip_no + ' ' + h.equipment.name) + '｜' + esc(h.equipment.line + '／' + h.equipment.location) + '｜' + (h.equipment.active ? '啟用' : '停用') + '</p>' +
      '<table class="data"><caption>保養計畫</caption><thead><tr><th>保養類別</th><th>週期</th><th>負責人</th><th>起始應保養日</th><th>上次保養日</th><th>下次應保養日</th><th>保養狀態</th><th>啟用</th></tr></thead><tbody>' +
      h.plans.map(p => '<tr><td>' + esc(p.plan_type) + '</td><td>' + p.cycle_days + ' 天</td><td>' + esc(p.owner_name) + '</td><td>' + esc(p.first_due_date) + '</td><td>' + esc(p.last_done || '') +
        '</td><td>' + esc(p.next_due) + '</td><td>' + badge(p.due_status) + '</td><td>' + (p.active ? '是' : '否') + '</td></tr>').join('') + '</tbody></table>' +
      '<table class="data"><caption>保養履歷</caption><thead><tr><th>保養日期</th><th>保養類別</th><th>執行人</th><th>紀錄結果</th><th>備註</th><th></th></tr></thead><tbody>' +
      (h.records.length ? h.records.map(r => '<tr><td>' + esc(r.done_date) + '</td><td>' + esc(r.plan_type) + '</td><td>' + esc(r.done_by_name) + '</td><td>' + badge(r.result) + '</td><td>' + esc(r.note || '') +
        '</td><td><button type="button" class="small secondary" id="hd-' + r.id + '" data-hd="' + r.id + '">明細</button></td></tr>' +
        (ui.histDetail === r.id ? '<tr class="detail"><td colspan="6">' + recordItems(st.db, r.id).map(i => i.seq + '. ' + esc(i.item) + '：' + esc(i.result) + (i.remark ? '（' + esc(i.remark) + '）' : '')).join('<br>') +
          '<br>登錄時間：' + esc(r.created_at) + '</td></tr>' : '')).join('') : '<tr><td colspan="6" class="empty">尚無保養紀錄</td></tr>') +
      '</tbody></table>' : '<p class="hint">選擇一台設備，查看它的保養計畫與保養履歷。</p>');
  $('#hist-eq', panel).addEventListener('change', e => {
    ui.histEq = e.target.value; ui.histDetail = null; ui.compMsg = null;
    if (ui.histEq) addCoach(emit('viewHistory', { equipmentId: Number(ui.histEq) }));
    rerenderComputer('hist-eq');
    render();
  });
  $all('[data-hd]', panel).forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.hd);
    ui.histDetail = ui.histDetail === id ? null : id;
    rerenderComputer('hd-' + id);
  }));
}

function renderRecords(panel) {
  const st = gameState;
  const q = ui.query;
  const eqs = st.db.equipment.slice().sort((a, b) => a.equip_no.localeCompare(b.equip_no)).map(e => ({ value: e.id, label: e.equip_no + ' ' + e.name }));
  const users = st.db.users.slice().sort((a, b) => a.emp_no.localeCompare(b.emp_no)).map(u => ({ value: u.id, label: u.name }));
  const rows = ui.queryRows;
  panel.innerHTML =
    '<form id="f-query" class="row" novalidate><label>保養日期起 <input id="q-from" type="date" value="' + esc(q.from) + '"></label>' +
    '<label>保養日期迄 <input id="q-to" type="date" value="' + esc(q.to) + '"></label>' +
    '<label>設備 <select id="q-eq">' + optionTags(eqs, q.equipment, '全部') + '</select></label>' +
    '<label>執行人 <select id="q-by">' + optionTags(users, q.doneBy, '全部') + '</select></label>' +
    '<label>紀錄結果 <select id="q-res">' + optionTags(['正常', '有異常', '部分未執行'].map(s => ({ value: s, label: s })), q.result, '全部') + '</select></label>' +
    '<button type="submit">查詢</button></form>' +
    (rows === null ? '<p class="hint">設定條件後按「查詢」。</p>' :
      '<p class="selected">共 ' + rows.length + ' 筆</p><table class="data"><thead><tr><th>保養日期</th><th>設備編號</th><th>設備名稱</th><th>保養類別</th><th>執行人</th><th>紀錄結果</th><th>備註</th><th>登錄時間</th></tr></thead><tbody>' +
      (rows.length ? rows.map(r => '<tr><td>' + esc(r.done_date) + '</td><td>' + esc(r.equip_no) + '</td><td>' + esc(r.equip_name) + '</td><td>' + esc(r.plan_type) + '</td><td>' + esc(r.done_by_name) +
        '</td><td>' + badge(r.result) + '</td><td>' + esc(r.note || '') + '</td><td>' + esc(r.created_at) + '</td></tr>').join('') : '<tr><td colspan="8" class="empty">沒有符合條件的保養紀錄</td></tr>') +
      '</tbody></table>');
  $('#f-query', panel).addEventListener('submit', e => {
    e.preventDefault();
    q.from = $('#q-from').value; q.to = $('#q-to').value; q.equipment = $('#q-eq').value; q.doneBy = $('#q-by').value; q.result = $('#q-res').value;
    ui.queryRows = listRecords(st.db, q);
    ui.compMsg = null;
    addCoach(emit('queryRecords', { query: Object.assign({}, q), rows: ui.queryRows }));
    rerenderComputer('q-from');
    render();
  });
}

/* phone */
function defaultPhone(st, ext) {
  const e = PHONE_BOOK.find(x => x.ext === ext);
  if (!e) return [{ who: '電話', text: '（嘟嘟嘟——您撥的分機號碼不存在。）' }];
  if (ext === '2501') return [{ who: '鄭國榮', text: '我就在辦公室，有事直接過來說吧。' }];
  return [{ who: e.name.split(' ')[1], text: '喂？……沒事的話我先忙了。' }];
}
function openPhone() {
  ui.phoneLog = [];
  openModal('電話（系統以外的人工作業）', renderPhone);
}
function renderPhone(body) {
  body.innerHTML = '<p class="hint">牆上的分機表：' + PHONE_BOOK.map(p => esc(p.name) + ' ' + p.ext).join('、') + '。電話內容不會留在系統紀錄裡。</p>' +
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

/* maintenance tag rack */
function openRack() { openModal('吊牌架（實體吊牌）', renderRack); }
function renderRack(body) {
  const st = gameState;
  const ro = !!ctrl.rackReadOnly;
  const codes = Object.keys(st.cards).sort();
  const held = heldCards(st);
  body.innerHTML = '<p class="hint">「保養中」吊牌掛在機台上，提醒現場不要開機。吊牌在哪裡由場景追蹤，系統裡沒有這項資料。</p>' +
    '<div class="rack">' + codes.map(c => {
      const loc = st.cards[c];
      const on = loc === 'rack';
      return '<div class="slot ' + (on ? 'filled' : 'empty') + '"><b>保養中 ' + c + '</b>' +
        (on ? (ro ? '<span>在吊牌架上</span>' : '<button type="button" class="small" data-take="' + c + '">取出</button>') :
          '<span>' + (loc === 'player' ? '（在你手上）' : '（掛在 ' + esc(loc) + '）') + '</span>') + '</div>';
    }).join('') + '</div>' +
    (ro ? '' : '<h3>你手上的吊牌</h3>' + (held.length ? held.map(c => '<button type="button" class="small" data-put="' + c + '">把 ' + c + ' 放回吊牌架</button>').join(' ') : '<p class="hint">（無）</p>'));
  $all('[data-take]', body).forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.take;
    st.cards[c] = 'player';
    Sound.sfx('card');
    if (ctrl.onRack) ctrl.onRack(st, 'take', c);
    log('從吊牌架取出吊牌 ' + c + '。', 'scene');
    renderRack(body);
    render();
    const nb = $('[data-put="' + c + '"]', body);
    if (nb) nb.focus();
  }));
  $all('[data-put]', body).forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.put;
    st.cards[c] = 'rack';
    Sound.sfx('card');
    if (ctrl.onRack) ctrl.onRack(st, 'put', c);
    log('把吊牌 ' + c + ' 放回吊牌架。', 'scene');
    renderRack(body);
    render();
    const first = $('button', body);
    if (first) first.focus();
  }));
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
  '<tr><th>E</th><td>和相鄰（優先面向）的角色、機台或物件互動</td></tr>' +
  '<tr><th>Esc</th><td>關閉對話或表單；在場景中開啟暫停選單</td></tr>' +
  '<tr><th>滑鼠、Tab、Enter</th><td>操作表單、選單、對話與問題</td></tr>' +
  '<tr><th>音樂／音效</th><td>畫面右上角的兩個按鈕可以分別開關</td></tr>' +
  '<tr><th>快捷移動</th><td>右側面板的按鈕，可直接移到用過的電腦、電話或吊牌架</td></tr>' +
  '</tbody></table><p class="hint">角色頭上的「！」表示現在和他說話會有進展。所有人名、設備與日期都是虛構的。遊戲不連網、不儲存資料，重新整理就回到標題。</p>';

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
