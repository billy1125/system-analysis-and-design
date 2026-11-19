// Headless UI playthrough. Run: node tools/ui.test.js [final|midterm] [shotDir]
const path = require('path');
const assert = require('assert');
const { launch, PAGE_HELPERS } = require('./cdp');

const which = process.argv[2] || 'final';
const shotDir = process.argv[3] || null;
const root = path.join(__dirname, '..');
const file = which === 'midterm' ? path.join(root, 'dist', 'midterm', 'index.html')
  : which === 'dist-final' ? path.join(root, 'dist', 'final-demo', 'index.html') : path.join(root, 'index.html');

function step(name) { console.log('ok  ' + name); }

async function level1(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('第一關')");
  await ev("T.btn('開始')");
  await waitFor("T.idle('A') && gameState.npcs.A.x === 7 && T.idle('A2')");
  assert.strictEqual(await ev("T.click('#btn-music'); document.querySelector('#btn-music').textContent"), '音樂：關');
  assert.strictEqual(await ev("T.click('#btn-music'); T.click('#btn-sfx'); T.click('#btn-sfx'); [Sound.isMusicOn(), Sound.isSfxOn()].join()"), 'true,true');
  // A02 movement: one tile per key, blocked by counter
  await ev("document.querySelector('#map-wrap').focus(); T.at(5,3,'right')");
  await key('w'); assert.strictEqual(await ev('gameState.player.y'), 2);
  await key('s'); await key('d');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [5, 3]);
  await key('e');
  assert.ok((await ev('T.modal()')).includes('黃建民'));
  await key('w');
  assert.strictEqual(await ev('gameState.player.y'), 3, 'no move while dialog open');
  await ev("T.btn('核對證件')");
  step('L1 talk, ID check, movement blocked by dialog');

  await ev("T.at(1,2,'up')"); await key('e');
  assert.ok(await ev('T.open()'));
  // typing in an input must not move the player
  await ev("document.querySelector('#in-phone').focus()");
  await key('w'); await key('a');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [1, 2]);
  await ev("T.set('#in-phone','0911000101'); T.submit('#f-lookup')");
  assert.strictEqual(await ev("document.querySelectorAll('[data-select]').length"), 2);
  await ev("T.click('[data-select=\"2\"]')");
  assert.ok((await ev('T.modal()')).includes('不同'));
  await ev("T.click('[data-select=\"1\"]')");
  assert.strictEqual(await ev('gameState.flags.A.selected'), true);
  await ev("T.click('#tab-checkin'); T.set('#ci-emp','1'); T.set('#ci-purpose','開會'); T.set('#ci-comp','21'); T.set('#ci-pass','1'); T.submit('#f-checkin')");
  assert.ok((await ev('T.modal()')).includes('隨行人數須為 0 到 20 的整數'));
  assert.strictEqual(await ev('gameState.db.visits.length'), 2);
  await ev("T.set('#ci-comp','1'); T.submit('#f-checkin')");
  const m = await ev('T.modal()');
  assert.ok(m.includes('報到完成') && m.includes('還沒通知受訪員工'), m);
  await key('Escape');
  await waitFor('!T.open()');
  step('L1 lookup duplicate phone, validation error, check-in, Esc closes');

  // card before phone call is refused
  await ev("T.at(5,2,'up')"); await key('e');
  await ev("T.click('[data-take=\"V-01\"]'); T.click('#modal-close')");
  await ev("T.at(5,3,'right')"); await key('e');
  await ev("T.btn('交付訪客證 V-01')");
  assert.ok((await ev('T.modal()')).includes('還沒通知受訪員工'));
  await ev("T.click('#modal-close')");
  await ev("T.at(3,2,'up')"); await key('e');
  await ev("T.set('#in-ext','2301'); T.submit('#f-phone')");
  assert.ok((await ev('T.modal()')).includes('李俊傑'));
  await ev("T.click('#modal-close')");
  await ev("T.at(5,3,'right')"); await key('e');
  await ev("T.btn('交付訪客證 V-01')");
  assert.strictEqual(await ev('gameState.flags.phase'), 'B');
  step('L1 phone notify gate and card hand-over');

  await waitFor("gameState.npcs.B.visible && T.idle('B') && gameState.npcs.B.x === 7");
  await ev("T.at(5,4,'right')"); await key('e'); await ev("T.btn('核對證件')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-lookup'); T.set('#in-phone','0911000303'); T.submit('#f-lookup')");
  assert.ok((await ev('T.modal()')).includes('查無此手機號碼'));
  await ev("T.set('#nv-name','張雅婷'); T.set('#nv-company','禾豐檢測'); T.set('#nv-phone','0911000303'); T.set('#nv-idno','g200000303'); T.submit('#f-visitor')");
  assert.ok((await ev('T.modal()')).includes('身分證字號須為'));
  await ev("T.click('#nv-fill'); T.submit('#f-visitor')");
  await ev("T.click('[data-select=\"4\"]')");
  await ev("T.click('#tab-checkin'); T.set('#ci-emp','2'); T.set('#ci-purpose','其他'); T.set('#ci-comp','0'); T.set('#ci-pass','2'); T.submit('#f-checkin')");
  assert.ok((await ev('T.modal()')).includes('事由'));
  await ev("T.click('#warn-back'); T.set('#ci-purpose','維修'); T.submit('#f-checkin')");
  assert.ok((await ev('T.modal()')).includes('報到完成'));
  await ev("T.click('#modal-close')");
  await ev("T.at(3,2,'up')"); await key('e'); await ev("T.set('#in-ext','2410'); T.submit('#f-phone'); T.click('#modal-close')");
  await ev("T.at(5,2,'up')"); await key('e'); await ev("T.click('[data-take=\"V-02\"]'); T.click('#modal-close')");
  await ev("T.at(5,4,'right')"); await key('e'); await ev("T.btn('交付訪客證 V-02')");
  await waitFor("T.open() && T.modal().includes('合計 3 人')", 10000);
  assert.ok((await ev("document.querySelector('#hud-stats').innerText")).includes('合計 3 人'));
  await ev("T.btn('結束對話')");
  step('L1 new visitor master, coach mismatch warning, totals 2/1/3');

  await waitFor("T.idle('A') && T.idle('B') && T.idle('A2') && gameState.npcs.A.x === 7 && gameState.npcs.B.x === 7", 10000);
  await ev("T.at(5,3,'right')"); await key('e'); await ev("T.btn('收回訪客證 V-01')");
  await ev("T.at(5,4,'right')"); await key('e'); await ev("T.btn('收回訪客證 V-02')");
  await waitFor("!gameState.npcs.A.visible && !gameState.npcs.B.visible", 10000);
  assert.strictEqual(await ev('listOnSite(gameState.db).length'), 2, 'still on site until check-out');
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-onsite')");
  const ids = await ev('listOnSite(gameState.db).map(v => v.id)');
  for (const id of ids) await ev("T.click('#out-" + id + "'); T.click('#out-yes')");
  assert.strictEqual(await ev('listOnSite(gameState.db).length'), 0);
  await ev("T.click('#modal-close')");
  await ev("T.at(5,2,'up')"); await key('e');
  await ev("T.click('[data-put=\"V-01\"]')"); await ev("T.click('[data-put=\"V-02\"]')");
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('第一關結算')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('實際系統待查證') && !s.includes('ERD'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l1-settle.png'));
  step('L1 return, check-out, cards back, settlement');
  await ev("T.btn('下一關')");
}

