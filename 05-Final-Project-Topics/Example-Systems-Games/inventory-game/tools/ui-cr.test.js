// CR-01 scenario playthrough, called from ui.test.js
const assert = require('assert');
const path = require('path');

module.exports = async function (p, shotDir, which) {
  const { ev, key, waitFor } = p;
  const step = n => console.log('ok  ' + n);

  await ev("T.btn('CR-01')"); await ev("T.btn('開始觀察')");
  assert.strictEqual(await ev('Sound.isPlaying()'), true);
  await ev("T.at(15,4,'left')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('直接改成 298 存檔'));
  await ev("T.btn('結束對話')");
  await ev("T.at(9,6,'down')"); await key('e'); await ev("T.btn('結束對話')");
  await ev("T.at(8,4,'up')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('差異說明那一欄沒有寫'));
  await ev("T.btn('結束對話')");
  assert.ok((await ev("document.querySelector('#hud-extra').innerText")).includes('觀察筆記'));

  await ev("T.at(1,2,'up')"); await key('e');
  let m = await ev('T.modal()');
  assert.ok(m.includes('觀察用畫面，未登入') && m.includes('已盤 11／共 12 項') && m.includes('298') && m.includes('沒有覆盤紀錄、差異容許範圍與核准功能'));
  assert.strictEqual(await ev("document.querySelectorAll('#modal input').length"), 0, 'read-only detail');
  assert.strictEqual(await ev("document.querySelector('#btn-close')"), null);
  assert.strictEqual(await ev("[...document.querySelectorAll('#modal button:not([data-tab])')].filter(b => /覆盤|核准|退回|結案/.test(b.textContent)).length"), 0, 'no To-Be buttons');
  const tabs = await ev("[...document.querySelectorAll('[data-tab]')].map(b => b.textContent).join()");
  assert.ok(!/覆盤|核准/.test(tabs));
  await ev("T.click('#tab-crhist')");
  m = await ev('T.modal()');
  assert.ok(m.includes('情境模擬示意') && m.includes('（空白）') && m.includes('切料損耗未扣帳'));
  await ev("T.click('#modal-close')");
  assert.strictEqual(await ev('gameState.cr.stage'), 'request');
  step('A09 CR-01 five clues: overwrite, big vs small difference, stuck count, history; no new features');

  await waitFor("gameState.npcs.mgr.visible && T.idle('mgr') && gameState.npcs.mgr.x === 8", 10000);
  await ev("T.at(9,2,'left')"); await key('e');
  assert.ok((await ev('T.modal()')).includes('調帳之前要有人核准'));
  await ev("T.btn('開始需求釐清練習')");
  await waitFor("T.modal().includes('需求釐清練習')");
  assert.strictEqual(await ev("document.querySelector('#btn-to-settle').disabled"), true);
  const n = await ev("document.querySelectorAll('ol.classify > li').length");
  for (let i = 0; i < n; i++) await ev("T.radio('st" + i + "','obs')");
  assert.ok((await ev('T.modal()')).includes('參考分類是'));
  await ev("document.querySelector('.impacts input').click(); T.set('#cr-notes','差異大要由誰判斷？')");
  await ev("T.click('#btn-to-settle')");
  const s = await ev('T.modal()');
  ['觀察到的業務事件', '利害關係人的新要求（CR-01｜倉庫課長 陳振宇）', '可能受影響項目', '回到實際系統確認', '結算引導問題', '差異大要由誰判斷？'].forEach(t => assert.ok(s.includes(t), t));
  ['角色', '流程', '功能', '資料', '權限'].forEach(t => assert.ok(s.includes(t), t));
  assert.ok(!s.includes('操作環境'));
  assert.ok(!/(門檻|容許範圍)(為|是|設為|設定為)\s*\d/.test(s), 'no tolerance answer');
  if (shotDir) await p.shot(path.join(shotDir, which + '-cr01-settle.png'));
  step('A10 CR-01 exercise and four-block settlement; open questions left unanswered');
  await ev("T.btn('重新開始此情境')");
  assert.strictEqual(await ev('gameState.cr.clues.length'), 0);
  await ev("T.btn('開始觀察')");
  await key('Escape');
  await ev("T.btn('回到標題')");
  step('A08 CR restart resets clues');
};
