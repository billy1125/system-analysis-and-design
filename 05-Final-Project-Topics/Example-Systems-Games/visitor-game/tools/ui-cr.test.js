// CR scenario playthrough, called from ui.test.js
const assert = require('assert');
const path = require('path');

async function exercise(ev, waitFor) {
  await waitFor("T.modal().includes('需求釐清練習')");
  assert.strictEqual(await ev("document.querySelector('#btn-to-settle').disabled"), true);
  const n = await ev("document.querySelectorAll('ol.classify > li').length");
  for (let i = 0; i < n; i++) await ev("T.radio('st" + i + "','obs')");
  await ev("document.querySelector('.impacts input').click(); T.set('#cr-notes','受訪員工會怎麼使用？')");
  await ev("T.click('#btn-to-settle')");
}

module.exports = async function (p, shotDir, which) {
  const { ev, key, waitFor } = p;
  const step = n => console.log('ok  ' + n);

  // CR-01
  await ev("T.btn('CR-01')"); await ev("T.btn('開始觀察')");
  await ev("T.at(7,2,'down')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(8,2,'down')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(9,2,'down')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(5,4,'up')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(1,2,'up')"); await key('e');
  assert.strictEqual(await ev("document.querySelector('#f-checkin button[type=submit]').disabled"), true);
  const tabs = await ev("[...document.querySelectorAll('[data-tab]')].map(b => b.textContent).join()");
  assert.ok(!tabs.includes('預約'));
  await ev("T.click('#modal-close')");
  await ev("T.at(3,2,'up')"); await key('e'); await ev("T.set('#in-ext','2301'); T.submit('#f-phone')");
  assert.ok((await ev('T.modal()')).includes('沒有人接'));
  await ev("T.click('#modal-close')");
  await ev("T.at(4,4,'up')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'request');
  await waitFor("T.idle('mgr') && gameState.npcs.mgr.x === 8", 10000);
  await ev("T.at(8,1,'down')"); await key('e');
  await ev("T.btn('開始需求釐清練習')");
  await exercise(ev, waitFor);
  let s = await ev('T.modal()');
  assert.ok(s.includes('觀察到的業務事件') && s.includes('利害關係人的新要求（CR-01') && s.includes('回到實際系統確認') && s.includes('受訪員工會怎麼使用'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-cr01-settle.png'));
  step('CR-01 six clues, no reservation feature, exercise, 4-block settlement');
  await ev("T.btn('回到標題')");

  // CR-02
  await ev("T.btn('CR-02')"); await ev("T.btn('開始觀察')");
  await ev("T.at(1,2,'up')"); await key('e');
  await ev("T.click('#out-2')");
  assert.ok((await ev('T.modal()')).includes('沒有欄位可以輸入實際離開時間'));
  await ev("T.click('#out-no')");
  assert.strictEqual(await ev('gameState.db.visits.find(v => v.id === 2).check_out_at'), null);
  await ev("T.click('#modal-close')");
  await ev("T.at(5,2,'up')"); await key('e');
  assert.strictEqual(await ev("document.querySelectorAll('[data-take]').length"), 0, 'rack read-only');
  await ev("T.click('#modal-close')");
  await ev("T.at(17,4,'right')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(3,2,'up')"); await key('e'); await ev("T.set('#in-ext','2155'); T.submit('#f-phone'); T.click('#modal-close')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'request');
  await ev("T.at(8,3,'left')"); await key('e'); await ev("T.btn('開始需求釐清練習')");
  await exercise(ev, waitFor);
  s = await ev('T.modal()');
  assert.ok(s.includes('CR-02') && s.includes('補登'));
  step('CR-02 clues, original check-out confirm only, settlement');
  await ev("T.btn('回到標題')");

  // CR-03
  await ev("T.btn('CR-03')"); await ev("T.btn('開始觀察')");
  await ev("T.at(1,2,'up')"); await key('e');
  assert.strictEqual(await ev("document.querySelectorAll('[data-out]').length"), 0);
  await ev("T.click('#det-4')");
  await ev("T.click('#tab-history'); T.set('#hist-day','2027-10-06')");
  const h = await ev('T.modal()');
  assert.ok(h.includes('情境模擬示意') && h.includes('共 4 筆') && !h.includes('何俊宏'));
  assert.strictEqual(await ev("[...document.querySelectorAll('#modal button')].filter(b => /匯出|總覽|CSV/.test(b.textContent)).length"), 0);
  await ev("T.click('#modal-close')");
  await ev("T.at(5,4,'up')"); await key('e'); await ev("T.btn('結束對話')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'request');
  await ev("T.at(8,3,'left')"); await key('e'); await ev("T.btn('開始需求釐清練習')");
  await exercise(ev, waitFor);
  s = await ev('T.modal()');
  assert.ok(s.includes('若 CR-01 也被採用'));
  if (shotDir) await p.shot(path.join(shotDir, which + '-cr03-settle.png'));
  step('CR-03 two list scopes differ, no export, conditional CR-01 note');
  await ev("T.btn('回到標題')");
};
