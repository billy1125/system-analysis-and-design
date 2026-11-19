// Headless UI playthrough. Run: node tools/ui.test.js [final|midterm|dist-final] [shotDir]
const path = require('path');
const assert = require('assert');
const { launch, PAGE_HELPERS } = require('./cdp');

const which = process.argv[2] || 'final';
const shotDir = process.argv[3] || null;
const root = path.join(__dirname, '..');
const file = which === 'midterm' ? path.join(root, 'dist', 'midterm', 'index.html')
  : which === 'dist-final' ? path.join(root, 'dist', 'final', 'index.html') : path.join(root, 'index.html');

function step(name) { console.log('ok  ' + name); }

async function level1(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('第一關')");
  await ev("T.btn('開始')");
  // A12 sound toggles and music state
  assert.strictEqual(await ev('Sound.isPlaying()'), true, 'music starts with the level');
  assert.strictEqual(await ev("T.click('#btn-music'); document.querySelector('#btn-music').textContent"), '音樂：關');
  assert.strictEqual(await ev("document.querySelector('#btn-music').getAttribute('aria-pressed') + Sound.isPlaying()"), 'falsefalse');
  assert.strictEqual(await ev("T.click('#btn-sfx'); document.querySelector('#btn-sfx').getAttribute('aria-pressed')"), 'false');
  assert.strictEqual(await ev("T.click('#btn-music'); T.click('#btn-sfx'); [Sound.isMusicOn(), Sound.isSfxOn(), Sound.isPlaying()].join()"), 'true,true,true');
  step('A12 music and sfx toggles, aria-pressed, music plays in level');

  // A02 movement: one tile per key, blocked by wall and objects
  await ev("document.querySelector('#map-wrap').focus(); T.at(2,2,'up')");
  await key('w'); assert.strictEqual(await ev('gameState.player.y'), 1);
  await key('w'); assert.strictEqual(await ev('gameState.player.y'), 1, 'wall blocks');
  await key('a'); assert.strictEqual(await ev('gameState.player.x'), 2, 'computer blocks');
  assert.ok((await ev("document.querySelector('#identity').textContent")).includes('生管員 林家豪'));

  // create before reading the memo is blocked; typing does not move the player
  await ev("T.at(1,2,'up')"); await key('e');
  assert.ok(await ev('T.open()'));
  await key('w');
  assert.strictEqual(await ev('gameState.player.y'), 2, 'no move while dialog open');
  await ev("T.click('#tab-new')");
  await ev("document.querySelector('#new-so').focus()");
  await key('a'); await key('d');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [1, 2]);
  await ev("T.set('#new-so','SO-27-0412'); T.set('#new-product','1'); T.set('#new-qty','300'); T.set('#new-due','2027-10-09'); T.submit('#f-new')");
  assert.ok((await ev('T.modal()')).includes('先到桌上看業務的需求便條'));
  await key('Escape');
  await waitFor('!T.open()');
  await ev("T.at(5,2,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('SO-27-0412'));
  await ev("T.btn('結束對話')");
  step('A02 movement, focus, dialog blocks walking; memo gate');

  // A03 create with validation
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.set('#new-qty','0'); T.submit('#f-new')");
  assert.ok((await ev('T.modal()')).includes('數量須為 1 到 99999 的整數'));
  assert.strictEqual(await ev('gameState.db.work_orders.length'), 3);
  await ev("T.set('#new-qty','300'); T.set('#new-due','2027-10-03'); T.submit('#f-new')");
  assert.ok((await ev('T.modal()')).includes('便條寫的是 2027-10-09'), 'coach warning before system check');
  await ev("T.click('#warn-go')");
  assert.ok((await ev('T.modal()')).includes('交期不能早於開立日期（2027-10-04）'));
  await ev("T.set('#new-due','2027-10-09'); T.submit('#f-new')");
  let m = await ev('T.modal()');
  assert.ok(m.includes('已開立工單 WO-271004-01') && m.includes('待派工'), m);
  step('A03 create: field error, coach warning, due before open date, WO-271004-01');

  // dispatch, then planner tries to start
  await ev("T.click('#act-dispatch'); T.set('#form-first','1'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('已派工給 CNC 車削組，預定 2027-10-04 生產'));
  await ev("T.click('#try-start')");
  m = await ev('T.modal()');
  assert.ok(m.includes('只有這張工單所屬工作中心的組長可以回報'));
  assert.strictEqual(await ev('findOrder(gameState.db, 4).status'), '已派工');
  await ev("T.click('#modal-close')");
  step('A05 planner start rejected, status unchanged');

  // leader logs in and starts
  await ev("T.at(14,2,'up')"); await key('e');
  assert.ok((await ev("document.querySelector('#identity').textContent")).includes('車削組長 陳俊男'));
  await ev("T.click('#tab-open'); T.click('#det-4'); T.click('#act-start'); T.click('#start-yes')");
  assert.ok((await ev('T.modal()')).includes('已回報 WO-271004-01 開工'));
  await ev("T.click('#modal-close')");
  await ev("T.at(14,2,'right')"); await key('e');
  await ev("T.btn('好，請組長安排')");
  await waitFor('gameState.flags.afternoon');
  assert.strictEqual(await ev('nowStr(gameState)'), '2027-10-04 16:30');
  await ev("T.at(14,5,'down')"); await key('e'); await ev("T.btn('記下良品')");
  await ev("T.at(15,5,'down')"); await key('e'); await ev("T.btn('記下不良')");
  step('identity switch to leader, start, manual assignment, manual count');

  // finish: prediction, note required, then success
  await ev("T.at(14,2,'up')"); await key('e');
  await ev("T.click('#tab-open'); T.click('#det-4'); T.click('#act-finish'); T.set('#form-first','298'); T.set('#f-ng','2'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('完工前先預測'));
  assert.strictEqual(await ev("document.querySelector('#quiz-done').disabled"), true);
  await ev("T.radio('q0','生產中')");
  assert.ok((await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.radio('q0','已完工'); T.radio('q1','99.3%'); T.radio('q2','準時'); T.click('#quiz-done')");
  assert.ok((await ev('T.modal()')).includes('有不良品時請在完工備註說明原因'));
  assert.strictEqual(await ev('findOrder(gameState.db, 4).status'), '生產中');
  await ev("T.click('#f-help'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('已回報 WO-271004-01 完工'));
  assert.strictEqual(await ev("document.querySelectorAll('[data-act]').length"), 0, 'finished order has no actions');
  await ev("T.click('#modal-close')");
  step('A04 prediction with re-answer, note required with defects, finish');

  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-search'); T.set('#s-kw','WO-271004-01'); T.submit('#f-search'); T.click('#det-4')");
  m = await ev('T.modal()');
  assert.ok(m.includes('準時') && m.includes('99.3%') && m.includes('陳俊男'), m);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('第一關結算')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('實際系統待查證') && s.includes('不存在資料表') && !s.includes('ERD'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l1-settle.png'));
  step('L1 planner review, derived values, settlement');
  await ev("T.btn('下一關')");
}

async function level2(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('開始')");
  await ev("T.at(3,3,'right')"); await key('e'); await ev("T.btn('好，我去改派')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-open'); T.click('#det-1'); T.click('#act-dispatch'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('改派前先預測'));
  await ev("T.radio('q0','看得到，系統會保留前一次派工')");
  assert.ok((await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.radio('q0','看不到，這幾個欄位會被新的值蓋掉'); T.click('#quiz-done')");
  assert.ok((await ev('T.modal()')).includes('派工內容沒有變更'));
  assert.strictEqual(await ev('findOrder(gameState.db, 1).dispatched_at'), '2027-10-01 10:30');
  await ev("T.set('#d-plan','2027-10-05'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('已改派給 CNC 車削組，預定 2027-10-05 生產'));
  assert.deepStrictEqual(await ev('[findOrder(gameState.db, 1).dispatched_by, findOrder(gameState.db, 1).plan_date]'), [2, '2027-10-05']);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('20:00')");
  await ev("T.btn('結束對話')");
  step('A07 redispatch: prediction, unchanged rejected, overwrite');

  await ev("T.at(14,2,'up')"); await key('e');
  assert.ok((await ev("document.querySelector('#identity').textContent")).includes('許志明'));
  await ev("T.click('#tab-open'); T.click('#det-1'); T.click('#act-start'); T.click('#start-yes')");
  assert.ok((await ev('T.modal()')).includes('已回報 WO-271001-02 開工'));
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('夜班結束')");
  await ev("T.btn('結束對話')");
  await ev("T.at(14,2,'right')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('良品 282 件、不良 5 件'));
  await ev("T.btn('請許志明')");
  await waitFor("T.modal().includes('現在做了幾件')");
  await ev("T.btn('結束對話')");
  step('night leader start, paper handover');

  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-open'); T.click('#det-1')");
  assert.ok((await ev('T.modal()')).includes('良品數與不良數都是空白'));
  assert.strictEqual(await ev('findOrder(gameState.db, 1).good_qty'), null);
  await ev("T.click('#modal-close')");
  await ev("T.at(3,2,'up')"); await key('e');
  await ev("T.set('#in-ext','3101'); T.submit('#f-phone')");
  assert.ok((await ev('T.modal()')).includes('夜班交接班單寫 282 件'));
  await ev("T.click('#modal-close')");
  await waitFor('gameState.flags.afternoon');
  await ev("T.at(14,5,'down')"); await key('e'); await ev("T.btn('記下早班良品')");
  await ev("T.at(15,5,'down')"); await key('e'); await ev("T.btn('記下早班不良')");
  await ev("T.at(17,4,'right')"); await key('e'); await ev("T.btn('結束對話')");
  step('blank progress in system, phone call, count and sheet');

  await ev("T.at(14,2,'up')"); await key('e');
  assert.ok((await ev("document.querySelector('#identity').textContent")).includes('陳俊男'));
  await ev("T.click('#tab-open'); T.click('#det-1'); T.click('#act-finish'); T.click('#f-help'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('完工前先預測'));
  await ev("T.radio('q0','開工人許志明、回報人陳俊男'); T.radio('q1','只能寫進完工備註'); T.radio('q2','接受'); T.click('#quiz-done')");
  assert.ok((await ev('T.modal()')).includes('已回報 WO-271001-02 完工'));
  assert.deepStrictEqual(await ev('[findOrder(gameState.db,1).started_by, findOrder(gameState.db,1).closed_by, findOrder(gameState.db,1).good_qty + findOrder(gameState.db,1).ng_qty]'), [4, 3, 600]);
  await ev("T.click('#tab-search'); T.submit('#f-search'); T.click('#det-1')");
  assert.ok((await ev('T.modal()')).includes('沒有任何處理按鈕'));
  assert.strictEqual(await ev("document.querySelectorAll('[data-act]').length"), 0);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('第二關結算')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('夾痕 5、刀痕 3') && s.includes('許志明') && s.includes('沒有（被改派覆蓋）'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l2-settle.png'));
  step('A07 cross-shift finish, different reporters, no actions after finish, settlement');

  // A09 restart restores data; pause; back to title stops music
  await ev("T.btn('重新開始本關')");
  assert.strictEqual(await ev('findOrder(gameState.db, 1).plan_date'), '2027-10-04');
  await ev("T.btn('開始')");
  await key('Escape');
  assert.ok((await ev('T.modal()')).includes('暫停'));
  await ev("T.btn('回到標題')");
  assert.strictEqual(await ev("document.querySelector('#title-screen').hidden"), false);
  assert.strictEqual(await ev('Sound.isPlaying()'), false, 'music stops on title');
  step('A09 restart resets data; Esc pause menu; title stops music');
}

(async () => {
  const p = await launch('file://' + file, 9300 + Math.floor(Math.random() * 500));
  try {
    await p.ev(PAGE_HELPERS);
    const edition = await p.ev("document.querySelector('#edition-tag').textContent");
    const crCards = await p.ev("document.querySelectorAll('[data-start^=\"CR\"]').length");
    if (which === 'midterm') {
      assert.strictEqual(edition, '期中版'); assert.strictEqual(crCards, 0); assert.strictEqual(await p.ev('FinalDemo'), null);
      assert.ok(!(await p.ev('document.body.innerText')).includes('期末'));
    } else { assert.ok(edition.startsWith('期末版')); assert.strictEqual(crCards, 1); }
    if (shotDir) await p.shot(path.join(shotDir, which + '-title.png'));
    step('A11 title shows edition ' + edition + ', CR entries: ' + crCards);
    await level1(p);
    await level2(p);
    if (which !== 'midterm') await require('./ui-cr.test.js')(p, shotDir, which);
    // data: URLs are Chrome's built-in date-picker icon, not network requests
    const nonFile = p.events.requests.filter(u => !u.startsWith('file://') && !u.startsWith('data:'));
    assert.deepStrictEqual(nonFile, [], 'non-file requests');
    const audio = p.events.requests.filter(u => /\.(mp3|wav|ogg|m4a)$/i.test(u));
    assert.deepStrictEqual(audio, [], 'no audio files');
    assert.deepStrictEqual(p.events.errors, [], 'page errors');
    step('A01/A12 only file:// requests (' + p.events.requests.length + '), no audio files, no page errors');
    console.log('ALL PASSED (' + which + ')');
  } catch (e) {
    console.error('FAILED:', e.message);
    if (shotDir) await p.shot(path.join(shotDir, which + '-fail.png'));
    console.error('modal:', await p.ev('T.modal()').catch(() => ''));
    console.error('page errors:', p.events.errors);
    process.exitCode = 1;
  } finally { await p.close(); }
})();
