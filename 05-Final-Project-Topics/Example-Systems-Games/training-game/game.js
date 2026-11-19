'use strict';
/*
 * Training record simulation game (teaching material).
 * Plain HTML/CSS/JS. Opens from file:// with no network and no storage.
 * Sections:
 *   1. constants and helpers
 *   2. training rules (pure functions, no DOM)
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
// # wall, . floor, D door, C HR computer, T phone, R sign-in sheet rack, B notice board,
// P employee kiosk, K desk, W whiteboard, S class seat, F exit to the plant
const MAP_ROWS = [
  '####################',
  '#C.T.R.#P..#WWWWWWW#',
  '#......#...#.......#',
  '#......D...D.......#',
  '#......#...#.SS.SS.#',
  '#.KK...#...#.......#',
  '#......#...#.SS.SS.#',
  '#B.....#...#.......#',
  '########FFF#########'
];
const MAP_W = MAP_ROWS[0].length;
const MAP_H = MAP_ROWS.length;
const BLOCKING = '#CTRBPKWSF';
const OBJECTS = { C: 'computer', T: 'phone', R: 'rack', B: 'board', P: 'kiosk' };
const OBJECT_LABELS = { computer: '人資電腦', phone: '電話分機', rack: '簽到表架', board: '公告欄', kiosk: '員工報名電腦' };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const CATEGORIES = ['法規', '客戶要求', '內部'];
const RESULTS = ['已完成', '未完成'];
const STORED_STATUSES = ['開放報名', '截止報名', '已取消'];
const HR_ID = 2; // the player: HR staff 陳怡安

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function pad2(n) { return String(n).padStart(2, '0'); }
function clockAt(y, mo, d, h, mi) { return Date.UTC(y, mo - 1, d, h, mi); }
function fmtDT(ms) {
  const t = new Date(ms);
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate()) +
    ' ' + pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes());
}
function fmtHM(ms) { const t = new Date(ms); return pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes()); }
function dayOf(ms) { return fmtDT(ms).slice(0, 10); }
function hoursText(h) { return Number.isInteger(h) ? String(h) : String(h); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#';
  return MAP_ROWS[y][x];
}
function text(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function toId(v) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }
function isDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
function isTime(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(v); }

/* ---------- 2. training rules (pure functions, no DOM) ---------- */
// Names, check order and messages follow the original lib/rules.js and routes/*.js.
// Every function returns a new db on success and never mutates the input db.

function nextId(rows) { return rows.reduce((m, r) => Math.max(m, r.id), 0) + 1; }
function fail(db, error) { return { ok: false, error, db }; }
function findById(rows, id) { return rows.find(r => r.id === id) || null; }

// Status shown on screen: 已取消 / 已結束 / 今日上課 / stored status
function displayStatus(s, day) {
  if (s.status === '已取消') return '已取消';
  if (s.session_date < day) return '已結束';
  if (s.session_date === day) return '今日上課';
  return s.status;
}

// Open for sign-up: stored 開放報名 and the class date is after today
function isEnrollable(s, day) { return s.status === '開放報名' && s.session_date > day; }

function enrolledCount(db, sid) { return db.enrollments.filter(e => e.session_id === sid).length; }

function sessionView(db, s, day) {
  const c = findById(db.courses, s.course_id) || {};
  return Object.assign({}, s, {
    course_no: c.course_no, course_name: c.name, category: c.category, hours: c.hours,
    display_status: displayStatus(s, day), enrolled: enrolledCount(db, s.id)
  });
}

function listSessions(db, day) {
  return db.sessions.map(s => sessionView(db, s, day))
    .sort((a, b) => (b.session_date + b.start_time).localeCompare(a.session_date + a.start_time));
}

function checkSessionFields(input) {
  const v = {
    session_date: text(input.session_date), start_time: text(input.start_time), end_time: text(input.end_time),
    location: text(input.location), instructor: text(input.instructor), capacity: Number(text(input.capacity))
  };
  if (!isDate(v.session_date)) return { error: '請輸入正確的上課日期' };
  if (!isTime(v.start_time) || !isTime(v.end_time)) return { error: '請輸入開始與結束時間' };
  if (v.end_time <= v.start_time) return { error: '結束時間必須晚於開始時間' };
  if (!v.location) return { error: '請輸入地點' };
  if (Array.from(v.location).length > 30) return { error: '地點不可超過 30 字' };
  if (!v.instructor) return { error: '請輸入講師' };
  if (Array.from(v.instructor).length > 30) return { error: '講師不可超過 30 字' };
  if (text(input.capacity) === '' || !Number.isInteger(v.capacity) || v.capacity < 1 || v.capacity > 100) {
    return { error: '人數上限須為 1 到 100 的整數' };
  }
  return { value: v };
}

function createSession(db, input, userId, now) {
  const course = findById(db.courses, toId(input.course_id));
  if (!course) return fail(db, '請選擇課程');
  if (!course.active) return fail(db, '課程 ' + course.course_no + ' 已停用，不能開設新梯次');
  const r = checkSessionFields(input);
  if (r.error) return fail(db, r.error);
  const next = clone(db);
  const session = Object.assign({ id: nextId(next.sessions), course_id: course.id }, r.value,
    { status: '開放報名', created_by: userId, created_at: now, updated_at: null });
  next.sessions.push(session);
  return { ok: true, db: next, session, message: '已新增梯次' };
}

function updateSession(db, sid, input, day, now) {
  const s = findById(db.sessions, sid);
  if (!s) return fail(db, '找不到這個梯次');
  if (s.status === '已取消') return fail(db, '已取消的梯次不能修改');
  if (s.session_date <= day) return fail(db, '上課日期已到，不能修改梯次資料');
  const r = checkSessionFields(input);
  if (r.error) return fail(db, r.error);
  const n = enrolledCount(db, sid);
  if (r.value.capacity < n) return fail(db, '人數上限不可少於目前報名人數（' + n + ' 人）');
  const next = clone(db);
  Object.assign(findById(next.sessions, sid), r.value, { updated_at: now });
  return { ok: true, db: next, message: '已儲存梯次資料' };
}

function setSessionStatus(db, sid, status, day, now) {
  const s = findById(db.sessions, sid);
  if (!s) return fail(db, '找不到這個梯次');
  if (!STORED_STATUSES.includes(status)) return fail(db, '梯次狀態不正確');
  if (s.status === '已取消') return fail(db, '已取消的梯次不能再變更狀態');
  if (s.session_date <= day) return fail(db, '上課日期已到，不能變更梯次狀態');
  const next = clone(db);
  Object.assign(findById(next.sessions, sid), { status, updated_at: now });
  return { ok: true, db: next, message: '梯次狀態已改為「' + status + '」' };
}

// Shared enrollment checks (original spec 7.1 steps 3-7)
function enroll(db, sid, employeeId, byId, day, now) {
  const s = findById(db.sessions, sid);
  if (!s) return fail(db, '找不到這個梯次');
  if (!isEnrollable(s, day)) return fail(db, '這個梯次目前不開放報名');
  if (db.enrollments.some(e => e.session_id === sid && e.employee_id === employeeId)) return fail(db, '已經報名過這個梯次');
  const other = db.enrollments.map(e => ({ e, s2: findById(db.sessions, e.session_id) }))
    .find(x => x.e.employee_id === employeeId && x.s2.course_id === s.course_id && x.s2.id !== sid &&
      (x.s2.status === '開放報名' || x.s2.status === '截止報名') && x.s2.session_date > day);
  if (other) return fail(db, '已報名這門課 ' + other.s2.session_date + ' 的梯次，請先取消再報名');
  if (enrolledCount(db, sid) >= s.capacity) return fail(db, '這個梯次已額滿');
  const next = clone(db);
  const enrollment = {
    id: nextId(next.enrollments), session_id: sid, employee_id: employeeId, status: '已報名',
    enrolled_at: now, enrolled_by: byId, note: null, result_by: null, result_at: null
  };
  next.enrollments.push(enrollment);
  const c = findById(db.courses, s.course_id);
  return { ok: true, db: next, enrollment, message: '報名完成：' + c.name + '（' + s.session_date + '）' };
}

// HR signs up an employee (steps 1-2 first, then the shared checks)
function hrEnroll(db, sid, employeeId, byId, day, now) {
  const emp = findById(db.employees, toId(employeeId));
  if (!emp) return fail(db, '請選擇員工');
  if (!emp.active) return fail(db, '只能替在職員工報名');
  const r = enroll(db, sid, emp.id, byId, day, now);
  if (r.ok) r.message = '已替 ' + emp.name + ' 報名';
  return r;
}

// Employee cancels own sign-up while the session is still open
function cancelOwn(db, eid, employeeId, day) {
  const e = db.enrollments.find(x => x.id === eid && x.employee_id === employeeId);
  if (!e) return fail(db, '找不到這筆報名');
  if (!isEnrollable(findById(db.sessions, e.session_id), day)) return fail(db, '已截止報名，無法取消，請洽人資');
  const next = clone(db);
  next.enrollments = next.enrollments.filter(x => x.id !== eid);
  return { ok: true, db: next, message: '已取消報名' };
}

// HR removes a sign-up before the class date; the row is deleted
function removeEnrollment(db, sid, eid, day) {
  const s = findById(db.sessions, sid);
  if (!s) return fail(db, '找不到這個梯次');
  const e = db.enrollments.find(x => x.id === eid && x.session_id === sid);
  if (!e) return fail(db, '找不到這筆報名');
  if (s.session_date <= day) return fail(db, '上課日期已到，不能移除報名');
  const next = clone(db);
  next.enrollments = next.enrollments.filter(x => x.id !== eid);
  const emp = findById(db.employees, e.employee_id);
  return { ok: true, db: next, message: '已移除 ' + emp.name + ' 的報名' };
}

// Save results for the roster. rows: [{ id, result, note }]
function saveResults(db, sid, rows, userId, day, now) {
  const s = findById(db.sessions, sid);
  if (!s) return fail(db, '找不到這個梯次');
  if (s.status === '已取消') return fail(db, '已取消的梯次不能登錄結訓結果');
  if (s.session_date > day) return fail(db, '上課日期當天起才能登錄結訓結果');
  const current = new Map(db.enrollments.filter(e => e.session_id === sid).map(e => [e.id, e]));
  const changes = [];
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const old = current.get(toId(row.id));
    if (!old) return fail(db, '結訓結果不正確');
    const result = text(row.result);
    const note = text(row.note);
    if (result === '' && old.status === '已報名') continue;
    if (!RESULTS.includes(result)) return fail(db, '結訓結果不正確');
    if (Array.from(note).length > 100) return fail(db, '備註不可超過 100 字');
    if (result !== old.status || (note || null) !== old.note) changes.push({ id: old.id, result, note: note || null });
  }
  const next = clone(db);
  changes.forEach(c => Object.assign(findById(next.enrollments, c.id), { status: c.result, note: c.note, result_by: userId, result_at: now }));
  return { ok: true, db: next, changed: changes.map(c => c.id), message: '已儲存結訓結果（' + changes.length + ' 筆）' };
}

// Session detail with roster and what the page may do (original getDetail)
function sessionDetail(db, sid, day) {
  const s = findById(db.sessions, sid);
  if (!s) return null;
  const roster = db.enrollments.filter(e => e.session_id === sid).map(e => {
    const p = findById(db.employees, e.employee_id) || {};
    const r = findById(db.employees, e.result_by);
    return Object.assign({}, e, {
      emp_no: p.emp_no, name: p.name, department: p.department, job_title: p.job_title,
      by_self: e.employee_id === e.enrolled_by, result_by_name: r ? r.name : ''
    });
  }).sort((a, b) => a.emp_no.localeCompare(b.emp_no));
  const future = s.session_date > day;
  const cancelled = s.status === '已取消';
  const creator = findById(db.employees, s.created_by);
  return {
    session: Object.assign(sessionView(db, s, day), { created_by_name: creator ? creator.name : '' }),
    roster,
    can: { edit: future && !cancelled, enroll: isEnrollable(s, day), remove: future, record: !future && !cancelled }
  };
}

// One person's records, newest class first, plus total completed hours
function employeeRecords(db, employeeId, day) {
  const rows = db.enrollments.filter(e => e.employee_id === employeeId).map(e => {
    const s = findById(db.sessions, e.session_id);
    const c = findById(db.courses, s.course_id);
    return {
      id: e.id, result: e.status, note: e.note, session_date: s.session_date, start_time: s.start_time,
      status: s.status, display_status: displayStatus(s, day), course_id: c.id, course_no: c.course_no,
      course_name: c.name, category: c.category, hours: c.hours
    };
  }).sort((a, b) => (b.session_date + b.start_time).localeCompare(a.session_date + a.start_time));
  const total = rows.filter(r => r.result === '已完成').reduce((sum, r) => sum + r.hours, 0);
  return { rows, total_hours: total };
}

// Everyone who completed a course; completed date is the class date
function courseCompleters(db, courseId) {
  return db.enrollments.filter(e => e.status === '已完成').map(e => ({ e, s: findById(db.sessions, e.session_id) }))
    .filter(x => x.s.course_id === courseId).map(x => {
      const p = findById(db.employees, x.e.employee_id);
      return { emp_no: p.emp_no, name: p.name, department: p.department, job_title: p.job_title, active: p.active, completed_on: x.s.session_date };
    }).sort((a, b) => b.completed_on.localeCompare(a.completed_on) || a.emp_no.localeCompare(b.emp_no));
}

// Find employees by number or name, including inactive ones
function findEmployees(db, q) {
  q = text(q);
  if (!q) return { rows: [], message: '' };
  const rows = db.employees.filter(e => e.emp_no.includes(q.toUpperCase()) || e.name.includes(q))
    .sort((a, b) => a.emp_no.localeCompare(b.emp_no));
  return { rows, message: rows.length ? '' : '查無符合的員工' };
}

// Account active flag: an employee with upcoming sign-ups cannot be disabled
function setEmployeeActive(db, id, active, day, selfId) {
  const t = findById(db.employees, id);
  if (!t) return fail(db, '找不到這位員工');
  if (!active) {
    if (t.id === selfId) return fail(db, '不能停用自己的帳號');
    const n = db.enrollments.filter(e => {
      const s = findById(db.sessions, e.session_id);
      return e.employee_id === id && s.session_date > day && s.status !== '已取消';
    }).length;
    if (n > 0) return fail(db, '此員工還有 ' + n + ' 筆尚未上課的報名，請先移除後再停用');
  }
  const next = clone(db);
  findById(next.employees, id).active = !!active;
  return { ok: true, db: next, message: '已儲存員工資料' };
}

// Sessions open for sign-up, earliest first (employee home page)
function openSessions(db, day) {
  return db.sessions.filter(s => s.status === '開放報名' && s.session_date > day).map(s => sessionView(db, s, day))
    .sort((a, b) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time));
}

function empName(db, id) { const e = findById(db.employees, id); return e ? e.name : '?'; }
function empById(db, id) { return findById(db.employees, id); }

/* ---------- 3. level data (fixed fictional data) ---------- */

