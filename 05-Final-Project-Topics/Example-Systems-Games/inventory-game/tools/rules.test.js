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
function same(a, b, m) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); }
const NOW = '2027-11-30 10:00';
const MGR = 1, ME = 2, OTHER = 3, OFF_USER = 4;
const spot = { name: '十一月月底抽盤', count_type: '抽盤', counter_id: String(ME), item_ids: [2, 4, 7, 11] };

test('data: book quantities equal the sum of stock moves', () => {
  for (const db of [G.level1Data(), G.level2Data()]) {
    db.items.forEach(i => {
      const sum = db.stock_moves.filter(m => m.item_id === i.id).reduce((s, m) => s + m.qty_change, 0);
      assert.strictEqual(sum, i.book_qty, i.item_no);
    });
  }
});

test('signed uses + and the minus sign', () => {
  assert.strictEqual(G.signed(3), '+3');
  assert.strictEqual(G.signed(-2), '−2');
  assert.strictEqual(G.signed(0), '0');
});

test('A03 create and close are manager only; entry limited to assigned counter or manager', () => {
  const db = G.level1Data();
  const asStaff = G.createCount(db, spot, NOW, ME);
  assert.strictEqual(asStaff.ok, false);
  assert.strictEqual(asStaff.error, '只有主管可以使用這個功能');
  const c = G.createCount(db, spot, NOW, MGR);
  assert.ok(c.ok);
  const lineId = c.db.count_lines.find(l => l.count_id === c.count.id).id;
  const other = G.enterLine(c.db, lineId, { counted_qty: '1' }, NOW, OTHER);
  assert.strictEqual(other.error, '只有被指派的盤點人員或主管可以輸入');
  assert.ok(G.enterLine(c.db, lineId, { counted_qty: '1' }, NOW, ME).ok);
  assert.ok(G.enterLine(c.db, lineId, { counted_qty: '1' }, NOW, MGR).ok, 'manager may enter');
  assert.strictEqual(G.closeCount(c.db, c.count.id, NOW, ME).error, '只有主管可以使用這個功能');
  const cnt = c.count;
  assert.strictEqual(G.canEnter(cnt, G.userById(c.db, ME)), true);
  assert.strictEqual(G.canEnter(cnt, G.userById(c.db, OTHER)), false);
  assert.strictEqual(G.canClose(cnt, G.userById(c.db, ME)), false);
  assert.strictEqual(G.canClose(cnt, G.userById(c.db, MGR)), true);
});

test('A04 level 1: number, progress, difference, overwrite, close adjusts book', () => {
  let db = G.level1Data();
  const c = G.createCount(db, spot, NOW, MGR);
  assert.strictEqual(c.count.count_no, 'IC-2711-01');
  assert.strictEqual(c.message, '已建立盤點單 IC-2711-01，共 4 項');
  db = c.db;
  const count = () => G.countById(db, c.count.id);
  same(G.countSummary(db, count()).counted_count, 0);
  const lineFor = itemId => db.count_lines.find(l => l.count_id === c.count.id && l.item_id === itemId).id;
  const actual = { 2: 46, 4: 118, 7: 81, 11: 12 };
  [2, 4, 7].forEach(id => { const r = G.enterLine(db, lineFor(id), { counted_qty: String(actual[id]) }, NOW, ME); assert.ok(r.ok); db = r.db; });
  assert.strictEqual(G.countSummary(db, count()).counted_count, 3);
  const early = G.closeCount(db, c.count.id, NOW, MGR);
  assert.strictEqual(early.error, '還有 1 項沒有盤點，不能結案');
  assert.strictEqual(early.db.stock_moves.length, db.stock_moves.length);
  db = G.enterLine(db, lineFor(11), { counted_qty: '12' }, NOW, ME).db;
  // overwrite the hinge typo: quantity, counter and time are replaced
  const fix = G.enterLine(db, lineFor(7), { counted_qty: '18' }, '2027-11-30 11:00', ME);
  assert.strictEqual(fix.message, '已儲存 HW-3302：實盤 18，盤差 +3');
  db = fix.db;
  const hinge = db.count_lines.find(l => l.id === lineFor(7));
  same([hinge.counted_qty, hinge.counted_at], [18, '2027-11-30 11:00']);
  const lines = G.countLines(db, count());
  same(lines.map(l => l.location), ['A-02', 'B-01', 'C-02', 'D-02']);
  same(lines.map(l => l.diff), [0, -2, 3, 0]);
  const before = db.stock_moves.length;
  const closed = G.closeCount(db, c.count.id, '2027-11-30 16:00', MGR);
  assert.strictEqual(closed.message, '已結案 IC-2711-01，調整 2 個料號的帳面數量');
  db = closed.db;
  assert.strictEqual(db.stock_moves.length, before + 2);
  const adj = db.stock_moves.filter(m => m.count_id === c.count.id);
  same(adj.map(m => [m.item_id, m.qty_change, m.move_type, m.created_by]), [[7, 3, "盤點調整", MGR], [4, -2, "盤點調整", MGR]]);
  assert.strictEqual(G.itemById(db, 4).book_qty, 118);
  assert.strictEqual(G.itemById(db, 7).book_qty, 18);
  // closed count keeps its difference fixed even after later moves
  db = G.createMove(db, { item_id: 4, move_type: '出庫', qty: '8' }, '2027-12-01 09:00', ME).db;
  same(G.countLines(db, G.countById(db, c.count.id)).map(l => l.diff), [0, -2, 3, 0]);
  assert.strictEqual(G.enterLine(db, lineFor(2), { counted_qty: '1' }, NOW, MGR).error, '這張盤點單已結案，不能再輸入');
  assert.strictEqual(G.closeCount(db, c.count.id, NOW, MGR).error, '這張盤點單已結案');
  // next count in the same month
  assert.strictEqual(G.nextCountNo(db, '2027-11-30 17:00'), 'IC-2711-02');
  assert.strictEqual(G.nextCountNo(db, '2027-12-01 08:00'), 'IC-2712-01');
});