async function level2(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('開始')");
  await waitFor("T.idle('L') && gameState.npcs.L.x === 7");
  await ev("T.at(5,3,'right')"); await key('e'); await ev("T.btn('核對證件')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.set('#in-phone','0911000505'); T.submit('#f-lookup'); T.click('[data-select=\"1\"]')");
  await ev("T.click('#tab-checkin'); T.set('#ci-emp','1'); T.set('#ci-purpose','開會'); T.set('#ci-pass','6'); T.submit('#f-checkin')");
  assert.ok((await ev('T.modal()')).includes('仍在廠內'));
  assert.strictEqual(await ev('gameState.db.visits.length'), 3);
  assert.strictEqual(await ev('passStatus(gameState.db, 6)'), '可用');
  await ev("T.click('#tab-onsite'); T.click('#det-2')");
  assert.ok((await ev('T.modal()')).includes('離廠時間是空的'));
  await ev("T.click('#out-2')");
  assert.ok((await ev('T.modal()')).includes('先回櫃台'));
  await ev("T.click('#modal-close')");
  step('L2 rejection, no new visit, pass untouched, find record');

  await ev("T.at(5,3,'right')"); await key('e'); await ev("T.btn('收回訪客證 V-05')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-onsite'); T.click('#out-2')");
  assert.ok((await ev('T.modal()')).includes('補登前先預測'));
  assert.strictEqual(await ev("document.querySelector('#quiz-done').disabled"), true);
  await ev("T.radio('q0','2 筆')");
  assert.ok((await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.radio('q0','1 筆'); T.radio('q1','可用（已啟用，且沒有未離廠紀錄占用）'); T.radio('q2', document.querySelectorAll('input[name=q2]')[1].value)");
  await ev("T.click('#quiz-done')");
  const now = await ev('nowStr(gameState)');
  await ev("T.click('#out-yes')");
  assert.strictEqual(await ev('gameState.db.visits.find(v => v.id === 2).check_out_at'), now);
  assert.strictEqual(await ev('passStatus(gameState.db, 5)'), '可用');
  step('L2 prediction with re-answer, backfill writes now');

  await ev("T.click('#tab-checkin'); T.set('#ci-pass','6'); T.submit('#f-checkin')");
  assert.ok((await ev('T.modal()')).includes('報到完成'));
  await ev("T.click('#modal-close')");
  await ev("T.at(5,3,'right')"); await key('e'); await ev("T.btn('交付訪客證 V-05')");
  assert.ok((await ev('T.modal()')).includes('V-06'));
  await ev("T.click('#modal-close')");
  await ev("T.at(5,2,'up')"); await key('e');
  await ev("T.click('[data-put=\"V-05\"]'); T.click('[data-take=\"V-06\"]'); T.click('#modal-close')");
  await ev("T.at(5,3,'right')"); await key('e'); await ev("T.btn('交付訪客證 V-06')");
  await waitFor("T.modal().includes('第二關結算')", 10000);
  const s = await ev('T.modal()');
  assert.ok(s.includes('約 17:30') && s.includes(now));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l2-settle.png'));
  step('L2 card mismatch, new check-in, settlement compares actual vs recorded');
  // A08 restart restores data
  await ev("T.btn('重新開始本關')");
  assert.strictEqual(await ev('gameState.db.visits.length'), 3);
  await ev("T.btn('開始')");
  await key('Escape');
  assert.ok((await ev('T.modal()')).includes('暫停'));
  await ev("T.btn('回到標題')");
  assert.strictEqual(await ev("document.querySelector('#title-screen').hidden"), false);
  step('restart resets data; Esc pause menu; back to title');
}

(async () => {
  const p = await launch('file://' + file, 9300 + Math.floor(Math.random() * 500));
  try {
    await p.ev(PAGE_HELPERS);
    const edition = await p.ev("document.querySelector('#edition-tag').textContent");
    const crCards = await p.ev("document.querySelectorAll('[data-start^=\"CR\"]').length");
    if (which === 'midterm') { assert.strictEqual(edition, '期中版'); assert.strictEqual(crCards, 0); assert.strictEqual(await p.ev('FinalDemo'), null); }
    else { assert.ok(edition.startsWith('期末示範版')); assert.strictEqual(crCards, 3); }
    if (shotDir) await p.shot(path.join(shotDir, which + '-title.png'));
    step('title shows edition ' + edition + ', CR entries: ' + crCards);
    await level1(p);
    await level2(p);
    if (which !== 'midterm') await require('./ui-cr.test.js')(p, shotDir, which);
    const nonFile = p.events.requests.filter(u => !u.startsWith('file://'));
    assert.deepStrictEqual(nonFile, [], 'non-file requests');
    assert.deepStrictEqual(p.events.errors, [], 'page errors');
    step('A01 only file:// requests (' + p.events.requests.length + '), no page errors');
    console.log('ALL PASSED (' + which + ')');
  } catch (e) {
    console.error('FAILED:', e.message);
    if (shotDir) await p.shot(path.join(shotDir, which + '-fail.png'));
    console.error('page errors:', p.events.errors);
    process.exitCode = 1;
  } finally { await p.close(); }
})();
