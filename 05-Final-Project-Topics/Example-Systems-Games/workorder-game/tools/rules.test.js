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

const NOW = '2027-10-04 08:10';
const U = db => ({ planner: G.userById(db, 2), day: G.userById(db, 3), night: G.userById(db, 4), mill: G.userById(db, 5) });
const good = { so_no: 'SO-27-0412', product_id: '1', qty: '300', due_date: '2027-10-09', note: '' };

test('map rows are all 20 wide', () => {
  const rows = vm.runInContext('MAP_ROWS', ctx);
  rows.forEach(r => assert.strictEqual(r.length, 20, r));
});

test('A03 create: field checks in original order, one message each, no data change on failure', () => {
  const db = G.level1Data();
  const u = U(db).planner;
  const cases = [
    [{ so_no: 'x'.repeat(21) }, '訂單號不可超過 20 字'],
    [{ product_id: '' }, '請選擇產品'],
    [{ product_id: '7' }, '產品 BP-0901 已停用，請重新選擇'],
    [{ qty: '0' }, '數量須為 1 到 99999 的整數'],
    [{ qty: '100000' }, '數量須為 1 到 99999 的整數'],
    [{ qty: '1.5' }, '數量須為 1 到 99999 的整數'],
    [{ due_date: '2027-02-30' }, '請輸入正確的交期'],
    [{ due_date: '2027-10-03' }, '交期不能早於開立日期（2027-10-04）'],
    [{ note: 'x'.repeat(201) }, '備註不可超過 200 字'],
    [{ qty: '0', product_id: '' }, '請選擇產品']
  ];
  cases.forEach(([patch, msg]) => {
    const r = G.createOrder(db, Object.assign({}, good, patch), u, NOW);
    assert.strictEqual(r.ok, false, JSON.stringify(patch));
    assert.deepStrictEqual(Array.from(r.errors), [msg]);
    assert.strictEqual(r.db.work_orders.length, 3);
  });
  const lead = G.createOrder(db, good, U(db).day, NOW);
  assert.deepStrictEqual(Array.from(lead.errors), ['只有生管人員可以使用這個功能']);
  assert.ok(G.createOrder(db, Object.assign({}, good, { so_no: '', due_date: '2027-10-04', qty: '99999', note: 'x'.repeat(200) }), u, NOW).ok);
});

test('A03 order number WO-YYMMDD-NN by creation day and daily sequence; new order is 待派工', () => {
  let db = G.level1Data();
  const u = U(db).planner;
  const r1 = G.createOrder(db, good, u, NOW); db = r1.db;
  const r2 = G.createOrder(db, good, u, '2027-10-04 09:00'); db = r2.db;
  const r3 = G.createOrder(db, good, u, '2027-10-05 09:00');
  assert.strictEqual(r1.order.wo_no, 'WO-271004-01');
  assert.strictEqual(r2.order.wo_no, 'WO-271004-02');
  assert.strictEqual(r3.order.wo_no, 'WO-271005-01');
  assert.strictEqual(r1.order.status, '待派工');
  assert.strictEqual(r1.message, '已開立工單 WO-271004-01');
  assert.strictEqual(r1.order.so_no, 'SO-27-0412');
  assert.strictEqual(r1.order.note, null);
});

test('edit: only 待派工/已派工, keeps disabled own product, writes updated_at only on edit', () => {
  let db = G.level1Data();
  const u = U(db).planner;
  db.products.find(p => p.id === 7).active = true;
  db = G.createOrder(db, Object.assign({}, good, { product_id: '7' }), u, NOW).db;
  db.products.find(p => p.id === 7).active = false;
  const id = db.work_orders.length;
  const e1 = G.updateOrder(db, id, Object.assign({}, good, { product_id: '7', qty: '310' }), u, '2027-10-04 09:00');
  assert.ok(e1.ok, e1.errors);
  assert.strictEqual(e1.order.updated_at, '2027-10-04 09:00');
  assert.strictEqual(e1.order.status, '待派工');
  const d = G.dispatchOrder(e1.db, id, { work_center_id: '1', plan_date: '2027-10-04' }, u, '2027-10-04 09:10');
  assert.strictEqual(d.order.updated_at, '2027-10-04 09:00', 'dispatch does not touch updated_at');
  const done = G.updateOrder(db, 1, good, u, NOW);
  assert.deepStrictEqual(Array.from(done.errors), ['這張工單已開工、完工或取消，不能修改']);
  const early = G.updateOrder(e1.db, id, Object.assign({}, good, { due_date: '2027-10-03' }), u, NOW);
  assert.deepStrictEqual(Array.from(early.errors), ['交期不能早於開立日期（2027-10-04）']);
});