test('A05 create checks run in order and stop at the first error', () => {
  const db = G.level1Data();
  const cases = [
    [{ name: '' }, '請輸入盤點單名稱'],
    [{ name: 'x'.repeat(31) }, '盤點單名稱不可超過 30 字'],
    [{ count_type: '' }, '請選擇盤點類別'],
    [{ counter_id: '' }, '請選擇盤點人員'],
    [{ counter_id: String(OFF_USER) }, '盤點人員必須是啟用中的帳號'],
    [{ item_ids: [] }, '抽盤請至少選擇一個料號'],
    [{ item_ids: [99] }, '找不到這個料號'],
    [{ item_ids: [13] }, '料號 PK-4409 已停用，不能加入盤點']
  ];
  cases.forEach(([patch, msg]) => {
    const r = G.createCount(db, Object.assign({}, spot, patch), NOW, MGR);
    assert.strictEqual(r.error, msg);
    assert.strictEqual(r.db.counts.length, 1);
  });
  assert.ok(G.createCount(db, Object.assign({}, spot, { name: 'x'.repeat(30) }), NOW, MGR).ok);
  const first = G.createCount(db, spot, NOW, MGR).db;
  assert.strictEqual(G.createCount(first, Object.assign({}, spot, { item_ids: [1, 4] }), NOW, MGR).error, '料號 ST-2201 已在盤點單 IC-2711-01 盤點中');
  const full = G.createCount(db, { name: '全盤', count_type: '全盤', counter_id: '3' }, NOW, MGR);
  assert.strictEqual(full.db.count_lines.filter(l => l.count_id === full.count.id).length, 12, 'active items only');
});

