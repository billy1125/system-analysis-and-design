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
// values from the vm context come from another realm; compare as plain JSON
function deq(a, b, m) { assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m); }
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

const D1 = '2027-10-20';
const D2 = '2027-11-05';
const allNormal = n => Array.from({ length: n }, () => ({ result: '正常', remark: '' }));

test('date helpers', () => {
  assert.strictEqual(G.addDays('2027-09-22', 30), '2027-10-22');
  assert.strictEqual(G.addDays('2027-11-05', 30), '2027-12-05');
  assert.strictEqual(G.daysBetween('2027-11-05', '2027-10-28'), -8);
  assert.strictEqual(G.isDate('2027-02-29'), false);
  assert.strictEqual(G.isDate('2028-02-29'), true);
  assert.strictEqual(G.isDate('2027/10/20'), false);
});

test('A03 due list: derived values, summary ignores filters, inactive excluded, sort order', () => {
  const db = G.level1Data();
  const all = G.listDue(db, D1, {});
  deq([all.summary.overdue, all.summary.soon], [1, 2]);
  assert.ok(!all.rows.some(p => p.id === 7), 'plan on inactive equipment not listed');
  assert.ok(!all.rows.some(p => p.id === 8), 'inactive plan not listed');
  assert.strictEqual(all.rows.length, 6);
  const sorted = all.rows.map(p => p.next_due);
  deq(sorted, sorted.slice().sort());
  const p1 = all.rows.find(p => p.id === 1);
  deq([p1.last_done, p1.next_due, p1.days_left, p1.due_status], ['2027-09-22', '2027-10-22', 2, '即將到期']);
  const p4 = all.rows.find(p => p.id === 4);
  deq([p4.next_due, p4.days_left, p4.due_status], ['2027-10-25', 5, '即將到期']);
  const p5 = all.rows.find(p => p.id === 5);
  deq([p5.days_left, p5.due_status], [-5, '逾期']);
  assert.strictEqual(all.rows.find(p => p.id === 3).due_status, '未到期');
  const mine = G.listDue(db, D1, { owner: '3' });
  deq(mine.rows.map(p => p.id).sort(), [1, 4]);
  deq([mine.summary.overdue, mine.summary.soon], [1, 2], 'summary unchanged by filter');
  assert.strictEqual(G.listDue(db, D1, { status: '逾期' }).rows.length, 1);
  assert.strictEqual(G.listDue(db, D1, { line: '加工線' }).rows.length, 2);
  // first due date is used when there is no record
  const fresh = G.emptyDb(5);
  assert.strictEqual(G.listDue(fresh, D1, {}).rows.find(p => p.id === 1).next_due, '2027-05-25');
  // 7 days is still soon, 8 days is not
  assert.strictEqual(G.withDueState({ last_done: '2027-09-20', cycle_days: 30, first_due_date: '' }, '2027-10-13').due_status, '即將到期');
  assert.strictEqual(G.withDueState({ last_done: '2027-09-20', cycle_days: 30, first_due_date: '' }, '2027-10-12').due_status, '未到期');
  assert.strictEqual(G.daysText(0), '今天');
});