function baseEmployees() {
  const E = (id, no, name, dept, title, hire, role, active) => ({ id, emp_no: no, name, department: dept, job_title: title, hire_date: hire, role, active: active !== false });
  return [
    E(1, 'E0001', '吳秀蘭', '管理部', '人資課長', '2012-05-02', 0),
    E(2, 'E0002', '陳怡安', '管理部', '人資專員', '2021-08-16', 0),
    E(3, 'E0101', '王志成', '製造一課', '作業員', '2019-03-11', 1),
    E(4, 'E0102', '許家豪', '製造一課', '作業員', '2023-07-03', 1),
    E(5, 'E0103', '劉美君', '製造一課', '組長', '2014-10-20', 1),
    E(6, 'E0201', '張書維', '品保課', '品管員', '2020-01-06', 1),
    E(7, 'E0202', '周雅琪', '品保課', '品管員', '2022-09-13', 1),
    E(8, 'E0301', '蔡宗翰', '倉儲課', '堆高機操作員', '2018-04-09', 1),
    E(9, 'E0302', '楊凱翔', '倉儲課', '堆高機操作員', '2024-02-19', 1),
    E(10, 'E0303', '鄭文豪', '倉儲課', '堆高機司機', '2021-11-01', 1),
    E(11, 'E0304', '徐進財', '倉儲課', '堆高機操作員', '2009-04-01', 1),
    E(12, 'E0305', '洪立偉', '倉儲課', '倉管員', '2022-03-14', 1),
    E(13, 'E0306', '簡美惠', '倉儲課', '課長', '2011-06-27', 1),
    E(14, 'E0401', '江國棟', '工安課', '課長', '2010-02-08', 1),
    E(15, 'E0150', '李明德', '製造一課', '作業員', '2017-05-15', 1, false)
  ];
}
function baseCourses() {
  const C = (id, no, name, cat, hours, desc, active) => ({ id, course_no: no, name, category: cat, hours, description: desc, active: active !== false });
  return [
    C(1, 'TR-301', '化學品危害通識', '法規', 3, '危害標示、安全資料表與防護具'),
    C(2, 'TR-302', '堆高機操作安全', '法規', 6, '堆高機操作、檢點與廠內行駛規定'),
    C(3, 'TR-303', '急救人員訓練', '法規', 8, '急救處置與 CPR 實作'),
    C(4, 'TR-304', '消防安全訓練', '法規', 3, '滅火器與消防栓操作、疏散演練'),
    C(5, 'TR-310', 'ISO 9001 品質系統概論', '客戶要求', 4, '品質系統條文與文件管制'),
    C(6, 'TR-320', '5S 現場管理', '內部', 2, '整理、整頓、清掃、清潔、素養'),
    C(7, 'TR-399', '舊版作業標準說明', '內部', 1, '已由新版作業標準取代', false)
  ];
}
function mkSession(id, courseId, date, start, end, cap, status, instructor, createdAt) {
  return {
    id, course_id: courseId, session_date: date, start_time: start, end_time: end, location: '2F 訓練教室',
    instructor: instructor || '吳秀蘭', capacity: cap, status, created_by: HR_ID, created_at: createdAt || date + ' 09:00', updated_at: null
  };
}
function mkEnroll(id, sid, empId, byId, at, status, resultAt, note) {
  return {
    id, session_id: sid, employee_id: empId, status: status || '已報名', enrolled_at: at, enrolled_by: byId,
    note: note || null, result_by: resultAt ? HR_ID : null, result_at: resultAt || null
  };
}

function level1Data() {
  return {
    employees: baseEmployees(),
    courses: baseCourses(),
    sessions: [
      mkSession(1, 1, '2026-11-12', '13:30', '16:30', 10, '截止報名', '何文傑', '2026-10-20 10:00'),
      mkSession(2, 6, '2027-02-24', '09:00', '11:00', 20, '截止報名', '吳秀蘭', '2027-02-03 09:30'),
      mkSession(3, 5, '2027-04-14', '09:00', '13:00', 6, '開放報名', '林冠廷', '2027-02-26 14:00')
    ],
    enrollments: [
      mkEnroll(1, 1, 3, 3, '2026-10-22 08:10', '已完成', '2026-11-12 16:50'),
      mkEnroll(2, 2, 6, 6, '2027-02-05 12:30', '已完成', '2027-02-24 11:20'),
      mkEnroll(3, 2, 3, HR_ID, '2027-02-06 09:15', '已完成', '2027-02-24 11:20'),
      mkEnroll(4, 3, 7, 7, '2027-02-27 08:40')
    ]
  };
}

function level2Data() {
  return {
    employees: baseEmployees(),
    courses: baseCourses(),
    sessions: [
      mkSession(1, 1, '2026-11-12', '13:30', '16:30', 10, '截止報名', '何文傑', '2026-10-20 10:00'),
      mkSession(2, 5, '2027-04-14', '09:00', '13:00', 6, '截止報名', '林冠廷', '2027-02-26 14:00'),
      mkSession(3, 6, '2027-02-24', '09:00', '11:00', 20, '截止報名', '吳秀蘭', '2027-02-03 09:30'),
      mkSession(4, 1, '2027-03-10', '13:30', '16:30', 3, '截止報名', '何文傑', '2027-03-01 09:20'),
      mkSession(5, 5, '2027-05-12', '09:00', '13:00', 6, '開放報名', '林冠廷', '2027-04-06 10:00')
    ],
    enrollments: [
      mkEnroll(1, 1, 3, 3, '2026-10-22 08:10', '已完成', '2026-11-12 16:50'),
      mkEnroll(2, 3, 6, 6, '2027-02-05 12:30', '已完成', '2027-02-24 11:20'),
      mkEnroll(3, 3, 9, 9, '2027-02-06 07:55', '已完成', '2027-02-24 11:20'),
      mkEnroll(4, 4, 6, 6, '2027-03-01 09:40', '已完成', '2027-03-10 16:52'),
      mkEnroll(5, 4, 4, HR_ID, '2027-03-01 10:05', '已完成', '2027-03-10 16:52'),
      mkEnroll(6, 2, 7, HR_ID, '2027-02-27 08:40'),
      mkEnroll(7, 2, 3, 3, '2027-03-02 12:10'),
      mkEnroll(8, 2, 6, 6, '2027-03-03 08:05'),
      mkEnroll(9, 2, 9, 9, '2027-03-08 17:20')
    ]
  };
}

/* ---------- 4. game state and clock ---------- */

let gameState = null;
let RUN_SEQ = 0;

function newState(mode) {
  return {
    mode, runId: ++RUN_SEQ, db: null, clock: 0,
    player: { x: 3, y: 3, dir: 'right' },
    npcs: {}, sheets: {}, flags: {}, trail: [], predictions: {}, cr: null,
    visited: { computer: false, phone: false, rack: false, kiosk: false, classroom: false },
    done: false
  };
}
function advance(st, minutes) { st.clock += minutes * 60000; }
function nowStr(st) { return fmtDT(st.clock); }
function today(st) { return dayOf(st.clock); }
// kind: 'manual' (people outside the system) or 'system' (system function)
function addTrail(st, text, kind) { st.trail.push({ t: fmtDT(st.clock), text, kind: kind || 'manual' }); }
function npcDef(id, name, color, x, y, visible) {
  return { id, name, color, x, y, visible: visible !== false };
}

/* ---------- 5. level controllers (midterm) ---------- */

const STD_TABS = [
  { id: 'sessions', label: '梯次管理' },
  { id: 'detail', label: '梯次明細' },
  { id: 'records', label: '訓練紀錄查詢' },
  { id: 'employees', label: '員工' },
  { id: 'courses', label: '課程' }
];

const MIDTERM_PROMPTS = [
  { h: '觀察', q: '人資實際做哪些事情（收簽到表、接電話、決定能不能讓人取消）？系統負責哪些功能、存取與檢核？下面的操作紀錄已分成「人工工作」與「系統功能」兩欄，請檢查分得對不對。' },
  { h: '推論', q: '開設梯次、報名、取消、移除、截止、結訓登錄各影響哪些狀態與紀錄？哪些狀態是存起來的，哪些是算出來的？' },
  { h: '實際系統待查證', q: '如何在真實教育訓練系統及 SQLite 驗證上述推論？可能對應哪些使用案例、活動圖判斷點與資料表關聯？' }
];

function trailHtml(st) {
  const col = (kind, title) => '<section><h3>' + title + '</h3><ol class="trail">' +
    st.trail.filter(t => t.kind === kind).map(t => '<li>' + esc(t.t.slice(5)) + '　' + esc(t.text) + '</li>').join('') + '</ol></section>';
  return '<div class="two-col">' + col('manual', '人工工作（系統以外）') + col('system', '系統功能') + '</div>';
}

function rosterTableHtml(db, sid, caption) {
  const d = sessionDetail(db, sid, '0000-00-00');
  return '<table class="data"><caption>' + esc(caption) + '</caption><thead><tr><th>報名#</th><th>員工</th><th>報名方式</th><th>結訓結果</th><th>備註</th><th>結果登錄人</th><th>登錄時間</th></tr></thead><tbody>' +
    (d.roster.length ? d.roster.map(r => '<tr><td>' + r.id + '</td><td>' + esc(r.emp_no + ' ' + r.name) + '</td><td>' + (r.by_self ? '自行報名' : '人資代報') +
      '</td><td>' + esc(r.status) + '</td><td>' + esc(r.note || '') + '</td><td>' + esc(r.result_by_name) + '</td><td>' + esc(r.result_at || '') + '</td></tr>').join('')
      : '<tr><td colspan="7">（沒有報名紀錄）</td></tr>') + '</tbody></table>';
}

function hoursTableHtml(db, empIds, day) {
  return '<table class="data"><caption>模擬資料：累計完成時數（已完成紀錄的課程時數加總，畫面算出來的，不是存起來的）</caption><thead><tr><th>員工</th><th>已完成的課程</th><th>累計完成時數</th></tr></thead><tbody>' +
    empIds.map(id => {
      const r = employeeRecords(db, id, day);
      const done = r.rows.filter(x => x.result === '已完成').map(x => x.course_no + '（' + hoursText(x.hours) + ' 小時）').join('＋') || '（無）';
      return '<tr><td>' + esc(empName(db, id)) + '</td><td>' + esc(done) + '</td><td>' + hoursText(r.total_hours) + ' 小時</td></tr>';
    }).join('') + '</tbody></table>';
}

function midtermSettlementHtml(st, topHtml, dataHtml) {
  return '<div class="settle">' + (topHtml || '') +
    '<div class="prompts">' + MIDTERM_PROMPTS.map((p, i) => '<section><h3>' + (i + 1) + '. ' + p.h + '</h3><p>' + p.q + '</p>' +
      (i === 0 ? trailHtml(st) : '') + (i === 1 ? dataHtml || '' : '') + '</section>').join('') + '</div>' +
    '<p class="boundary">遊戲畫面與上面的資料是模擬教材的觀察，不是原系統資料庫的證據。正式分析請以實際系統為準。</p></div>';
}

function sheetLine(sheet) {
  return { kind: 'sheet', title: sheet.title, rows: sheet.rows };
}

function npcToOffice(id, spot, done) {
  showNpc(id, 9, 8);
  walkNpc(id, [[9, 3], [spot[0] + 1, 3], [spot[0], spot[1]]], done);
}
function npcLeave(id) {
  const n = gameState.npcs[id];
  if (!n || !n.visible) return;
  const pts = n.x <= 7 ? [[n.x, 3], [9, 3], [9, 8]] : [[9, n.y], [9, 8]];
  walkNpc(id, pts, () => hideNpc(id));
}

// Compare result drafts with what the sign-in sheet says
function resultMismatch(db, rows, expect) {
  const w = [];
  rows.forEach(r => {
    const e = findById(db.enrollments, r.id);
    if (!e || !(e.employee_id in expect)) return;
    const want = expect[e.employee_id];
    const got = r.result || (e.status === '已報名' ? '（未選）' : e.status);
    if (got !== want) w.push(empName(db, e.employee_id) + '：你選的是「' + got + '」，依簽到表應是「' + want + '」');
  });
  return w;
}