test('A04 level 1 full flow: dispatch, start, finish, derived due status and yield', () => {
  let db = G.level1Data();
  const { planner, day } = U(db);
  const c = G.createOrder(db, good, planner, NOW); db = c.db;
  const id = c.order.id;
  const d = G.dispatchOrder(db, id, { work_center_id: '1', plan_date: '2027-10-04' }, planner, '2027-10-04 08:20'); db = d.db;
  assert.strictEqual(d.message, '已派工給 CNC 車削組，預定 2027-10-04 生產');
  assert.strictEqual(d.order.status, '已派工');
  assert.strictEqual(d.order.dispatched_by, 2);
  const s = G.startOrder(db, id, day, '2027-10-04 08:40'); db = s.db;
  assert.strictEqual(s.order.status, '生產中');
  assert.strictEqual(s.order.started_by, 3);
  let j = G.joinOrder(db, G.findOrder(db, id), '2027-10-04');
  assert.strictEqual(j.due_status, '剩 5 天');
  assert.strictEqual(j.yield_rate, '');
  assert.strictEqual(j.good_qty, null);
  const f = G.finishOrder(db, id, { good_qty: '298', ng_qty: '2', close_note: '不良 2 件為外徑尺寸超差' }, day, '2027-10-04 16:40'); db = f.db;
  assert.ok(f.ok);
  j = G.joinOrder(db, G.findOrder(db, id), '2027-10-20');
  assert.strictEqual(j.status, '已完工');
  assert.strictEqual(j.due_status, '準時', 'finished: compares with finish date, not today');
  assert.strictEqual(j.yield_rate, '99.3%');
  assert.strictEqual(j.closed_by_name, '陳俊男');
  assert.ok(!('due_status' in G.findOrder(db, id)), 'derived values are not stored');
});

test('derived due status follows today for open orders; late finish shows delay', () => {
  const o = G.mkOrder({ status: '生產中', due_date: '2027-10-07' });
  assert.strictEqual(G.withDerived(o, '2027-10-04').due_status, '剩 3 天');
  assert.strictEqual(G.withDerived(o, '2027-10-09').due_status, '逾期 2 天');
  assert.strictEqual(G.withDerived(o, '2027-10-09').overdue, true);
  const late = G.mkOrder({ status: '已完工', due_date: '2027-10-07', closed_at: '2027-10-10 10:00', good_qty: 10, ng_qty: 0 });
  assert.strictEqual(G.withDerived(late, '2027-11-01').due_status, '延遲 3 天');
  assert.strictEqual(G.withDerived(late, '2027-11-01').yield_rate, '100.0%');
  assert.strictEqual(G.withDerived(G.mkOrder({ status: '已取消', due_date: '2027-10-07' }), '2027-10-04').due_status, '');
});

