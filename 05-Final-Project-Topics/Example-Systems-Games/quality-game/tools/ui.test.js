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
  assert.strictEqual(await ev('Sound.isPlaying() || !window.AudioContext'), true, 'music starts with the level');
  await waitFor("T.idle('lead') && gameState.npcs.lead.x === 7 && gameState.npcs.lead.y === 3");
  // A13 sound toggles
  assert.strictEqual(await ev("T.click('#btn-music'); document.querySelector('#btn-music').textContent"), '音樂：關');
  assert.strictEqual(await ev("document.querySelector('#btn-music').getAttribute('aria-pressed')"), 'false');
  assert.strictEqual(await ev('Sound.isPlaying()'), false);
  assert.strictEqual(await ev("T.click('#btn-sfx'); document.querySelector('#btn-sfx').textContent + document.querySelector('#btn-sfx').getAttribute('aria-pressed')"), '音效：關false');
  assert.strictEqual(await ev("T.click('#btn-music'); T.click('#btn-sfx'); [Sound.isMusicOn(), Sound.isSfxOn(), document.querySelector('#btn-music').getAttribute('aria-pressed')].join()"), 'true,true,true');
  step('A13 music and sfx toggles, aria-pressed in sync');

  // A02 movement: one tile per key, blocked by the computer
  await ev("document.querySelector('#map-wrap').focus(); T.at(2,2,'right')");
  await key('w'); assert.strictEqual(await ev('gameState.player.y'), 1);
  await key('s');
  await ev("T.at(1,2,'right')"); await key('w');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [1, 2], 'computer blocks');
  await ev("T.at(6,3,'right')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('分模線有毛邊'));
  await key('a');
  assert.strictEqual(await ev('gameState.player.x'), 6, 'no move while dialog open');
  await ev("T.btn('記下口頭回報')");
  assert.ok((await ev("document.querySelector('#hud-extra').innerText")).includes('L271105-01'));
  step('L1 movement, talk, note recorded in HUD');

  await ev("T.at(1,2,'up')"); await key('e');
  assert.ok(await ev('T.open()'));
  await ev("T.click('#tab-new')");
  await ev("document.querySelector('#nw-reporter').focus()");
  await key('w'); await key('a');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [1, 2], 'typing does not move');
  await ev("T.click('#nw-fill'); T.submit('#f-new')");
  let m = await ev('T.modal()');
  assert.ok(m.includes('請選擇異常類別'), m);
  assert.strictEqual(await ev('gameState.db.issues.length'), 3);
  await ev("T.set('#nw-reporter',''); T.submit('#f-new')");
  m = await ev('T.modal()');
  assert.ok(m.includes('請輸入回報人') && !m.includes('請選擇異常類別'), 'one message at a time');
  await ev("T.set('#nw-reporter','鄭國良'); T.set('#nw-type','1'); T.submit('#f-new')");
  assert.ok((await ev('T.modal()')).includes('外觀不良'), 'coach mismatch warning');
  await ev("T.click('#warn-back'); T.set('#nw-type','2'); T.submit('#f-new')");
  m = await ev('T.modal()');
  assert.ok(m.includes('已登記異常單 QI-2711-003') && m.includes('沒有系統帳號'), m);
  const iss = await ev('JSON.stringify(findIssue(gameState.db, 4))');
  const o = JSON.parse(iss);
  assert.strictEqual(o.status, '待處理'); assert.strictEqual(o.reporter, '鄭國良'); assert.strictEqual(o.created_by, 1);
  step('A03/A04 register: validation one by one, coach warning, QI-2711-003 created');

  await ev("T.click('#tab-open')");
  assert.ok((await ev('T.modal()')).includes('待處理 2 件、處理中 1 件'));
  await ev("T.click('#det-4'); T.click('#act-assign')");
  assert.ok((await ev('T.modal()')).includes('周家豪 3101'));
  assert.strictEqual(await ev('gameState.flags.sawContacts'), true);
  await ev("T.click('#modal-close')");
  await ev("T.at(3,2,'up')"); await key('e');
  await ev("T.set('#in-ext','3101'); T.submit('#f-phone')");
  assert.ok((await ev('T.modal()')).includes('QI-2711-003'));
  await ev("T.click('#modal-close')");
  step('L1 contacts seen in assign list, phone outside system');

  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#det-4'); T.click('#act-assign'); T.set('#ac-dept','2'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('歸製造一課'));
  await ev("T.set('#ac-dept','1'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('已指派給 製造一課'));
  assert.strictEqual(await ev('findIssue(gameState.db, 4).status'), '處理中');
  assert.strictEqual(await ev('findIssue(gameState.db, 4).updated_at'), null);
  await ev("T.click('#modal-close')");
  await waitFor("T.open() && T.modal().includes('14:20')");
  await ev("T.btn('記下回覆內容')");
  step('L1 assign, callback after time jump');

  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#det-4'); T.click('#act-close'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('請輸入處理對策'));
  assert.strictEqual(await ev('findIssue(gameState.db, 4).status'), '處理中');
  await ev("T.click('#ac-fill'); T.submit('#f-action')");
  m = await ev('T.modal()');
  assert.ok(m.includes('已結案 QI-2711-003') && m.includes('沒有任何操作按鈕'), m);
  assert.strictEqual(await ev("document.querySelectorAll('[data-act]').length"), 0);
  const c = JSON.parse(await ev('JSON.stringify(findIssue(gameState.db, 4))'));
  assert.strictEqual(c.closed_by, 1); assert.strictEqual(c.closed_at.slice(11), '14:2' + c.closed_at.slice(15));
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('第一關結算')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('實際系統待查證') && s.includes('待處理 1 件、處理中 1 件') && !s.includes('ERD'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l1-settle.png'));
  step('A03 close: empty countermeasure refused, closed has no buttons, settlement');
  await ev("T.btn('下一關')");
}

async function level2(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('開始')");
  await waitFor("T.open() && T.modal().includes('賴怡君')");
  await ev("T.btn('記下來電內容')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#det-1'); T.click('#act-assign')");
  assert.strictEqual(await ev("document.querySelector('#ac-dept').value"), '2', 'reassign defaults to current department');
  await ev("T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('責任單位沒有變更'));
  assert.strictEqual(await ev('findIssue(gameState.db, 1).assigned_at'), '2027-11-03 15:10');
  step('A05 reassign to same department refused, no change');

  await ev("T.set('#ac-dept','5'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('改派前先預測'));
  assert.strictEqual(await ev("document.querySelector('#quiz-done').disabled"), true);
  await ev("T.radio('q0','製造二課')");
  assert.ok((await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.radio('q0','採購課'); T.radio('q1','變成這次改派的操作時刻'); T.radio('q2', document.querySelectorAll('input[name=q2]')[2].value)");
  await ev("T.click('#quiz-done')");
  const now = await ev('nowStr(gameState)');
  const a = JSON.parse(await ev('JSON.stringify(findIssue(gameState.db, 1))'));
  assert.strictEqual(a.dept_id, 5); assert.strictEqual(a.status, '處理中'); assert.ok(a.assigned_at <= now);
  assert.ok((await ev('T.modal()')).includes('已改派給 採購課'));
  assert.strictEqual(await ev('issueDays(findIssue(gameState.db, 1), todayStr(gameState))'), 2);
  step('A06 prediction with re-answer, reassign overwrites three fields, status stays');

  await ev("T.click('#det-back'); T.click('#det-2'); T.click('#act-reject'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('先到檢驗台'));
  await ev("T.click('#modal-close')");
  await ev("T.at(4,6,'down')"); await key('e');
  await ev("T.btn('記下複量結果')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#det-2'); T.click('#act-reject'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('請輸入不成立的理由'));
  await ev("T.click('#ac-fill'); T.submit('#f-action')");
  assert.ok((await ev('T.modal()')).includes('已判定 QI-2711-002 不成立'));
  const b = JSON.parse(await ev('JSON.stringify(findIssue(gameState.db, 2))'));
  assert.strictEqual(b.status, '不成立'); assert.strictEqual(b.dept_id, null); assert.ok(b.resolution.includes('卡尺'));
  assert.strictEqual(await ev("document.querySelectorAll('[data-act]').length"), 0);
  await ev("T.click('#modal-close')");
  await waitFor("T.modal().includes('第二關結算')", 10000);
  const s = await ev('T.modal()');
  assert.ok(s.includes('製造二課') && s.includes('採購課') && s.includes('沒有指派過'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l2-settle.png'));
  step('A06 reject: reason required, department stays empty; settlement compares actual vs recorded');

  // A09 restart restores data
  await ev("T.btn('重新開始本關')");
  assert.strictEqual(await ev('findIssue(gameState.db, 1).dept_id'), 2);
  await ev("T.btn('開始')");
  await waitFor("T.open() && T.modal().includes('賴怡君')");
  await ev("T.btn('記下來電內容')");
  await key('Escape');
  assert.ok((await ev('T.modal()')).includes('暫停'));
  await ev("T.btn('回到標題')");
  assert.strictEqual(await ev("document.querySelector('#title-screen').hidden"), false);
  assert.strictEqual(await ev('Sound.isPlaying()'), false, 'music stops at title');
  step('A09 restart resets data; Esc pause menu; back to title stops music');
}

// A13: no Web Audio support must not break the game
async function noAudio(url) {
  const p = await launch(url, 9300 + Math.floor(Math.random() * 500));
  try {
    await p.ev(PAGE_HELPERS);
    await p.ev('window.AudioContext = undefined; window.webkitAudioContext = undefined; true');
    await p.ev("T.btn('第一關')");
    await p.ev("T.btn('開始')");
    await p.ev("T.at(2,2,'up')"); await p.key('w'); await p.key('s');
    assert.strictEqual(await p.ev('Sound.isPlaying()'), false);
    assert.deepStrictEqual(p.events.errors, [], 'page errors without Web Audio');
    step('A13 without Web Audio: no errors, game playable');
  } finally { await p.close(); }
}

(async () => {
  const url = 'file://' + file;
  const p = await launch(url, 9300 + Math.floor(Math.random() * 500));
  try {
    await p.ev(PAGE_HELPERS);
    const edition = await p.ev("document.querySelector('#edition-tag').textContent");
    const crCards = await p.ev("document.querySelectorAll('[data-start^=\"CR\"]').length");
    if (which === 'midterm') {
      assert.strictEqual(edition, '期中版'); assert.strictEqual(crCards, 0); assert.strictEqual(await p.ev('FinalDemo'), null);
      assert.strictEqual(await p.ev("document.body.innerText.includes('期末')"), false);
    } else { assert.ok(edition.startsWith('期末版')); assert.strictEqual(crCards, 1); }
    if (shotDir) await p.shot(path.join(shotDir, which + '-title.png'));
    step('A12 title shows edition ' + edition + ', CR entries: ' + crCards);
    await level1(p);
    await level2(p);
    if (which !== 'midterm') await require('./ui-cr.test.js')(p, shotDir, which);
    // data: URIs are Chrome's own date picker icons, not network requests
    const nonFile = p.events.requests.filter(u => !u.startsWith('file://') && !u.startsWith('data:'));
    assert.deepStrictEqual(nonFile, [], 'non-file requests');
    const audio = p.events.requests.filter(u => /\.(mp3|wav|ogg|m4a|aac)$/i.test(u));
    assert.deepStrictEqual(audio, [], 'audio files requested');
    assert.deepStrictEqual(p.events.errors, [], 'page errors');
    step('A01 only file:// requests (' + p.events.requests.length + '), no audio files, no page errors');
  } catch (e) {
    console.error('FAILED:', e.message);
    if (shotDir) await p.shot(path.join(shotDir, which + '-fail.png'));
    console.error('page errors:', p.events.errors);
    process.exitCode = 1;
  } finally { await p.close(); }
  if (process.exitCode) return;
  try { await noAudio(url); console.log('ALL PASSED (' + which + ')'); }
  catch (e) { console.error('FAILED:', e.message); process.exitCode = 1; }
})();
