// CR-01 scenario playthrough, called from ui.test.js
const assert = require('assert');
const path = require('path');

module.exports = async function (p, shotDir, which) {
  const { ev, key, waitFor } = p;
  const step = n => console.log('ok  ' + n);

  await ev("T.btn('CR-01')"); await ev("T.btn('開始觀察')");
  assert.ok((await ev("document.querySelector('#hud-task').innerText")).includes('0/6'));

  // current screens only, read-only record form
  await ev("T.at(1,2,'up')"); await key('e');
  let m = await ev('T.modal()');
  assert.ok(m.includes('CR-01 情境') && m.includes('逾期 1 項'));
  await ev("T.click('#rec-3')");
  assert.strictEqual(await ev("document.querySelector('#f-record button[type=submit]').disabled"), true, 'record form read-only');
  assert.strictEqual(await ev("document.querySelector('#rf-allnormal').disabled"), true);
  const tabs = await ev("[...document.querySelectorAll('[data-tab]')].map(b => b.textContent).join()");
  assert.ok(!/年度|延期|達成率|計畫表/.test(tabs), tabs);
  assert.strictEqual(await ev("[...document.querySelectorAll('#modal button, #modal select option')].filter(b => /年度|延期|達成率|原訂/.test(b.textContent)).length"), 0, 'no To-Be function');
  await ev("T.click('#tab-history'); T.set('#hist-eq','2')");
  assert.ok((await ev('T.modal()')).includes('2027-11-05'));
  await ev("T.click('#modal-close')");
  assert.deepStrictEqual(await ev('gameState.cr.clues.slice().sort()'), ['history', 'next']);
  step('A09 current screens only: next due, history, read-only form, no To-Be function');

  // A10 Excel fragment is labeled manual practice
  await ev("T.at(4,4,'down')"); await key('e');
  m = await ev('T.modal()');
  assert.ok(m.includes('現行人工作法') && m.includes('不是保養系統的畫面') && m.includes('11-28'));
  assert.strictEqual(await ev("document.querySelectorAll('#modal input, #modal select, #modal textarea').length"), 0, 'excel is read-only');
  await ev("T.btn('結束對話')");
  step('A10 Excel fragment labeled as manual practice, read-only');

  // overdue disappears after the technician records; delay by phone
  await ev("T.at(16,4,'down')"); await key('e');
  await ev("T.btn('請她照平常方式登錄')");
  assert.strictEqual(await ev("listDue(gameState.db, todayStr(gameState), {}).summary.overdue"), 0);
  await key('e');
  assert.ok((await ev('T.modal()')).includes('我自己往後排'));
  await ev("T.btn('結束對話')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#tab-due')");
  assert.ok((await ev('T.modal()')).includes('逾期 0 項'));
  assert.ok(await ev("gameState.cr.clues.includes('gone')"));
  await ev("T.click('#tab-records'); T.set('#q-from','2027-07-01'); T.set('#q-to','2027-09-30'); T.submit('#f-query')");
  assert.ok((await ev('T.modal()')).includes('共 15 筆'));
  await ev("T.click('#modal-close')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'request');
  step('A09 overdue gone after record, delay without approval, Q3 count only');

  await ev("T.at(4,4,'down')"); await key('e');
  await ev("T.btn('開始需求釐清練習')");
  await waitFor("T.modal().includes('需求釐清練習')");
  assert.strictEqual(await ev("document.querySelector('#btn-to-settle').disabled"), true);
  const n = await ev("document.querySelectorAll('ol.classify > li').length");
  for (let i = 0; i < n; i++) await ev("T.radio('st" + i + "','obs')");
  await ev("document.querySelector('.impacts input').click(); T.set('#cr-notes','延期要由誰核准？')");
  await ev("T.click('#btn-to-settle')");
  const s = await ev('T.modal()');
  ['觀察到的業務事件', '利害關係人的新要求（CR-01', '可能受影響項目', '回到實際系統確認', '既有紀錄', '待小組決議的問題', '延期要由誰核准', 'EQ-001 與 EQ-012']
    .forEach(t => assert.ok(s.includes(t), 'settlement missing ' + t));
  assert.ok(!/決議：|答案：/.test(s), 'open questions are not answered');
  if (shotDir) await p.shot(path.join(shotDir, which + '-cr01-settle.png'));
  step('A11 four-block settlement, open questions without answers');
  await ev("T.btn('重新開始此情境')");
  assert.strictEqual(await ev('gameState.cr.clues.length'), 0);
  assert.strictEqual(await ev("listDue(gameState.db, todayStr(gameState), {}).summary.overdue"), 1);
  await ev("T.btn('開始觀察')");
  await ev("T.click('#btn-pause')"); await ev("T.btn('回到標題')");
  step('A08 CR restart resets data');
};