/* Level 1: normal flow */
function makeLevel1() {
  const MEMO = { course_id: 1, session_date: '2027-03-10', start_time: '13:30', end_time: '16:30', location: '2F 訓練教室', instructor: '何文傑', capacity: '3' };
  const MEMO_TEXT = 'TR-301 化學品危害通識（3 小時）｜2027-03-10（三）13:30–16:30｜2F 訓練教室｜講師 何文傑｜名額 3 人';
  const SHEET = 'S-0310';
  const EXPECT = { 6: '已完成', 4: '已完成' };
  const sess = st => st.flags.sid ? findById(st.db.sessions, st.flags.sid) : null;

  function memoMismatch(input) {
    const w = [];
    const label = { course_id: '課程', session_date: '上課日期', start_time: '開始時間', end_time: '結束時間', location: '地點', instructor: '講師', capacity: '人數上限' };
    Object.keys(MEMO).forEach(k => {
      if (text(input[k]) !== String(MEMO[k])) w.push(label[k] + '和開課通知不同（通知：' + (k === 'course_id' ? 'TR-301 化學品危害通識' : MEMO[k]) + '）');
    });
    return w;
  }

  function selfEnroll(st) {
    showNpc('zs', 9, 8);
    walkNpc('zs', [[9, 2], [8, 2]], () => {
      if (gameState !== st) return;
      const r = enroll(st.db, st.flags.sid, 6, 6, today(st), nowStr(st));
      if (r.ok) {
        st.db = r.db;
        st.flags.selfDone = true;
        addTrail(st, '張書維在員工報名電腦自行報名：系統新增一筆「已報名」，報名操作人是他本人', 'system');
      }
      log('品保課張書維在員工報名電腦完成報名。到「梯次明細」看看名單。', 'scene');
      if (ui.compOpen) rerenderComputer();
      render();
      setTimeout(() => { if (gameState === st) walkNpc('zs', [[9, 2], [9, 8]], () => hideNpc('zs')); }, 900);
    });
  }

  function predictQuestions() {
    return [
      {
        id: 'count', q: '① 替許家豪報名後，這一梯「已報名」會是幾人？', options: ['1 人', '2 人', '3 人'], answer: '2 人',
        explain: '已報名人數不是存起來的數字，是把這一梯的報名紀錄筆數算出來：張書維自行報名 1 筆，加上許家豪 1 筆。'
      },
      {
        id: 'left', q: '② 報名後這一梯還剩幾個名額？', options: ['0 個', '1 個', '2 個', '3 個'], answer: '1 個',
        explain: '名額依報名筆數計算：人數上限 3 減去 2 筆報名，還剩 1 個。報名筆數達到上限時，系統會回「這個梯次已額滿」。'
      }
    ];
  }
  function dayQuestions() {
    return [
      {
        id: 'disp', q: '① 今天（上課當天）打開「梯次明細」，梯次狀態會顯示？', options: ['開放報名', '截止報名', '今日上課', '已結束'], answer: '今日上課',
        explain: '畫面上的狀態是拿上課日期和今天比較算出來的：上課日期等於今天顯示「今日上課」，早於今天顯示「已結束」。'
      },
      {
        id: 'stored', q: '② 這時資料庫 sessions.status 存的是？', options: ['截止報名', '今日上課', '已結束'], answer: '截止報名',
        explain: 'sessions.status 只存開放報名、截止報名、已取消三種。「今日上課」「已結束」不會寫回資料庫。'
      },
      {
        id: 'enroll', q: '③ 今天還能報名這一梯嗎？', options: ['可以', '不行'], answer: '不行',
        explain: '「可報名」要同時符合儲存狀態是開放報名、而且上課日期晚於今天，所以上課當天已經不能報名。'
      }
    ];
  }

  function jumpToEve(st) {
    st.clock = clockAt(2027, 3, 9, 8, 30);
    st.flags.eve = true;
    render();
    showTalk([
      { who: '旁白', text: '時間來到 3 月 9 日（二）上午 8:30，明天就要上課。' },
      { who: '吳秀蘭', text: '明天的化學品課，今天就截止報名吧，講師要先印講義。' }
    ]);
  }
  function jumpToClassDay(st) {
    st.clock = clockAt(2027, 3, 10, 13, 0);
    render();
    showTalk([{ who: '旁白', text: '3 月 10 日（三）中午 1:00，今天下午上課。打開電腦之前，先預測畫面會怎麼顯示。' }], [{
      label: '開始預測',
      run: () => openQuiz('上課當天：先預測', '選完會看到說明，可以改選，不計分。', dayQuestions(), st.predictions, '看結果', () => {
        st.flags.predDay = true;
        st.clock = clockAt(2027, 3, 10, 16, 40);
        showNpc('teacher', 15, 2);
        addTrail(st, '講師在教室點名、收紙本簽到表（系統沒有簽到功能）', 'manual');
        render();
        showTalk([{ who: '旁白', text: '下午 4:40，課程結束。講師何文傑在 2F 訓練教室，手上有紙本簽到表。' }]);
      })
    }], { closeLabel: '稍後' });
  }

  function finish(st) {
    if (st.done) return;
    st.done = true;
    whenIdle(() => {
      const s = sess(st);
      const top = '<p class="ok">通關：梯次 TR-301（' + s.session_date + '）完成開課、報名、截止與結訓登錄，簽到表也歸檔了。</p>' +
        '<p>課程（courses）一門課可以開很多梯次（sessions）；每位員工報名一個梯次就是一筆報名紀錄（enrollments）。下面是本關的模擬資料。</p>';
      const data = '<table class="data"><caption>模擬資料：TR-301 的梯次（sessions）</caption><thead><tr><th>梯次#</th><th>上課日期</th><th>儲存狀態 status</th><th>今天畫面顯示</th><th>人數上限</th><th>報名筆數</th></tr></thead><tbody>' +
        st.db.sessions.filter(x => x.course_id === 1).map(x => '<tr><td>' + x.id + '</td><td>' + x.session_date + '</td><td>' + esc(x.status) + '</td><td>' + esc(displayStatus(x, today(st))) + '</td><td>' + x.capacity + '</td><td>' + enrolledCount(st.db, x.id) + '</td></tr>').join('') +
        '</tbody></table>' + rosterTableHtml(st.db, s.id, '模擬資料：本梯次的報名紀錄（enrollments）') + hoursTableHtml(st.db, [6, 4], today(st));
      openSettlement('第一關結算：觀察—推論—實際系統待查證', midtermSettlementHtml(st, top, data), [
        { label: '下一關：請假、補考與截止之後', run: () => startMode('level2') },
        { label: '重新開始本關', run: () => startMode('level1') },
        { label: '回到標題', run: showTitle }
      ]);
    });
  }

  return {
    id: 'level1', title: '第一關　開課與報名', role: '人資專員 陳怡安',
    setup(st) {
      st.db = level1Data();
      st.clock = clockAt(2027, 3, 1, 9, 0);
      st.player = { x: 2, y: 3, dir: 'right' };
      st.flags = { memo: false, sid: null, selfDone: false, seenSelf: false, ringing: false, called: false, predicted: false, proxy: false, eve: false, closed: false, predDay: false, gotSheet: false, recorded: false };
      st.npcs = {
        boss: npcDef('boss', '人資課長 吳秀蘭', '#9333ea', 5, 6),
        zs: npcDef('zs', '張書維', '#0891b2', 9, 8, false),
        teacher: npcDef('teacher', '講師 何文傑', '#b45309', 15, 2, false)
      };
      st.sheets = {
        'S-1112': { title: '2026-11-12 TR-301 化學品危害通識', where: 'rack', rows: [] },
        'S-0224': { title: '2027-02-24 TR-320 5S 現場管理', where: 'rack', rows: [] },
        [SHEET]: {
          title: '2027-03-10 TR-301 化學品危害通識', where: 'instructor',
          rows: [{ name: '張書維（E0201）', sign: '已簽到', test: '測驗通過' }, { name: '許家豪（E0102）', sign: '已簽到', test: '測驗通過' }]
        }
      };
    },
    onStart() {
      showTalk([
        { who: '旁白', text: '2027 年 3 月 1 日（一）上午 9:00。你是管理部人資專員陳怡安，負責教育訓練。' },
        { who: '旁白', text: '方向鍵或 WASD 移動；面向人、電腦、電話、簽到表架或公告欄按 E 互動。對話與表單可用滑鼠或 Tab、Enter 操作。' },
        { who: '旁白', text: '人資課長吳秀蘭在辦公室裡，先去和她談。' }
      ], [], { closeLabel: '開始' });
    },
    objective(st) {
      const f = st.flags;
      return {
        title: '開一梯化學品課，從報名做到結訓',
        items: [
          { text: '和人資課長吳秀蘭談，拿到開課通知', done: f.memo },
          { text: '在人資電腦「梯次管理」依開課通知新增梯次', done: !!f.sid },
          { text: '等員工自己報名後，到「梯次明細」查看名單', done: f.seenSelf },
          { text: '接聽分機（組長來電）', done: f.called },
          { text: '在梯次明細用「代為報名」替許家豪報名（先預測）', done: f.proxy },
          { text: '上課前一天：在梯次明細按「截止報名」', done: f.closed },
          { text: '上課當天：預測畫面上的梯次狀態', done: f.predDay },
          { text: '到 2F 訓練教室向講師取回紙本簽到表', done: f.gotSheet },
          { text: '依簽到表在梯次明細登錄結訓結果並儲存', done: f.recorded },
          { text: '把簽到表放回簽到表架歸檔', done: f.recorded && st.sheets[SHEET].where === 'rack' }
        ]
      };
    },
    sessionFormHint(st) { return st.flags.memo && !st.flags.sid ? '開課通知（課長交付的紙本）：' + MEMO_TEXT : ''; },
    hudStats(st) {
      const s = sess(st);
      return '<h3>本關梯次</h3><p>' + (s ? 'TR-301　' + s.session_date + '　已報名 ' + enrolledCount(st.db, s.id) + '／上限 ' + s.capacity + '　畫面狀態：' + displayStatus(s, today(st)) : '（尚未開設）') + '</p>' +
        '<h3>手上的簽到表</h3><p>' + (heldSheets(st).join('、') || '（無）') + '</p>';
    },
    npcAttention(st, id) {
      const f = st.flags;
      if (id === 'boss') return !f.memo;
      if (id === 'teacher') return f.predDay && !f.gotSheet;
      return false;
    },
    onTalk(st, id) {
      const f = st.flags;
      if (id === 'boss') {
        if (!f.memo) {
          return showTalk([
            { who: '吳秀蘭', text: '化學品危害通識每年都要上，下一梯請你開出來。細節我寫在通知上了。' },
            { kind: 'memo', text: '開課通知：' + MEMO_TEXT },
            { who: '吳秀蘭', text: '開好之後員工可以自己在走廊那台員工報名電腦報名；不習慣用電腦的，組長會打電話來請你代報。' }
          ], [{ label: '收下開課通知', run: () => { f.memo = true; advance(st, 2); addTrail(st, '課長交付開課通知（紙本）', 'manual'); } }]);
        }
        if (f.eve && !f.closed) return showTalk([{ who: '吳秀蘭', text: '今天記得把明天那梯截止報名。' }]);
        return showTalk([{ who: '吳秀蘭', text: '辛苦了，有問題再跟我說。' }, { kind: 'memo', text: '開課通知：' + MEMO_TEXT }]);
      }
      if (id === 'teacher') {
        const sh = st.sheets[SHEET];
        if (!f.gotSheet) {
          return showTalk([
            { who: '何文傑', text: '今天兩位學員都有到，測驗也都過了。這是簽到表，請你登錄。' },
            sheetLine(sh)
          ], [{
            label: '收下簽到表', run: () => {
              sh.where = 'player'; f.gotSheet = true; Sound.sfx('card'); advance(st, 1);
              addTrail(st, '向講師取回紙本簽到表', 'manual');
              log('拿到簽到表 ' + SHEET + '。回人資電腦登錄結訓結果。', 'scene');
            }
          }]);
        }
        return showTalk([{ who: '何文傑', text: '簽到表已經交給你了，辛苦了。' }]);
      }
      showTalk([{ who: (st.npcs[id] || {}).name || '', text: '……' }]);
    },
    phoneCall(st) {
      const f = st.flags;
      if (!f.ringing) return null;
      return {
        lines: [
          { who: '劉美君', text: '人資你好，我是製造一課組長劉美君。我們組的許家豪，員工編號 E0102，要上 3/10 那堂化學品的課。' },
          { who: '劉美君', text: '他不太會用電腦，麻煩你直接幫他報名，謝謝。' }
        ],
        choices: [{
          label: '記下：替許家豪（E0102）報名 3/10 梯次', run: () => {
            f.ringing = false; f.called = true; advance(st, 2);
            addTrail(st, '接聽組長劉美君來電，請人資替許家豪報名（電話不會留在系統裡）', 'manual');
          }
        }]
      };
    },
    board() {
      return '<p class="memo">公告：化學品危害通識每年應受訓一次，請各課提醒同仁報名。報名請用走廊的員工報名電腦。</p>';
    },
    computerTabs() { return STD_TABS; },
    onSystem(st, evt) {
      const f = st.flags;
      switch (evt.type) {
        case 'beforeCreateSession': {
          if (f.sid) return { block: '本關只需要開這一個梯次。' };
          if (!f.memo) return { block: '先和人資課長吳秀蘭談，拿到開課通知再開梯次。' };
          const w = memoMismatch(evt.input);
          return w.length ? { block: '和開課通知不一致，請修改後再送出：' + w.join('；') } : {};
        }
        case 'createSession':
          if (!evt.result.ok) { addTrail(st, '新增梯次失敗：' + evt.result.error, 'system'); return {}; }
          f.sid = evt.result.session.id;
          addTrail(st, '新增梯次 #' + f.sid + '（TR-301，' + evt.result.session.session_date + '），儲存狀態「開放報名」', 'system');
          setTimeout(() => { if (gameState === st) selfEnroll(st); }, 500);
          return { coach: '梯次已新增，儲存狀態是「開放報名」。員工可以自己到走廊的員工報名電腦報名，等一下看看名單。' };
        case 'viewDetail':
          if (evt.sid === f.sid && f.selfDone && !f.seenSelf) {
            f.seenSelf = true;
            addTrail(st, '在梯次明細看到張書維的報名（報名方式：自行報名）', 'system');
            setTimeout(() => {
              if (gameState !== st) return;
              f.ringing = true; Sound.sfx('ring');
              log('分機響起：製造一課組長來電。到電話分機接聽。', 'scene');
              render();
            }, 600);
            return { coach: '名單多了一筆，報名方式是「自行報名」。系統是看「報名操作人是不是本人」來分辨自行報名和人資代報。' };
          }
          return {};
        case 'beforeEnroll':
          if (evt.sid !== f.sid) return { block: '本關只處理 TR-301 這一梯的報名。' };
          if (!f.called) return { block: '還不知道要替誰報名。先接聽電話。' };
          if (evt.empId !== 4) return { warn: ['你選的是' + empName(st.db, evt.empId) + '，組長說要替許家豪（E0102）報名'] };
          if (!f.predicted) {
            return {
              intercept: proceed => openQuiz('代為報名前先預測', '按下報名之前，先預測兩件事。選完會看到說明，可以改選，不計分。',
                predictQuestions(), st.predictions, '繼續報名', () => { f.predicted = true; proceed(); })
            };
          }
          return {};
        case 'enroll':
          if (!evt.result.ok) { addTrail(st, '代為報名失敗：' + evt.result.error, 'system'); return {}; }
          if (evt.empId === 4 && !f.proxy) {
            f.proxy = true;
            addTrail(st, '代為報名許家豪：系統新增一筆報名，報名操作人是人資（人資代報）', 'system');
            whenIdle(() => jumpToEve(st));
            return { coach: '報名完成，名單上許家豪的報名方式是「人資代報」。關閉電腦後，時間會往後推進。' };
          }
          return {};
        case 'beforeSetStatus':
          if (evt.sid !== f.sid) return { block: '本關只處理 TR-301 這一梯。' };
          if (!f.eve) return { block: '還不到截止的時候：課長交代上課前一天才截止報名。' };
          return {};
        case 'setStatus':
          if (evt.result.ok && evt.status === '截止報名' && !f.closed) {
            f.closed = true;
            addTrail(st, '把梯次儲存狀態改為「截止報名」', 'system');
            whenIdle(() => jumpToClassDay(st));
            return { coach: '儲存狀態改成「截止報名」了。關閉電腦後，時間會推進到上課當天。' };
          }
          return {};
        case 'beforeRemove':
          return { block: '本關不需要移除任何報名。' };
        case 'beforeSaveResults': {
          if (!f.gotSheet) return { block: '先到 2F 訓練教室向講師取回紙本簽到表，再依簽到表登錄。' };
          const w = resultMismatch(st.db, evt.rows, EXPECT);
          return w.length ? { warn: w } : {};
        }
        case 'saveResults':
          if (evt.result.ok && !f.recorded) {
            f.recorded = true;
            addTrail(st, '儲存結訓結果：' + evt.result.message + '，登錄人陳怡安，登錄時間 ' + nowStr(st), 'system');
            return { coach: '系統把結果登錄人記成你、登錄時間記成按下儲存的這一刻（' + nowStr(st) + '）。最後把簽到表放回簽到表架歸檔。' };
          }
          return {};
      }
      return {};
    },
    onRack(st, action, code) { addTrail(st, (action === 'take' ? '從簽到表架取出 ' : '把簽到表 ') + code + (action === 'take' ? '' : ' 放回簽到表架歸檔'), 'manual'); },
    afterAction(st) {
      if (!st.done && st.flags.recorded && st.sheets[SHEET].where === 'rack') finish(st);
    }
  };
}

