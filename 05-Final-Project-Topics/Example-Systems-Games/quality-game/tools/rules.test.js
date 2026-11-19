// Rule tests for game.js pure functions. Run: node tools/rules.test.js [path/to/game.js]
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const file = process.argv[2] || path.join(__dirname, '..', 'game.js');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
const G = ctx;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }
const NOW = '2027-11-05 09:00';
const TODAY = '2027-11-05';

function goodInput(over) {
  return Object.assign({
    found_at: '2027-11-05T08:10', reporter: '鄭國良', line: '射出一線', station: '射出機 #05', product_id: '1',
    lot_no: 'L271105-01', defect_type_id: '2', description: '車燈外殼分模線有毛邊', qty: '80'
  }, over || {});
}

test('A03 register: number from registration month, status 待處理, reporter is text, created_by is the user', () => {
  const db = G.level1Data();
  const r = G.createIssue(db, goodInput(), NOW, 1);
  assert.ok(r.ok);
  assert.strictEqual(r.issue.issue_no, 'QI-2711-003');
  assert.strictEqual(r.issue.status, '待處理');
  assert.strictEqual(r.issue.reporter, '鄭國良');
  assert.strictEqual(r.issue.created_by, 1);
  assert.strictEqual(r.issue.found_at, '2027-11-05 08:10');
  assert.strictEqual(r.message, '已登記異常單 QI-2711-003');
  assert.strictEqual(db.issues.length, 3, 'input db not mutated');
  const s = G.summarizeOpen(r.db);
  assert.deepStrictEqual([s.pending, s.working], [2, 1]);
  // number uses the registration date, not the found date
  const r2 = G.createIssue(r.db, goodInput({ found_at: '2027-10-30T10:00' }), NOW, 1);
  assert.strictEqual(r2.issue.issue_no, 'QI-2711-004');
  const r3 = G.createIssue(r.db, goodInput(), '2027-12-01 08:00', 1);
  assert.strictEqual(r3.issue.issue_no, 'QI-2712-001');
  // no duplicate check: same content can be registered twice
  assert.ok(G.createIssue(r.db, goodInput(), NOW, 1).ok);
});

test('A04 field checks stop at the first error, in the original order', () => {
  const db = G.level1Data();
  const cases = [
    [{ found_at: '' }, '請輸入正確的發現時間'],
    [{ found_at: '2027-02-30T08:00' }, '請輸入正確的發現時間'],
    [{ found_at: '2027-11-05T09:01' }, '發現時間不能晚於現在'],
    [{ reporter: ' ' }, '請輸入回報人'],
    [{ reporter: 'x'.repeat(21) }, '回報人不可超過 20 字'],
    [{ line: '' }, '請輸入產線'],
    [{ line: 'x'.repeat(21) }, '產線不可超過 20 字'],
    [{ station: 'x'.repeat(31) }, '工站或機台不可超過 30 字'],
    [{ product_id: '' }, '請選擇產品'],
    [{ product_id: '6' }, '產品 AP-5099 已停用，請重新選擇'],
    [{ lot_no: 'x'.repeat(21) }, '批號不可超過 20 字'],
    [{ defect_type_id: '' }, '請選擇異常類別'],
    [{ defect_type_id: '6' }, '異常類別「包裝不良」已停用，請重新選擇'],
    [{ description: '' }, '請輸入異常描述'],
    [{ description: 'x'.repeat(201) }, '異常描述不可超過 200 字'],
    [{ qty: '' }, '影響數量須為 0 到 99999 的整數'],
    [{ qty: '100000' }, '影響數量須為 0 到 99999 的整數'],
    [{ qty: '1.5' }, '影響數量須為 0 到 99999 的整數'],
    [{ qty: '-1' }, '影響數量須為 0 到 99999 的整數']
  ];
  cases.forEach(([over, msg]) => {
    const r = G.createIssue(db, goodInput(over), NOW, 1);
    assert.strictEqual(r.ok, false, JSON.stringify(over));
    assert.deepStrictEqual(Array.from(r.errors), [msg]);
    assert.strictEqual(r.db.issues.length, 3);
  });
  // several bad fields: only the first one is reported
  const multi = G.createIssue(db, goodInput({ reporter: '', line: '', defect_type_id: '' }), NOW, 1);
  assert.deepStrictEqual(Array.from(multi.errors), ['請輸入回報人']);
  // boundaries pass
  assert.ok(G.createIssue(db, goodInput({ found_at: '2027-11-05T09:00', reporter: 'x'.repeat(20), station: '', lot_no: '', qty: '0' }), NOW, 1).ok);
  assert.ok(G.createIssue(db, goodInput({ qty: '99999', description: 'x'.repeat(200) }), NOW, 1).ok);
});

