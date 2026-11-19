// CR-01 scenario playthrough, called from ui.test.js
const assert = require('assert');
const path = require('path');

module.exports = async function (p, shotDir, which) {
  const { ev, key, waitFor } = p;
  const step = n => console.log('ok  ' + n);
  const noNewFeature = async () => {
    const bad = await ev("[...document.querySelectorAll('#modal button, #modal [role=tab]')].map(b => b.textContent).filter(t => /匯出|CSV|缺訓|到期|職務|有效期限/.test(t))");
    assert.deepStrictEqual(bad, [], 'no To-Be feature buttons');
  };

  await ev("T.btn('CR-01')"); await ev("T.btn('開始觀察')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'seg1');
  await ev("T.at(1,2,'up')"); await key('e');
  const m0 = await ev('T.modal()');
  assert.ok(m0.includes('只供觀察') && m0.includes('不是遊戲省略'), m0);
  await noNewFeature();
  await ev("T.click('#rec-course'); T.set('#rc-course','2')");
  let m = await ev('T.modal()');
  assert.ok(m.includes('洪立偉') && m.includes('蔡宗翰') && !m.includes('楊凱翔'), m);
  await ev("T.click('#tab-employees')");
  assert.ok((await ev('T.modal()')).includes('堆高機司機'));
  await ev("T.click('#tab-records'); T.click('#rec-emp'); T.set('#rq','楊凱翔'); T.submit('#f-emp'); T.click('#hist-9')");
  assert.ok((await ev('T.modal()')).includes('TR-320'));
  await ev("T.click('#modal-close')");
  await ev("T.at(9,5,'right')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('系統還沒上線以前'));
  await ev("T.btn('結束對話')");
  await waitFor("T.modal().includes('一段期間內有效')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'seg2');
  await ev("T.btn('結束對話')");
  step('CR-01 segment 1: completers only, free-text titles, per-person history, pre-system record');

  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-courses')");
  m = await ev("document.querySelector('#tabpanel thead').innerText");
  assert.ok(m.includes('時數') && !/有效|期限|到期/.test(m), 'course list has no validity column: ' + m);
  await ev("T.click('#tab-records'); T.click('#rec-emp'); T.set('#rq','蔡宗翰'); T.submit('#f-emp'); T.click('#hist-8')");
  assert.ok((await ev('T.modal()')).includes('2026-08-20'));
  await ev("T.click('#modal-close')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'seg3');
  await waitFor("T.idle('mgr') && gameState.npcs.mgr.y === 4 && T.idle('kao') && gameState.npcs.kao.y === 2", 10000);
  step('CR-01 segment 2: no validity period on courses or records');

  await ev("T.at(5,5,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('截圖'));
  await ev("T.btn('結束對話')");
  await ev("T.at(9,2,'left')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('這個梯次已額滿'));
  await ev("T.btn('結束對話')");
  const n = await ev('gameState.db.enrollments.length');
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-sessions'); T.click('#sd-23')");
  m = await ev('T.modal()');
  assert.ok(m.includes('自行報名') && m.includes('人資代報'), m);
  assert.strictEqual(await ev("!!document.querySelector('#en-btn') || !!document.querySelector('#save-results') || !!document.querySelector('[data-remove]') || !!document.querySelector('#st-toggle') || !!document.querySelector('#f-session')"), false, 'read-only');
  await noNewFeature();
  await ev("T.click('#modal-close')");
  assert.strictEqual(await ev('gameState.db.enrollments.length'), n, 'no data change');
  assert.strictEqual(await ev('gameState.cr.stage'), 'request');
  step('CR-01 segment 3: no export, full session, roster shows no required/voluntary');

  await ev("T.at(3,3,'right')"); await key('e');
  await ev("T.btn('開始需求釐清練習')");
  await waitFor("T.modal().includes('需求釐清練習')");
  assert.strictEqual(await ev("document.querySelector('#btn-to-settle').disabled"), true);
  const k = await ev("document.querySelectorAll('ol.classify > li').length");
  for (let i = 0; i < k; i++) await ev("T.radio('st" + i + "','obs')");
  await ev("document.querySelector('.impacts input').click(); T.set('#cr-notes','缺訓從哪一天算起？')");
  await ev("T.click('#btn-to-settle')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('觀察到的業務事件') && s.includes('利害關係人的新要求（CR-01') && s.includes('可能受影響項目') && s.includes('回到實際系統確認'), s);
  assert.ok(s.includes('TR-101') && s.includes('2027-01-20') && s.includes('缺訓從哪一天算起'), s);
  for (const leak of ['職稱對照', '職務清單', '存成欄位', '查詢時計算', '優先', 'CSV 的欄位']) assert.ok(!s.includes(leak), 'settlement hints a decision: ' + leak);
  if (shotDir) await p.shot(path.join(shotDir, which + '-cr01-settle.png'));
  step('A10 CR-01 exercise and 4-block settlement without decision answers');
  await ev("T.btn('重新開始此情境')");
  assert.strictEqual(await ev('gameState.cr.stage + gameState.cr.clues.length'), 'seg10');
  await ev("T.btn('開始觀察')");
  await key('Escape'); await ev("T.btn('回到標題')");
};