/* Level 2: leave, re-test and after the deadline */
function makeLevel2() {
  const S1 = 2, S2 = 5, SHEET = 'S-0414';
  const E_WANG = 7, E_ZHOU = 6, E_YANG = 9;

  function expectClassDay(st) {
    const e = { 6: '已完成', 7: '未完成', 9: '未完成' };
    if (st.flags.decision !== 'remove') e[3] = '已完成';
    return e;
  }
  function predictQuestions() {
    return [
      {
        id: 'hours', q: '① 存檔後，楊凱翔的累計完成時數會？', options: ['不會增加', '增加 4 小時（TR-310 的時數）', '增加 8 小時'], answer: '增加 4 小時（TR-310 的時數）',
        explain: '累計完成時數是「已完成」紀錄的課程時數加總。改成已完成，就加上 TR-310 的 4 小時；系統不分補考通過或當天通過。'
      },
      {
        id: 'date', q: '② 「訓練紀錄查詢」依課程查 TR-310 時，楊凱翔的完成日期會是？',
        options: ['2027-04-14（梯次的上課日期）', '2027-04-27（補考日期）', '2027-04-28（今天登錄的日期）'], answer: '2027-04-14（梯次的上課日期）',
        explain: '依課程查詢的完成日期取的是梯次的上課日期。系統沒有補考日期欄位，4/27 只會留在備註文字裡。'
      },
      {
        id: 'by', q: '③ 存檔後，這一筆的「結果登錄人」與「登錄時間」會是？',
        options: ['保留 4/14 第一次登錄的人與時間', '改成你和現在的模擬時刻，前一次的被覆蓋', '兩次登錄都保留'], answer: '改成你和現在的模擬時刻，前一次的被覆蓋',
        explain: '有變動的那一筆，會寫入這次儲存的登錄人與執行當下的時刻；前一次的登錄人與時間不會另外保留。'
      }
    ];
  }

  function wangAtKiosk(st) {
    showNpc('wang', 9, 8);
    walkNpc('wang', [[9, 2], [8, 2]], () => {
      if (gameState !== st) return;
      const r = cancelOwn(st.db, E_WANG, 3, today(st));
      st.flags.wangMsg = r.error || r.message;
      addTrail(st, '王志成在員工報名電腦按「取消報名」，系統回「' + st.flags.wangMsg + '」', 'system');
      log('王志成在員工報名電腦前停了下來，好像遇到問題。', 'scene');
      render();
    });
  }
  function jumpTo13(st) {
    st.flags.day13 = true;
    st.clock = clockAt(2027, 4, 13, 16, 0);
    render();
    showTalk([
      { who: '旁白', text: '4 月 13 日（二）下午 4:00，明天上午就要上 ISO 9001 的課。' },
      { who: '吳秀蘭', text: '明天大家應該都會到，結訓結果你今天先登錄好，明天就不用再弄了。' }
    ]);
  }
  function jumpTo14(st) {
    st.flags.day14 = true;
    st.clock = clockAt(2027, 4, 14, 13, 20);
    showNpc('teacher', 15, 2);
    addTrail(st, '講師在教室點名、收紙本簽到表；有人請假、有人測驗未過（系統外）', 'manual');
    render();
    showTalk([{ who: '旁白', text: '4 月 14 日（三）下午 1:20，上午的課已經結束。講師林冠廷在 2F 訓練教室，手上有簽到表。' }]);
  }
  function jumpTo28(st) {
    st.flags.day28 = true;
    st.clock = clockAt(2027, 4, 28, 10, 0);
    hideNpc('teacher');
    render();
    npcToOffice('yang', [4, 3]);
    showTalk([{ who: '旁白', text: '4 月 28 日（三）上午 10:00，兩週過去了。倉儲課楊凱翔拿著補考成績單來找你。' }]);
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
    const db = st.db;
    const row = (name, actual, eid) => {
      const e = eid ? db.enrollments.find(x => x.id === eid) : null;
      const rb = e && e.result_by ? empName(db, e.result_by) : '';
      return '<tr><th>' + esc(name) + '</th><td>' + esc(actual) + '</td><td>' + (e ? esc(e.status) : '<em>（報名紀錄已刪除，名單上找不到）</em>') +
        '</td><td>' + esc(e ? e.note || '' : '') + '</td><td>' + esc(rb) + '</td><td>' + esc(e ? e.result_at || '' : '') + '</td></tr>';
    };
    const wangRemoved = !db.enrollments.some(x => x.id === E_WANG);
    const qs = predictQuestions();
    const yang = db.enrollments.find(x => x.id === E_YANG);
    const sysAns = { hours: '累計 ' + hoursText(employeeRecords(db, 9, today(st)).total_hours) + ' 小時', date: (courseCompleters(db, 5).find(r => r.emp_no === 'E0302') || {}).completed_on || '', by: empName(db, yang.result_by) + '，' + yang.result_at };
    const top =
      '<table class="data compare"><caption>4/14 ISO 9001 梯次：「實際發生」與「系統記錄」（模擬資料）</caption><thead><tr><th>學員</th><th>實際發生</th><th>結訓結果</th><th>備註</th><th>結果登錄人</th><th>登錄時間</th></tr></thead><tbody>' +
      row('王志成', wangRemoved ? '臨時支援夜班，沒有上課（口述）' : '照常上課、測驗通過', wangRemoved ? null : E_WANG) +
      row('張書維', '上課、測驗通過', 8) +
      row('周雅琪', '請假，沒有上課（簽到表）', E_ZHOU) +
      row('楊凱翔', '4/14 測驗未過；4/27 補考通過（成績單）', E_YANG) +
      '</tbody></table>' +
      '<p>系統的結訓結果只有「已完成／未完成」；請假、補考只能寫在備註文字裡；結果登錄人與登錄時間只留最後一次。' +
      (wangRemoved ? '王志成的報名被移除後，紀錄直接刪除，名單上看不出他曾經報過名。' : '你選擇請王志成照常上課，所以沒有移除任何報名。') + '</p>' +
      '<h3>你的預測與系統結果</h3><ol class="pred">' + qs.map(q => '<li>' + esc(q.q) + '<br>你的預測：' + esc(st.predictions[q.id] || '（未作答）') + '　系統結果：' + esc(sysAns[q.id]) + '</li>').join('') + '</ol>';
    const data = rosterTableHtml(db, S1, '模擬資料：4/14 梯次目前的報名紀錄（enrollments）') +
      '<table class="data"><caption>模擬資料：依課程查詢 TR-310 的結果（只列已完成者，完成日期是上課日期）</caption><thead><tr><th>員工</th><th>職稱</th><th>完成日期</th></tr></thead><tbody>' +
      courseCompleters(db, 5).map(r => '<tr><td>' + esc(r.emp_no + ' ' + r.name) + '</td><td>' + esc(r.job_title) + '</td><td>' + r.completed_on + '</td></tr>').join('') + '</tbody></table>';
    return midtermSettlementHtml(st, top, data);
  }

  return {
    id: 'level2', title: '第二關　請假、補考與截止之後', role: '人資專員 陳怡安',
    setup(st) {
      st.db = level2Data();
      st.clock = clockAt(2027, 4, 12, 9, 0);
      st.player = { x: 2, y: 3, dir: 'right' };
      st.flags = {
        wangMsg: '', talkedWang: false, decision: '', removed: false, talkedZhang: false, rejectedOther: false,
        day13: false, early: false, day14: false, gotSheet: false, recorded: false, askedRemove: false, checkedRemove: false,
        day28: false, makeupTalk: false, predicted: false, makeupSaved: false
      };
      st.npcs = {
        boss: npcDef('boss', '人資課長 吳秀蘭', '#9333ea', 5, 6),
        wang: npcDef('wang', '王志成', '#65a30d', 9, 8, false),
        zhang: npcDef('zhang', '張書維', '#0891b2', 9, 8, false),
        zhou: npcDef('zhou', '周雅琪', '#db2777', 9, 8, false),
        yang: npcDef('yang', '楊凱翔', '#ea580c', 9, 8, false),
        teacher: npcDef('teacher', '講師 林冠廷', '#b45309', 15, 2, false)
      };
      st.sheets = {
        'S-0224': { title: '2027-02-24 TR-320 5S 現場管理', where: 'rack', rows: [] },
        'S-0310': { title: '2027-03-10 TR-301 化學品危害通識', where: 'rack', rows: [] },
        [SHEET]: { title: '2027-04-14 TR-310 ISO 9001 品質系統概論', where: 'instructor', rows: [] }
      };
    },
    onStart(st) {
      wangAtKiosk(st);
      showTalk([
        { who: '旁白', text: '2027 年 4 月 12 日（一）上午 9:00。你是人資專員陳怡安。' },
        { who: '旁白', text: '後天（4/14）上午有一梯 ISO 9001 品質系統概論，已經截止報名，名單上有四位學員。另外 5/12 還有一梯同一門課，正在開放報名。' }
      ], [], { closeLabel: '開始' });
    },
    objective(st) {
      const f = st.flags;
      const items = [
        { text: '和員工報名電腦前的王志成談', done: f.talkedWang },
        f.decision === 'keep' ? { text: '你請王志成照常上課（不移除）', done: true }
          : { text: '在 4/14 梯次明細用「移除」取消王志成的報名', done: f.removed },
        { text: '和張書維談', done: f.talkedZhang },
        { text: '在 5/12 梯次明細用「代為報名」替張書維報名', done: f.rejectedOther },
        { text: '上課前一天：打開 4/14 梯次明細，試著登錄結訓結果', done: f.early },
        { text: '上課當天：到 2F 訓練教室向講師取回簽到表', done: f.gotSheet },
        { text: '依簽到表登錄結訓結果並儲存（請假原因寫在備註）', done: f.recorded },
        { text: '和周雅琪談', done: f.askedRemove },
        { text: '在 4/14 梯次明細看看還能不能移除周雅琪', done: f.checkedRemove },
        { text: '把簽到表放回簽到表架歸檔', done: f.recorded && st.sheets[SHEET].where === 'rack' },
        { text: '兩週後：和楊凱翔談補考結果', done: f.makeupTalk },
        { text: '把楊凱翔改為「已完成」、備註寫補考，儲存（先預測）', done: f.makeupSaved }
      ];
      return { title: '同一梯課的例外狀況', items };
    },
    hudStats(st) {
      const s = findById(st.db.sessions, S1);
      return '<h3>4/14 梯次（TR-310）</h3><p>已報名 ' + enrolledCount(st.db, S1) + '／上限 ' + s.capacity + '　儲存狀態：' + s.status + '　畫面狀態：' + displayStatus(s, today(st)) + '</p>' +
        '<h3>手上的簽到表</h3><p>' + (heldSheets(st).join('、') || '（無）') + '</p>';
    },
    npcAttention(st, id) {
      const f = st.flags;
      if (id === 'wang') return !!f.wangMsg && !f.talkedWang;
      if (id === 'zhang') return !f.talkedZhang;
      if (id === 'teacher') return !f.gotSheet;
      if (id === 'zhou') return !f.askedRemove;
      if (id === 'yang') return !f.makeupTalk;
      if (id === 'boss') return f.day13 && !f.early;
      return false;
    },
    onTalk(st, id) {
      const f = st.flags;
      if (id === 'wang') {
        if (!f.wangMsg) return showTalk([{ who: '王志成', text: '等我一下，我先看看系統。' }]);
        if (f.talkedWang) return showTalk([{ who: '王志成', text: '麻煩你了。' }]);
        return showTalk([
          { kind: 'screen', title: '員工報名電腦（王志成登入）', text: f.wangMsg, err: true },
          { who: '王志成', text: '我 4/14 臨時要支援夜班，沒辦法上這堂課。系統說已截止，要洽人資。可以幫我取消嗎？' },
          { kind: 'coach', text: '原系統允許人資在上課日期之前用「移除」刪掉一筆報名。要不要替他取消，是人資的判斷，系統不會替你決定。' }
        ], [
          { label: '好，我到電腦用「移除」替你取消', run: () => { f.talkedWang = true; f.decision = 'remove'; advance(st, 2); addTrail(st, '王志成來找人資取消；人資決定用「移除」替他取消', 'manual'); npcLeave('wang'); setTimeout(() => { if (gameState === st) npcToOffice('zhang', [4, 3]); }, 1500); } },
          { label: '這梯已截止，請你照常上課', run: () => { f.talkedWang = true; f.decision = 'keep'; advance(st, 2); addTrail(st, '王志成來找人資取消；人資請他照常上課', 'manual'); npcLeave('wang'); setTimeout(() => { if (gameState === st) npcToOffice('zhang', [4, 3]); }, 1500); } }
        ]);
      }
      if (id === 'zhang') {
        if (f.rejectedOther) return showTalk([{ who: '張書維', text: '系統不讓喔？那我還是上 4/14 這梯好了。' }]);
        return showTalk([
          { who: '張書維', text: '我 4/14 那梯已經報了，但最近比較忙，想先多報 5/12 那一梯，到時候再決定上哪一梯。可以幫我報嗎？' }
        ], [{ label: '好，我到電腦替你報 5/12 的梯次', run: () => { f.talkedZhang = true; advance(st, 1); addTrail(st, '張書維請人資替他加報 5/12 梯次', 'manual'); } }]);
      }
      if (id === 'boss') {
        if (f.day13 && !f.early) return showTalk([{ who: '吳秀蘭', text: '結訓結果今天先登錄吧，打開明天那梯的明細就可以弄。' }]);
        if (f.early && !f.day14) return showTalk([{ who: '吳秀蘭', text: '畫面不給登錄？那就明天上完課再登錄吧。' }]);
        return showTalk([{ who: '吳秀蘭', text: '辛苦了。' }]);
      }
      if (id === 'teacher') {
        const sh = st.sheets[SHEET];
        const rows = [];
        if (f.decision !== 'remove') rows.push({ name: '王志成（E0101）', sign: '已簽到', test: '測驗通過' });
        rows.push({ name: '張書維（E0201）', sign: '已簽到', test: '測驗通過' });
        rows.push({ name: '周雅琪（E0202）', sign: '請假（未簽到）', test: '—' });
        rows.push({ name: '楊凱翔（E0302）', sign: '已簽到', test: '測驗未通過（62 分，及格 70 分）' });
        sh.rows = rows;
        if (!f.gotSheet) {
          return showTalk([
            { who: '林冠廷', text: '今天有一位請假，一位測驗沒過，兩週後會安排他補考。這是簽到表。' }, sheetLine(sh)
          ], [{
            label: '收下簽到表', run: () => {
              sh.where = 'player'; f.gotSheet = true; Sound.sfx('card'); advance(st, 1);
              addTrail(st, '向講師取回紙本簽到表', 'manual');
              log('拿到簽到表 ' + SHEET + '。回人資電腦登錄結訓結果。', 'scene');
            }
          }]);
        }
        return showTalk([{ who: '林冠廷', text: '補考的時間我再通知楊凱翔。' }]);
      }
      if (id === 'zhou') {
        if (f.askedRemove) return showTalk([{ who: '周雅琪', text: '如果不能拿掉也沒關係，謝謝。' }]);
        return showTalk([{ who: '周雅琪', text: '我那天請假，名單上會留一筆「未完成」。可以把我從名單拿掉嗎？' }],
          [{ label: '我到電腦看看能不能移除', run: () => { f.askedRemove = true; advance(st, 1); addTrail(st, '周雅琪請人資把她從名單移除', 'manual'); } }]);
      }
      if (id === 'yang') {
        if (f.makeupTalk) return showTalk([{ who: '楊凱翔', text: '麻煩你幫我改成通過，謝謝。' }]);
        return showTalk([
          { who: '楊凱翔', text: '我昨天（4/27）補考，這次 85 分過了。成績單在這裡。' },
          { kind: 'memo', text: '補考成績單（紙本）：TR-310 ISO 9001 品質系統概論｜補考日期 2027-04-27｜成績 85 分（及格 70 分）' },
          { kind: 'coach', text: '系統沒有補考欄位。原系統只能把這筆結果改成「已完成」，補考的事寫在備註。' }
        ], [{ label: '收下成績單，到電腦改結果', run: () => { f.makeupTalk = true; advance(st, 2); addTrail(st, '收下楊凱翔的補考成績單（紙本，系統外）', 'manual'); } }]);
      }
      showTalk([{ who: (st.npcs[id] || {}).name || '', text: '……' }]);
    },
    phoneCall() { return null; },
    board() { return '<p class="memo">公告：4/14（三）09:00–13:00 ISO 9001 品質系統概論（TR-310），2F 訓練教室。5/12 另開一梯。</p>'; },
    computerTabs() { return STD_TABS; },
    onSystem(st, evt) {
      const f = st.flags;
      switch (evt.type) {
        case 'beforeRemove':
          if (f.decision !== 'remove' || evt.eid !== E_WANG) return { block: '這位學員沒有要求取消報名。' };
          return {};
        case 'removeConfirm':
          return { note: '系統允許在上課日期之前移除。按下確定後，這筆報名紀錄會直接刪除，名單上不會留下痕跡。' };
        case 'remove':
          if (evt.result.ok && evt.eid === E_WANG) {
            f.removed = true;
            addTrail(st, '移除王志成的報名：系統直接刪除這筆報名紀錄', 'system');
            return { coach: '名單剩 ' + enrolledCount(st.db, S1) + ' 人。王志成的報名紀錄已經刪除，之後在系統裡查不到他曾經報過這一梯。' };
          }
          return {};
        case 'beforeEnroll':
          if (!f.talkedZhang) return { block: '目前沒有人請你代為報名。' };
          if (evt.empId !== 6) return { warn: ['你選的是' + empName(st.db, evt.empId) + '，要替他報名的是張書維（E0201）'] };
          return {};
        case 'enroll':
          if (!evt.result.ok && evt.result.error.indexOf('已報名這門課') === 0 && !f.rejectedOther) {
            f.rejectedOther = true;
            addTrail(st, '替張書維代報 5/12 梯次被拒：「' + evt.result.error + '」，沒有新增報名', 'system');
            setTimeout(() => { if (gameState === st) npcLeave('zhang'); }, 400);
            return { coach: '報名被拒，沒有新增報名紀錄。原系統一門課同一時間只能報一個尚未上課的梯次。' };
          }
          if (!evt.result.ok) addTrail(st, '代為報名失敗：' + evt.result.error, 'system');
          return {};
        case 'beforeSetStatus':
          return { block: '本關不需要變更梯次狀態。' };
        case 'viewDetail':
          if (evt.sid !== S1) return {};
          if (f.day13 && !f.day14 && !f.early) {
            f.early = true;
            addTrail(st, '上課前一天打開梯次明細：沒有結訓結果的登錄欄位（原系統規則：上課日期當天起才能登錄結訓結果）', 'system');
            return { coach: '畫面上沒有結訓結果的選單，也沒有「儲存結訓結果」按鈕。原系統即使直接送出，也會被擋下：「上課日期當天起才能登錄結訓結果」。關閉電腦後，時間會推進到上課當天。' };
          }
          if (f.askedRemove && !f.checkedRemove) {
            f.checkedRemove = true;
            addTrail(st, '上課日期已到：名單上不再有「移除」按鈕（原系統規則：上課日期已到，不能移除報名）', 'system');
            setTimeout(() => { if (gameState === st) npcLeave('zhou'); }, 400);
            return { coach: '上課日期已到，名單上已經沒有「移除」按鈕。原系統的檢查訊息是「上課日期已到，不能移除報名」，周雅琪的「未完成」會一直留在紀錄裡。最後把簽到表歸檔。' };
          }
          return {};
        case 'beforeSaveResults': {
          if (!f.recorded) {
            if (!f.gotSheet) return { block: '先到 2F 訓練教室向講師取回紙本簽到表，再依簽到表登錄。' };
            const w = resultMismatch(st.db, evt.rows, expectClassDay(st));
            const z = evt.rows.find(r => r.id === E_ZHOU);
            if (z && !text(z.note)) w.push('周雅琪請假：系統只有「已完成／未完成」，請假原因只能寫在備註');
            return w.length ? { warn: w } : {};
          }
          if (!f.day28) return { block: '結訓結果已經登錄過了。' };
          if (!f.makeupTalk) return { block: '先和楊凱翔談，確認補考結果。' };
          const want = {}; st.db.enrollments.filter(e => e.session_id === S1).forEach(e => { want[e.employee_id] = e.status; });
          want[9] = '已完成';
          const w = resultMismatch(st.db, evt.rows, want);
          const y = evt.rows.find(r => r.id === E_YANG);
          if (y && text(y.note).indexOf('補考') < 0) w.push('楊凱翔的備註沒有寫補考，日後看不出這筆是補考通過');
          if (w.length) return { warn: w };
          if (!f.predicted) {
            return {
              intercept: proceed => openQuiz('改結果前先預測', '按下儲存之前，先預測三件事。選完會看到說明，可以改選，不計分。',
                predictQuestions(), st.predictions, '繼續儲存', () => { f.predicted = true; proceed(); })
            };
          }
          return {};
        }
        case 'saveResults':
          if (!evt.result.ok) { addTrail(st, '儲存結訓結果失敗：' + evt.result.error, 'system'); return {}; }
          if (!f.recorded) {
            f.recorded = true;
            addTrail(st, '儲存 4/14 結訓結果：' + evt.result.message + '，登錄時間 ' + nowStr(st), 'system');
            setTimeout(() => { if (gameState === st) npcToOffice('zhou', [4, 4]); }, 300);
            return { coach: '已登錄。請假與測驗未過，在系統裡都是「未完成」，差別只能看備註。' };
          }
          if (f.day28 && !f.makeupSaved) {
            f.makeupSaved = true;
            const y = findById(st.db.enrollments, E_YANG);
            addTrail(st, '把楊凱翔改為已完成：登錄人與登錄時間被覆蓋成 ' + empName(st.db, y.result_by) + '、' + y.result_at, 'system');
            finish(st);
            return { coach: '楊凱翔改成已完成，登錄時間變成 ' + y.result_at + '，4/14 那次的登錄紀錄被覆蓋了。關閉電腦後看結算。' };
          }
          return {};
      }
      return {};
    },
    onRack(st, action, code) { addTrail(st, (action === 'take' ? '從簽到表架取出 ' : '把簽到表 ') + code + (action === 'take' ? '' : ' 放回簽到表架歸檔'), 'manual'); },
    afterAction(st) {
      const f = st.flags;
      if (f.rejectedOther && (f.decision === 'keep' || f.removed) && !f.day13) { f.day13 = 'pending'; whenIdle(() => jumpTo13(st)); }
      if (f.early && !f.day14) { f.day14 = 'pending'; whenIdle(() => jumpTo14(st)); }
      if (f.recorded && f.checkedRemove && st.sheets[SHEET].where === 'rack' && !f.day28) { f.day28 = 'pending'; whenIdle(() => jumpTo28(st)); }
    }
  };
}