test('A05 permissions: planner and other-center leader rejected; another leader of same center accepted', () => {
  let db = G.level2Data();
  const { planner, day, night, mill } = U(db);
  const msg = '只有這張工單所屬工作中心的組長可以回報';
  assert.deepStrictEqual(Array.from(G.startOrder(db, 1, planner, NOW).errors), [msg]);
  assert.deepStrictEqual(Array.from(G.startOrder(db, 1, mill, NOW).errors), [msg]);
  assert.deepStrictEqual(Array.from(G.finishOrder(db, 1, {}, planner, NOW).errors), [msg], 'own-center check comes before status');
  const s = G.startOrder(db, 1, night, '2027-10-05 20:01'); db = s.db;
  assert.ok(s.ok);
  assert.deepStrictEqual(Array.from(G.finishOrder(db, 1, { good_qty: '1', ng_qty: '0' }, mill, NOW).errors), [msg]);
  const f = G.finishOrder(db, 1, { good_qty: '592', ng_qty: '8', close_note: '夜班 282、早班 310' }, day, '2027-10-06 15:40');
  assert.ok(f.ok);
  assert.strictEqual(f.order.started_by, 4);
  assert.strictEqual(f.order.closed_by, 3);
  ['dispatchOrder', 'cancelOrder', 'updateOrder'].forEach(fn => {
    assert.deepStrictEqual(Array.from(G[fn](G.level2Data(), 1, {}, day, NOW).errors), ['只有生管人員可以使用這個功能'], fn);
  });
});

test('A06 invalid input and state errors leave data unchanged', () => {
  let db = G.level2Data();
  const { planner, day, night } = U(db);
  const same = G.dispatchOrder(db, 1, { work_center_id: '1', plan_date: '2027-10-04' }, planner, '2027-10-04 13:40');
  assert.deepStrictEqual(Array.from(same.errors), ['派工內容沒有變更']);
  assert.deepStrictEqual(Array.from(G.dispatchOrder(db, 1, { work_center_id: '1', plan_date: '2027-10-03' }, planner, '2027-10-04 13:40').errors), ['預定生產日不能早於今天']);
  assert.deepStrictEqual(Array.from(G.dispatchOrder(db, 1, { work_center_id: '', plan_date: '2027-10-05' }, planner, NOW).errors), ['請選擇工作中心']);
  assert.deepStrictEqual(Array.from(G.dispatchOrder(db, 1, { work_center_id: '4', plan_date: '2027-10-05' }, planner, NOW).errors), ['工作中心「傳統車床組」已停用，請重新選擇']);
  assert.deepStrictEqual(Array.from(G.dispatchOrder(db, 1, { work_center_id: '1', plan_date: '2027-13-01' }, planner, NOW).errors), ['請輸入正確的預定生產日']);
  assert.deepStrictEqual(Array.from(G.startOrder(db, 3, U(db).mill, NOW).errors), ['只有已派工的工單可以開工']);
  db = G.startOrder(db, 1, night, '2027-10-05 20:01').db;
  const snapshot = JSON.stringify(db);
  const bad = [
    [{ good_qty: '', ng_qty: '0' }, '良品數須為 0 到 99999 的整數'],
    [{ good_qty: '1', ng_qty: '-1' }, '不良數須為 0 到 99999 的整數'],
    [{ good_qty: '0', ng_qty: '0' }, '良品數與不良數不能都是 0'],
    [{ good_qty: '592', ng_qty: '8', close_note: '' }, '有不良品時請在完工備註說明原因'],
    [{ good_qty: '592', ng_qty: '0', close_note: 'x'.repeat(201) }, '完工備註不可超過 200 字']
  ];
  bad.forEach(([body, msg]) => {
    const r = G.finishOrder(db, 1, body, day, NOW);
    assert.deepStrictEqual(Array.from(r.errors), [msg], JSON.stringify(body));
  });
  assert.strictEqual(JSON.stringify(db), snapshot, 'failed actions do not change data');
  assert.ok(G.finishOrder(db, 1, { good_qty: '100', ng_qty: '0' }, day, NOW).ok, 'note optional without defects; sum need not equal qty');
  db = G.finishOrder(db, 1, { good_qty: '592', ng_qty: '8', close_note: 'x' }, day, NOW).db;
  assert.deepStrictEqual(Array.from(G.finishOrder(db, 1, { good_qty: '1', ng_qty: '0' }, day, NOW).errors), ['只有生產中的工單可以完工回報']);
  assert.deepStrictEqual(Array.from(G.startOrder(db, 1, day, NOW).errors), ['只有已派工的工單可以開工']);
  assert.deepStrictEqual(Array.from(G.dispatchOrder(db, 1, { work_center_id: '1', plan_date: '2027-10-09' }, planner, NOW).errors), ['這張工單已開工、完工或取消，不能派工']);
  assert.deepStrictEqual(Array.from(G.cancelOrder(db, 1, { close_note: 'x' }, planner, NOW).errors), ['這張工單已開工、完工或取消，不能取消']);
  assert.strictEqual(G.actionsFor(planner, G.findOrder(db, 1)).length, 0, 'finished: no planner buttons');
  assert.strictEqual(G.actionsFor(day, G.findOrder(db, 1)).length, 0, 'finished: no leader buttons');
});

