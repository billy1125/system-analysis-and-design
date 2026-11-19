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
const NOW = '2027-09-30 10:00';

test('A03 duplicate phone returns two masters; masters and visits are separate', () => {
  const db = G.level1Data();
  assert.strictEqual(G.findVisitorsByPhone(db, '0911000101').length, 2);
  assert.strictEqual(G.findVisitorsByPhone(db, '0911000303').length, 0);
  assert.strictEqual(G.findVisitorsByPhone(db, '').length, 0);
});

test('A03 createVisitor validation and no unique rule', () => {
  const db = G.level1Data();
  const bad = G.createVisitor(db, { name: '', company: '', phone: '0811000303', idNo: 'g200000303' });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.errors.length, 4);
  assert.strictEqual(bad.db.visitors.length, 3);
  const good = G.createVisitor(db, { name: '張雅婷', company: '禾豐檢測', phone: '0911000303', idNo: 'G200000303' });
  assert.ok(good.ok);
  assert.strictEqual(good.db.visitors.length, 4);
  assert.strictEqual(db.visitors.length, 3, 'input db not mutated');
  const dup = G.createVisitor(good.db, { name: '張雅婷', company: '禾豐檢測', phone: '0911000303', idNo: 'G200000303' });
  assert.ok(dup.ok, 'duplicates allowed');
});

test('A04 level 1 check-in, totals 2/1/3, check-out frees passes', () => {
  let db = G.level1Data();
  assert.strictEqual(G.listAvailablePasses(db).length, 5, 'V-06 disabled');
  let r = G.checkIn(db, { visitorId: 1, employeeId: 1, passId: 1, purpose: '開會', companions: '1' }, NOW, 1);
  assert.ok(r.ok); db = r.db;
  const nv = G.createVisitor(db, { name: '張雅婷', company: '禾豐檢測', phone: '0911000303', idNo: 'G200000303' });
  db = nv.db;
  r = G.checkIn(db, { visitorId: nv.visitor.id, employeeId: 2, passId: 2, purpose: '維修', companions: '' }, NOW, 1);
  assert.ok(r.ok); db = r.db;
  const s = G.summarizeOnSite(db);
  assert.deepStrictEqual([s.visitors, s.companions, s.total], [2, 1, 3]);
  assert.strictEqual(G.passStatus(db, 1).indexOf('占用'), 0);
  const ids = G.listOnSite(db).map(v => v.id);
  ids.forEach(id => { const o = G.checkOut(db, id, '2027-09-30 11:40', 1); assert.ok(o.ok); db = o.db; });
  assert.strictEqual(G.listOnSite(db).length, 0);
  assert.strictEqual(G.passStatus(db, 1), '可用');
  assert.strictEqual(G.passStatus(db, 2), '可用');
});

test('A05 invalid fields, disabled/occupied pass, inactive employee, repeat check-out', () => {
  let db = G.level1Data();
  const base = { visitorId: 1, employeeId: 1, passId: 1, purpose: '開會', companions: '0' };
  const bad = [
    Object.assign({}, base, { companions: '21' }),
    Object.assign({}, base, { companions: '-1' }),
    Object.assign({}, base, { companions: '1.5' }),
    Object.assign({}, base, { plate: '12345678901' }),
    Object.assign({}, base, { note: 'x'.repeat(201) }),
    Object.assign({}, base, { purpose: '' }),
    Object.assign({}, base, { passId: 6 }),
    Object.assign({}, base, { employeeId: 4 }),
    Object.assign({}, base, { visitorId: 99 })
  ];
  bad.forEach(input => {
    const r = G.checkIn(db, input, NOW, 1);
    assert.strictEqual(r.ok, false, JSON.stringify(input));
    assert.strictEqual(r.db.visits.length, 2);
  });
  assert.ok(G.checkIn(db, Object.assign({}, base, { plate: '1234567890', note: 'x'.repeat(200), companions: '20' }), NOW, 1).ok);
  const r1 = G.checkIn(db, base, NOW, 1); db = r1.db;
  const occ = G.checkIn(db, Object.assign({}, base, { visitorId: 3 }), NOW, 1);
  assert.strictEqual(occ.ok, false);
  assert.ok(occ.errors.some(e => e.indexOf('占用') >= 0));
  const o1 = G.checkOut(db, r1.visit.id, NOW, 1); db = o1.db;
  const o2 = G.checkOut(db, r1.visit.id, NOW, 1);
  assert.strictEqual(o2.ok, false);
  assert.ok(o2.errors[0].indexOf('不能重複') >= 0);
});

test('A06 level 2: rejected while on site, no new visit or pass use; backfill writes now', () => {
  let db = G.level2Data();
  assert.strictEqual(G.listAvailablePasses(db).map(p => p.code).join(), "V-06");
  const rej = G.checkIn(db, { visitorId: 1, employeeId: 1, passId: 6, purpose: '開會', companions: '0' }, '2027-10-05 09:15', 1);
  assert.strictEqual(rej.ok, false);
  assert.ok(rej.errors[0].indexOf('仍在廠內') >= 0);
  assert.strictEqual(rej.db.visits.length, 3);
  assert.strictEqual(G.passStatus(rej.db, 6), '可用');
  assert.strictEqual(G.listOnSite(db).length, 2);
  const o = G.checkOut(db, 2, '2027-10-05 09:24', 1); db = o.db;
  assert.strictEqual(db.visits.find(v => v.id === 2).check_out_at, '2027-10-05 09:24');
  assert.strictEqual(G.listOnSite(db).length, 1);
  assert.strictEqual(G.passStatus(db, 5), '可用');
  const ok = G.checkIn(db, { visitorId: 1, employeeId: 1, passId: 5, purpose: '開會', companions: '0' }, '2027-10-05 09:26', 1);
  assert.ok(ok.ok);
  assert.strictEqual(G.listOnSite(ok.db).length, 2);
});

test('A08 fixed data resets to the same initial state', () => {
  assert.strictEqual(JSON.stringify(G.level1Data()), JSON.stringify(G.level1Data()));
  assert.strictEqual(JSON.stringify(G.level2Data()), JSON.stringify(G.level2Data()));
});

console.log(passed + ' tests passed: ' + file);