/* ---------- 6. CR scenario controller (final only) ---------- */

let FinalDemo = null;

/* @@FINAL_BEGIN */
function crData() {
  return {
    employees: baseEmployees(),
    courses: baseCourses(),
    sessions: [
      mkSession(21, 2, '2026-08-20', '09:00', '16:00', 10, '截止報名', '外聘講師 宋家齊', '2026-07-20 09:00'),
      mkSession(22, 2, '2027-03-18', '09:00', '16:00', 10, '截止報名', '外聘講師 宋家齊', '2027-02-15 09:00'),
      mkSession(23, 2, '2027-11-03', '09:00', '16:00', 3, '開放報名', '外聘講師 宋家齊', '2027-09-27 10:00'),
      mkSession(24, 3, '2026-10-05', '08:30', '17:30', 12, '截止報名', '外聘講師 曾雅芳', '2026-09-01 09:00'),
      mkSession(25, 4, '2026-09-15', '13:30', '16:30', 30, '截止報名', '工安課 江國棟', '2026-08-25 09:00'),
      mkSession(26, 6, '2027-02-24', '09:00', '11:00', 20, '截止報名', '吳秀蘭', '2027-02-03 09:30')
    ],
    enrollments: [
      mkEnroll(1, 21, 8, 8, '2026-07-22 08:30', '已完成', '2026-08-20 16:30'),
      mkEnroll(2, 22, 12, 12, '2027-02-20 12:05', '已完成', '2027-03-18 16:30'),
      mkEnroll(3, 23, 3, 3, '2027-09-28 08:10'),
      mkEnroll(4, 23, 4, HR_ID, '2027-09-29 14:20'),
      mkEnroll(5, 23, 8, 8, '2027-10-04 07:50'),
      mkEnroll(6, 24, 13, 13, '2026-09-10 09:00', '已完成', '2026-10-05 17:45'),
      mkEnroll(7, 24, 7, HR_ID, '2026-09-12 10:30', '已完成', '2026-10-05 17:45'),
      mkEnroll(8, 25, 8, HR_ID, '2026-08-28 09:00', '已完成', '2026-09-15 16:40'),
      mkEnroll(9, 25, 12, 12, '2026-08-29 13:10', '已完成', '2026-09-15 16:40'),
      mkEnroll(10, 26, 9, 9, '2027-02-06 07:55', '已完成', '2027-02-24 11:20'),
      mkEnroll(11, 26, 10, 10, '2027-02-07 12:40', '已完成', '2027-02-24 11:20')
    ]
  };
}

const CR_SCENARIO = {
  id: 'CR-01',
  title: '應受訓與到期追蹤',
  requester: '工安課 江國棟課長',
  summary: '客戶稽核前一個月，工安課要人資當天交出「堆高機操作員誰還沒上、誰已經過期」。',
  segments: [
    { id: 'seg1', title: '第一段　清查：誰還沒上堆高機訓練' },
    { id: 'seg2', title: '第二段　到期：誰的訓練已經過期' },
    { id: 'seg3', title: '第三段　名單與名額' }
  ],
  clues: [
    { id: 'course', seg: 'seg1', hint: '在「訓練紀錄查詢」依課程查 TR-302 堆高機操作安全', text: '依課程查 TR-302，畫面只列出完成過的 2 個人，每人一個完成日期；還沒上過的人不會出現。' },
    { id: 'title', seg: 'seg1', hint: '打開「員工」頁，找出職稱是堆高機操作員的人', text: '職稱是員工資料上的自由文字，只能一個個看；倉儲課鄭文豪的職稱寫成「堆高機司機」，用「堆高機操作員」找會漏掉他。' },
    { id: 'history', seg: 'seg1', hint: '用「依員工查詢」查一位不在完成名單上的堆高機操作員', text: '要逐一用「依員工查詢」比對履歷，才看得出誰沒有堆高機訓練的完成紀錄。' },
    { id: 'legacy', seg: 'seg1', hint: '和走廊上的資深員工徐進財談談', text: '徐進財說系統上線（2026-07-01）以前就受過堆高機訓練，但系統裡查不到任何紀錄。' },
    { id: 'rule', seg: 'seg2', hint: '聽工安課長說明本廠的有效期間規定', text: '本廠規定堆高機、急救、消防這幾門課完成後只在一段期間內有效。' },
    { id: 'courses', seg: 'seg2', hint: '打開「課程」頁，看課程資料有哪些欄位', text: '課程資料只有編號、名稱、類別、時數、說明與啟用狀態，沒有有效期限。' },
    { id: 'expiry', seg: 'seg2', hint: '用「依員工查詢」查蔡宗翰的訓練履歷', text: '蔡宗翰的履歷只有 TR-302 的完成日期 2026-08-20，系統看不出這筆訓練現在還有沒有效。' },
    { id: 'export', seg: 'seg3', hint: '和倉儲課簡美惠課長談談', text: '部門主管要自己部門的名單，畫面上沒有匯出功能，只能截圖或手抄；部門主管以員工身分登入，沒有額外權限。' },
    { id: 'full', seg: 'seg3', hint: '和員工報名電腦前的楊凱翔談談', text: '還沒受過訓的堆高機操作員楊凱翔報名 11/03 梯次，系統回「這個梯次已額滿」。' },
    { id: 'roster', seg: 'seg3', hint: '打開 TR-302 的 11/03 梯次明細，看名單上的報名方式', text: '11/03 梯次的名單只看得到「自行報名」或「人資代報」，看不出哪些人是依職務應該上這門課的。' }
  ],
  requestLines: [
    { who: '江國棟', text: '所以要知道誰還沒上、誰過期，現在只能人工一個一個比對，還可能漏掉職稱寫法不一樣的人。' },
    { who: '江國棟', text: '我希望稽核之前，就能知道哪些人依職務該上哪幾門課、誰還沒上、誰已經過期或快要過期。' },
    { who: '江國棟', text: '簡課長那邊也要自己部門的名單。還有，名額有限的法規課，該上的人不要因為晚報名就上不到。' }
  ],
  requests: [
    '清查出依職務應該受訓、但還沒完成的人',
    '在到期之前知道誰的訓練已經過期或即將到期',
    '各部門主管拿得到自己部門的名單',
    '名額有限的課，該上的人不會因為晚報名而上不到'
  ],
  statements: [
    { text: '依課程查 TR-302，只列出完成過的 2 個人。', cat: 'obs', explain: '這是你在模擬畫面上看到的範圍。' },
    { text: '鄭文豪的職稱寫成「堆高機司機」，用「堆高機操作員」找會漏掉他。', cat: 'obs', explain: '這是比對員工資料時看到的事實：職稱是自由文字。' },
    { text: '課程資料沒有有效期限。', cat: 'obs', explain: '這是你打開課程頁看到的欄位範圍。' },
    { text: '工安課希望稽核之前就知道誰缺訓、誰已經過期。', cat: 'want', explain: '這是需求提出者希望達成的業務結果，還不是系統規格。「缺訓」「過期」各怎麼算，還要釐清。' },
    { text: '部門主管希望拿到自己部門的名單。', cat: 'want', explain: '這是利害關係人的期望；名單要有哪些內容、多久給一次，還沒有定義。' },
    { text: '只要在課程資料加一個欄位記有效年數，問題就解決了。', cat: 'infer', explain: '這是資料設計的想法，不是現況事實；期限記在哪裡、規定改了怎麼算，都還沒有釐清。' },
    { text: '徐進財上線前受過訓，所以他不算缺訓。', cat: 'infer', explain: '這是根據口述做的推論。上線前的紀錄要怎麼看待，需要問利害關係人，遊戲不回答。' }
  ],
  impacts: {
    '角色': '工安課、部門主管、人資、員工各自要看到什麼？部門主管現在以員工身分登入，沒有額外權限。',
    '流程': '開梯次、報名、結訓登錄、查詢，這幾個流程哪些會被這項需求碰到？',
    '功能': '現有的依課程查詢、依員工查詢、梯次名單，各自查得到什麼、查不到什麼？',
    '資料': '哪些資訊原本根本沒被記錄（職務要求、有效期限、應受訓或自願）？',
    '權限': '名單交給部門主管時，誰可以看、誰可以拿到檔案？',
    '操作環境': '系統裝在管理部一台電腦，其他人用瀏覽器連線；名單要怎麼交到各部門手上？'
  },
  verify: [
    '以人資帳號登入原系統，在「訓練紀錄查詢」依課程查 TR-101，對照「員工」頁的職稱。',
    '打開 TR-101 第 6 梯次（2027-01-20）的名單，看報名方式欄。',
    '打開課程維護畫面，確認課程有哪些欄位。',
    '在 SQLite 查看課程與報名紀錄目前存了哪些欄位（只看現況，不先設計新表）。'
  ],
  guide: [
    '工安課要的「缺訓」與「過期」各是什麼意思？要先問清楚哪些人、哪些課、從哪一天算起？',
    '目前哪幾個畫面查得到相關資訊？哪些資訊原本根本沒被記錄（職務要求、有效期限、應受訓或自願）？',
    '這項需求可能會碰到哪些角色、流程（開梯次、報名、結訓登錄、查詢）、資料與畫面？部門主管目前沒有額外權限，名單要怎麼交到他們手上？',
    '系統上線前受過訓的人、職稱寫法不一致的人、換過職務的人，上線後會被怎麼看待？要問誰？'
  ]
};

