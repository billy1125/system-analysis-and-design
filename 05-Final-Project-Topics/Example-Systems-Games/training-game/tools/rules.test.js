// Rule tests for game.js pure functions. Run: node tools/rules.test.js [path/to/game.js]
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const file = process.argv[2] || path.join(__dirname, '..', 'game.js');
const G = {};
vm.createContext(G);
vm.runInContext(fs.readFileSync(file, 'utf8'), G);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }
// values come from another vm realm, so compare as JSON
function same(a, b, m) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); }
const NOW = '2027-03-01 09:10';
const good = { course_id: 1, session_date: '2027-03-10', start_time: '13:30', end_time: '16:30', location: '2F 訓練教室', instructor: '何文傑', capacity: '3' };
const withField = (k, v) => Object.assign({}, good, { [k]: v });

test('status is derived from the date; stored status keeps only 3 values', () => {
  const s = { status: '截止報名', session_date: '2027-03-10' };
  assert.strictEqual(G.displayStatus(s, '2027-03-09'), '截止報名');
  assert.strictEqual(G.displayStatus(s, '2027-03-10'), '今日上課');
  assert.strictEqual(G.displayStatus(s, '2027-03-11'), '已結束');
  assert.strictEqual(G.displayStatus({ status: '已取消', session_date: '2027-03-01' }, '2027-03-10'), '已取消');
  assert.strictEqual(G.isEnrollable({ status: '開放報名', session_date: '2027-03-10' }, '2027-03-09'), true);
  assert.strictEqual(G.isEnrollable({ status: '開放報名', session_date: '2027-03-10' }, '2027-03-10'), false, 'not on class day');
  assert.strictEqual(G.isEnrollable({ status: '截止報名', session_date: '2027-03-10' }, '2027-03-01'), false);
});

test('A03 create session: field checks, inactive course, failure adds nothing', () => {
  const db = G.level1Data();
  const n = db.sessions.length;
  const cases = [
    [withField('course_id', ''), '請選擇課程'],
    [withField('course_id', 7), '課程 TR-399 已停用，不能開設新梯次'],
    [withField('session_date', '2027/03/10'), '請輸入正確的上課日期'],
    [withField('session_date', '2027-02-30'), '請輸入正確的上課日期'],
    [withField('start_time', '1:30'), '請輸入開始與結束時間'],
    [withField('end_time', '13:30'), '結束時間必須晚於開始時間'],
    [withField('end_time', '12:00'), '結束時間必須晚於開始時間'],
    [withField('location', ''), '請輸入地點'],
    [withField('location', 'x'.repeat(31)), '地點不可超過 30 字'],
    [withField('instructor', ''), '請輸入講師'],
    [withField('instructor', 'x'.repeat(31)), '講師不可超過 30 字'],
    [withField('capacity', '0'), '人數上限須為 1 到 100 的整數'],
    [withField('capacity', '101'), '人數上限須為 1 到 100 的整數'],
    [withField('capacity', '2.5'), '人數上限須為 1 到 100 的整數'],
    [withField('capacity', ''), '人數上限須為 1 到 100 的整數']
  ];
  cases.forEach(([input, msg]) => {
    const r = G.createSession(db, input, 2, NOW);
    assert.strictEqual(r.ok, false, JSON.stringify(input));
    assert.strictEqual(r.error, msg);
    assert.strictEqual(r.db.sessions.length, n);
  });
  assert.ok(G.createSession(db, withField('capacity', '100'), 2, NOW).ok);
  const ok = G.createSession(db, good, 2, NOW);
  assert.ok(ok.ok);
  assert.strictEqual(ok.session.status, '開放報名');
  assert.strictEqual(db.sessions.length, n, 'input db not mutated');
});