test('A05 entry and move validation: no data change on failure', () => {
  let db = G.createCount(G.level1Data(), spot, NOW, MGR).db;
  const line = db.count_lines.find(l => l.count_id === 2).id;
  ['', '-1', '1.5', 'abc', '100000'].forEach(q => {
    const r = G.enterLine(db, line, { counted_qty: q }, NOW, ME);
    assert.strictEqual(r.error, '實盤數量須為 0 到 99999 的整數', q);
    assert.strictEqual(r.db.count_lines.find(l => l.id === line).counted_qty, null);
  });
  assert.ok(G.enterLine(db, line, { counted_qty: '0' }, NOW, ME).ok);
  assert.ok(G.enterLine(db, line, { counted_qty: '99999' }, NOW, ME).ok);
  assert.strictEqual(G.enterLine(db, line, { counted_qty: '1', remark: 'x'.repeat(101) }, NOW, ME).error, '差異說明不可超過 100 字');
  const moves = db.stock_moves.length;
  const bad = [
    [{ item_id: '' }, '請選擇料號'],
    [{ item_id: 13, move_type: '入庫', qty: '1' }, '料號 PK-4409 已停用，不能登錄異動'],
    [{ item_id: 10, move_type: '盤點調整', qty: '1' }, '請選擇異動類別'],
    [{ item_id: 10, move_type: '入庫', qty: '0' }, '數量須為 1 到 99999 的整數'],
    [{ item_id: 10, move_type: '出庫', qty: '241' }, '庫存不足：PK-4401 帳面只有 240 個'],
    [{ item_id: 10, move_type: '入庫', qty: '1', note: 'x'.repeat(51) }, '說明不可超過 50 字']
  ];
  bad.forEach(([input, msg]) => {
    const r = G.createMove(db, input, NOW, ME);
    assert.strictEqual(r.error, msg);
    assert.strictEqual(r.db.stock_moves.length, moves);
  });
  const ok = G.createMove(db, { item_id: 10, move_type: '出庫', qty: '240' }, NOW, ME);
  assert.strictEqual(ok.message, '已登錄出庫：PK-4401 −240，帳面 0');
});

test('A06 level 2: stock out is not blocked by an open count; difference follows the book now', () => {
  let db = G.level2Data();
  const count = G.countById(db, 3);
  assert.strictEqual(G.openCountOf(db, 10).count_no, 'IC-2712-01');
  const box = () => G.countLines(db, G.countById(db, 3)).find(l => l.item_id === 10);
  same([box().book, box().diff], [240, 0]);
  assert.strictEqual(G.createMove(db, { item_id: 10, move_type: '出庫', qty: '260' }, NOW, ME).error, '庫存不足：PK-4401 帳面只有 240 個');
  const out = G.createMove(db, { item_id: 10, move_type: '出庫', qty: '60', note: '出貨單 SO-1215-07' }, '2027-12-15 14:10', ME);
  assert.ok(out.ok, 'open count does not block');
  db = out.db;
  same([box().book, box().diff], [180, 60]);
  db = G.enterLine(db, 7, { counted_qty: '35' }, NOW, ME).db;
  db = G.enterLine(db, 8, { counted_qty: '22' }, NOW, ME).db;
  // branch A: close directly -> +60 adjustment, book back to 240
  const direct = G.closeCount(db, count.id, '2027-12-15 15:00', MGR);
  assert.strictEqual(direct.adjusted, 1);
  assert.strictEqual(G.itemById(direct.db, 10).book_qty, 240);
  assert.strictEqual(direct.db.stock_moves.filter(m => m.count_id === 3)[0].qty_change, 60);
  // branch B: recount and overwrite, then close -> no adjustment
  const re = G.enterLine(db, 9, { counted_qty: '180' }, '2027-12-15 14:40', ME);
  assert.strictEqual(re.message, '已儲存 PK-4401：實盤 180，盤差 0');
  const closed = G.closeCount(re.db, count.id, '2027-12-15 15:00', MGR);
  assert.strictEqual(closed.adjusted, 0);
  assert.strictEqual(G.itemById(closed.db, 10).book_qty, 180);
});

test('A08 fixed data resets to the same initial state; input db not mutated', () => {
  assert.strictEqual(JSON.stringify(G.level1Data()), JSON.stringify(G.level1Data()));
  assert.strictEqual(JSON.stringify(G.level2Data()), JSON.stringify(G.level2Data()));
  const db = G.level1Data();
  const snap = JSON.stringify(db);
  G.createCount(db, spot, NOW, MGR);
  G.createMove(db, { item_id: 10, move_type: '出庫', qty: '1' }, NOW, ME);
  assert.strictEqual(JSON.stringify(db), snap);
});

if (typeof G.crData === 'function') {
  test('final data: CR scenario books match moves; full count has one open line', () => {
    const db = G.crData();
    db.items.forEach(i => {
      const sum = db.stock_moves.filter(m => m.item_id === i.id).reduce((s, m) => s + m.qty_change, 0);
      assert.strictEqual(sum, i.book_qty, i.item_no);
    });
    const s = G.countSummary(db, G.countById(db, 4));
    same([s.line_count, s.counted_count], [12, 11]);
    assert.strictEqual(G.closeCount(db, 4, NOW, MGR).error, '還有 1 項沒有盤點，不能結案');
  });
}

console.log(passed + ' tests passed: ' + file);