FinalDemo = (function () {
  const sc = CR_SCENARIO;
  const id = sc.id;
  const CATEGORIES = [
    { id: 'obs', label: '觀察到的問題（現場事實）' },
    { id: 'want', label: '利害關係人的期望' },
    { id: 'infer', label: '尚待查證的推論或設計想法' }
  ];
  const IMPACT_AREAS = ['角色', '流程', '功能', '資料', '權限', '操作環境'];
  const SEG_ORDER = ['seg1', 'seg2', 'seg3'];
  const CR_TABS = [
    { id: 'records', label: '訓練紀錄查詢' },
    { id: 'employees', label: '員工' },
    { id: 'courses', label: '課程' },
    { id: 'sessions', label: '梯次管理' },
    { id: 'detail', label: '梯次明細' }
  ];

  function menuHtml() {
    return '<h2>期末：變更需求情境</h2>' +
      '<p class="hint">本題只有一項變更需求 CR-01，約 5–10 分鐘。你的角色是系統分析師：觀察現況問題、聽需求提出者說明、辨識待查證事項。遊戲只呈現現況，不提供改善後的系統。</p>' +
      '<div class="cards"><button type="button" class="card" data-start="' + id + '"><b>' + id + '　' + esc(sc.title) + '</b><span>需求提出者：' + esc(sc.requester) + '</span><span>' + esc(sc.summary) + '</span></button></div>';
  }

  function makeController() {
    const cluesOf = seg => sc.clues.filter(c => c.seg === seg);
    const has = (st, cid) => st.cr.clues.indexOf(cid) >= 0;
    const segDone = (st, seg) => cluesOf(seg).every(c => has(st, c.id));

    function collect(st, cid) {
      const c = sc.clues.find(x => x.id === cid);
      if (!c || has(st, cid) || st.cr.stage !== c.seg) return;
      st.cr.clues.push(cid);
      addTrail(st, '觀察：' + c.text, 'manual');
      log('已記下觀察：' + c.text, 'note');
      if (segDone(st, c.seg)) whenIdle(() => nextStage(st));
      render();
    }

    function nextStage(st) {
      const i = SEG_ORDER.indexOf(st.cr.stage);
      if (i < 0 || !segDone(st, st.cr.stage)) return;
      if (i === 0) {
        st.cr.stage = 'seg2';
        advance(st, 20);
        showTalk([
          { who: '旁白', text: '工安課長江國棟看了你整理的清查結果。' },
          { who: '江國棟', text: '還有一件事。依本廠規定，堆高機、急救、消防這幾門課，完成之後只在一段期間內有效，過了就要複訓。' },
          { who: '江國棟', text: '我要知道誰的訓練已經過期。系統查得出來嗎？' }
        ]);
        collect(st, 'rule');
      } else if (i === 1) {
        st.cr.stage = 'seg3';
        advance(st, 20);
        showNpc('kao', 9, 8); walkNpc('kao', [[9, 2], [8, 2]]);
        npcToOffice('mgr', [5, 4]);
        log('倉儲課簡美惠課長來到辦公室；楊凱翔走到員工報名電腦前。', 'scene');
      } else {
        st.cr.stage = 'request';
        log('觀察已足夠。回去找工安課江國棟課長聽需求說明。', 'scene');
      }
      render();
    }

    function talkRequester(st) {
      if (st.cr.stage === 'seg1' || st.cr.stage === 'seg2' || st.cr.stage === 'seg3') {
        return showTalk([
          { who: '江國棟', text: '稽核下個月就來了，麻煩你先看看系統現在查得到什麼。' },
          { kind: 'coach', text: '先在現場收集觀察筆記（右側清單），三段都完成後，再回來聽需求說明。' }
        ]);
      }
      if (st.cr.stage === 'request') return showTalk(sc.requestLines, [{ label: '開始需求釐清練習', run: () => openExercise(st) }]);
      return showTalk([{ who: '江國棟', text: '謝謝你整理。' }], [
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
      const observed = sc.clues.filter(c => has(st, c.id)).map(c => '<li>' + esc(c.text) + '</li>').join('');
      const html = '<div class="settle cr">' +
        '<p class="boundary">本情境只呈現現況困難與需求背景，不提供資料表、欄位、畫面或做法的答案。合理的做法可能不只一種，請回到原系統查證後，再提出有理由的設計。</p>' +
        '<div class="grid4">' +
        '<section><h3>觀察到的業務事件</h3><ul>' + observed + '</ul></section>' +
        '<section><h3>利害關係人的新要求（' + id + '｜' + esc(sc.requester) + '）</h3><ul>' + sc.requests.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></section>' +
        '<section><h3>可能受影響項目（分類問題）</h3><dl>' + IMPACT_AREAS.map(x =>
          '<dt>' + x + (st.cr.impacts.indexOf(x) >= 0 ? '　<span class="tag-sel">你有勾選</span>' : '') + '</dt><dd>' + esc(sc.impacts[x]) + '</dd>').join('') + '</dl></section>' +
        '<section><h3>回到實際系統確認</h3><ul>' + sc.verify.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></section>' +
        '</div>' +
        '<section><h3>結算引導問題</h3><ol>' + sc.guide.map(g => '<li>' + esc(g) + '</li>').join('') + '</ol></section>' +
        '<section><h3>你寫下的追問</h3><p class="notes">' + (st.cr.notes.trim() ? esc(st.cr.notes) : '（未填寫）') + '</p></section>' +
        '<p class="hint">接下來請以期中修訂版為基礎，回到原系統查證，再寫出「現況問題、需求釐清、影響範圍、修改建議、驗收條件」。</p>' +
        '</div>';
      openSettlement(id + ' 結算：' + sc.title, html, [
        { label: '重做需求釐清練習', run: () => openExercise(st) },
        { label: '重新開始此情境', run: () => startMode(id) },
        { label: '回到標題', run: showTitle }
      ]);
    }

    const LEGACY_LINES = [
      { who: '徐進財', text: '堆高機訓練？我在這裡開了快二十年堆高機，系統還沒上線以前就受過訓了，證書放在家裡。' },
      { who: '徐進財', text: '不過那時候都是紙本，人資說換系統時沒有把舊資料打進去。' }
    ];

    return {
      id, title: id + '　' + sc.title, role: '系統分析師（觀察現場）', isCR: true, rackReadOnly: true,
      setup(st) {
        st.db = crData();
        st.clock = clockAt(2027, 10, 18, 9, 30);
        st.player = { x: 2, y: 3, dir: 'right' };
        st.npcs = {
          req: npcDef('req', '工安課 江國棟', '#ca8a04', 4, 3),
          hsu: npcDef('hsu', '徐進財', '#374151', 10, 5),
          mgr: npcDef('mgr', '倉儲課 簡美惠', '#9333ea', 9, 8, false),
          kao: npcDef('kao', '楊凱翔', '#ea580c', 9, 8, false)
        };
        st.sheets = {
          'S-0820': { title: '2026-08-20 TR-302 堆高機操作安全', where: 'rack', rows: [] },
          'S-0318': { title: '2027-03-18 TR-302 堆高機操作安全', where: 'rack', rows: [] }
        };
        st.cr = { clues: [], answers: {}, impacts: [], notes: '', stage: 'seg1' };
      },
      onStart() {
        showTalk([
          { who: '旁白', text: '2027 年 10 月 18 日（一）上午 9:30，下個月有客戶稽核。你是系統分析師，今天到管理部觀察教育訓練系統的使用情形。' },
          { who: '江國棟', text: '我是工安課江國棟。稽核要看堆高機操作員的訓練狀況，我要一份名單：誰還沒上、誰已經過期。今天就要。' },
          { who: '旁白', text: '用人資電腦查查看（你以人資的畫面觀察，只看不改），也和現場的人談談，收集「觀察筆記」。' }
        ], [], { closeLabel: '開始觀察' });
      },
      objective(st) {
        const stg = st.cr.stage;
        const seg = sc.segments.find(s => s.id === stg);
        if (seg) {
          const cs = cluesOf(stg);
          return {
            title: seg.title + '（' + cs.filter(c => has(st, c.id)).length + '/' + cs.length + '）',
            items: cs.map(c => ({ text: c.hint, done: has(st, c.id) })), showAll: true
          };
        }
        if (stg === 'request') return { title: '聽取需求', items: [{ text: '向' + sc.requester + '了解需求', done: false }] };
        if (stg === 'exercise') return { title: '整理需求', items: [{ text: '完成需求釐清練習', done: false }] };
        return { title: '情境完成', items: [{ text: '可以找' + sc.requester + '重看結算，或從暫停選單回到標題', done: true }], showAll: true };
      },
      hudExtra(st) {
        const got = sc.clues.filter(c => has(st, c.id));
        return '<h3>觀察筆記</h3>' + (got.length ? '<ul class="notes-list">' + got.map(c => '<li>' + esc(c.text) + '</li>').join('') + '</ul>' : '<p class="hint">尚未記下觀察。</p>');
      },
      npcAttention(st, npcId) {
        const stg = st.cr.stage;
        if (npcId === 'req') return stg === 'request';
        if (npcId === 'hsu') return stg === 'seg1' && !has(st, 'legacy');
        if (npcId === 'mgr') return stg === 'seg3' && !has(st, 'export');
        if (npcId === 'kao') return stg === 'seg3' && !has(st, 'full');
        return false;
      },
      onTalk(st, npcId) {
        if (npcId === 'req') return talkRequester(st);
        if (npcId === 'hsu') {
          showTalk(LEGACY_LINES);
          collect(st, 'legacy');
          return;
        }
        if (npcId === 'mgr') {
          showTalk([
            { who: '簡美惠', text: '我是倉儲課課長。我們課的人誰缺訓，我想自己留一份名單，排班的時候對照。' },
            { who: '簡美惠', text: '上次跟人資要，她只能截圖給我。我登入系統也只看得到我自己的紀錄。' }
          ]);
          collect(st, 'export');
          return;
        }
        if (npcId === 'kao') {
          const r = enroll(st.db, 23, 9, 9, today(st), nowStr(st));
          showTalk([
            { who: '楊凱翔', text: '我是堆高機操作員，到現在還沒上過堆高機訓練。我想報 11/03 那一梯。' },
            { kind: 'screen', title: '員工報名電腦（楊凱翔登入）', text: r.ok ? r.message : r.error, err: !r.ok },
            { who: '楊凱翔', text: '額滿了……可是我開堆高機一定要上這堂課啊。' }
          ]);
          collect(st, 'full');
          return;
        }
        showTalk([{ who: (st.npcs[npcId] || {}).name || '', text: '……' }]);
      },
      phoneCall() { return null; },
      board() { return '<p class="memo">公告：11/03（三）TR-302 堆高機操作安全，2F 訓練教室，名額 3 人，請至員工報名電腦報名。</p>'; },
      computerTabs() { return CR_TABS; },
      computerOptions() {
        return { readOnly: true, banner: '期末情境 CR-01：以下是現況模擬畫面，只供觀察，不能新增或修改資料。畫面上沒有職務課程設定、有效期限、缺訓名單或匯出功能，這是現況，不是遊戲省略。（實際畫面請回原系統確認）' };
      },
      onSystem(st, evt) {
        if (evt.type === 'courseQuery' && evt.courseId === 2) collect(st, 'course');
        if (evt.type === 'openTab' && evt.tab === 'employees') collect(st, 'title');
        if (evt.type === 'empHistory' && [9, 10, 11].indexOf(evt.empId) >= 0) collect(st, 'history');
        if (evt.type === 'openTab' && evt.tab === 'courses') collect(st, 'courses');
        if (evt.type === 'empHistory' && evt.empId === 8) collect(st, 'expiry');
        if (evt.type === 'viewDetail' && evt.sid === 23) collect(st, 'roster');
        return {};
      }
    };
  }

  return { menuHtml, makeController, editionLabel: '期末版（含現況回顧）', has: m => m === id };
})();
/* @@FINAL_END */

/* ---------- 6b. sound (Web Audio, synthesized in code, no audio files) ---------- */

const Sound = (function () {
  let ctx = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true, timer = null, nextTime = 0, stepIdx = 0;
  const STEP = 60 / 92 / 2; // eighth note at 92 BPM
  // C major pentatonic loop, 8 bars of eighth notes (0 = rest), one bass note per bar
  const MELODY = [
    72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 72, 0, 0, 0,
    74, 0, 76, 0, 79, 0, 81, 79, 76, 0, 74, 0, 72, 0, 0, 0,
    69, 0, 72, 0, 74, 0, 76, 74, 72, 0, 74, 0, 76, 0, 79, 0,
    81, 0, 79, 0, 76, 0, 74, 72, 74, 0, 0, 0, 72, 0, 0, 0
  ];
  const BASS = [48, 45, 50, 43, 45, 48, 41, 43];
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
    isSfxOn: () => sfxOn
  };
})();

/* ---------- 7. UI ---------- */

const ui = {
  modalOpen: false, lastFocus: null, onClose: null, idleQueue: [], msgs: [], toastTimer: null, lastMoveAt: 0,
  compTab: 'sessions', compOpen: false, compMsg: null, warn: null, detailSid: null, sdraft: null,
  resultDraft: {}, resultDraftSid: null, enrollPick: '', pendingRemove: null, pendingNote: '',
  recMode: 'emp', recQ: '', recFound: null, recEmpId: null, recCourseId: null, quickKey: ''
};
let ctrl = null;

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function emptySessionDraft() { return { course_id: '', session_date: '', start_time: '', end_time: '', location: '', instructor: '', capacity: '' }; }
function heldSheets(st) { return Object.keys(st.sheets).filter(c => st.sheets[c].where === 'player').sort(); }

function resetUiState() {
  Object.assign(ui, {
    idleQueue: [], msgs: [], compTab: null, compOpen: false, compMsg: null, warn: null, detailSid: null, sdraft: emptySessionDraft(),
    resultDraft: {}, resultDraftSid: null, enrollPick: '', pendingRemove: null, pendingNote: '',
    recMode: 'emp', recQ: '', recFound: null, recEmpId: null, recCourseId: null, quickKey: ''
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
  ui.compOpen = !!opts.computer;
  const body = $('#modal-body');
  body.innerHTML = '';
  build(body);
  ui.onClose = opts.onClose || null;
  if (!dlg.open) { dlg.showModal(); Sound.sfx(opts.sound || 'open'); }
  else if (opts.sound) Sound.sfx(opts.sound);
  ui.modalOpen = true;
  const target = body.querySelector('[data-autofocus]') ||
    body.querySelector('input:not([disabled]), select:not([disabled]), textarea, button:not([disabled])');
  if (target) target.focus();
}

function closeModal(skipFlush) {
  const dlg = $('#modal');
  if (!ui.modalOpen && !dlg.open) return;
  ui.modalOpen = false;
  ui.compOpen = false;
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
  if (l.kind === 'screen') return '<div class="screen"><b>' + esc(l.title) + '｜系統畫面（模擬）</b><span class="' + (l.err ? 'err' : '') + '">' + esc(l.text) + '</span></div>';
  if (l.kind === 'sheet') {
    return '<div class="sheet"><b>紙本簽到表（虛構）：' + esc(l.title) + '</b><table><thead><tr><th>學員</th><th>簽到</th><th>測驗</th></tr></thead><tbody>' +
      l.rows.map(r => '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.sign) + '</td><td>' + esc(r.test) + '</td></tr>').join('') + '</tbody></table></div>';
  }
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
    '<h2>期中：現況理解（As-Is）</h2><p class="hint">扮演管理部人資專員，體驗原有系統的功能與例外。兩關合計約 10–15 分鐘。</p><div class="cards">' +
    '<button type="button" class="card" data-start="level1"><b>第一關　開課與報名</b><span>正常流程：開梯次、自行報名與代為報名、截止、收簽到表、登錄結訓結果。</span></button>' +
    '<button type="button" class="card" data-start="level2"><b>第二關　請假、補考與截止之後</b><span>現有系統的例外：截止後想取消、重複報名同一門課、請假與補考。</span></button></div>';
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
    case '.': return x <= 6 ? 'floor-staff' : x >= 12 ? 'floor-class' : 'floor-lobby';
    case 'D': return 'door';
    case 'C': return 'obj t-computer';
    case 'T': return 'obj t-phone';
    case 'R': return 'obj t-sheets';
    case 'B': return 'board-wall';
    case 'P': return 't-kiosk';
    case 'K': return 'desk';
    case 'W': return 'whiteboard';
    case 'S': return 'class-seat';
    case 'F': return 'entrance';
  }
  return 'floor-lobby';
}
function tileLabel(ch, x, y) {
  if (ch === 'C') return '電腦';
  if (ch === 'T') return '電話';
  if (ch === 'R') return '簽到表架';
  if (ch === 'B') return '公告欄';
  if (ch === 'P') return '報名電腦';
  if (ch === 'W' && x === 15) return '白板';
  if (ch === 'D' && x === 7) return '管理部';
  if (ch === 'D' && x === 11) return '2F 教室';
  if (ch === 'F' && x === 9) return '往廠區';
  if (ch === 'K' && x === 2 && y === 5) return '辦公桌';
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
    setTimeout(tick, 110);
  }
  npc.walking = true;
  setTimeout(tick, 110);
}

function renderEntities() {
  const st = gameState;
  const layer = $('#ents');
  if (!st || !layer || !ctrl) return;
  const list = Object.values(st.npcs).filter(n => n.visible).map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, color: n.color, kind: 'npc' }));
  list.push({ id: '__player', name: ctrl.isCR ? '你（分析師）' : '你（人資）', x: st.player.x, y: st.player.y, color: '#2563a8', kind: 'player' });
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
  $('#clock').textContent = '模擬日期 ' + fmtDT(gameState.clock);
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
  computer: { x: 1, y: 2, dir: 'up', label: '人資電腦' },
  phone: { x: 3, y: 2, dir: 'up', label: '電話' },
  rack: { x: 5, y: 2, dir: 'up', label: '簽到表架' },
  kiosk: { x: 9, y: 1, dir: 'left', label: '報名電腦' },
  classroom: { x: 15, y: 3, dir: 'up', label: '2F 講台' }
};
function renderQuick() {
  const st = gameState;
  const keys = Object.keys(QUICK_SPOTS).filter(k => st.visited[k]);
  const key = keys.join(',');
  if (key === ui.quickKey) return;
  ui.quickKey = key;
  $('#hud-quick').innerHTML = '<h3>快捷移動</h3>' + (keys.length
    ? keys.map(k => '<button type="button" class="small" data-quick="' + k + '">' + QUICK_SPOTS[k].label + '</button>').join(' ')
    : '<p class="hint">用過電腦、電話、簽到表架、報名電腦或到過講台後，可以在這裡直接移過去。</p>');
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
  if (t.kind === 'npc') {
    if (t.id === 'teacher') st.visited.classroom = true;
    ctrl.onTalk(st, t.id);
    return;
  }
  if (st.visited[t.id] !== undefined) st.visited[t.id] = true;
  if (t.id === 'computer') openComputer();
  else if (t.id === 'phone') openPhone();
  else if (t.id === 'rack') openRack();
  else if (t.id === 'kiosk') openKiosk();
  else if (t.id === 'board') openBoard();
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

/* HR computer */
function compOptions() { return (ctrl.computerOptions && ctrl.computerOptions(gameState)) || {}; }

function enterTab(tab) {
  ui.compTab = tab;
  addCoach(emit('openTab', { tab }));
  if (tab === 'detail' && ui.detailSid) addCoach(emit('viewDetail', { sid: ui.detailSid }));
}

function openComputer() {
  const tabs = ctrl.computerTabs(gameState);
  if (!tabs.some(t => t.id === ui.compTab)) ui.compTab = tabs[0].id;
  ui.compMsg = null; ui.warn = null; ui.pendingRemove = null;
  openModal('人資電腦', renderComputerBody, { size: 'wide', computer: true });
  enterTab(ui.compTab);
  rerenderComputer();
  render();
}

function rerenderComputer(focusId) {
  if (!ui.modalOpen || !ui.compOpen) return;
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
function coachMsg(text) { ui.compMsg = { kind: 'coach', lines: [], coach: text }; Sound.sfx('notice'); }
function addCoach(res) {
  if (!res || !res.coach) return;
  Sound.sfx('notice');
  ui.compMsg = { kind: ui.compMsg ? ui.compMsg.kind : 'coach', lines: ui.compMsg ? ui.compMsg.lines : [], coach: res.coach };
}
// Run a before-hook result: block, warn (confirm), intercept (quiz) or go
function guarded(r, goLabel, go, reopenTab) {
  if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
  if (r.warn && r.warn.length) { Sound.sfx('notice'); ui.warn = { lines: r.warn, goLabel, go }; rerenderComputer(); return; }
  if (r.intercept) {
    r.intercept(() => { ui.compTab = reopenTab; openComputer(); go(); });
    return;
  }
  go();
}

function renderComputerBody(body) {
  const st = gameState;
  const tabs = ctrl.computerTabs(st);
  const opt = compOptions();
  const u = empById(st.db, HR_ID);
  body.innerHTML =
    '<div class="sys-bar"><b>員工教育訓練紀錄系統（遊戲模擬）</b><span>登入：' + esc(u.emp_no + ' ' + u.name) + '（人資）</span><span>系統日期：' + fmtDT(st.clock) + '</span></div>' +
    (opt.banner ? '<p class="banner">' + esc(opt.banner) + '</p>' : '') +
    '<div class="tabs" role="tablist">' + tabs.map(t => '<button type="button" role="tab" id="tab-' + t.id + '" aria-selected="' + (t.id === ui.compTab) + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>').join('') + '</div>' +
    '<div id="comp-msg" aria-live="polite"></div><div class="tabpanel" id="tabpanel" role="tabpanel"></div>';
  $all('[data-tab]', body).forEach(b => b.addEventListener('click', () => {
    ui.compMsg = null; ui.warn = null; ui.pendingRemove = null;
    enterTab(b.dataset.tab);
    rerenderComputer('tab-' + ui.compTab);
    render();
  }));
  const msg = $('#comp-msg', body);
  if (ui.compMsg) {
    const m = ui.compMsg;
    msg.innerHTML = (m.lines.length ? '<div class="msg k-' + m.kind + '"><b>系統訊息</b><ul>' + m.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul></div>' : '') +
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
  if (ui.compTab === 'sessions') renderSessions(panel, opt);
  else if (ui.compTab === 'detail') renderDetail(panel, opt);
  else if (ui.compTab === 'records') renderRecords(panel);
  else if (ui.compTab === 'employees') renderEmployees(panel);
  else if (ui.compTab === 'courses') renderCourses(panel);
}

function badge(s) {
  const cls = s === '已完成' ? ' b-done' : s === '未完成' || s === '已取消' ? ' b-fail' : '';
  return '<span class="badge' + cls + '">' + esc(s) + '</span>';
}

function renderSessions(panel, opt) {
  const st = gameState;
  const day = today(st);
  const rows = listSessions(st.db, day);
  const d = ui.sdraft;
  panel.innerHTML =
    '<table class="data"><thead><tr><th>課程</th><th>上課日期</th><th>時間</th><th>地點</th><th>講師</th><th>梯次狀態</th><th>已報名／上限</th><th></th></tr></thead><tbody>' +
    rows.map(r => '<tr><td>' + esc(r.course_no + ' ' + r.course_name) + '</td><td>' + r.session_date + '</td><td>' + r.start_time + '–' + r.end_time +
      '</td><td>' + esc(r.location) + '</td><td>' + esc(r.instructor) + '</td><td>' + badge(r.display_status) + '</td><td>' + r.enrolled + '／' + r.capacity +
      '</td><td><button type="button" class="small" id="sd-' + r.id + '" data-sdetail="' + r.id + '">明細</button></td></tr>').join('') + '</tbody></table>' +
    (opt.readOnly ? '' :
      '<details open><summary>新增梯次</summary>' + (ctrl.sessionFormHint && ctrl.sessionFormHint(st) ? '<p class="memo">' + esc(ctrl.sessionFormHint(st)) + '</p>' : '') +
      '<form id="f-session" class="grid-form">' +
      '<label>課程 <select id="ns-course"><option value="">請選擇課程</option>' + st.db.courses.filter(c => c.active).map(c => '<option value="' + c.id + '"' + (String(c.id) === d.course_id ? ' selected' : '') + '>' + esc(c.course_no + ' ' + c.name) + '</option>').join('') + '</select></label>' +
      '<label>上課日期（YYYY-MM-DD） <input id="ns-date" autocomplete="off" value="' + esc(d.session_date) + '"></label>' +
      '<label>開始時間（HH:MM） <input id="ns-start" autocomplete="off" value="' + esc(d.start_time) + '"></label>' +
      '<label>結束時間（HH:MM） <input id="ns-end" autocomplete="off" value="' + esc(d.end_time) + '"></label>' +
      '<label>地點 <input id="ns-loc" value="' + esc(d.location) + '"></label>' +
      '<label>講師 <input id="ns-ins" value="' + esc(d.instructor) + '"></label>' +
      '<label>人數上限 <input id="ns-cap" inputmode="numeric" value="' + esc(d.capacity) + '"></label>' +
      '<div class="row"><button type="submit">新增梯次</button><span class="hint">課程選單只列啟用中的課程。</span></div></form></details>');
  $all('[data-sdetail]', panel).forEach(b => b.addEventListener('click', () => {
    ui.detailSid = Number(b.dataset.sdetail);
    ui.compMsg = null; ui.warn = null; ui.pendingRemove = null;
    enterTab('detail');
    rerenderComputer('tab-detail');
    render();
  }));
  const f = $('#f-session', panel);
  if (!f) return;
  const sync = () => {
    d.course_id = $('#ns-course').value; d.session_date = $('#ns-date').value; d.start_time = $('#ns-start').value;
    d.end_time = $('#ns-end').value; d.location = $('#ns-loc').value; d.instructor = $('#ns-ins').value; d.capacity = $('#ns-cap').value;
  };
  $all('input, select', f).forEach(i => { i.addEventListener('input', sync); i.addEventListener('change', sync); });
  f.addEventListener('submit', e => {
    e.preventDefault();
    sync();
    const input = Object.assign({}, d);
    const res = createSession(st.db, input, HR_ID, nowStr(st));
    if (!res.ok) {
      setMsg('err', ['新增失敗，沒有新增梯次', res.error]);
      addCoach(emit('createSession', { result: res }));
      rerenderComputer();
      return;
    }
    const commit = () => {
      st.db = res.db;
      advance(st, 2);
      ui.sdraft = emptySessionDraft();
      ui.detailSid = res.session.id;
      setMsg('ok', res.message + '：' + res.session.session_date + ' ' + res.session.start_time + '–' + res.session.end_time + '（梯次 #' + res.session.id + '）');
      addCoach(emit('createSession', { result: res }));
      rerenderComputer();
      render();
    };
    guarded(emit('beforeCreateSession', { input }), '仍要新增', commit, 'sessions');
  });
}

function renderDetail(panel, opt) {
  const st = gameState;
  const day = today(st);
  const sid = ui.detailSid;
  const d = sid ? sessionDetail(st.db, sid, day) : null;
  if (!d) { panel.innerHTML = '<p class="hint">請先在「梯次管理」按某一梯次的「明細」。</p>'; return; }
  const s = d.session, can = d.can, ro = !!opt.readOnly;
  if (ui.resultDraftSid !== sid) { ui.resultDraft = {}; ui.resultDraftSid = sid; }
  const draftOf = r => ui.resultDraft[r.id] || { result: r.status === '已報名' ? '' : r.status, note: r.note || '' };
  const showRec = can.record && !ro;
  const showRm = can.remove && !ro;
  const emps = st.db.employees.filter(e => e.active).sort((a, b) => a.emp_no.localeCompare(b.emp_no));
  panel.innerHTML =
    '<table class="data compare"><tbody>' +
    '<tr><th>課程</th><td>' + esc(s.course_no + ' ' + s.course_name + '（' + hoursText(s.hours) + ' 小時）') + '</td></tr>' +
    '<tr><th>梯次狀態</th><td>' + badge(s.display_status) + (s.display_status !== s.status ? '　<span class="hint">教材註記：資料庫 sessions.status 存的是「' + esc(s.status) + '」，畫面狀態是依日期算出來的</span>' : '') + '</td></tr>' +
    '<tr><th>上課日期</th><td>' + s.session_date + '</td></tr><tr><th>時間</th><td>' + s.start_time + '–' + s.end_time + '</td></tr>' +
    '<tr><th>地點</th><td>' + esc(s.location) + '</td></tr><tr><th>講師</th><td>' + esc(s.instructor) + '</td></tr>' +
    '<tr><th>人數上限</th><td>' + s.capacity + '（已報名 ' + s.enrolled + '）</td></tr><tr><th>建立人</th><td>' + esc(s.created_by_name) + '</td></tr>' +
    '</tbody></table>' +
    (!ro && can.edit ? '<div class="row"><button type="button" class="secondary" id="st-toggle" data-status="' + (s.status === '開放報名' ? '截止報名' : '開放報名') + '">' +
      (s.status === '開放報名' ? '截止報名' : '重新開放報名') + '</button><span class="hint">原系統另有「修改」「取消梯次」按鈕，本遊戲不使用。</span></div>' : '') +
    '<h3>報名名單</h3>' +
    (!ro && can.enroll ? '<div class="row"><label>代為報名 <select id="en-emp"><option value="">請選擇員工</option>' +
      emps.map(e => '<option value="' + e.id + '"' + (String(e.id) === ui.enrollPick ? ' selected' : '') + '>' + esc(e.emp_no + ' ' + e.name + '（' + e.department + '）') + '</option>').join('') +
      '</select></label><button type="button" id="en-btn">代為報名</button></div>' : '') +
    '<table class="data"><thead><tr><th>員工編號</th><th>姓名</th><th>部門</th><th>報名時間</th><th>報名方式</th><th>結訓結果</th><th>備註</th><th>結果登錄人</th><th>登錄時間</th>' + (showRm ? '<th>操作</th>' : '') + '</tr></thead><tbody>' +
    (d.roster.length === 0 ? '<tr><td colspan="' + (showRm ? 10 : 9) + '">目前沒有人報名</td></tr>' : d.roster.map(r => {
      const dr = draftOf(r);
      const opts = r.status === '已報名' ? ['', '已完成', '未完成'] : ['已完成', '未完成'];
      return '<tr><td>' + esc(r.emp_no) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.department) + '</td><td>' + esc(r.enrolled_at) + '</td><td>' + (r.by_self ? '自行報名' : '人資代報') + '</td>' +
        '<td>' + (showRec ? '<select id="rs-' + r.id + '" data-result="' + r.id + '" aria-label="' + esc(r.name) + ' 的結訓結果">' + opts.map(o => '<option value="' + o + '"' + (o === dr.result ? ' selected' : '') + '>' + (o || '請選擇') + '</option>').join('') + '</select>' : badge(r.status)) + '</td>' +
        '<td>' + (showRec ? '<input id="rn-' + r.id + '" data-note="' + r.id + '" maxlength="100" aria-label="' + esc(r.name) + ' 的備註" value="' + esc(dr.note) + '">' : esc(r.note || '')) + '</td>' +
        '<td>' + esc(r.result_by_name) + '</td><td>' + esc(r.result_at || '') + '</td>' +
        (showRm ? '<td><button type="button" class="small secondary" id="rm-' + r.id + '" data-remove="' + r.id + '">移除</button></td>' : '') + '</tr>' +
        (ui.pendingRemove === r.id ? '<tr class="confirm"><td colspan="10"><p>確定移除 ' + esc(r.name) + ' 的報名？</p>' + (ui.pendingNote ? '<p class="coach">' + esc(ui.pendingNote) + '</p>' : '') +
          '<div class="choices"><button type="button" id="rm-yes">確定移除</button><button type="button" class="secondary" id="rm-no">取消</button></div></td></tr>' : '');
    }).join('')) + '</tbody></table>' +
    (showRec && d.roster.length ? '<div class="row"><button type="button" id="save-results">儲存結訓結果</button></div>' : '') +
    (!can.record && s.status !== '已取消' ? '<p class="limit">上課日期前，這個畫面不顯示結訓結果的登錄欄位。</p>' : '') +
    (!can.remove ? '<p class="limit">上課日期已到，名單上不顯示「移除」按鈕。</p>' : '') +
    (!can.enroll ? '<p class="limit">這個梯次目前不開放報名，畫面不顯示「代為報名」。</p>' : '');

  const tg = $('#st-toggle', panel);
  if (tg) tg.addEventListener('click', () => {
    const status = tg.dataset.status;
    const r = emit('beforeSetStatus', { sid, status });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    const res = setSessionStatus(st.db, sid, status, day, nowStr(st));
    if (res.ok) { st.db = res.db; advance(st, 1); setMsg('ok', res.message); } else setMsg('err', res.error);
    addCoach(emit('setStatus', { sid, status, result: res }));
    rerenderComputer();
    render();
  });
  const sel = $('#en-emp', panel);
  if (sel) {
    sel.addEventListener('change', () => { ui.enrollPick = sel.value; });
    $('#en-btn', panel).addEventListener('click', () => {
      ui.enrollPick = sel.value;
      const empId = Number(sel.value) || null;
      const doEnroll = () => {
        const res = hrEnroll(st.db, sid, empId, HR_ID, today(st), nowStr(st));
        if (res.ok) { st.db = res.db; advance(st, 1); ui.enrollPick = ''; setMsg('ok', res.message); } else setMsg('err', ['報名失敗，沒有新增報名紀錄', res.error]);
        addCoach(emit('enroll', { sid, empId, result: res }));
        rerenderComputer();
        render();
      };
      if (!empId) { doEnroll(); return; }
      guarded(emit('beforeEnroll', { sid, empId }), '仍要報名', doEnroll, 'detail');
    });
  }
  $all('[data-result], [data-note]', panel).forEach(el => {
    const h = () => {
      const eid = Number(el.dataset.result || el.dataset.note);
      ui.resultDraft[eid] = { result: $('#rs-' + eid, panel).value, note: $('#rn-' + eid, panel).value };
    };
    el.addEventListener('change', h);
    el.addEventListener('input', h);
  });
  $all('[data-remove]', panel).forEach(b => b.addEventListener('click', () => {
    const eid = Number(b.dataset.remove);
    ui.compMsg = null;
    const r = emit('beforeRemove', { sid, eid });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    ui.pendingRemove = eid;
    ui.pendingNote = emit('removeConfirm', { sid, eid }).note || '';
    rerenderComputer('rm-yes');
  }));
  const yes = $('#rm-yes', panel);
  if (yes) {
    yes.addEventListener('click', () => {
      const eid = ui.pendingRemove;
      ui.pendingRemove = null;
      const res = removeEnrollment(st.db, sid, eid, today(st));
      if (res.ok) { st.db = res.db; advance(st, 1); setMsg('ok', res.message); } else setMsg('err', res.error);
      addCoach(emit('remove', { sid, eid, result: res }));
      rerenderComputer();
      render();
    });
    $('#rm-no', panel).addEventListener('click', () => { ui.pendingRemove = null; setMsg('info', '已取消，沒有刪除任何資料。'); rerenderComputer(); });
  }
  const save = $('#save-results', panel);
  if (save) save.addEventListener('click', () => {
    const rows = d.roster.map(r => ({ id: r.id, result: $('#rs-' + r.id, panel).value, note: $('#rn-' + r.id, panel).value }));
    const doSave = () => {
      const res = saveResults(st.db, sid, rows, HR_ID, today(st), nowStr(st));
      if (res.ok) { st.db = res.db; advance(st, 1); ui.resultDraft = {}; setMsg('ok', res.message); } else setMsg('err', ['儲存失敗', res.error]);
      addCoach(emit('saveResults', { sid, result: res }));
      rerenderComputer();
      render();
    };
    guarded(emit('beforeSaveResults', { sid, rows }), '仍要儲存', doSave, 'detail');
  });
}

function renderRecords(panel) {
  const st = gameState;
  const day = today(st);
  const emp = ui.recMode === 'emp';
  let html = '<div class="subtabs"><button type="button" class="secondary small" id="rec-emp" aria-pressed="' + emp + '">依員工查詢</button>' +
    '<button type="button" class="secondary small" id="rec-course" aria-pressed="' + !emp + '">依課程查詢</button></div>';
  if (emp) {
    const f = ui.recFound;
    html += '<form id="f-emp" class="row"><label>員工編號或姓名 <input id="rq" autocomplete="off" value="' + esc(ui.recQ) + '"></label><button type="submit">查詢</button></form>' +
      (f ? (f.rows.length ? '<table class="data"><thead><tr><th>員工編號</th><th>姓名</th><th>部門</th><th>職稱</th><th>在職狀態</th><th></th></tr></thead><tbody>' +
        f.rows.map(e => '<tr><td>' + esc(e.emp_no) + '</td><td>' + esc(e.name) + '</td><td>' + esc(e.department) + '</td><td>' + esc(e.job_title) + '</td><td>' + (e.active ? '在職' : '離職') +
          '</td><td><button type="button" class="small" id="hist-' + e.id + '" data-hist="' + e.id + '">查看紀錄</button></td></tr>').join('') + '</tbody></table>'
        : '<p class="hint">' + esc(f.message) + '</p>') : '');
    if (ui.recEmpId) {
      const e = empById(st.db, ui.recEmpId);
      const r = employeeRecords(st.db, e.id, day);
      html += '<h3>' + esc(e.emp_no + ' ' + e.name + '｜' + e.department + '｜' + e.job_title + '｜' + (e.active ? '在職' : '離職')) + '</h3>' +
        '<table class="data"><thead><tr><th>梯次日期</th><th>課程名稱</th><th>類別</th><th>時數</th><th>梯次狀態</th><th>結訓結果</th><th>備註</th></tr></thead><tbody>' +
        (r.rows.length ? r.rows.map(x => '<tr><td>' + x.session_date + '</td><td>' + esc(x.course_no + ' ' + x.course_name) + '</td><td>' + esc(x.category) + '</td><td>' + hoursText(x.hours) +
          '</td><td>' + badge(x.display_status) + '</td><td>' + badge(x.result) + '</td><td>' + esc(x.note || '') + '</td></tr>').join('') : '<tr><td colspan="7">沒有任何訓練紀錄</td></tr>') +
        '</tbody></table><p class="selected">累計完成時數：' + hoursText(r.total_hours) + ' 小時</p>';
    }
  } else {
    const cid = ui.recCourseId;
    html += '<div class="row"><label>課程 <select id="rc-course"><option value="">請選擇課程</option>' +
      st.db.courses.map(c => '<option value="' + c.id + '"' + (c.id === cid ? ' selected' : '') + '>' + esc(c.course_no + ' ' + c.name + (c.active ? '' : '（停用）')) + '</option>').join('') + '</select></label></div>';
    if (cid) {
      const rows = courseCompleters(st.db, cid);
      html += '<table class="data"><thead><tr><th>員工編號</th><th>姓名</th><th>部門</th><th>職稱</th><th>在職狀態</th><th>完成日期</th></tr></thead><tbody>' +
        (rows.length ? rows.map(r => '<tr><td>' + esc(r.emp_no) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.department) + '</td><td>' + esc(r.job_title) + '</td><td>' + (r.active ? '在職' : '離職') + '</td><td>' + r.completed_on + '</td></tr>').join('')
          : '<tr><td colspan="6">沒有人完成過這門課</td></tr>') + '</tbody></table><p class="hint">只列結訓結果為「已完成」的人，完成日期是梯次的上課日期。</p>';
    }
  }
  panel.innerHTML = html;
  $('#rec-emp', panel).addEventListener('click', () => { ui.recMode = 'emp'; rerenderComputer('rec-emp'); });
  $('#rec-course', panel).addEventListener('click', () => { ui.recMode = 'course'; rerenderComputer('rec-course'); });
  const fe = $('#f-emp', panel);
  if (fe) {
    $('#rq', panel).addEventListener('input', e => { ui.recQ = e.target.value; });
    fe.addEventListener('submit', e => {
      e.preventDefault();
      ui.recQ = $('#rq', panel).value;
      ui.recFound = findEmployees(st.db, ui.recQ);
      ui.recEmpId = null;
      ui.compMsg = null;
      if (!text(ui.recQ)) setMsg('info', '請輸入員工編號或姓名');
      advance(st, 1);
      addCoach(emit('empSearch', { q: ui.recQ, rows: ui.recFound.rows }));
      rerenderComputer('rq');
      render();
    });
  }
  $all('[data-hist]', panel).forEach(b => b.addEventListener('click', () => {
    ui.recEmpId = Number(b.dataset.hist);
    ui.compMsg = null;
    addCoach(emit('empHistory', { empId: ui.recEmpId }));
    rerenderComputer(b.id);
    render();
  }));
  const rc = $('#rc-course', panel);
  if (rc) rc.addEventListener('change', () => {
    ui.recCourseId = Number(rc.value) || null;
    ui.compMsg = null;
    if (ui.recCourseId) addCoach(emit('courseQuery', { courseId: ui.recCourseId }));
    rerenderComputer('rc-course');
    render();
  });
}

function renderEmployees(panel) {
  const rows = gameState.db.employees.slice().sort((a, b) => a.emp_no.localeCompare(b.emp_no));
  panel.innerHTML = '<table class="data"><thead><tr><th>員工編號</th><th>姓名</th><th>部門</th><th>職稱</th><th>到職日</th><th>角色</th><th>帳號狀態</th></tr></thead><tbody>' +
    rows.map(e => '<tr><td>' + esc(e.emp_no) + '</td><td>' + esc(e.name) + '</td><td>' + esc(e.department) + '</td><td>' + esc(e.job_title) + '</td><td>' + e.hire_date +
      '</td><td>' + (e.role === 0 ? '人資' : '員工') + '</td><td>' + (e.active ? '啟用' : '停用') + '</td></tr>').join('') +
    '</tbody></table><p class="hint">員工資料就是登入帳號。職稱是自由輸入的文字。本遊戲只顯示清單，不做帳號維護。</p>';
}

function renderCourses(panel) {
  const db = gameState.db;
  panel.innerHTML = '<table class="data"><thead><tr><th>課程編號</th><th>名稱</th><th>類別</th><th>時數</th><th>說明</th><th>狀態</th><th>已開梯次</th></tr></thead><tbody>' +
    db.courses.map(c => '<tr><td>' + esc(c.course_no) + '</td><td>' + esc(c.name) + '</td><td>' + esc(c.category) + '</td><td>' + hoursText(c.hours) + '</td><td>' + esc(c.description || '') +
      '</td><td>' + (c.active ? '啟用' : '停用') + '</td><td>' + db.sessions.filter(s => s.course_id === c.id).length + '</td></tr>').join('') +
    '</tbody></table><p class="hint">開過梯次的課程不能修改時數。本遊戲只顯示清單，不做課程維護。</p>';
}

/* phone: incoming calls only */
function openPhone() {
  const call = ctrl.phoneCall && ctrl.phoneCall(gameState);
  if (call) showTalk(call.lines, call.choices, { title: '電話分機（系統以外的人工作業）' });
  else showTalk([{ who: '電話', text: '目前沒有來電。電話聯絡不在系統裡，不會留下紀錄。' }], [], { title: '電話分機（系統以外的人工作業）' });
}

/* sign-in sheet rack */
function openRack() { openModal('簽到表架（紙本簽到表）', renderRack); }
function renderRack(body) {
  const st = gameState;
  const ro = !!ctrl.rackReadOnly;
  const codes = Object.keys(st.sheets).filter(c => st.sheets[c].where === 'rack').sort();
  const held = heldSheets(st);
  body.innerHTML = '<p class="hint">紙本簽到表放在哪裡由場景追蹤；系統沒有簽到功能，簽到表不會進系統。</p>' +
    '<div class="rack">' + codes.map(c => '<div class="slot filled"><b>' + c + '</b><span>' + esc(st.sheets[c].title) + '</span>' +
      (ro ? '' : '<button type="button" class="small" data-take="' + c + '">取出</button>') + '</div>').join('') + '</div>' +
    (ro ? '' : '<h3>你手上的簽到表</h3>' + (held.length ? held.map(c => '<button type="button" class="small" data-put="' + c + '">把 ' + c + ' 放回簽到表架</button>').join(' ') : '<p class="hint">（無）</p>'));
  $all('[data-take]', body).forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.take;
    st.sheets[c].where = 'player';
    Sound.sfx('card');
    if (ctrl.onRack) ctrl.onRack(st, 'take', c);
    log('從簽到表架取出 ' + c + '。', 'scene');
    renderRack(body);
    render();
  }));
  $all('[data-put]', body).forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.put;
    st.sheets[c].where = 'rack';
    Sound.sfx('card');
    if (ctrl.onRack) ctrl.onRack(st, 'put', c);
    log('把簽到表 ' + c + ' 放回簽到表架。', 'scene');
    renderRack(body);
    render();
    const first = $('button', body);
    if (first) first.focus();
  }));
}

