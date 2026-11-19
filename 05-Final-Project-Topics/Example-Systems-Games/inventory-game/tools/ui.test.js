// Headless UI playthrough. Run: node tools/ui.test.js [final|midterm|dist-final] [shotDir]
// The midterm run also simulates a browser without Web Audio.
const path = require('path');
const assert = require('assert');
const { launch, PAGE_HELPERS } = require('./cdp');

const which = process.argv[2] || 'final';
const shotDir = process.argv[3] || null;
const root = path.join(__dirname, '..');
const file = which === 'midterm' ? path.join(root, 'dist', 'midterm', 'index.html')
  : which === 'dist-final' ? path.join(root, 'dist', 'final', 'index.html') : path.join(root, 'index.html');
const noAudio = which === 'midterm';

function step(name) { console.log('ok  ' + name); }
const lineId = itemId => "gameState.db.count_lines.find(l => l.count_id === gameState.flags.countId && l.item_id === " + itemId + ").id";

async function enter(ev, id, qty) {
  await ev("T.set('#q-" + id + "','" + qty + "'); T.click('#save-" + id + "')");
}

async function level1(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('第一關')");
  await ev("T.btn('開始')");
  await waitFor('gameState.flags.ringing');
  // A13 sound toggles
  assert.strictEqual(await ev("document.querySelector('#btn-music').getAttribute('aria-pressed')"), 'true');
  assert.strictEqual(await ev('Sound.isPlaying()'), !noAudio, 'music plays in a level (unless no Web Audio)');
  assert.strictEqual(await ev("T.click('#btn-music'); [document.querySelector('#btn-music').textContent, document.querySelector('#btn-music').getAttribute('aria-pressed'), Sound.isPlaying()].join()"), '音樂：關,false,false');
  assert.strictEqual(await ev("T.click('#btn-sfx'); [document.querySelector('#btn-sfx').textContent, document.querySelector('#btn-sfx').getAttribute('aria-pressed')].join()"), '音效：關,false');
  assert.strictEqual(await ev("T.click('#btn-music'); T.click('#btn-sfx'); [Sound.isMusicOn(), Sound.isSfxOn(), Sound.isPlaying()].join()"), 'true,true,' + !noAudio);
  step('A13 music plays in level; music and sfx toggles work separately');

  // A02 movement and one interaction per key
  await ev("document.querySelector('#map-wrap').focus()");
  await key('w');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [3, 2]);
  await key('w');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [3, 2], 'phone blocks');
  await key('e');
  assert.ok((await ev('T.modal()')).includes('四個料號'));
  await key('s');
  assert.strictEqual(await ev('gameState.player.y'), 2, 'no move while dialog open');
  await ev("T.btn('好，我知道了')");
  await waitFor("gameState.flags.mgrPos === 'pc'", 10000);
  step('A02 movement, blocked tile, phone call, no move during dialog');

  // manager creates the count
  await ev("T.at(2,2,'up')"); await key('e');
  await ev("T.btn('看課長在電腦建立盤點單')");
  let m = await ev('T.modal()');
  assert.ok(m.includes('課長登入中') && m.includes('陳振宇（主管）') && m.includes('建立盤點單'));
  await ev("T.set('#nc-name',''); T.submit('#f-new')");
  assert.ok((await ev('T.modal()')).includes('請輸入盤點單名稱'));
  assert.strictEqual(await ev('gameState.db.counts.length'), 1);
  await ev("T.set('#nc-name','十一月月底抽盤'); T.click('#nc-item-11'); T.submit('#f-new')");
  assert.ok((await ev('T.modal()')).includes('課長交辦的是'));
  assert.strictEqual(await ev('gameState.db.counts.length'), 1);
  await ev("T.click('#nc-item-11'); T.submit('#f-new')");
  m = await ev('T.modal()');
  assert.ok(m.includes('已建立盤點單 IC-2711-01，共 4 項') && m.includes('已盤 0／共 4 項'), m);
  await ev("T.click('#modal-close')");
  assert.strictEqual(await ev('gameState.loginId'), 2);
  await waitFor("gameState.flags.mgrPos === 'desk'", 10000);
  step('L1 manager creates count: validation error, assignment check, IC-2711-01');

  // A03 staff view: no create tab, no close button, can enter
  await ev("T.at(1,2,'up')"); await key('e');
  m = await ev('T.modal()');
  assert.ok(m.includes('吳宜蓁（倉管人員）') && m.includes('沒有「建立盤點單」分頁'));
  assert.strictEqual(await ev("document.querySelector('#tab-new')"), null);
  assert.strictEqual(await ev("document.querySelector('#btn-close')"), null);
  const pl = await ev(lineId(2));
  assert.ok(await ev("!!document.querySelector('#q-" + pl + "')"));
  await ev("document.querySelector('#q-" + pl + "').focus()");
  await key('a'); await key('d');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [1, 2], 'typing does not move');
  await enter(ev, pl, '46');
  assert.ok((await ev('T.modal()')).includes('還沒到 A-02 貨架清點'));
  assert.strictEqual(await ev('gameState.db.count_lines.find(l => l.id === ' + pl + ').counted_qty'), null);
  await ev("T.click('#modal-close')");
  step('A03 staff login: no create/close, entry allowed; input does not move player');

  // count four shelves
  for (const [x, y] of [[9, 2], [14, 2], [9, 4], [15, 4]]) {
    await ev("T.at(" + x + "," + y + ",'up')"); await key('e');
    await ev("T.btn('記在盤點筆記')");
  }
  assert.strictEqual(await ev("Object.keys(gameState.notes).sort().join()"), 'A-02,B-01,C-02,D-02');
  assert.strictEqual(await ev("gameState.notes['C-02'].qty"), 81);
  assert.ok((await ev("document.querySelector('#hud-stats').innerText")).includes('盤點筆記'));
  step('L1 four shelves counted into the notebook (hinge written as 81)');

  // enter three lines, invalid number, note mismatch warning
  await ev("T.btn('電腦')");
  await key('e');
  const tube = await ev(lineId(4)), hinge = await ev(lineId(7)), bub = await ev(lineId(11));
  await enter(ev, pl, '1.5');
  assert.ok((await ev('T.modal()')).includes('實盤數量須為 0 到 99999 的整數'));
  await enter(ev, pl, '45');
  assert.ok((await ev('T.modal()')).includes('盤點筆記上記的是 46'));
  await ev("T.click('#warn-back')");
  await enter(ev, pl, '46');
  assert.ok((await ev('T.modal()')).includes('已儲存 PL-1102：實盤 46，盤差 0'));
  await enter(ev, tube, '118');
  assert.ok((await ev('T.modal()')).includes('盤差 −2'));
  await enter(ev, hinge, '81');
  assert.ok((await ev('T.modal()')).includes('盤差 +66'));
  assert.ok(await ev('gameState.flags.earlyDue'));
  await enter(ev, bub, '12');
  assert.ok((await ev('T.modal()')).includes('課長剛好走過來'));
  assert.strictEqual(await ev('countSummary(gameState.db, countById(gameState.db, gameState.flags.countId)).counted_count'), 3);
  await ev("T.click('#modal-close')");
  await waitFor("gameState.flags.mgrPos === 'pc'", 10000);
  step('L1 entries: invalid number, note mismatch warning, differences, 3 of 4');

  // early close is refused
  await ev("T.at(2,2,'up')"); await key('e');
  await ev("T.btn('看課長按結案')");
  await ev("T.click('#btn-close')");
  assert.ok((await ev('T.modal()')).includes('確定結案'));
  const moves0 = await ev('gameState.db.stock_moves.length');
  await ev("T.click('#close-yes')");
  assert.ok((await ev('T.modal()')).includes('還有 1 項沒有盤點，不能結案'));
  assert.strictEqual(await ev('gameState.db.stock_moves.length'), moves0);
  await enter(ev, bub, '12');
  assert.ok((await ev('T.modal()')).includes('這是課長的登入畫面'));
  await ev("T.click('#modal-close')");
  await waitFor("gameState.flags.mgrPos === 'desk'", 10000);
  step('A05 early close refused, no data change; manager session cannot be used to enter');

  await ev("T.at(1,2,'up')"); await key('e');
  await enter(ev, bub, '12');
  await ev("T.click('#modal-close')");
  await ev("T.at(4,2,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('盤差 +66？'));
  await ev("T.btn('結束對話')");
  await ev("T.at(9,4,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('剛才把 18 寫成 81'));
  await ev("T.btn('記在盤點筆記')");
  await ev("T.at(1,2,'up')"); await key('e');
  const t0 = await ev('gameState.db.count_lines.find(l => l.id === ' + hinge + ').counted_at');
  await enter(ev, hinge, '18');
  m = await ev('T.modal()');
  assert.ok(m.includes('已儲存 HW-3302：實盤 18，盤差 +3') && m.includes('蓋掉前一次'), m);
  assert.notStrictEqual(await ev('gameState.db.count_lines.find(l => l.id === ' + hinge + ').counted_at'), t0);
  await ev("T.click('#modal-close')");
  step('A04 recount and overwrite: quantity and time replaced');

  // prediction then close
  await ev("T.at(4,2,'up')"); await key('e');
  await ev("T.btn('請課長結案（結案前先預測）')");
  assert.strictEqual(await ev("document.querySelector('#quiz-done').disabled"), true);
  await ev("T.radio('q0','0 個')");
  assert.ok((await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.radio('q0','2 個'); T.radio('q1','118'); T.radio('q2','2 筆')");
  assert.ok(!(await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.click('#quiz-done')");
  await waitFor("T.open() && T.modal().includes('課長登入中')", 10000);
  await ev("T.click('#btn-close'); T.click('#close-yes')");
  m = await ev('T.modal()');
  assert.ok(m.includes('已結案 IC-2711-01，調整 2 個料號的帳面數量'));
  assert.ok(!(await ev("!!document.querySelector('[id^=save-]')")));
  assert.strictEqual(await ev('itemById(gameState.db, 4).book_qty'), 118);
  await ev("T.click('#modal-close')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-moves')");
  m = await ev('T.modal()');
  assert.ok(m.includes('IC-2711-01 盤點調整') && m.includes('沒有修改或刪除'));
  assert.strictEqual(await ev("[...document.querySelectorAll('#modal button')].filter(b => /刪除|修改/.test(b.textContent)).length"), 0);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('第一關結算')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('實際系統待查證') && s.includes('調整 2 個料號') && !s.includes('ERD'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l1-settle.png'));
  step('A07 prediction with re-answer, close, adjustments visible, settlement');
  await ev("T.btn('下一關')");
}

async function level2(p, branch) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('開始')");
  await waitFor('gameState.flags.ringing');
  await ev("T.at(3,2,'up')"); await key('e');
  await ev("T.btn('好，我來登錄')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-moves')");
  const n0 = await ev('gameState.db.stock_moves.length');
  if (branch === 'recount') {
    await ev("T.set('#mv-item','10'); T.set('#mv-type','出庫'); T.set('#mv-qty','260'); T.submit('#f-move')");
    assert.ok((await ev('T.modal()')).includes('庫存不足：PK-4401 帳面只有 240 個'));
    assert.strictEqual(await ev('gameState.db.stock_moves.length'), n0);
    await ev("T.set('#mv-qty','100'); T.submit('#f-move')");
    assert.ok((await ev('T.modal()')).includes('數量和出貨單還沒對上'));
    await ev("T.click('#modal-close')");
    await ev("T.at(17,5,'down')"); await key('e');
    assert.ok((await ev('T.modal()')).includes('是 60 個'));
    await ev("T.btn('知道了')");
    await ev("T.at(1,2,'up')"); await key('e');
    await ev("T.click('#tab-moves')");
  }
  await ev("T.set('#mv-item','10'); T.set('#mv-type','出庫'); T.set('#mv-qty','60'); T.set('#mv-note','出貨單 SO-1215-07'); T.submit('#f-move')");
  let m = await ev('T.modal()');
  assert.ok(m.includes('已登錄出庫：PK-4401 −60，帳面 180') && m.includes('沒有因此擋下出庫'), m);
  assert.strictEqual(await ev('countLines(gameState.db, countById(gameState.db, 3)).find(l => l.item_id === 10).diff'), 60);
  await ev("T.click('#modal-close')");
  await ev("T.at(16,5,'down')"); await key('e');
  await ev("T.btn('點交紙箱 60 個')");
  assert.strictEqual(await ev("gameState.shelf['D-01']"), 180);
  for (const x of [8, 11]) { await ev("T.at(" + x + ",4,'up')"); await key('e'); await ev("T.btn('記在盤點筆記')"); }
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-counts')");
  if (await ev("!!document.querySelector('#det-3')")) await ev("T.click('#det-3')");
  await enter(ev, 9, '180');
  assert.ok((await ev('T.modal()')).includes('紙箱上午已經盤完了'));
  await enter(ev, 7, '35');
  await enter(ev, 8, '22');
  assert.ok((await ev('T.modal()')).includes('已儲存 HW-3304：實盤 22，盤差 0'));
  await ev("T.click('#modal-close')");
  step('L2 ' + branch + ': stock out during open count not blocked, hand-over, other lines');

  await ev("T.at(4,2,'up')"); await key('e');
  await ev("T.btn('結案前先預測')");
  await ev("T.radio('q0','帳面 180，盤差 +60'); T.radio('q1','240'); T.radio('q2','不能修改，也不能刪除')");
  assert.ok((await ev('T.modal()')).includes('上午記下的實盤 240 沒有跟著減少'));
  await ev("T.click('#quiz-done')");
  if (branch === 'recount') {
    await ev("T.btn('先回 D-01 重新清點紙箱')");
    await ev("T.at(14,4,'up')"); await key('e');
    assert.ok((await ev('T.modal()')).includes('現在是 180 個'));
    await ev("T.btn('記在盤點筆記')");
    await ev("T.at(1,2,'up')"); await key('e');
    await enter(ev, 9, '180');
    assert.ok((await ev('T.modal()')).includes('盤差 0'));
    await ev("T.click('#modal-close')");
    await ev("T.at(4,2,'up')"); await key('e');
    await ev("T.btn('請課長結案')");
  } else {
    await ev("T.btn('不重盤，直接請課長結案')");
  }
  await waitFor("T.open() && T.modal().includes('課長登入中')", 10000);
  await ev("T.click('#btn-close'); T.click('#close-yes')");
  m = await ev('T.modal()');
  assert.ok(m.includes(branch === 'recount' ? '調整 0 個料號' : '調整 1 個料號'), m);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('第二關結算')", 10000);
  const s = await ev('T.modal()');
  if (branch === 'recount') {
    assert.ok(s.includes('重盤後紙箱的實盤改成 180') && s.includes('無盤點調整'));
    assert.strictEqual(await ev('itemById(gameState.db, 10).book_qty'), 180);
  } else {
    assert.ok(s.includes('帳面比貨架多出 60 個') && s.includes('盤點調整 +60'));
    assert.strictEqual(await ev('itemById(gameState.db, 10).book_qty'), 240);
  }
  assert.ok(s.includes('這一關只做現況理解'));
  assert.strictEqual(s.includes('CR-01'), which !== 'midterm', 'final note only in final build');
  if (shotDir) await p.shot(path.join(shotDir, which + '-l2-' + branch + '.png'));
  step('A06 L2 ' + branch + ' branch: book and adjustment correct, settlement compares time points');
}

(async () => {
  const p = await launch('file://' + file, 9300 + Math.floor(Math.random() * 500));
  try {
    if (noAudio) await p.ev('window.AudioContext = undefined; window.webkitAudioContext = undefined; true');
    await p.ev(PAGE_HELPERS);
    const edition = await p.ev("document.querySelector('#edition-tag').textContent");
    const crCards = await p.ev("document.querySelectorAll('[data-start^=\"CR\"]').length");
    if (which === 'midterm') { assert.strictEqual(edition, '期中版'); assert.strictEqual(crCards, 0); assert.strictEqual(await p.ev('FinalDemo'), null); }
    else { assert.ok(edition.startsWith('期末版')); assert.strictEqual(crCards, 1); }
    if (shotDir) await p.shot(path.join(shotDir, which + '-title.png'));
    step('A11 title shows edition ' + edition + ', CR entries: ' + crCards);
    await level1(p);
    await level2(p, 'recount');
    await p.ev("T.btn('重新開始本關')");
    assert.strictEqual(await p.ev('gameState.db.stock_moves.length'), await p.ev('level2Data().stock_moves.length'));
    step('A08 restart restores fixed data');
    await level2(p, 'direct');
    await p.ev("T.btn('重新開始本關')");
    await p.ev("T.btn('開始')");
    await p.key('Escape');
    assert.ok((await p.ev('T.modal()')).includes('暫停'));
    await p.ev("T.btn('操作說明')");
    assert.ok((await p.ev('T.modal()')).includes('音樂／音效'));
    await p.key('Escape');
    await p.key('Escape');
    await p.ev("T.btn('回到標題')");
    assert.strictEqual(await p.ev("document.querySelector('#title-screen').hidden"), false);
    assert.strictEqual(await p.ev('Sound.isPlaying()'), false, 'music stops at title');
    step('Esc pause, help lists sound toggles, back to title stops music');
    if (which !== 'midterm') await require('./ui-cr.test.js')(p, shotDir, which);
    const nonFile = p.events.requests.filter(u => !u.startsWith('file://'));
    assert.deepStrictEqual(nonFile, [], 'non-file requests');
    assert.ok(p.events.requests.every(u => /\.(html|css|js)$/.test(u)), 'only the three page files: ' + p.events.requests.join());
    assert.deepStrictEqual(p.events.errors, [], 'page errors');
    step('A01 only file:// requests for html/css/js (' + p.events.requests.length + '), no page errors' + (noAudio ? ' (no Web Audio)' : ''));
    console.log('ALL PASSED (' + which + ')');
  } catch (e) {
    console.error('FAILED:', e.message);
    if (shotDir) await p.shot(path.join(shotDir, which + '-fail.png'));
    console.error('page errors:', p.events.errors);
    process.exitCode = 1;
  } finally { await p.close(); }
})();