test('A04 level 1 records: items copied, record result derived, next due from done date', () => {
  let db = G.level1Data();
  const n0 = db.pm_records.length;
  let r = G.createRecord(db, 1, { doneDate: D1, note: '', items: allNormal(4) }, D1, 3, '2027-10-20 09:40');
  assert.ok(r.ok, r.errors.join());
  assert.strictEqual(r.nextDue, '2027-11-19');
  assert.strictEqual(r.message, '已登錄保養：EQ-101 月保養（2027-10-20），下次應保養日 2027-11-19');
  assert.strictEqual(db.pm_records.length, n0, 'input db not mutated');
  db = r.db;
  assert.strictEqual(G.recordResult(db, r.record.id), '正常');
  assert.strictEqual(r.record.note, null, 'empty note stored as null');
  const lathe = [{ result: '正常' }, { result: '異常', remark: '濃度 3%，已補充' }, { result: '正常' }, { result: '正常' }];
  r = G.createRecord(db, 4, { doneDate: D1, note: '', items: lathe }, D1, 3, '2027-10-20 11:00');
  assert.ok(r.ok);
  db = r.db;
  assert.strictEqual(G.recordResult(db, r.record.id), '有異常');
  const items = G.recordItems(db, r.record.id);
  deq(items.map(i => i.item), ['清潔切屑與排屑機', '檢查切削液濃度與液位', '檢查主軸潤滑油位', '檢查夾頭夾持力']);
  // later plan edit does not change the copied item text
  db.pm_plans.find(p => p.id === 4).items = '新項目一\n新項目二\n新項目三\n新項目四';
  assert.strictEqual(G.recordItems(db, r.record.id)[0].item, '清潔切屑與排屑機');
  const due = G.listDue(db, D1, {});
  assert.strictEqual(due.rows.find(p => p.id === 1).due_status, '未到期');
  assert.strictEqual(due.rows.find(p => p.id === 4).due_status, '未到期');
  deq([due.summary.overdue, due.summary.soon], [1, 0]);
  // partial result
  const part = G.createRecord(G.level1Data(), 4, { doneDate: D1, items: [{ result: '正常' }, { result: '未執行', remark: '缺料' }, { result: '正常' }, { result: '正常' }] }, D1, 3, 'x');
  assert.strictEqual(G.recordResult(part.db, part.record.id), '部分未執行');
});

test('A05 validation order and messages; failures add nothing', () => {
  const db = G.level1Data();
  const n0 = db.pm_records.length;
  const ok = { doneDate: D1, note: '', items: allNormal(4) };
  const cases = [
    [99, ok, '找不到這個保養計畫'],
    [8, Object.assign({}, ok, { items: allNormal(3) }), '這個保養計畫已停用，不能登錄保養'],
    [7, ok, '設備 EQ-103 已停用，不能登錄保養'],
    [1, Object.assign({}, ok, { doneDate: '2027-13-01' }), '請輸入正確的保養日期'],
    [1, Object.assign({}, ok, { doneDate: '' }), '請輸入正確的保養日期'],
    [1, Object.assign({}, ok, { doneDate: '2027-10-21' }), '保養日期不能晚於今天'],
    [1, Object.assign({}, ok, { doneDate: '2027-09-22' }), '保養日期必須晚於上一次保養日（2027-09-22）'],
    [1, Object.assign({}, ok, { items: allNormal(3) }), '保養項目已變更，請重新開啟這個頁面'],
    [1, Object.assign({}, ok, { items: [{ result: '正常' }, { result: '' }, { result: '正常' }, { result: '正常' }] }), '第 2 項還沒選結果'],
    [1, Object.assign({}, ok, { items: [{ result: '正常' }, { result: '正常' }, { result: '異常', remark: '  ' }, { result: '正常' }] }), '第 3 項為異常或未執行，請填寫說明'],
    [1, Object.assign({}, ok, { items: [{ result: '未執行' }, { result: '正常' }, { result: '正常' }, { result: '正常' }] }), '第 1 項為異常或未執行，請填寫說明'],
    [1, Object.assign({}, ok, { items: [{ result: '異常', remark: 'x'.repeat(101) }, { result: '正常' }, { result: '正常' }, { result: '正常' }] }), '第 1 項的說明不可超過 100 字'],
    [1, Object.assign({}, ok, { note: 'x'.repeat(201) }), '備註不可超過 200 字']
  ];
  cases.forEach(([planId, input, msg]) => {
    const r = G.createRecord(db, planId, input, D1, 3, 'now');
    assert.strictEqual(r.ok, false, msg);
    deq(r.errors, [msg]);
    assert.strictEqual(r.db.pm_records.length, n0);
  });
  // the first failing step wins: future date reported before missing results
  const both = G.createRecord(db, 1, { doneDate: '2027-10-21', items: allNormal(4).map(() => ({ result: '' })) }, D1, 3, 'now');
  deq(both.errors, ['保養日期不能晚於今天']);
  // limits are inclusive
  const edge = G.createRecord(db, 1, { doneDate: D1, note: 'x'.repeat(200), items: [{ result: '異常', remark: 'y'.repeat(100) }, { result: '正常' }, { result: '正常' }, { result: '正常' }] }, D1, 3, 'now');
  assert.ok(edge.ok);
  // any user can record any active plan (no owner check)
  assert.ok(G.createRecord(db, 5, { doneDate: D1, items: allNormal(4) }, D1, 3, 'now').ok);
});