/* employee kiosk (read-only view of the employee home page) */
function openKiosk() {
  const st = gameState;
  const rows = openSessions(st.db, today(st));
  openModal('員工報名電腦（員工端「可報名課程」畫面示意）', body => {
    body.innerHTML = '<p class="hint">這台電腦給員工用自己的帳號登入，報名或取消自己的報名。你是' + (ctrl.isCR ? '系統分析師' : '人資') + '，這裡只看畫面，不操作。</p>' +
      '<table class="data"><thead><tr><th>課程</th><th>類別</th><th>時數</th><th>上課日期</th><th>時間</th><th>地點</th><th>已報名／上限</th></tr></thead><tbody>' +
      (rows.length ? rows.map(r => '<tr><td>' + esc(r.course_name) + '</td><td>' + esc(r.category) + '</td><td>' + hoursText(r.hours) + '</td><td>' + r.session_date + '</td><td>' + r.start_time + '–' + r.end_time +
        '</td><td>' + esc(r.location) + '</td><td>' + r.enrolled + '／' + r.capacity + '</td></tr>').join('') : '<tr><td colspan="7">目前沒有可報名的梯次</td></tr>') +
      '</tbody></table><p class="hint">只列儲存狀態為「開放報名」且上課日期晚於今天的梯次。</p><div class="choices"><button type="button" id="k-ok">關閉</button></div>';
    $('#k-ok', body).addEventListener('click', () => closeModal());
  }, { size: 'wide' });
}