test('A04 edit keeps a disabled product or type that the issue already had; edit writes updated_at', () => {
  let db = G.level1Data();
  db.products.find(p => p.id === 4).active = false;
  const issue = db.issues.find(i => i.id === 1);
  const input = { found_at: issue.found_at, reporter: issue.reporter, line: issue.line, station: issue.station, product_id: '4', lot_no: '', defect_type_id: '2', description: issue.description, qty: '13' };
  const r = G.updateIssue(db, 1, input, NOW);
  assert.ok(r.ok);
  assert.strictEqual(r.issue.updated_at, NOW);
  assert.strictEqual(r.issue.qty, 13);
  const other = G.createIssue(db, goodInput({ product_id: '4' }), NOW, 1);
  assert.deepStrictEqual(Array.from(other.errors), ['產品 AP-5302 已停用，請重新選擇']);
});

test('A05 refusals do not change data', () => {
  let db = G.level2Data();
  const same = G.assignIssue(db, 1, 2, NOW, 1);
  assert.deepStrictEqual(Array.from(same.errors), ['責任單位沒有變更']);
  assert.strictEqual(same.db.issues.find(i => i.id === 1).assigned_at, '2027-11-03 15:10');
  assert.deepStrictEqual(Array.from(G.assignIssue(db, 1, '', NOW, 1).errors), ['請選擇責任單位']);
  assert.deepStrictEqual(Array.from(G.assignIssue(db, 1, 6, NOW, 1).errors), ['責任單位「外包管理課」已停用，請重新選擇']);
  assert.deepStrictEqual(Array.from(G.closeIssue(db, 1, '  ', NOW, 1).errors), ['請輸入處理對策']);
  assert.deepStrictEqual(Array.from(G.closeIssue(db, 1, 'x'.repeat(201), NOW, 1).errors), ['處理對策不可超過 200 字']);
  assert.deepStrictEqual(Array.from(G.closeIssue(db, 2, '對策', NOW, 1).errors), ['只有處理中的異常單可以結案']);
  assert.deepStrictEqual(Array.from(G.rejectIssue(db, 2, '', NOW, 1).errors), ['請輸入不成立的理由']);
  assert.deepStrictEqual(Array.from(G.rejectIssue(db, 2, 'x'.repeat(201), NOW, 1).errors), ['不成立的理由不可超過 200 字']);
  assert.deepStrictEqual(Array.from(G.assignIssue(db, 99, 1, NOW, 1).errors), ['找不到這張異常單']);
  // terminal states: closed issue 3 cannot be edited, assigned, closed or rejected
  assert.deepStrictEqual(Array.from(G.updateIssue(db, 3, goodInput(), NOW).errors), ['這張異常單已結案或判定不成立，不能修改']);
  assert.deepStrictEqual(Array.from(G.assignIssue(db, 3, 1, NOW, 1).errors), ['這張異常單已結案或判定不成立，不能指派']);
  assert.deepStrictEqual(Array.from(G.closeIssue(db, 3, '對策', NOW, 1).errors), ['只有處理中的異常單可以結案']);
  assert.deepStrictEqual(Array.from(G.rejectIssue(db, 3, '理由', NOW, 1).errors), ['這張異常單已結案或判定不成立']);
  assert.strictEqual(G.actionsFor('已結案').length, 0);
  assert.strictEqual(G.actionsFor('不成立').length, 0);
  assert.deepStrictEqual(Array.from(G.actionsFor('待處理'), a => a[1]), ['修改', '指派', '判定不成立']);
  assert.deepStrictEqual(Array.from(G.actionsFor('處理中'), a => a[1]), ['修改', '改派', '結案', '判定不成立']);
  assert.strictEqual(JSON.stringify(db), JSON.stringify(G.level2Data()), 'no change after refusals');
});

test('A03 level 1 flow: assign makes 處理中, close writes closer and time, no updated_at', () => {
  let db = G.level1Data();
  let r = G.createIssue(db, goodInput(), NOW, 1); db = r.db;
  const id = r.issue.id;
  r = G.assignIssue(db, id, '1', '2027-11-05 09:10', 1); db = r.db;
  assert.strictEqual(r.message, '已指派給 製造一課');
  assert.strictEqual(r.issue.status, '處理中');
  assert.strictEqual(r.issue.assigned_at, '2027-11-05 09:10');
  r = G.closeIssue(db, id, '調整保壓時間', '2027-11-05 14:25', 1); db = r.db;
  assert.strictEqual(r.message, '已結案 QI-2711-003');
  assert.strictEqual(r.issue.status, '已結案');
  assert.strictEqual(r.issue.closed_at, '2027-11-05 14:25');
  assert.strictEqual(r.issue.updated_at, null, 'assign and close do not write updated_at');
  const s = G.summarizeOpen(db);
  assert.deepStrictEqual([s.pending, s.working], [1, 1]);
});