test('A04 level 1: self and HR sign-up, count from rows, close, results, total hours', () => {
  let db = G.level1Data();
  let r = G.createSession(db, good, 2, NOW); db = r.db; const sid = r.session.id;
  r = G.enroll(db, sid, 6, 6, '2027-03-01', '2027-03-01 09:20'); assert.ok(r.ok); db = r.db;
  r = G.hrEnroll(db, sid, 4, 2, '2027-03-01', '2027-03-01 09:30'); assert.ok(r.ok); db = r.db;
  assert.strictEqual(r.message, '已替 許家豪 報名');
  const d = G.sessionDetail(db, sid, '2027-03-01');
  same(d.roster.map(x => [x.name, x.by_self]), [['許家豪', false], ['張書維', true]]);
  assert.strictEqual(G.enrolledCount(db, sid), 2);
  assert.ok(!('enrolled' in db.sessions.find(s => s.id === sid)), 'count is not stored');
  r = G.setSessionStatus(db, sid, '截止報名', '2027-03-09', '2027-03-09 08:31'); assert.ok(r.ok); db = r.db;
  const s = db.sessions.find(x => x.id === sid);
  assert.strictEqual(s.status, '截止報名');
  assert.strictEqual(G.displayStatus(s, '2027-03-10'), '今日上課');
  same(G.sessionDetail(db, sid, '2027-03-10').can, { edit: false, enroll: false, remove: false, record: true });
  const rows = G.sessionDetail(db, sid, '2027-03-10').roster.map(x => ({ id: x.id, result: '已完成', note: '' }));
  r = G.saveResults(db, sid, rows, 2, '2027-03-10', '2027-03-10 16:45'); assert.ok(r.ok); db = r.db;
  assert.strictEqual(r.message, '已儲存結訓結果（2 筆）');
  assert.ok(db.enrollments.filter(e => e.session_id === sid).every(e => e.result_by === 2 && e.result_at === '2027-03-10 16:45'));
  assert.strictEqual(G.employeeRecords(db, 6, '2027-03-10').total_hours, 5, 'TR-320 2h + TR-301 3h');
  assert.strictEqual(G.employeeRecords(db, 4, '2027-03-10').total_hours, 3);
});

test('A05 enroll checks in original order and messages; failure adds nothing', () => {
  let db = G.level1Data();
  let r = G.createSession(db, good, 2, NOW); db = r.db; const sid = r.session.id;
  const day = '2027-03-01';
  const n0 = db.enrollments.length;
  const chk = (res, msg) => { assert.strictEqual(res.ok, false); assert.strictEqual(res.error, msg); assert.strictEqual(res.db.enrollments.length, res.db === db ? n0 : res.db.enrollments.length); };
  chk(G.hrEnroll(db, sid, null, 2, day, NOW), '請選擇員工');
  chk(G.hrEnroll(db, sid, 15, 2, day, NOW), '只能替在職員工報名');
  chk(G.enroll(db, 999, 4, 2, day, NOW), '找不到這個梯次');
  chk(G.enroll(db, sid, 4, 2, '2027-03-10', NOW), '這個梯次目前不開放報名');
  db = G.enroll(db, sid, 4, 2, day, NOW).db;
  const n1 = db.enrollments.length;
  r = G.enroll(db, sid, 4, 2, day, NOW); assert.strictEqual(r.error, '已經報名過這個梯次'); assert.strictEqual(r.db.enrollments.length, n1);
  r = G.enroll(G.level2Data(), 5, 6, 6, '2027-04-12', NOW); assert.strictEqual(r.error, '已報名這門課 2027-04-14 的梯次，請先取消再報名');
  db = G.enroll(db, sid, 6, 6, day, NOW).db;
  db = G.enroll(db, sid, 3, 3, day, NOW).db;
  r = G.enroll(db, sid, 7, 7, day, NOW); assert.strictEqual(r.error, '這個梯次已額滿'); assert.strictEqual(r.db.enrollments.length, n1 + 2);
  // Order: inactive check comes before session checks for HR sign-up
  assert.strictEqual(G.hrEnroll(db, 999, 15, 2, day, NOW).error, '只能替在職員工報名');
  // Duplicate is checked before full
  assert.strictEqual(G.enroll(db, sid, 4, 2, day, NOW).error, '已經報名過這個梯次');
});