function openBoard() {
  openModal('公告欄', body => {
    body.innerHTML = (ctrl.board ? ctrl.board(gameState) : '<p class="hint">（目前沒有新公告）</p>') + '<div class="choices"><button type="button" id="b-ok">關閉</button></div>';
    $('#b-ok', body).addEventListener('click', () => closeModal());
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
  '<tr><th>E</th><td>和相鄰（優先面向）的角色或物件互動：人資電腦、電話分機、簽到表架、公告欄、員工報名電腦</td></tr>' +
  '<tr><th>Esc</th><td>關閉對話或表單；在場景中開啟暫停選單</td></tr>' +
  '<tr><th>滑鼠、Tab、Enter</th><td>操作表單、選單、對話與問題</td></tr>' +
  '<tr><th>音樂／音效</th><td>畫面右上角的兩個按鈕可以分別開關；設定只在這次遊玩有效</td></tr>' +
  '<tr><th>快捷移動</th><td>右側面板的按鈕，可直接移到用過的電腦、電話、簽到表架、報名電腦或講台</td></tr>' +
  '</tbody></table><p class="hint">角色頭上的「！」表示現在和他說話會有進展。所有人名、員工編號與課程資料都是虛構的。遊戲不連網、不儲存資料，重新整理就回到標題。</p>';

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
