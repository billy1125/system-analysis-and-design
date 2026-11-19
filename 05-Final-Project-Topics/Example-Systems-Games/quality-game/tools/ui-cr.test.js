// CR-01 scenario playthrough, called from ui.test.js
const assert = require('assert');
const path = require('path');

module.exports = async function (p, shotDir, which) {
  const { ev, key, waitFor } = p;
  const step = n => console.log('ok  ' + n);

  await ev("T.btn('CR-01')"); await ev("T.btn('開始觀察')");
  await ev("T.at(1,2,'up')"); await key('e');
  const tabs = await ev("[...document.querySelectorAll('[data-tab]')].map(b => b.textContent).join()");
  assert.ok(!tabs.includes('登記') && !/確認|退回|歷程/.test(tabs), tabs);
  await ev("T.click('#tab-search'); T.set('#sq-keyword','毛邊'); T.submit('#f-search')");
  assert.ok((await ev('T.modal()')).includes('共 3 筆'));
  await ev("T.click('#det-1')");
  assert.strictEqual(await ev("document.querySelectorAll('[data-act]').length"), 0, 'closed issue has no buttons');
  await ev("T.click('#det-back'); T.click('#det-4')");
  const acts = await ev("[...document.querySelectorAll('[data-act]')].map(b => b.textContent + (b.disabled ? ':off' : ':on')).join()");
  assert.strictEqual(acts, '修改:off,改派:off,結案:off,判定不成立:off');
  assert.strictEqual(await ev("[...document.querySelectorAll('#modal button')].filter(b => /確認|退回|重新開啟|歷程/.test(b.textContent)).length"), 0);
  await ev("T.click('#modal-close')");
  step('CR-01 search 毛邊 finds 3, closed issue has no buttons, open issue buttons read-only, no To-Be features');

  await ev("T.at(12,4,'up')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(16,6,'up')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(9,2,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('QI-2710-005'));
  await ev("T.btn('結束對話')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-search'); T.set('#sq-keyword','黑點'); T.submit('#f-search'); T.click('#det-3')");
  const d = await ev('T.modal()');
  assert.ok(d.includes('2027-10-12 08:50') && d.includes('2027-10-18 09:30') && d.includes('採購課') && !d.includes('製造二課'));
  assert.strictEqual(await ev('gameState.cr.stage'), 'request');
  await ev("T.click('#modal-close')");
  step('CR-01 field talks and 6-day gap clue complete the observations');

  await ev("T.at(9,2,'up')"); await key('e');
  await ev("T.btn('開始需求釐清練習')");
  await waitFor("T.modal().includes('需求釐清練習')");
  assert.strictEqual(await ev("document.querySelector('#btn-to-settle').disabled"), true);
  const n = await ev("document.querySelectorAll('ol.classify > li').length");
  for (let i = 0; i < n; i++) await ev("T.radio('st" + i + "','obs')");
  await ev("document.querySelector('.impacts input').click(); T.set('#cr-notes','誰來確認對策？')");
  await ev("T.click('#btn-to-settle')");
  const s = await ev('T.modal()');
  ['觀察到的業務事件', '利害關係人的新要求（CR-01', '可能受影響項目', '回到實際系統確認', 'QI-2610-003', '誰來確認對策', '判定不成立是否也需要有人確認', '改版後要怎麼看待'].forEach(t => assert.ok(s.includes(t), 'settlement missing ' + t));
  if (shotDir) await p.shot(path.join(shotDir, which + '-cr01-settle.png'));
  step('A10/A11 CR-01 exercise and 4-block settlement with 3.4 guide questions');
  await ev("T.btn('重新開始此情境')");
  assert.strictEqual(await ev('gameState.cr.clues.length'), 0);
  await ev("T.btn('開始觀察')");
  await key('Escape'); await ev("T.btn('回到標題')");
  step('A09 CR-01 restart resets observations');
};