test('A06 level 2: cancel after deadline, remove deletes row, early record, remove on class day, re-test overwrites', () => {
  let db = G.level2Data();
  let r = G.cancelOwn(db, 7, 3, '2027-04-12'); assert.strictEqual(r.error, '已截止報名，無法取消，請洽人資');
  assert.strictEqual(G.cancelOwn(db, 7, 6, '2027-04-12').error, '找不到這筆報名', 'not own row');
  r = G.removeEnrollment(db, 2, 7, '2027-04-12'); assert.ok(r.ok); db = r.db;
  assert.strictEqual(db.enrollments.some(e => e.id === 7), false, 'row is deleted');
  assert.strictEqual(G.enrolledCount(db, 2), 3);
  r = G.saveResults(db, 2, [{ id: 6, result: '未完成', note: '' }], 2, '2027-04-13', '2027-04-13 16:05');
  assert.strictEqual(r.error, '上課日期當天起才能登錄結訓結果');
  r = G.saveResults(db, 2, [{ id: 6, result: '未完成', note: '請假' }, { id: 8, result: '已完成' }, { id: 9, result: '未完成' }], 2, '2027-04-14', '2027-04-14 13:30');
  assert.ok(r.ok); db = r.db;
  assert.strictEqual(G.removeEnrollment(db, 2, 6, '2027-04-14').error, '上課日期已到，不能移除報名');
  assert.strictEqual(G.employeeRecords(db, 9, '2027-04-28').total_hours, 2);
  r = G.saveResults(db, 2, [{ id: 6, result: '未完成', note: '請假' }, { id: 8, result: '已完成' }, { id: 9, result: '已完成', note: '4/27 補考通過' }], 2, '2027-04-28', '2027-04-28 10:05');
  assert.ok(r.ok); db = r.db;
  assert.strictEqual(r.message, '已儲存結訓結果（1 筆）', 'only changed rows are written');
  const y = db.enrollments.find(e => e.id === 9);
  assert.strictEqual(y.result_at, '2027-04-28 10:05');
  assert.strictEqual(db.enrollments.find(e => e.id === 8).result_at, '2027-04-14 13:30', 'unchanged row keeps old time');
  assert.strictEqual(G.employeeRecords(db, 9, '2027-04-28').total_hours, 6);
  assert.strictEqual(G.courseCompleters(db, 5).find(x => x.name === '楊凱翔').completed_on, '2027-04-14');
  assert.strictEqual(G.courseCompleters(db, 5).some(x => x.name === '周雅琪'), false, 'only completed rows');
});

test('results: blank skipped, cannot go back to blank, invalid value, note length, cancelled session', () => {
  let db = G.level2Data();
  let r = G.saveResults(db, 2, [{ id: 6, result: '' }], 2, '2027-04-14', NOW);
  assert.ok(r.ok); assert.strictEqual(r.message, '已儲存結訓結果（0 筆）');
  db = G.saveResults(db, 2, [{ id: 6, result: '未完成' }], 2, '2027-04-14', NOW).db;
  assert.strictEqual(G.saveResults(db, 2, [{ id: 6, result: '' }], 2, '2027-04-14', NOW).error, '結訓結果不正確');
  assert.strictEqual(G.saveResults(db, 2, [{ id: 6, result: '通過' }], 2, '2027-04-14', NOW).error, '結訓結果不正確');
  assert.strictEqual(G.saveResults(db, 2, [{ id: 6, result: '未完成', note: 'x'.repeat(101) }], 2, '2027-04-14', NOW).error, '備註不可超過 100 字');
  assert.strictEqual(G.saveResults(db, 2, [{ id: 99, result: '未完成' }], 2, '2027-04-14', NOW).error, '結訓結果不正確');
  let c = G.setSessionStatus(G.level2Data(), 5, '已取消', '2027-04-12', NOW).db;
  assert.strictEqual(G.saveResults(c, 5, [], 2, '2027-05-12', NOW).error, '已取消的梯次不能登錄結訓結果');
  assert.strictEqual(G.setSessionStatus(c, 5, '開放報名', '2027-04-12', NOW).error, '已取消的梯次不能再變更狀態');
});