test('A06 reassign overwrites department, assigner and time; status stays; reject keeps department', () => {
  let db = G.level2Data();
  const r = G.assignIssue(db, 1, 5, '2027-11-05 09:20', 1);
  assert.ok(r.ok && r.reassign);
  assert.strictEqual(r.message, '已改派給 採購課');
  assert.strictEqual(r.issue.dept_id, 5);
  assert.strictEqual(r.issue.assigned_at, '2027-11-05 09:20');
  assert.strictEqual(r.issue.status, '處理中');
  assert.ok(!('history' in r.issue));
  assert.strictEqual(G.issueDays(r.issue, TODAY), 2, 'days still from found date');
  db = r.db;
  const j = G.rejectIssue(db, 2, '卡尺未歸零', '2027-11-05 09:40', 1);
  assert.strictEqual(j.issue.status, '不成立');
  assert.strictEqual(j.issue.resolution, '卡尺未歸零');
  assert.strictEqual(j.issue.dept_id, null);
  assert.strictEqual(j.message, '已判定 QI-2711-002 不成立');
  // reject on an assigned issue keeps the department
  const k = G.rejectIssue(db, 1, '理由', '2027-11-05 09:40', 1);
  assert.strictEqual(k.issue.dept_id, 5);
});

test('A07 elapsed days: open to the simulated date, finished to the closing date', () => {
  const db = G.level2Data();
  assert.strictEqual(G.issueDays(db.issues[0], '2027-11-05'), 2);
  assert.strictEqual(G.issueDays(db.issues[0], '2027-11-30'), 27);
  assert.strictEqual(G.issueDays(db.issues[2], '2027-11-30'), 2, 'closed: 10-20 to 10-22');
  assert.ok(!('days' in db.issues[0]), 'not stored');
});

test('open list and search rules', () => {
  const db = G.level1Data();
  const all = G.listOpen(db, {}, TODAY);
  assert.deepStrictEqual(Array.from(all.rows, r => r.issue_no), ['QI-2711-002', 'QI-2711-001'], 'open only, by found time');
  const f = G.listOpen(db, { status: '處理中' }, TODAY);
  assert.strictEqual(f.rows.length, 1);
  assert.deepStrictEqual([f.summary.pending, f.summary.working], [1, 1], 'summary ignores filters');
  assert.strictEqual(G.searchIssues(db, { keyword: '刮傷' }, TODAY).rows.length, 1);
  assert.strictEqual(G.searchIssues(db, { keyword: '射出三線' }, TODAY).rows.length, 0, 'keyword only matches description');
  assert.deepStrictEqual(Array.from(G.searchIssues(db, { from: '2027-11-05', to: '2027-11-01' }, TODAY).errors), ['起始日期不可晚於結束日期']);
  assert.deepStrictEqual(Array.from(G.searchIssues(db, {}, TODAY).rows, r => r.issue_no), ['QI-2711-001', 'QI-2711-002', 'QI-2710-006'], 'newest first');
});

if (typeof G.cr01Data === 'function') {
  test('CR-01 data: keyword 毛邊 gives three issues, same product and machine; 6-day gap on QI-2710-005', () => {
    const db = G.cr01Data();
    const r = G.searchIssues(db, { keyword: '毛邊' }, '2027-11-08');
    assert.strictEqual(r.rows.length, 3);
    assert.ok(r.rows.every(x => x.product_id === 1 && x.station === '射出機 #05'));
    assert.strictEqual(r.rows.filter(x => x.status === '已結案').length, 2);
    const b = db.issues.find(i => i.issue_no === 'QI-2710-005');
    assert.strictEqual(G.daysBetween(b.found_at.slice(0, 10), b.assigned_at.slice(0, 10)), 6);
  });
}

test('A09 fixed data resets to the same initial state', () => {
  assert.strictEqual(JSON.stringify(G.level1Data()), JSON.stringify(G.level1Data()));
  assert.strictEqual(JSON.stringify(G.level2Data()), JSON.stringify(G.level2Data()));
});

console.log(passed + ' tests passed: ' + file);