test('A06 level 2: overdue 8 days, recorded today, next due 12-05, no overdue trace', () => {
  let db = G.level2Data();
  const before = G.listDue(db, D2, {});
  const p3 = before.rows.find(p => p.id === 3);
  deq([p3.next_due, p3.days_left, p3.due_status, p3.owner_id], ['2027-10-28', -8, '逾期', 3]);
  deq([before.summary.overdue, before.summary.soon], [1, 1]);
  assert.strictEqual(G.createRecord(db, 3, { doneDate: '2027-11-06', items: allNormal(4) }, D2, 3, 'now').errors[0], '保養日期不能晚於今天');
  const r = G.createRecord(db, 3, { doneDate: D2, note: '沖壓線趕貨，下午才停機', items: allNormal(4) }, D2, 3, '2027-11-05 15:10');
  assert.ok(r.ok);
  assert.strictEqual(r.nextDue, '2027-12-05');
  db = r.db;
  const after = G.planState(db, 3, D2);
  deq([after.due_status, after.days_left], ['未到期', 30]);
  const eq = db.equipment.find(e => e.equip_no === 'EQ-102');
  const h = G.equipmentHistory(db, eq.id, D2);
  deq(Object.keys(h.records[0]).filter(k => /due|overdue|plan_date/.test(k)), [], 'record has no due or overdue field');
  assert.strictEqual(h.records[0].done_date, D2);
  assert.strictEqual(h.records[0].note, '沖壓線趕貨，下午才停機');
  // the original-date backfill would be accepted by the rules
  const back = G.createRecord(G.level2Data(), 3, { doneDate: '2027-10-28', items: allNormal(4) }, D2, 3, 'now');
  assert.ok(back.ok);
  assert.strictEqual(back.nextDue, '2027-11-27');
});

test('record search: range, equipment, worker, result; sorted newest first', () => {
  const db = G.level1Data();
  const q3 = G.listRecords(db, { from: '2027-07-01', to: '2027-09-30' });
  assert.ok(q3.every(r => r.done_date >= '2027-07-01' && r.done_date <= '2027-09-30'));
  assert.strictEqual(q3.length, 11);
  const ds = q3.map(r => r.done_date);
  deq(ds, ds.slice().sort().reverse());
  assert.ok(G.listRecords(db, { equipment: '4' }).every(r => r.equip_no === 'EQ-201'));
  assert.ok(G.listRecords(db, { doneBy: '4' }).every(r => r.done_by_name === '王怡婷'));
  assert.strictEqual(G.listRecords(db, { result: '有異常' }).length, 0);
  assert.strictEqual(G.listRecords(db, { from: 'bad' }).length, db.pm_records.length, 'invalid date ignored');
});

test('A08 fixed data resets to the same initial state', () => {
  assert.strictEqual(JSON.stringify(G.level1Data()), JSON.stringify(G.level1Data()));
  assert.strictEqual(JSON.stringify(G.level2Data()), JSON.stringify(G.level2Data()));
  if (G.crData) assert.strictEqual(JSON.stringify(G.crData()), JSON.stringify(G.crData()));
});

if (G.crData) {
  test('A09 CR-01 data: overdue plan disappears after a record, Q3 count only', () => {
    let db = G.crData();
    const D = '2027-11-10';
    const before = G.listDue(db, D, { status: '逾期' }).rows.map(p => p.equip_no);
    deq(before, ['EQ-202']);
    assert.strictEqual(G.planState(db, 3, D).next_due, '2027-12-05');
    const r = G.createRecord(db, 5, { doneDate: D, items: allNormal(4) }, D, 4, 'now');
    db = r.db;
    assert.strictEqual(G.listDue(db, D, {}).summary.overdue, 0);
    assert.strictEqual(G.listRecords(db, { from: '2027-07-01', to: '2027-09-30' }).length, 15);
  });
}

console.log(passed + ' tests passed: ' + file);