test('session status and edit rules', () => {
  const db = G.level2Data();
  assert.strictEqual(G.setSessionStatus(db, 2, '開放報名', '2027-04-14', NOW).error, '上課日期已到，不能變更梯次狀態');
  assert.strictEqual(G.setSessionStatus(db, 5, '已結束', '2027-04-12', NOW).error, '梯次狀態不正確');
  const s2 = db.sessions.find(s => s.id === 2);
  const input = { session_date: s2.session_date, start_time: s2.start_time, end_time: s2.end_time, location: s2.location, instructor: s2.instructor, capacity: '3' };
  assert.strictEqual(G.updateSession(db, 2, input, '2027-04-12', NOW).error, '人數上限不可少於目前報名人數（4 人）');
  assert.ok(G.updateSession(db, 2, Object.assign({}, input, { capacity: '4' }), '2027-04-12', NOW).ok);
  assert.strictEqual(G.updateSession(db, 2, input, '2027-04-14', NOW).error, '上課日期已到，不能修改梯次資料');
});

test('queries and accounts', () => {
  const db = G.level1Data();
  same(G.findEmployees(db, 'e010').rows.map(e => e.emp_no), ['E0101', 'E0102', 'E0103']);
  assert.strictEqual(G.findEmployees(db, '李明德').rows.length, 1, 'includes inactive');
  assert.strictEqual(G.findEmployees(db, '不存在').message, '查無符合的員工');
  assert.strictEqual(G.findEmployees(db, '').rows.length, 0);
  assert.strictEqual(G.setEmployeeActive(db, 7, false, '2027-03-01', 2).error, '此員工還有 1 筆尚未上課的報名，請先移除後再停用');
  assert.strictEqual(G.setEmployeeActive(db, 2, false, '2027-03-01', 2).error, '不能停用自己的帳號');
  assert.ok(G.setEmployeeActive(db, 4, false, '2027-03-01', 2).ok);
  same(G.openSessions(db, '2027-03-01').map(s => s.id), [3]);
});

test('A08 fixed data resets to the same initial state', () => {
  assert.strictEqual(JSON.stringify(G.level1Data()), JSON.stringify(G.level1Data()));
  assert.strictEqual(JSON.stringify(G.level2Data()), JSON.stringify(G.level2Data()));
  if (typeof G.crData === 'function') assert.strictEqual(JSON.stringify(G.crData()), JSON.stringify(G.crData()));
});

if (typeof G.crData === 'function') {
  test('A09 CR-01 data shows the current gaps without new features', () => {
    const db = G.crData();
    const day = '2027-10-18';
    same(G.courseCompleters(db, 2).map(r => r.name), ['洪立偉', '蔡宗翰']);
    assert.strictEqual(G.enroll(db, 23, 9, 9, day, NOW).error, '這個梯次已額滿');
    same(G.sessionDetail(db, 23, day).roster.map(r => r.by_self), [true, false, true]);
    assert.strictEqual(G.employeeRecords(db, 11, day).rows.length, 0, 'pre-system training not recorded');
    const keys = Object.keys(db.courses[0]).join();
    assert.ok(!/valid|expire|period/.test(keys), 'no validity field on courses: ' + keys);
    assert.strictEqual(typeof G.exportCsv, 'undefined');
  });
}

console.log(passed + ' tests passed: ' + file);
