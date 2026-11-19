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
  // A13: no Web Audio in the browser must not break the game
  await ev('window.__AC = window.AudioContext; window.AudioContext = undefined; window.webkitAudioContext = undefined; true');
  await ev("T.btn('第一關')");
  await ev("T.btn('開始')");
  await ev('window.AudioContext = window.__AC; true');
  assert.strictEqual(await ev("T.click('#btn-music'); document.querySelector('#btn-music').textContent"), '音樂：關');
  assert.strictEqual(await ev("document.querySelector('#btn-music').getAttribute('aria-pressed')"), 'false');
  assert.strictEqual(await ev("T.click('#btn-music'); T.click('#btn-sfx'); [document.querySelector('#btn-sfx').textContent, document.querySelector('#btn-sfx').getAttribute('aria-pressed')].join()"), '音效：關,false');
  assert.strictEqual(await ev("T.click('#btn-sfx'); [Sound.isMusicOn(), Sound.isSfxOn()].join()"), 'true,true');
  step('A13 audio toggles with aria-pressed; game runs without Web Audio');

  // A02 movement: one tile per key, blocked by objects, no move while a dialog is open
  await ev("document.querySelector('#map-wrap').focus(); T.at(2,3,'right')");
  await key('w'); assert.strictEqual(await ev('gameState.player.y'), 2);
  await ev("T.at(1,2,'up')"); await key('w');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [1, 2], 'computer blocks');
  await ev("T.at(5,5,'down')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('開課通知'));
  await key('a');
  assert.strictEqual(await ev('gameState.player.x'), 5, 'no move while dialog open');
  await ev("T.btn('收下開課通知')");
  assert.strictEqual(await ev('gameState.flags.memo'), true);
  step('L1 movement, talk to manager, memo');

  await ev("T.at(1,2,'up')"); await key('e');
  assert.ok(await ev("T.modal().includes('人資電腦')"));
  await ev("document.querySelector('#ns-date').focus()");
  await key('w'); await key('a');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [1, 2], 'typing does not move');
  const fill = (o) => "T.set('#ns-course','" + o.c + "'); T.set('#ns-date','" + o.d + "'); T.set('#ns-start','13:30'); T.set('#ns-end','" + o.e + "'); T.set('#ns-loc','2F 訓練教室'); T.set('#ns-ins','何文傑'); T.set('#ns-cap','" + o.cap + "'); T.submit('#f-session')";
  const n0 = await ev('gameState.db.sessions.length');
  await ev(fill({ c: 1, d: '2027-03-10', e: '13:30', cap: 3 }));
  assert.ok((await ev('T.modal()')).includes('結束時間必須晚於開始時間'));
  await ev(fill({ c: 1, d: '2027-03-10', e: '16:30', cap: 101 }));
  assert.ok((await ev('T.modal()')).includes('人數上限須為 1 到 100 的整數'));
  await ev(fill({ c: 1, d: '2027-03-10', e: '16:30', cap: 5 }));
  assert.ok((await ev('T.modal()')).includes('和開課通知不一致'));
  assert.strictEqual(await ev('gameState.db.sessions.length'), n0, 'failures add no session');
  assert.strictEqual(await ev("[...document.querySelectorAll('#ns-course option')].some(o => o.textContent.includes('TR-399'))"), false);
  await ev(fill({ c: 1, d: '2027-03-10', e: '16:30', cap: 3 }));
  assert.ok((await ev('T.modal()')).includes('已新增梯次'));
  const sid = await ev('gameState.flags.sid');
  assert.strictEqual(await ev('gameState.db.sessions.find(s => s.id === ' + sid + ').status'), '開放報名');
  step('A03 session form errors, memo check, create');

  await waitFor('gameState.flags.selfDone', 10000);
  await ev("T.click('#tab-detail')");
  let m = await ev('T.modal()');
  assert.ok(m.includes('自行報名') && m.includes('張書維'), m);
  assert.strictEqual(await ev('gameState.flags.seenSelf'), true);
  await ev("T.click('#modal-close')");
  await waitFor('gameState.flags.ringing');
  await ev("T.at(3,2,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('許家豪'));
  await ev("T.btn('記下')");
  step('L1 self sign-up seen in roster, phone call');

  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.set('#en-emp','3'); T.click('#en-btn')");
  assert.ok((await ev('T.modal()')).includes('組長說要替許家豪'));
  await ev("T.click('#warn-back'); T.set('#en-emp','4'); T.click('#en-btn')");
  assert.ok((await ev('T.modal()')).includes('代為報名前先預測'));
  assert.strictEqual(await ev("document.querySelector('#quiz-done').disabled"), true);
  await ev("T.radio('q0','1 人')");
  assert.ok((await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.radio('q0','2 人'); T.radio('q1','1 個'); T.click('#quiz-done')");
  m = await ev('T.modal()');
  assert.ok(m.includes('已替 許家豪 報名') && m.includes('人資代報'), m);
  assert.strictEqual(await ev('enrolledCount(gameState.db, ' + sid + ')'), 2);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('3 月 9 日')");
  await ev("T.btn('結束對話')");
  step('A04 proxy sign-up with prediction and re-answer; date moves');

  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#st-toggle')");
  assert.ok((await ev('T.modal()')).includes('梯次狀態已改為「截止報名」'));
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('3 月 10 日')");
  await ev("T.btn('開始預測')");
  await ev("T.radio('q0','今日上課'); T.radio('q1','截止報名'); T.radio('q2','不行'); T.click('#quiz-done')");
  await waitFor("T.modal().includes('下午 4:40')");
  await ev("T.btn('結束對話')");
  await ev("T.at(1,2,'up')"); await key('e');
  m = await ev('T.modal()');
  assert.ok(m.includes('今日上課') && m.includes('存的是「截止報名」'), m);
  await ev("T.click('#save-results')");
  assert.ok((await ev('T.modal()')).includes('先到 2F 訓練教室'));
  await ev("T.click('#modal-close')");
  step('L1 close sign-up, class-day prediction, derived status shown');

  await ev("T.at(15,3,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('紙本簽到表'));
  await ev("T.btn('收下簽到表')");
  await ev("T.at(1,2,'up')"); await key('e');
  const ids = await ev('gameState.db.enrollments.filter(e => e.session_id === ' + sid + ').map(e => e.id)');
  await ev("T.set('#rs-" + ids[0] + "','未完成'); T.set('#rs-" + ids[1] + "','已完成'); T.click('#save-results')");
  assert.ok((await ev('T.modal()')).includes('依簽到表應是'));
  await ev("T.click('#warn-back'); T.set('#rs-" + ids[0] + "','已完成'); T.click('#save-results')");
  m = await ev('T.modal()');
  assert.ok(m.includes('已儲存結訓結果（2 筆）') && m.includes('陳怡安'), m);
  await ev("T.click('#modal-close')");
  await ev("T.at(5,2,'up')"); await key('e');
  await ev("T.click('[data-put=\"S-0310\"]'); T.click('#modal-close')");
  await waitFor("T.modal().includes('第一關結算')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('人工工作') && s.includes('系統功能') && s.includes('累計完成時數') && s.includes('5 小時') && !s.includes('ERD'), s);
  if (shotDir) await p.shot(path.join(shotDir, which + '-l1-settle.png'));
  step('A04 sheet, result check, save, file sheet, settlement');
  await ev("T.btn('下一關')");
}

async function level2(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('開始')");
  await waitFor("gameState.flags.wangMsg && T.idle('wang')", 10000);
  await ev("T.at(9,2,'left')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('已截止報名，無法取消，請洽人資'));
  await ev("T.btn('好，我到電腦')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#sd-2')");
  assert.strictEqual(await ev("!!document.querySelector('#save-results')"), false);
  await ev("T.click('#rm-6')");
  assert.ok((await ev('T.modal()')).includes('沒有要求取消'));
  await ev("T.click('#rm-7')");
  assert.ok((await ev('T.modal()')).includes('直接刪除'));
  await ev("T.click('#rm-yes')");
  assert.ok((await ev('T.modal()')).includes('已移除 王志成 的報名'));
  assert.strictEqual(await ev('gameState.db.enrollments.some(e => e.id === 7)'), false);
  await ev("T.click('#modal-close')");
  step('L2 cancel refused at kiosk; HR removes, row deleted');

  await waitFor("gameState.npcs.zhang.visible && T.idle('zhang') && gameState.npcs.zhang.x === 4", 10000);
  await ev("T.at(3,3,'right')"); await key('e'); await ev("T.btn('好，我到電腦')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-sessions'); T.click('#sd-5')");
  const n = await ev('gameState.db.enrollments.length');
  await ev("T.set('#en-emp','6'); T.click('#en-btn')");
  assert.ok((await ev('T.modal()')).includes('已報名這門課 2027-04-14 的梯次，請先取消再報名'));
  assert.strictEqual(await ev('gameState.db.enrollments.length'), n);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('4 月 13 日')");
  await ev("T.btn('結束對話')");
  step('A05 second session of the same course refused, nothing added');

  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-sessions'); T.click('#sd-2')");
  let m = await ev('T.modal()');
  assert.ok(m.includes('上課日期當天起才能登錄結訓結果') && m.includes('不顯示結訓結果的登錄欄位'), m);
  assert.strictEqual(await ev("!!document.querySelector('#save-results')"), false);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('4 月 14 日')");
  await ev("T.btn('結束對話')");
  await ev("T.at(15,3,'up')"); await key('e'); await ev("T.btn('收下簽到表')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-detail'); T.set('#rs-6','未完成'); T.set('#rs-8','已完成'); T.set('#rs-9','未完成'); T.click('#save-results')");
  assert.ok((await ev('T.modal()')).includes('請假原因只能寫在備註'));
  await ev("T.click('#warn-back'); T.set('#rn-6','請假'); T.click('#save-results')");
  assert.ok((await ev('T.modal()')).includes('已儲存結訓結果（3 筆）'));
  await ev("T.click('#modal-close')");
  step('L2 early record refused, class-day results with leave note');

  await waitFor("gameState.npcs.zhou.visible && T.idle('zhou') && gameState.npcs.zhou.y === 4", 10000);
  await ev("T.at(3,4,'right')"); await key('e'); await ev("T.btn('我到電腦看看')");
  await ev("T.at(1,2,'up')"); await key('e');
  m = await ev('T.modal()');
  assert.ok(m.includes('不能移除報名'), m);
  assert.strictEqual(await ev("document.querySelectorAll('[data-remove]').length"), 0);
  await ev("T.click('#modal-close')");
  await ev("T.at(5,2,'up')"); await key('e');
  await ev("T.click('[data-put=\"S-0414\"]'); T.click('#modal-close')");
  await waitFor("T.modal().includes('4 月 28 日')");
  await ev("T.btn('結束對話')");
  step('L2 remove hidden on class day; sheet filed; two weeks later');

  await waitFor("gameState.npcs.yang.visible && T.idle('yang') && gameState.npcs.yang.x === 4", 10000);
  await ev("T.at(3,3,'right')"); await key('e'); await ev("T.btn('收下成績單')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.set('#rs-9','已完成'); T.click('#save-results')");
  assert.ok((await ev('T.modal()')).includes('沒有寫補考'));
  await ev("T.click('#warn-back'); T.set('#rn-9','4/27 補考通過'); T.click('#save-results')");
  assert.ok((await ev('T.modal()')).includes('改結果前先預測'));
  await ev("T.radio('q0','不會增加')");
  assert.ok((await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.radio('q0','增加 4 小時（TR-310 的時數）'); T.radio('q1','2027-04-14（梯次的上課日期）'); T.radio('q2','改成你和現在的模擬時刻，前一次的被覆蓋'); T.click('#quiz-done')");
  const now = await ev('gameState.db.enrollments.find(e => e.id === 9).result_at');
  assert.ok(now.startsWith('2027-04-28'), now);
  assert.ok((await ev('T.modal()')).includes('已儲存結訓結果（1 筆）'));
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('第二關結算')", 10000);
  const s = await ev('T.modal()');
  assert.ok(s.includes('報名紀錄已刪除') && s.includes(now) && s.includes('2027-04-14') && s.includes('累計 6 小時'), s);
  if (shotDir) await p.shot(path.join(shotDir, which + '-l2-settle.png'));
  step('A06 re-test overwrites result time, completion date stays class day');

  await ev("T.btn('重新開始本關')");
  assert.strictEqual(await ev('gameState.db.enrollments.length'), 9);
  assert.strictEqual(await ev('gameState.clock'), Date.UTC(2027, 3, 12, 9, 0));
  await ev("T.btn('開始')");
  await key('Escape');
  assert.ok((await ev('T.modal()')).includes('暫停'));
  await ev("T.btn('回到標題')");
  assert.strictEqual(await ev("document.querySelector('#title-screen').hidden"), false);
  step('A08 restart resets data and date; Esc pause; back to title');
}

(async () => {
  const p = await launch('file://' + file, 9300 + Math.floor(Math.random() * 500));
  try {
    await p.ev(PAGE_HELPERS);
    const edition = await p.ev("document.querySelector('#edition-tag').textContent");
    const crCards = await p.ev("document.querySelectorAll('[data-start^=\"CR\"]').length");
    if (which === 'midterm') {
      assert.strictEqual(edition, '期中版'); assert.strictEqual(crCards, 0);
      assert.strictEqual(await p.ev('FinalDemo'), null);
      assert.strictEqual(await p.ev("document.body.innerText.includes('期末')"), false);
    } else { assert.ok(edition.startsWith('期末版')); assert.strictEqual(crCards, 1); }
    if (shotDir) await p.shot(path.join(shotDir, which + '-title.png'));
    step('A11 title shows edition ' + edition + ', CR entries: ' + crCards);
    await level1(p);
    await level2(p);
    if (which !== 'midterm') await require('./ui-cr.test.js')(p, shotDir, which);
    const nonFile = p.events.requests.filter(u => !u.startsWith('file://'));
    assert.deepStrictEqual(nonFile, [], 'non-file requests');
    const others = p.events.requests.filter(u => !/\.(html|css|js)$/.test(u));
    assert.deepStrictEqual(others, [], 'only the three web files are loaded (no audio files)');
    assert.deepStrictEqual(p.events.errors, [], 'page errors');
    step('A01/A13 only file:// html/css/js requests (' + p.events.requests.length + '), no page errors');
    console.log('ALL PASSED (' + which + ')');
  } catch (e) {
    console.error('FAILED:', e.message);
    if (shotDir) await p.shot(path.join(shotDir, which + '-fail.png'));
    console.error('page errors:', p.events.errors);
    process.exitCode = 1;
  } finally { await p.close(); }
})();
