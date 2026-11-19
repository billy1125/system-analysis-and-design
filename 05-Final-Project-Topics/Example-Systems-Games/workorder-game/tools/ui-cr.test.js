// CR-01 scenario playthrough, called from ui.test.js
const assert = require('assert');
const path = require('path');

module.exports = async function (p, shotDir, which) {
  const { ev, key, waitFor } = p;
  const step = n => console.log('ok  ' + n);

  await ev("T.btn('CR-01')"); await ev("T.btn('開始觀察')");
  assert.ok((await ev("document.querySelector('#identity').textContent")).includes('系統分析師'));
  // planner computer: read-only, no create tab
  await ev("T.at(1,2,'up')"); await key('e');
  assert.strictEqual(await ev("!!document.querySelector('#tab-new')"), false);
  await ev("T.click('#det-1')");
  let m = await ev('T.modal()');
  assert.ok(m.includes('生產中') && m.includes('剩 2 天'), m);
  assert.strictEqual(await ev("document.querySelectorAll('[data-act]').length"), 0);
  await ev("T.click('#modal-close')");
  // center computer: finish button only shown disabled
  await ev("T.at(14,2,'up')"); await key('e');
  await ev("T.click('#det-1')");
  assert.deepStrictEqual(await ev("[...document.querySelectorAll('#actions button')].map(b => b.textContent + ':' + b.disabled)"), ['完工回報:true']);
  assert.strictEqual(await ev("!!document.querySelector('#f-action')"), false);
  await ev("T.click('#modal-close')");
  step('CR-01 list and detail show no progress; actions read-only');

  await ev("T.at(14,2,'right')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('只有一個「完工回報」'));
  await ev("T.btn('問組長')");
  assert.ok((await ev('T.modal()')).includes('只預測，不送出'));
  await ev("T.radio('q0','已完工'); T.radio('q1','不能，已完工的單沒有任何處理動作'); T.radio('q2','會接受'); T.click('#quiz-done')");
  assert.strictEqual(await ev('findOrder(gameState.db, 1).status'), '生產中', 'prediction only, nothing submitted');
  await ev("T.at(17,2,'up')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(17,4,'right')"); await key('e'); await ev("T.btn('結束對話')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'report');
  step('CR-01 leader, prediction only, board and handover sheet');

  await ev("T.at(3,3,'right')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('花了多少工時'));
  await ev("T.btn('好，我去查')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-open'); T.click('#det-1')");
  assert.ok((await ev('T.modal()')).includes('沒有作業員或工時的欄位'));
  await ev("T.click('#tab-history'); T.set('#hist-month','2027-10')");
  m = await ev('T.modal()');
  assert.ok(m.includes('情境模擬示意') && m.includes('共 6 筆'), m);
  await ev("T.click('#hd-11')"); await ev("T.click('#hd-12')");
  assert.ok((await ev('T.modal()')).includes('夾傷'));
  assert.strictEqual(await ev("[...document.querySelectorAll('#modal button')].filter(b => /分批|工時|不良原因|累計/.test(b.textContent)).length"), 0);
  await ev("T.click('#modal-close')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'request');
  step('CR-01 follow-up: no labor fields, defect reasons only in notes');

  await ev("T.at(3,3,'right')"); await key('e');
  await ev("T.btn('開始需求釐清練習')");
  await waitFor("T.modal().includes('需求釐清練習')");
  assert.strictEqual(await ev("document.querySelector('#btn-to-settle').disabled"), true);
  const n = await ev("document.querySelectorAll('ol.classify > li').length");
  for (let i = 0; i < n; i++) await ev("T.radio('st" + i + "','obs')");
  await ev("document.querySelector('.impacts input').click(); T.set('#cr-notes','作業員旁邊有電腦嗎？')");
  await ev("T.click('#btn-to-settle')");
  const s = await ev('T.modal()');
  assert.ok(s.includes('觀察到的業務事件') && s.includes('利害關係人的新要求（CR-01') && s.includes('可能受影響項目') &&
    s.includes('回到實際系統確認') && s.includes('3.4') && s.includes('作業員旁邊有電腦嗎'));
  assert.ok(!/停工|途程|排程與產能|物料領用|重工|報廢|客戶訂單管理/.test(s), 'out-of-scope topics absent');
  if (shotDir) await p.shot(path.join(shotDir, which + '-cr01-settle.png'));
  step('CR-01 exercise and 4-block settlement, out-of-scope topics absent');
  await ev("T.btn('重新開始此情境')");
  assert.deepStrictEqual(await ev('[gameState.cr.clues.length, gameState.cr.stage]'), [0, 'explore']);
  await ev("T.btn('開始觀察')");
  await ev("T.click('#btn-pause')"); await ev("T.btn('回到標題')");
  step('A09 CR-01 restart resets');
};
