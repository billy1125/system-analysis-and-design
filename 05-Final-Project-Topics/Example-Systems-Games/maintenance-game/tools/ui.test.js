// Headless UI playthrough. Run: node tools/ui.test.js [source|midterm|final] [shotDir]
//   source  : ./index.html (default)
//   midterm : dist/midterm/index.html (run tools/build.sh first)
//   final   : dist/final/index.html
const path = require('path');
const assert = require('assert');
const { launch, PAGE_HELPERS } = require('./cdp');

const which = process.argv[2] || 'source';
const shotDir = process.argv[3] || null;
const root = path.join(__dirname, '..');
const file = which === 'midterm' ? path.join(root, 'dist', 'midterm', 'index.html')
  : which === 'final' ? path.join(root, 'dist', 'final', 'index.html') : path.join(root, 'index.html');
const isMidterm = which === 'midterm';

function step(name) { console.log('ok  ' + name); }
const port = () => 9300 + Math.floor(Math.random() * 500);

async function level1(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('第一關')");
  await ev("T.btn('開始')");
  // A15 music and sound toggles
  assert.strictEqual(await ev('Sound.isPlaying()'), true, 'music starts with the level');
  assert.strictEqual(await ev("T.click('#btn-music'); document.querySelector('#btn-music').textContent + '|' + document.querySelector('#btn-music').getAttribute('aria-pressed') + '|' + Sound.isPlaying()"), '音樂：關|false|false');
  assert.strictEqual(await ev("T.click('#btn-sfx'); document.querySelector('#btn-sfx').getAttribute('aria-pressed') + '|' + Sound.isSfxOn()"), 'false|false');
  assert.strictEqual(await ev("T.click('#btn-music'); T.click('#btn-sfx'); [Sound.isMusicOn(), Sound.isSfxOn(), Sound.isPlaying(), document.querySelector('#btn-music').getAttribute('aria-pressed')].join()"), 'true,true,true,true');
  step('A15 music/sfx toggles, aria-pressed, music restarts');

  // A02 movement: one tile per key, blocked by walls and objects
  await ev("document.querySelector('#map-wrap').focus(); T.at(3,4,'up')");
  await key('w'); assert.strictEqual(await ev('gameState.player.y'), 3);
  await key('w'); await key('w'); assert.strictEqual(await ev('gameState.player.y'), 2, 'phone blocks');
  await ev("T.at(1,4,'left')"); await key('a');
  assert.strictEqual(await ev('gameState.player.x'), 1, 'wall blocks');
  await ev("T.at(2,5,'down')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('鄭國榮'));
  await key('w');
  assert.strictEqual(await ev('gameState.player.y'), 5, 'no move while dialog open');
  await ev("T.btn('結束對話')");
  step('A02 movement, walls, dialog stops movement');

  // A03 due list and filter
  await ev("T.at(1,2,'up')"); await key('e');
  let m = await ev('T.modal()');
  assert.ok(m.includes('逾期 1 項、7 天內到期 2 項') && m.includes('教學提示'), m);
  assert.strictEqual(await ev("document.querySelectorAll('[data-plan]').length"), 6);
  assert.ok(!m.includes('80 噸沖床'), 'inactive equipment not listed');
  await ev("T.set('#f-owner','3')");
  m = await ev('T.modal()');
  assert.strictEqual(await ev("document.querySelectorAll('[data-plan]').length"), 2);
  assert.ok(m.includes('逾期 1 項、7 天內到期 2 項') && m.includes('件數統計不受篩選影響'));
  assert.strictEqual(await ev('gameState.flags.filtered'), true);
  await ev("T.click('#rec-1')");
  assert.ok((await ev('T.modal()')).includes('還沒到'), 'record form gated by inspection');
  await ev("T.set('#f-owner','')");
  await ev("T.click('#rec-5')");
  assert.ok((await ev('T.modal()')).includes('不檢查是不是負責人'));
  await ev("T.click('#modal-close')");
  step('A03 due list counts, owner filter keeps summary, gates');

  // manual work: phone, tag, inspection
  await ev("T.at(9,2,'down')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('還沒和沖壓線班長'));
  await ev("T.btn('結束對話')");
  await ev("T.at(3,2,'up')"); await key('e');
  await ev("T.set('#in-ext','3101'); T.submit('#f-phone')");
  assert.ok((await ev('T.modal()')).includes('江明德'));
  await ev("T.set('#in-ext','3201'); T.submit('#f-phone')");
  await ev("T.click('#modal-close')");
  await ev("T.at(9,2,'down')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('先到吊牌架'));
  await ev("T.btn('結束對話')");
  await ev("T.at(5,2,'up')"); await key('e');
  await ev("T.click('[data-take=\"T-1\"]'); T.click('[data-take=\"T-2\"]'); T.click('#modal-close')");
  await ev("T.at(9,2,'down')"); await key('e');
  await ev("T.btn('掛上保養中吊牌 T-1')");
  assert.strictEqual(await ev("gameState.cards['T-1']"), 'EQ-101');
  assert.strictEqual(await ev("document.querySelector('[data-equip=\"EQ-101\"]').classList.contains('tagged')"), true);
  await key('e'); await ev("T.btn('完成逐項檢查')");
  assert.strictEqual(await ev("gameState.flags.jobs['EQ-101'].inspected"), true);
  step('phone, tag and inspection are scene tasks outside the system');

  // A05 / A04 record EQ-101
  const n0 = await ev('gameState.db.pm_records.length');
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#rec-1')");
  assert.strictEqual(await ev("document.querySelector('#rf-date').value"), '2027-10-20', 'date defaults to today');
  await ev("document.querySelector('#rf-date').focus()");
  await key('w'); await key('a');
  assert.deepStrictEqual(await ev('[gameState.player.x, gameState.player.y]'), [1, 2], 'typing does not move');
  await ev("T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('第 1 項還沒選結果'));
  await ev("T.click('#rf-allnormal'); T.set('#rf-date','2027-10-21'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('保養日期不能晚於今天'));
  await ev("T.set('#rf-date','2027-09-22'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('保養日期必須晚於上一次保養日（2027-09-22）'));
  await ev("T.set('#rf-date','2027-10-19'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('本關請以實際保養日'));
  assert.strictEqual(await ev('gameState.db.pm_records.length'), n0, 'failures add nothing');
  await ev("T.set('#rf-date','2027-10-20'); T.submit('#f-record')");
  m = await ev('T.modal()');
  assert.ok(m.includes('已登錄保養：EQ-101 月保養（2027-10-20），下次應保養日 2027-11-19'), m);
  assert.strictEqual(await ev('gameState.db.pm_records.length'), n0 + 1);
  await ev("T.click('#modal-close')");
  step('A05 validation order in UI, backfill coach block, A04 record EQ-101');

  // EQ-201 with abnormal item and prediction
  await ev("T.at(15,2,'down')"); await key('e');
  await ev("T.btn('掛上保養中吊牌 T-2')");
  await key('e'); await ev("T.btn('完成逐項檢查')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#rec-4'); T.click('#rf-allnormal'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('第 2 項「檢查切削液濃度與液位」'));
  await ev("T.click('#warn-back'); T.radio('res-1','異常'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('第 2 項為異常或未執行，請填寫說明'));
  await ev("T.set('#rm-1','濃度 3%，已補充原液'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('送出前先預測'));
  assert.strictEqual(await ev("document.querySelector('#quiz-done').disabled"), true);
  await ev("T.radio('q0', document.querySelectorAll('input[name=q0]')[0].value)");
  assert.ok((await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.radio('q0', document.querySelectorAll('input[name=q0]')[1].value); T.radio('q1', document.querySelectorAll('input[name=q1]')[1].value)");
  assert.ok((await ev('T.modal()')).includes('和系統規則相同'));
  await ev("T.click('#quiz-done')");
  m = await ev('T.modal()');
  assert.ok(m.includes('下次應保養日 2027-11-19') && m.includes('有異常'), m);
  assert.strictEqual(await ev("recordResult(gameState.db, gameState.flags.jobs['EQ-201'].recordId)"), '有異常');
  assert.ok((await ev("document.querySelector('#hud-stats').innerText")).includes('逾期 1 項、7 天內到期 0 項'));
  await ev("T.click('#modal-close')");
  step('mismatch warning, remark required, prediction with re-answer, result 有異常');

  await ev("T.at(9,2,'down')"); await key('e'); await ev("T.btn('取下保養中吊牌 T-1')");
  await ev("T.at(15,2,'down')"); await key('e'); await ev("T.btn('取下保養中吊牌 T-2')");
  await ev("T.at(5,2,'up')"); await key('e');
  await ev("T.click('[data-put=\"T-1\"]'); T.click('[data-put=\"T-2\"]'); T.click('#modal-close')");
  await waitFor("T.modal().includes('第一關結算')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('實際系統待查證') && s.includes('pm_record_items') && s.includes('有異常') && !s.includes('ERD'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l1-settle.png'));
  step('A04 tags back, settlement with records and items');
  await ev("T.btn('下一關')");
}

async function level2(p) {
  const { ev, key, waitFor } = p;
  await ev("T.btn('開始')");
  await ev("T.at(1,2,'up')"); await key('e');
  let m = await ev('T.modal()');
  assert.ok(m.includes('逾期 8 天') && m.includes('逾期 1 項、7 天內到期 1 項'), m);
  await ev("T.click('#rec-3')");
  assert.ok((await ev('T.modal()')).includes('還沒保養'));
  await ev("T.click('#modal-close')");
  await ev("T.at(9,6,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('還沒和沖壓線班長'));
  await ev("T.btn('結束對話')");
  await ev("T.at(3,2,'up')"); await key('e');
  await ev("T.set('#in-ext','3101'); T.submit('#f-phone')");
  assert.ok((await ev('T.modal()')).includes('下午兩點'));
  await ev("T.click('#modal-close')");
  await ev("T.at(9,6,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('下午兩點才能停機'));
  await ev("T.btn('結束對話')");
  await ev("T.at(2,5,'down')"); await key('e');
  m = await ev('T.modal()');
  assert.ok(m.includes('系統沒有延期這個功能'));
  assert.strictEqual(await ev("[...document.querySelectorAll('#modal button')].filter(b => /延期/.test(b.textContent)).length"), 0, 'no delay action');
  await ev("T.btn('知道了')");
  await waitFor("T.modal().includes('下午 2:00')");
  assert.strictEqual(await ev('fmtHM(gameState.clock)'), '14:00');
  await ev("T.btn('結束對話')");
  step('L2 overdue shown, stop-machine call, no delay function, afternoon');

  await ev("T.at(5,2,'up')"); await key('e'); await ev("T.click('[data-take=\"T-1\"]'); T.click('#modal-close')");
  await ev("T.at(9,6,'up')"); await key('e'); await ev("T.btn('掛上保養中吊牌 T-1')");
  await key('e'); await ev("T.btn('完成逐項檢查')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#rec-3'); T.click('#rf-allnormal'); T.set('#rf-date','2027-11-06'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('保養日期不能晚於今天'));
  await ev("T.set('#rf-date','2027-10-28'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('系統會接受這個日期'));
  assert.strictEqual(await ev('gameState.flags.recordId'), null, 'backfill not allowed to pass');
  await ev("T.set('#rf-date','2027-11-05'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('備註是空的'));
  await ev("T.click('#warn-back'); T.set('#rf-note','沖壓線趕貨，下午才停機；原訂 10-28'); T.submit('#f-record')");
  assert.ok((await ev('T.modal()')).includes('④ 如果把保養日期填成原訂日'));
  for (let i = 0; i < 4; i++) await ev("T.radio('q" + i + "', document.querySelectorAll('input[name=q" + i + "]')[" + (i === 1 ? 2 : 1) + "].value)");
  assert.ok(!(await ev('T.modal()')).includes('和系統規則不同'));
  await ev("T.click('#quiz-done')");
  m = await ev('T.modal()');
  assert.ok(m.includes('下次應保養日 2027-12-05') && m.includes('逾期 8 天都沒有存下來'), m);
  assert.strictEqual(await ev("planState(gameState.db, 3, todayStr(gameState)).due_status"), '未到期');
  await ev("T.click('#tab-history'); T.set('#hist-eq','2')");
  m = await ev('T.modal()');
  assert.ok(m.includes('沖壓線趕貨，下午才停機') && !m.includes('原訂應保養日'));
  await ev("T.click('#modal-close')");
  step('A06 future date rejected, backfill blocked by coach, record today, next due 12-05');

  await ev("T.at(9,6,'up')"); await key('e'); await ev("T.btn('取下保養中吊牌 T-1')");
  await ev("T.at(5,2,'up')"); await key('e'); await ev("T.click('[data-put=\"T-1\"]'); T.click('#modal-close')");
  await waitFor("T.modal().includes('第二關結算')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('逾期天數') && s.includes('沒有記錄') && s.includes('2027-12-05') && s.includes('會被接受'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-l2-settle.png'));
  step('L2 settlement compares actual vs recorded');
  // A08 restart restores data
  const n = await ev('gameState.db.pm_records.length');
  await ev("T.btn('重新開始本關')");
  assert.strictEqual(await ev('gameState.db.pm_records.length'), n - 1);
  assert.strictEqual(await ev('gameState.flags.afternoon'), false);
  await ev("T.btn('開始')");
  await key('Escape');
  assert.ok((await ev('T.modal()')).includes('暫停'));
  await ev("T.btn('回到標題')");
  assert.strictEqual(await ev("document.querySelector('#title-screen').hidden"), false);
  assert.strictEqual(await ev('Sound.isPlaying()'), false, 'music stops at title');
  step('A08 restart resets data; Esc pause; title stops music');
}

async function noWebAudio() {
  const p = await launch('file://' + file, port());
  try {
    await p.ev(PAGE_HELPERS);
    await p.ev('window.AudioContext = undefined; window.webkitAudioContext = undefined; true');
    await p.ev("T.btn('第一關')");
    await p.ev("T.btn('開始')");
    await p.ev("document.querySelector('#map-wrap').focus(); T.at(3,4,'up')");
    await p.key('w'); await p.key('w');
    await p.ev("T.at(1,2,'up')"); await p.key('e');
    assert.ok((await p.ev('T.modal()')).includes('待保養清單'));
    assert.strictEqual(await p.ev('Sound.isPlaying()'), false);
    assert.deepStrictEqual(p.events.errors, [], 'page errors without Web Audio');
    step('A15 no Web Audio: silent, no errors, game continues');
  } finally { await p.close(); }
}

(async () => {
  const p = await launch('file://' + file, port());
  try {
    await p.ev(PAGE_HELPERS);
    const edition = await p.ev("document.querySelector('#edition-tag').textContent");
    const crCards = await p.ev("document.querySelectorAll('[data-start^=\"CR\"]').length");
    if (isMidterm) {
      assert.strictEqual(edition, '期中版'); assert.strictEqual(crCards, 0); assert.strictEqual(await p.ev('FinalDemo'), null);
      assert.ok(!(await p.ev('document.body.innerText')).includes('期末'));
    } else { assert.ok(edition.startsWith('期末版')); assert.strictEqual(crCards, 1); }
    if (shotDir) await p.shot(path.join(shotDir, which + '-title.png'));
    step('A12 title shows edition ' + edition + ', CR entries: ' + crCards);
    await level1(p);
    await level2(p);
    if (!isMidterm) await require('./ui-cr.test.js')(p, shotDir, which);
    // data: URLs are the browser's own date-picker icon, not a network request
    const nonFile = p.events.requests.filter(u => !u.startsWith('file://') && !u.startsWith('data:'));
    assert.deepStrictEqual(nonFile, [], 'non-file requests');
    const names = Array.from(new Set(p.events.requests.filter(u => u.startsWith('file://')).map(u => u.split('/').pop())));
    assert.ok(names.every(n => ['index.html', 'style.css', 'game.js'].includes(n)), 'only three files: ' + names.join());
    assert.deepStrictEqual(p.events.errors, [], 'page errors');
    step('A01 only file:// requests to the three files (' + names.join(', ') + '), no page errors');
  } catch (e) {
    console.error('FAILED:', e.message);
    if (shotDir) await p.shot(path.join(shotDir, which + '-fail.png'));
    console.error('page errors:', p.events.errors);
    process.exitCode = 1;
  } finally { await p.close(); }
  if (process.exitCode) return;
  try { await noWebAudio(); } catch (e) { console.error('FAILED:', e.message); process.exitCode = 1; return; }
  console.log('ALL PASSED (' + which + ')');
})();