test('A07 redispatch overwrites dispatch fields and keeps no history', () => {
  const db = G.level2Data();
  const before = G.findOrder(db, 1);
  assert.strictEqual(before.dispatched_by, 1);
  const r = G.dispatchOrder(db, 1, { work_center_id: '1', plan_date: '2027-10-05' }, U(db).planner, '2027-10-04 13:40');
  assert.ok(r.ok && r.redispatch);
  assert.strictEqual(r.message, '已改派給 CNC 車削組，預定 2027-10-05 生產');
  assert.deepStrictEqual([r.order.plan_date, r.order.dispatched_by, r.order.dispatched_at], ['2027-10-05', 2, '2027-10-04 13:40']);
  assert.ok(!JSON.stringify(r.db).includes('2027-10-01 10:30'), 'previous dispatch time is gone');
});

test('cancel: reason required, dispatch fields kept, terminal state', () => {
  const db = G.level2Data();
  const p = U(db).planner;
  assert.deepStrictEqual(Array.from(G.cancelOrder(db, 1, { close_note: ' ' }, p, NOW).errors), ['請輸入取消理由']);
  assert.deepStrictEqual(Array.from(G.cancelOrder(db, 1, { close_note: 'x'.repeat(201) }, p, NOW).errors), ['取消理由不可超過 200 字']);
  const r = G.cancelOrder(db, 1, { close_note: '客戶取消' }, p, NOW);
  assert.ok(r.ok);
  assert.strictEqual(r.order.status, '已取消');
  assert.strictEqual(r.order.work_center_id, 1);
  assert.strictEqual(r.order.plan_date, '2027-10-04');
  assert.strictEqual(G.actionsFor(p, r.order).length, 0);
});

test('visibility: leader open list only own center 已派工/生產中; planner sees all open; search sees all', () => {
  const db = G.level2Data();
  const { planner, day } = U(db);
  assert.deepStrictEqual(Array.from(G.listOpen(db, planner, '2027-10-04').map(o => o.wo_no)), ['WO-271004-01', 'WO-271001-02', 'WO-270930-01']);
  assert.deepStrictEqual(Array.from(G.listOpen(db, day, '2027-10-04').map(o => o.wo_no)), ['WO-271004-01', 'WO-271001-02']);
  const s = G.openSummary(db, day, '2027-10-04');
  assert.deepStrictEqual([s.pending, s.dispatched, s.producing], [0, 2, 0]);
  assert.strictEqual(G.searchOrders(db, {}, '2027-10-04').rows.length, 3);
  assert.deepStrictEqual(Array.from(G.searchOrders(db, { from: '2027-10-08', to: '2027-10-01' }, '2027-10-04').errors), ['起始日期不可晚於結束日期']);
  assert.strictEqual(G.searchOrders(db, { keyword: '0397' }, '2027-10-04').rows.length, 1);
});

test('A09 fixed data resets to the same initial state', () => {
  assert.strictEqual(JSON.stringify(G.level1Data()), JSON.stringify(G.level1Data()));
  assert.strictEqual(JSON.stringify(G.level2Data()), JSON.stringify(G.level2Data()));
});

test('A12 sound module is silent and does not throw without Web Audio', () => {
  const out = vm.runInContext("Sound.sfx('ok'); Sound.startMusic(); Sound.setMusic(false); Sound.setSfx(false); Sound.sfx('error'); [Sound.isMusicOn(), Sound.isSfxOn(), Sound.isPlaying()].join()", ctx);
  assert.strictEqual(out, 'false,false,false');
});

console.log(passed + ' tests passed: ' + file);
