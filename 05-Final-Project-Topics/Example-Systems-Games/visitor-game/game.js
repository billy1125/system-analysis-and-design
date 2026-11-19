'use strict';
/*
 * Visitor check-in simulation game (teaching material).
 * Plain HTML/CSS/JS. Opens from file:// with no network and no storage.
 * Sections:
 *   1. constants and helpers
 *   2. visitor rules (pure functions, no DOM)
 *   3. level data (fixed fictional data)
 *   4. game state and clock
 *   5. level controllers (midterm: level 1, level 2)
 *   6. CR scenario controller (final demo only; removed in the midterm build)
 *   7. UI
 */

const EDITION = 'final'; // @@EDITION  build script sets 'midterm' for the midterm zip

/* ---------- 1. constants and helpers ---------- */

const TILE = 40;
const MAP_ROWS = [
  '####################',
  '#C.T.RD......SSS...#',
  '#.....K............F',
  '#.....K............F',
  '#.....K............#',
  '#.....K............#',
  '#######......SSS...#',
  '#######............#',
  '#########GG#########'
];
const MAP_W = MAP_ROWS[0].length;
const MAP_H = MAP_ROWS.length;
const BLOCKING = '#CTRKSFG';
const OBJECTS = { C: 'computer', T: 'phone', R: 'rack' };
const OBJECT_LABELS = { computer: '櫃台電腦', phone: '電話', rack: '訪客證架' };
const PURPOSES = ['開會', '送貨', '維修', '參觀', '面試', '其他'];
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function pad2(n) { return String(n).padStart(2, '0'); }
function clockAt(y, mo, d, h, mi) { return Date.UTC(y, mo - 1, d, h, mi); }
function fmtDT(ms) {
  const t = new Date(ms);
  return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate()) +
    ' ' + pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes());
}
function fmtHM(ms) { const t = new Date(ms); return pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes()); }
function charLen(s) { return Array.from(String(s)).length; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return '#';
  return MAP_ROWS[y][x];
}

/* ---------- 2. visitor rules (pure functions, no DOM) ---------- */

function nextId(rows) { return rows.reduce((m, r) => Math.max(m, r.id), 0) + 1; }

function findVisitorsByPhone(db, phone) {
  const p = String(phone || '').trim();
  if (!p) return [];
  return db.visitors.filter(v => v.phone === p);
}

function validateVisitorInput(input) {
  const value = {
    name: String(input.name || '').trim(),
    company: String(input.company || '').trim(),
    phone: String(input.phone || '').trim(),
    id_no: String(input.idNo || '').trim()
  };
  const errors = [];
  if (!value.name) errors.push('請填寫姓名');
  if (!value.company) errors.push('請填寫公司');
  if (!/^09\d{8}$/.test(value.phone)) errors.push('手機須為 09 開頭、共 10 碼數字');
  if (!/^[A-Z]\d{9}$/.test(value.id_no)) errors.push('身分證字號須為 1 個大寫英文字母加 9 個數字');
  return { errors, value };
}

// No unique rule on phone or ID number (same as the original system description).
function createVisitor(db, input) {
  const { errors, value } = validateVisitorInput(input);
  if (errors.length) return { ok: false, errors, db };
  const next = clone(db);
  const visitor = Object.assign({ id: nextId(next.visitors) }, value);
  next.visitors.push(visitor);
  return { ok: true, errors: [], db: next, visitor };
}

function listActiveEmployees(db) { return db.employees.filter(e => e.active); }

function openVisitOf(db, visitorId) {
  return db.visits.find(v => v.visitor_id === visitorId && v.check_out_at === null) || null;
}

function passOccupiedBy(db, passId) {
  return db.visits.find(v => v.pass_id === passId && v.check_out_at === null) || null;
}

// Available = enabled and not held by any visit without check_out_at.
function listAvailablePasses(db) {
  return db.visitor_passes.filter(p => p.enabled && !passOccupiedBy(db, p.id));
}

function passCodeOf(db, passId) {
  const p = db.visitor_passes.find(x => x.id === passId);
  return p ? p.code : '?';
}

function passStatus(db, passId) {
  const p = db.visitor_passes.find(x => x.id === passId);
  if (!p) return '不存在';
  if (!p.enabled) return '停用';
  const v = passOccupiedBy(db, passId);
  return v ? '占用中（來訪 #' + v.id + '）' : '可用';
}

function checkIn(db, input, now, userId) {
  const errors = [];
  const visitor = db.visitors.find(v => v.id === input.visitorId);
  if (!visitor) errors.push('請先選擇訪客主檔');
  else if (openVisitOf(db, visitor.id)) errors.push('訪客目前仍在廠內：此訪客有尚未登記離廠的來訪紀錄，不能再次報到');
  const emp = db.employees.find(e => e.id === input.employeeId);
  if (!emp || !emp.active) errors.push('請選擇在職的受訪員工');
  const pass = db.visitor_passes.find(p => p.id === input.passId);
  if (!pass) errors.push('請選擇訪客證');
  else if (!pass.enabled) errors.push('訪客證 ' + pass.code + ' 已停用，不能使用');
  else if (passOccupiedBy(db, pass.id)) errors.push('訪客證 ' + pass.code + ' 已被尚未離廠的來訪占用');
  if (!PURPOSES.includes(input.purpose)) errors.push('請選擇事由');
  let compStr = String(input.companions == null ? '' : input.companions).trim();
  if (compStr === '') compStr = '0';
  const companions = Number(compStr);
  if (!/^\d+$/.test(compStr) || companions > 20) errors.push('隨行人數須為 0 到 20 的整數');
  const plate = String(input.plate || '').trim();
  if (charLen(plate) > 10) errors.push('車牌最多 10 字');
  const note = String(input.note || '');
  if (charLen(note) > 200) errors.push('備註最多 200 字');
  if (errors.length) return { ok: false, errors, db };
  const next = clone(db);
  const visit = {
    id: nextId(next.visits), visitor_id: visitor.id, employee_id: emp.id, pass_id: pass.id,
    purpose: input.purpose, companions, plate, note,
    check_in_at: now, check_out_at: null, check_in_by: userId, check_out_by: null
  };
  next.visits.push(visit);
  return { ok: true, errors: [], db: next, visit };
}

// Normal check-out and late check-out share this action: it always writes "now".
function checkOut(db, visitId, now, userId) {
  const v = db.visits.find(x => x.id === visitId);
  if (!v) return { ok: false, errors: ['找不到這筆來訪紀錄'], db };
  if (v.check_out_at !== null) return { ok: false, errors: ['這筆來訪已登記離廠，不能重複提交'], db };
  const next = clone(db);
  const nv = next.visits.find(x => x.id === visitId);
  nv.check_out_at = now;
  nv.check_out_by = userId;
  return { ok: true, errors: [], db: next, visit: nv };
}

function joinVisit(db, v) {
  const visitor = db.visitors.find(x => x.id === v.visitor_id) || {};
  const emp = db.employees.find(x => x.id === v.employee_id) || {};
  return Object.assign({}, v, {
    visitor_name: visitor.name || '?', company: visitor.company || '',
    employee_name: emp.name || '?', employee_ext: emp.ext || '',
    pass_code: passCodeOf(db, v.pass_id)
  });
}

function listOnSite(db) {
  return db.visits.filter(v => v.check_out_at === null)
    .map(v => joinVisit(db, v))
    .sort((a, b) => a.check_in_at.localeCompare(b.check_in_at));
}

function summarizeOnSite(db) {
  const rows = listOnSite(db);
  const companions = rows.reduce((s, r) => s + r.companions, 0);
  return { visitors: rows.length, companions, total: rows.length + companions };
}

function userName(db, id) {
  const u = db.users.find(x => x.id === id);
  return u ? u.name : '';
}

/* ---------- 3. level data (fixed fictional data) ---------- */

function baseEmployees() {
  return [
    { id: 1, name: '李俊傑', ext: '2301', active: true },
    { id: 2, name: '吳佩珊', ext: '2410', active: true },
    { id: 3, name: '周大衛', ext: '2155', active: true },
    { id: 4, name: '許文彬', ext: '2302', active: false },
    { id: 5, name: '黃怡君', ext: '2100', active: true },
    { id: 6, name: '蔡明哲', ext: '2120', active: true }
  ];
}
function baseUsers() { return [{ id: 1, name: '林淑芬', role: '接待員' }]; }
function makePasses(codes, disabled) {
  return codes.map(c => ({ id: Number(c.slice(2)), code: c, enabled: !(disabled || []).includes(c) }));
}
function mkVisit(id, visitorId, employeeId, passId, purpose, companions, inAt, outAt) {
  return {
    id, visitor_id: visitorId, employee_id: employeeId, pass_id: passId, purpose, companions,
    plate: '', note: '', check_in_at: inAt, check_out_at: outAt || null,
    check_in_by: 1, check_out_by: outAt ? 1 : null
  };
}

function level1Data() {
  return {
    visitors: [
      { id: 1, name: '黃建民', company: '東昇精機', phone: '0911000101', id_no: 'F100000101' },
      { id: 2, name: '黃建明', company: '和泰五金', phone: '0911000101', id_no: 'H100000202' },
      { id: 3, name: '陳美玲', company: '順安水電', phone: '0911000606', id_no: 'B200000606' }
    ],
    employees: baseEmployees(),
    visitor_passes: makePasses(['V-01', 'V-02', 'V-03', 'V-04', 'V-05', 'V-06'], ['V-06']),
    visits: [
      mkVisit(1, 1, 1, 2, '開會', 0, '2027-09-20 10:02', '2027-09-20 11:45'),
      mkVisit(2, 3, 3, 4, '維修', 0, '2027-09-27 13:30', '2027-09-27 15:10')
    ],
    users: baseUsers()
  };
}

function level2Data() {
  return {
    visitors: [
      { id: 1, name: '林志豪', company: '宇辰機電', phone: '0911000505', id_no: 'K100000505' },
      { id: 2, name: '陳美玲', company: '順安水電', phone: '0911000606', id_no: 'B200000606' }
    ],
    employees: baseEmployees(),
    visitor_passes: makePasses(['V-02', 'V-05', 'V-06', 'V-07'], ['V-07']),
    visits: [
      mkVisit(1, 1, 1, 6, '開會', 0, '2027-09-28 10:00', '2027-09-28 11:20'),
      mkVisit(2, 1, 1, 5, '開會', 0, '2027-10-04 14:10', null),
      mkVisit(3, 2, 3, 2, '維修', 1, '2027-10-05 08:40', null)
    ],
    users: baseUsers()
  };
}

/* ---------- 4. game state and clock ---------- */

let gameState = null;
let RUN_SEQ = 0;

function newState(mode) {
  return {
    mode, runId: ++RUN_SEQ, db: null, clock: 0,
    player: { x: 3, y: 3, dir: 'right' },
    npcs: {}, cards: {}, flags: {}, trail: [], predictions: {}, cr: null,
    visited: { computer: false, phone: false, rack: false, counter: false },
    done: false
  };
}
function advance(st, minutes) { st.clock += minutes * 60000; }
function nowStr(st) { return fmtDT(st.clock); }
function addTrail(st, text) { st.trail.push(fmtHM(st.clock) + '　' + text); }
function npcDef(id, name, color, x, y, visible) {
  return { id, name, color, x, y, visible: visible !== false };
}

/* ---------- 5. level controllers (midterm) ---------- */

function empName(db, id) { const e = db.employees.find(x => x.id === id); return e ? e.name : '?'; }

// Coach-side checks: compare form input with what the visitor said at the counter.
function checkInMismatch(db, input, who) {
  const w = [];
  if (input.employeeId && input.employeeId !== who.employeeId) {
    w.push('受訪員工：你選的是' + empName(db, input.employeeId) + '，訪客說要找' + empName(db, who.employeeId));
  }
  if (input.purpose && PURPOSES.includes(input.purpose) && input.purpose !== who.purpose) {
    w.push('事由：你選的是「' + input.purpose + '」，訪客說的是「' + who.purpose + '」');
  }
  const c = String(input.companions == null ? '' : input.companions).trim() || '0';
  if (/^\d+$/.test(c) && Number(c) <= 20 && Number(c) !== who.companions) {
    w.push('隨行人數：你填的是 ' + c + '，訪客說的是 ' + who.companions);
  }
  return w;
}

function visitorMismatch(input, who) {
  const w = [];
  if (String(input.name || '').trim() && String(input.name).trim() !== who.idCard.name) w.push('姓名和證件不同（證件：' + who.idCard.name + '）');
  if (String(input.company || '').trim() && String(input.company).trim() !== who.company) w.push('公司和訪客說的不同（訪客說：' + who.company + '）');
  if (String(input.phone || '').trim() && String(input.phone).trim() !== who.phone) w.push('手機和訪客說的不同（訪客說：' + who.phone + '）');
  if (String(input.idNo || '').trim() && String(input.idNo).trim() !== who.idCard.id_no) w.push('身分證字號和證件不同（證件：' + who.idCard.id_no + '）');
  return w;
}

function idCardLine(who) { return { kind: 'idcard', name: who.idCard.name, id_no: who.idCard.id_no }; }

function heldCards(st) { return Object.keys(st.cards).filter(c => st.cards[c] === 'player').sort(); }

function sendIntoPlant(ids, then) {
  ids.forEach((id, i) => {
    const n = gameState.npcs[id];
    walkNpc(id, [[18, n.y], [18, 3], [19, 3]], () => { hideNpc(id); if (then && i === 0) then(); });
  });
}
function sendOutGate(ids) {
  ids.forEach(id => {
    const n = gameState.npcs[id];
    const gx = n.x <= 7 ? 9 : 10;
    walkNpc(id, [[gx, n.y], [gx, 8]], () => hideNpc(id));
  });
}

const MIDTERM_PROMPTS = [
  { h: '觀察', q: '接待員實際做了哪些事情？系統負責哪些功能、資料存取與檢核？請把下面的操作紀錄分成「人工工作」與「系統功能」。' },
  { h: '推論', q: '報到、漏登、離廠各影響哪些狀態與紀錄？（在廠名單、訪客證是否可用、能否再次報到）' },
  { h: '實際系統待查證', q: '如何在真實訪客系統及 SQLite 驗證上述推論？可能對應哪些使用案例、活動圖判斷點與資料表關聯？' }
];

function visitsTableHtml(db) {
  const rows = db.visits.map(v => joinVisit(db, v));
  return '<table class="data"><caption>模擬資料：來訪紀錄（visits）</caption><thead><tr>' +
    '<th>來訪#</th><th>訪客</th><th>受訪員工</th><th>訪客證</th><th>事由</th><th>隨行</th><th>報到時間</th><th>離廠時間</th><th>報到登記人</th><th>離廠登記人</th>' +
    '</tr></thead><tbody>' + rows.map(r => '<tr><td>' + r.id + '</td><td>#' + r.visitor_id + ' ' + esc(r.visitor_name) +
      '</td><td>' + esc(r.employee_name) + '</td><td>' + esc(r.pass_code) + '</td><td>' + esc(r.purpose) +
      '</td><td>' + r.companions + '</td><td>' + esc(r.check_in_at) + '</td><td>' + (r.check_out_at ? esc(r.check_out_at) : '<em>（空）</em>') +
      '</td><td>' + esc(userName(db, r.check_in_by)) + '</td><td>' + esc(userName(db, r.check_out_by)) + '</td></tr>').join('') +
    '</tbody></table>';
}

function passesTableHtml(db) {
  return '<table class="data"><caption>模擬資料：訪客證（visitor_passes）與目前狀態</caption><thead><tr><th>證號</th><th>啟用</th><th>系統狀態</th></tr></thead><tbody>' +
    db.visitor_passes.map(p => '<tr><td>' + esc(p.code) + '</td><td>' + (p.enabled ? '是' : '否') + '</td><td>' + esc(passStatus(db, p.id)) + '</td></tr>').join('') +
    '</tbody></table>';
}

function midtermSettlementHtml(st, topHtml) {
  return '<div class="settle">' + (topHtml || '') +
    '<div class="prompts">' + MIDTERM_PROMPTS.map((p, i) => '<section><h3>' + (i + 1) + '. ' + p.h + '</h3><p>' + p.q + '</p>' +
      (i === 0 ? '<ol class="trail">' + st.trail.map(t => '<li>' + esc(t) + '</li>').join('') + '</ol>' : '') +
      (i === 1 ? visitsTableHtml(st.db) + passesTableHtml(st.db) : '') + '</section>').join('') + '</div>' +
    '<p class="boundary">遊戲畫面與上面的資料是模擬教材的觀察，不是原系統資料庫的證據。正式分析請以實際系統為準。</p></div>';
}

/* Level 1: normal flow */
function makeLevel1() {
  const P = {
    A: {
      key: 'A', name: '黃建民', employeeId: 1, ext: '2301', purpose: '開會', companions: 1,
      idCard: { name: '黃建民', id_no: 'F100000101' }, company: '東昇精機', phone: '0911000101',
      memo: '黃建民（東昇精機），手機 0911000101，找李俊傑經理開會，隨行 1 人'
    },
    B: {
      key: 'B', name: '張雅婷', employeeId: 2, ext: '2410', purpose: '維修', companions: 0,
      idCard: { name: '張雅婷', id_no: 'G200000303' }, company: '禾豐檢測', phone: '0911000303',
      memo: '張雅婷（禾豐檢測），第一次來，手機 0911000303，找吳佩珊維修量測儀器，沒有隨行人員'
    }
  };
  const fresh = () => ({ talked: false, selected: false, visitorId: null, notified: false, visitId: null, handed: false, returned: false });
  const current = st => P[st.flags.phase] || null;
  const visitOf = (st, key) => { const id = st.flags[key].visitId; return id ? st.db.visits.find(v => v.id === id) : null; };
  const codeOf = (st, key) => { const v = visitOf(st, key); return v ? passCodeOf(st.db, v.pass_id) : null; };

  function arriveB() {
    showNpc('B', 9, 8);
    walkNpc('B', [[9, 4], [7, 4]]);
    log('第二位訪客走進大門。', 'scene');
  }

  function timeJump(st) {
    const s = summarizeOnSite(st.db);
    st.flags.phase = 'return';
    st.clock = clockAt(2027, 9, 30, 11, 40);
    showNpc('A', 19, 3); walkNpc('A', [[7, 3]]);
    setTimeout(() => { if (gameState === st) { showNpc('A2', 19, 3); walkNpc('A2', [[8, 3]]); } }, 300);
    showNpc('B', 19, 2); walkNpc('B', [[9, 2], [9, 4], [7, 4]]);
    whenIdle(() => showTalk([
      { who: '旁白', text: '兩位訪客都進廠了。依系統在廠名單：訪客 ' + s.visitors + ' 人、隨行人員 ' + s.companions + ' 人、合計 ' + s.total + ' 人。' },
      { who: '旁白', text: '（時間來到 11:40）兩位訪客結束拜訪，回到櫃台。' }
    ]));
  }

  function handCard(st, who, code) {
    const s = st.flags[who.key];
    const v = visitOf(st, who.key);
    if (!v) return coachTalk('系統還沒有這位訪客的報到紀錄。先在電腦完成報到，再發卡。');
    if (!s.notified) return coachTalk('還沒通知受訪員工。電話通知不在系統裡，系統不會提醒，要靠接待員自己記得。');
    const want = passCodeOf(st.db, v.pass_id);
    if (code !== want) return coachTalk('系統登記給' + who.name + '的是 ' + want + '，你手上這張是 ' + code + '。實體卡要和系統紀錄一致。');
    st.cards[code] = who.key;
    s.handed = true;
    advance(st, 1);
    addTrail(st, '交付 ' + code + ' 給' + who.name);
    log(who.name + '拿到 ' + code + '，走進廠內。', 'scene');
    if (who.key === 'A') {
      st.flags.phase = 'B';
      sendIntoPlant(['A2', 'A']);
      setTimeout(() => { if (gameState === st) arriveB(); }, 900);
    } else {
      st.flags.phase = 'between';
      sendIntoPlant(['B'], () => { if (gameState === st) timeJump(st); });
    }
    render();
  }

  function talkReturn(st, id) {
    const who = P[id];
    const s = st.flags[id];
    if (s.returned) return showTalk([{ who: who.name, text: '謝謝，再見。' }]);
    const code = Object.keys(st.cards).find(c => st.cards[c] === id);
    const text = id === 'A' ? '會開完了，這是訪客證，謝謝。' : '儀器修好了，訪客證還給您。';
    showTalk([{ who: who.name, text }], [{
      label: '收回訪客證 ' + code,
      run: () => {
        st.cards[code] = 'player';
        s.returned = true;
        advance(st, 1);
        addTrail(st, '收回 ' + code + '（' + who.name + '）');
        sendOutGate(id === 'A' ? ['A', 'A2'] : ['B']);
        if (!st.flags.coachedLeave) {
          st.flags.coachedLeave = true;
          log('訪客走出大門了，但系統的在廠名單不會自己改變：要辦理離廠登記才會更新。', 'coach');
        }
      }
    }]);
  }

  return {
    id: 'level1', title: '第一關　早班接待', role: '接待員 林淑芬', showSummary: true,
    setup(st) {
      st.db = level1Data();
      st.clock = clockAt(2027, 9, 30, 9, 50);
      st.player = { x: 5, y: 3, dir: 'right' };
      st.flags = { phase: 'A', A: fresh(), B: fresh(), coachedLeave: false };
      st.npcs = {
        A: npcDef('A', '黃建民', '#d97706', 9, 8),
        A2: npcDef('A2', '隨行人員', '#b45309', 10, 8),
        B: npcDef('B', '張雅婷', '#7c3aed', 9, 8, false)
      };
      ['V-01', 'V-02', 'V-03', 'V-04', 'V-05', 'V-06'].forEach(c => { st.cards[c] = 'rack'; });
    },
    onStart(st) {
      walkNpc('A', [[9, 3], [7, 3]]);
      walkNpc('A2', [[10, 3], [8, 3]]);
      showTalk([
        { who: '旁白', text: '9 月 30 日上午 9:50。你是接待員林淑芬，在櫃台後方值班。今天上午有兩位訪客。' },
        { who: '旁白', text: '方向鍵或 WASD 移動；面向櫃台、電腦、電話或證架按 E 互動。對話與表單可用滑鼠或 Tab、Enter 操作。' }
      ], [], { closeLabel: '開始' });
    },
    objective(st) {
      const ph = st.flags.phase;
      if (ph === 'A' || ph === 'B') {
        const s = st.flags[ph];
        const v = visitOf(st, ph);
        const code = codeOf(st, ph);
        return {
          title: ph === 'A' ? '第一位訪客（回訪者，含 1 名隨行）' : '第二位訪客（新訪客）',
          items: [
            { text: '在櫃台與訪客對話並核對證件', done: s.talked },
            { text: ph === 'A' ? '到電腦用手機號碼查詢主檔，選用正確的一筆' : '到電腦用手機號碼查詢；查無資料就建立主檔，再選用', done: s.selected },
            { text: '用電話通知受訪員工（分機可在電腦查）', done: s.notified },
            { text: '在電腦「來訪報到」送出報到', done: !!v },
            { text: code ? '到證架取出 ' + code : '到證架取出系統登記的訪客證', done: !!code && (st.cards[code] === 'player' || s.handed) },
            { text: '回櫃台把訪客證交給訪客', done: s.handed }
          ]
        };
      }
      if (ph === 'between') return { title: '訪客進廠中', items: [{ text: '等待訪客走進廠內', done: false }] };
      if (ph === 'return') {
        const a = visitOf(st, 'A'), b = visitOf(st, 'B');
        const ca = codeOf(st, 'A'), cb = codeOf(st, 'B');
        return {
          title: '訪客離廠', items: [
            { text: '在櫃台收回黃建民的訪客證', done: st.flags.A.returned },
            { text: '在櫃台收回張雅婷的訪客證', done: st.flags.B.returned },
            { text: '在電腦「在廠名單」為兩筆來訪辦理離廠', done: !!(a && a.check_out_at && b && b.check_out_at) },
            { text: '把 ' + ca + '、' + cb + ' 放回證架', done: st.cards[ca] === 'rack' && st.cards[cb] === 'rack' }
          ], showAll: true
        };
      }
      return { title: '本關完成', items: [] };
    },
    npcAttention(st, id) {
      const ph = st.flags.phase;
      if (ph === 'return') return (id === 'A' || id === 'B') && !st.flags[id].returned;
      if (id !== ph) return false;
      const s = st.flags[id];
      if (!s.talked) return true;
      const code = codeOf(st, id);
      return !!code && s.notified && st.cards[code] === 'player';
    },
    counterIdCard(st) {
      const who = current(st);
      if (!who || !st.flags[who.key].talked) return null;
      return { name: who.idCard.name, company: who.company, phone: who.phone, idNo: who.idCard.id_no };
    },
    onTalk(st, id) {
      const ph = st.flags.phase;
      if (id === 'A2') return showTalk([{ who: '隨行人員', text: '我跟黃先生一起的。' }]);
      if (ph === 'return') return talkReturn(st, id);
      const who = P[id];
      if (!who || ph !== id) return showTalk([{ who: who ? who.name : '訪客', text: '謝謝。' }]);
      const s = st.flags[id];
      if (!s.talked) {
        const lines = id === 'A' ? [
          { who: '黃建民', text: '早安，我是東昇精機的黃建民，約了李俊傑經理十點開會。這位是我同事，跟我一起進去。' },
          { who: '黃建民', text: '我的手機是 0911000101。這是我的證件。' }, idCardLine(who)
        ] : [
          { who: '張雅婷', text: '您好，我是禾豐檢測的張雅婷，第一次來。來找品保課的吳佩珊，維修量測儀器。' },
          { who: '張雅婷', text: '手機是 0911000303。這是我的證件。' }, idCardLine(who)
        ];
        return showTalk(lines, [{
          label: '核對證件：姓名、照片與本人相符',
          run: () => { s.talked = true; advance(st, 1); addTrail(st, '與' + who.name + '對話，核對證件'); }
        }]);
      }
      const choices = heldCards(st).map(code => ({ label: '交付訪客證 ' + code, run: () => handCard(st, who, code) }));
      showTalk([{ who: who.name, text: '好，我在這邊等。' }, { kind: 'memo', text: who.memo }], choices);
    },
    onPhone(st, ext) {
      const who = current(st);
      if (!who || !st.flags[who.key].talked || ext !== who.ext) return null;
      const s = st.flags[who.key];
      if (s.notified) return [{ who: empName(st.db, who.employeeId), text: '好，我知道了，謝謝。' }];
      s.notified = true;
      addTrail(st, '撥打分機 ' + ext + ' 通知' + empName(st.db, who.employeeId));
      return who.key === 'A'
        ? [{ who: '李俊傑', text: '喂，我是李俊傑。東昇精機的黃先生到了？好，請他們直接到二樓會議室，謝謝。' }]
        : [{ who: '吳佩珊', text: '品保課吳佩珊。禾豐檢測的張小姐到了？好，請她到品保課，我在門口等。' }];
    },
    computerTabs() { return STD_TABS; },
    onSystem(st, evt) {
      const who = current(st);
      switch (evt.type) {
        case 'lookup':
          addTrail(st, '以手機 ' + (evt.phone || '（空白）') + ' 查詢主檔：' + evt.results.length + ' 筆');
          return {};
        case 'selectVisitor': {
          if (!who) return { block: '目前櫃台沒有需要辦理報到的訪客。' };
          const s = st.flags[who.key];
          if (!s.talked) return { block: '先到櫃台和訪客對話、核對證件，再選用主檔。' };
          const v = evt.visitor;
          if (v.name !== who.idCard.name || v.id_no !== who.idCard.id_no) {
            return { block: '這筆主檔是「' + v.name + '／' + v.id_no + '」，和櫃台訪客的證件「' + who.idCard.name + '／' + who.idCard.id_no + '」不同。手機號碼相同不代表是同一個人，請再比對。' };
          }
          s.selected = true; s.visitorId = v.id;
          addTrail(st, '選用訪客主檔 #' + v.id + '（' + v.name + '）');
          return {};
        }
        case 'beforeCreateVisitor':
          if (!who) return {};
          if (who.key === 'A') return { warn: ['黃建民已經有訪客主檔，查詢結果裡就有。系統不限制重複建檔，但重複的主檔會讓之後的查詢更難判斷。'] };
          { const w = visitorMismatch(evt.input, who); return w.length ? { warn: w } : {}; }
        case 'createVisitor':
          addTrail(st, '建立訪客主檔 #' + evt.visitor.id + '（' + evt.visitor.name + '）');
          return {};
        case 'beforeCheckIn': {
          if (!who) return { block: '目前櫃台沒有需要辦理報到的訪客。' };
          const s = st.flags[who.key];
          if (evt.input.visitorId && evt.input.visitorId !== s.visitorId && !openVisitOf(st.db, evt.input.visitorId)) {
            return { block: '「目前選用的主檔」不是櫃台這位訪客。請回「訪客查詢／建檔」重新選用。' };
          }
          const w = checkInMismatch(st.db, evt.input, who);
          return w.length ? { warn: w } : {};
        }
        case 'checkIn':
          if (evt.result.ok && who) {
            const s = st.flags[who.key];
            s.visitId = evt.result.visit.id;
            addTrail(st, '送出報到：來訪 #' + s.visitId + '，訪客證 ' + passCodeOf(st.db, evt.result.visit.pass_id));
            if (!s.notified) return { coach: '系統完成報到了。不過你還沒通知受訪員工：電話通知在系統之外，系統不會提醒。' };
          } else if (!evt.result.ok) addTrail(st, '送出報到失敗：' + evt.result.errors.join('；'));
          return {};
        case 'beforeCheckOut': {
          const key = ['A', 'B'].find(k => st.flags[k].visitId === evt.visitId);
          if (key && !st.flags[key].returned) {
            return { warn: [P[key].name + '還在廠內，還沒回到櫃台交還訪客證。系統允許你現在按離廠，但在廠名單就會和現場不一致。'] };
          }
          return {};
        }
        case 'checkOut':
          if (evt.result.ok) addTrail(st, '登記離廠：來訪 #' + evt.result.visit.id + '（系統寫入 ' + fmtHM(st.clock) + '）');
          return {};
      }
      return {};
    },
    onRack(st, action, code) { addTrail(st, (action === 'take' ? '從證架取出 ' : '把 ') + code + (action === 'take' ? '' : ' 放回證架')); },
    afterAction(st) {
      if (st.done || st.flags.phase !== 'return') return;
      const a = visitOf(st, 'A'), b = visitOf(st, 'B');
      const ca = codeOf(st, 'A'), cb = codeOf(st, 'B');
      if (st.flags.A.returned && st.flags.B.returned && a.check_out_at && b.check_out_at &&
        st.cards[ca] === 'rack' && st.cards[cb] === 'rack') {
        st.done = true;
        st.flags.phase = 'done';
        whenIdle(() => {
          const top = '<p class="ok">通關：兩筆來訪完成離廠，' + ca + '（' + passStatus(st.db, a.pass_id) + '）、' + cb + '（' +
            passStatus(st.db, b.pass_id) + '）恢復可用，實體卡片也回到證架。</p>';
          openSettlement('第一關結算：觀察—推論—實際系統待查證', midtermSettlementHtml(st, top), [
            { label: '下一關：昨天走了，今天還在廠', run: () => startMode('level2') },
            { label: '重新開始本關', run: () => startMode('level1') },
            { label: '回到標題', run: showTitle }
          ]);
        });
      }
    }
  };
}

const STD_TABS = [
  { id: 'lookup', label: '訪客查詢／建檔' },
  { id: 'checkin', label: '來訪報到' },
  { id: 'onsite', label: '在廠名單' },
  { id: 'employees', label: '受訪員工分機' }
];

/* Level 2: yesterday's visitor is still "on site" in the system */
function makeLevel2() {
  const WHO = {
    key: 'L', name: '林志豪', employeeId: 1, ext: '2301', purpose: '開會', companions: 0,
    idCard: { name: '林志豪', id_no: 'K100000505' }, company: '宇辰機電', phone: '0911000505',
    memo: '林志豪（宇辰機電），手機 0911000505，找李俊傑經理開會，沒有隨行人員'
  };
  const OLD_VISIT = 2;
  const newVisit = st => st.flags.newVisitId ? st.db.visits.find(v => v.id === st.flags.newVisitId) : null;

  function predictionQuestions(st) {
    return [
      {
        id: 'count', q: '① 補登完成後，「在廠名單」會剩幾筆？',
        options: ['0 筆', '1 筆', '2 筆', '3 筆'], answer: '1 筆',
        explain: '在廠與否只看離廠時間是否為空。補登後昨天那筆有了離廠時間，不再列入；陳美玲今天的來訪還沒離廠，所以剩 1 筆。'
      },
      {
        id: 'pass', q: '② 補登完成後，V-05 在系統裡的狀態？',
        options: ['仍被占用', '可用（已啟用，且沒有未離廠紀錄占用）', '變成停用'], answer: '可用（已啟用，且沒有未離廠紀錄占用）',
        explain: '「可用」是推導出來的：已啟用、且沒有被未離廠的來訪占用。昨天那筆有了離廠時間，V-05 就解除占用。卡片實體在你手上，和系統狀態是兩回事。'
      },
      {
        id: 'time', q: '③ 系統會把哪個時間記成昨天那筆的離廠時間？',
        options: ['昨天 17:30（林志豪說的時間）', '今天現在的模擬時刻（約 ' + fmtHM(st.clock) + '）', '不會記錄時間'],
        answer: '今天現在的模擬時刻（約 ' + fmtHM(st.clock) + '）',
        explain: '原有的離廠動作一律寫入執行當下的模擬時鐘。這個畫面沒有欄位可以輸入林志豪說的實際離開時間。'
      }
    ];
  }

  function handCard(st, code) {
    const v = newVisit(st);
    if (!v) return coachTalk('系統還沒有林志豪今天的報到紀錄，先完成報到再發卡。');
    const want = passCodeOf(st.db, v.pass_id);
    if (code !== want) return coachTalk('系統登記給林志豪的是 ' + want + '，你手上這張是 ' + code + '。不用的卡請放回證架。');
    st.cards[code] = 'L';
    st.flags.handed = true;
    advance(st, 1);
    addTrail(st, '交付 ' + code + ' 給林志豪');
    log('林志豪拿到 ' + code + '，走進廠內。', 'scene');
    render();
    sendIntoPlant(['L'], () => { if (gameState === st) finish(st); });
  }

  function finish(st) {
    if (st.done) return;
    st.done = true;
    whenIdle(() => openSettlement('第二關結算：實際發生與系統記錄', settlementHtml(st), [
      { label: '重新開始本關', run: () => startMode('level2') },
      { label: '回到第一關', run: () => startMode('level1') },
      { label: '回到標題', run: showTitle }
    ]));
  }

  function settlementHtml(st) {
    const old = st.db.visits.find(v => v.id === OLD_VISIT);
    const nv = newVisit(st);
    const qs = predictionQuestions(st);
    const pred = qs.map(q => '<li>' + esc(q.q) + '<br>你的預測：' + esc(st.predictions[q.id] || '（未作答）') +
      '　系統結果：' + esc(q.id === 'time' ? old.check_out_at : q.answer) + '</li>').join('');
    let gap = '';
    if (old.check_out_at) {
      const toMs = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
      const mins = Math.round((toMs(old.check_out_at) - toMs('2027-10-04 17:30')) / 60000);
      gap = '約 ' + Math.floor(mins / 60) + ' 小時 ' + (mins % 60) + ' 分';
    }
    const top =
      '<table class="data compare"><caption>兩筆來訪紀錄對照（模擬資料）</caption><thead><tr><th></th><th>昨天的來訪 #' + old.id + '</th><th>今天的來訪 #' + (nv ? nv.id : '—') + '</th></tr></thead><tbody>' +
      '<tr><th>報到時間</th><td>' + esc(old.check_in_at) + '</td><td>' + esc(nv ? nv.check_in_at : '') + '</td></tr>' +
      '<tr><th>系統記錄的離廠時間</th><td>' + esc(old.check_out_at || '（空）') + '<br><small>補登操作當下寫入</small></td><td>（尚未離廠）</td></tr>' +
      '<tr><th>訪客證</th><td>' + esc(passCodeOf(st.db, old.pass_id)) + '</td><td>' + esc(nv ? passCodeOf(st.db, nv.pass_id) : '') + '</td></tr>' +
      '</tbody></table>' +
      '<table class="data compare"><caption>「實際發生」與「系統記錄」</caption><tbody>' +
      '<tr><th>實際離開（訪客口述，未查證）</th><td>2027-10-04 約 17:30</td></tr>' +
      '<tr><th>系統記錄的離廠時間</th><td>' + esc(old.check_out_at || '') + '</td></tr>' +
      '<tr><th>兩者相差</th><td>' + gap + '</td></tr></tbody></table>' +
      '<h3>你的預測與系統結果</h3><ol class="pred">' + pred + '</ol>';
    return midtermSettlementHtml(st, top);
  }

  return {
    id: 'level2', title: '第二關　昨天走了，今天還在廠', role: '接待員 林淑芬', showSummary: true,
    setup(st) {
      st.db = level2Data();
      st.clock = clockAt(2027, 10, 5, 9, 10);
      st.player = { x: 5, y: 3, dir: 'right' };
      st.flags = { talked: false, selected: false, rejected: false, found: false, cardBack: false, predicted: false, backfilled: false, newVisitId: null, handed: false, notified: false };
      st.npcs = { L: npcDef('L', '林志豪', '#059669', 9, 8) };
      st.cards = { 'V-02': 'inPlant', 'V-05': 'L', 'V-06': 'rack', 'V-07': 'rack' };
    },
    onStart() {
      walkNpc('L', [[9, 3], [7, 3]]);
      showTalk([{ who: '旁白', text: '10 月 5 日上午 9:10。你是接待員林淑芬。一位回訪的訪客走到櫃台。' }], [], { closeLabel: '開始' });
    },
    objective(st) {
      const f = st.flags;
      const nv = newVisit(st);
      const code = nv ? passCodeOf(st.db, nv.pass_id) : null;
      return {
        title: '回訪者再次到廠', items: [
          { text: '在櫃台與訪客對話並核對證件', done: f.talked },
          { text: '到電腦查詢並選用林志豪的主檔', done: f.selected },
          { text: '選一張今天可用的訪客證，送出報到', done: f.rejected || !!nv },
          { text: '到「在廠名單」查看明細，找出系統拒絕的原因', done: f.found },
          { text: '回櫃台向訪客確認昨天的情形，收回 V-05', done: f.cardBack },
          { text: '在「在廠名單」對昨天那筆辦理離廠（補登前先預測）', done: f.backfilled },
          { text: '重新辦理今天的報到', done: !!nv },
          { text: code ? '把 ' + code + ' 交給林志豪（用不到的卡放回證架）' : '交付系統登記的訪客證', done: f.handed }
        ]
      };
    },
    npcAttention(st, id) {
      const f = st.flags;
      if (id !== 'L' || f.handed) return false;
      if (!f.talked) return true;
      if (f.found && !f.cardBack) return true;
      const nv = newVisit(st);
      return !!nv && st.cards[passCodeOf(st.db, nv.pass_id)] === 'player';
    },
    counterIdCard(st) {
      return st.flags.talked ? { name: WHO.idCard.name, company: WHO.company, phone: WHO.phone, idNo: WHO.idCard.id_no } : null;
    },
    onTalk(st, id) {
      const f = st.flags;
      if (id !== 'L') return;
      if (f.handed) return showTalk([{ who: '林志豪', text: '謝謝，我上去了。' }]);
      if (!f.talked) {
        return showTalk([
          { who: '林志豪', text: '早安，我是宇辰機電的林志豪，今天又來找李俊傑經理開會。' },
          { who: '林志豪', text: '手機 0911000505，證件在這裡。' }, idCardLine(WHO)
        ], [{ label: '核對證件：姓名、照片與本人相符', run: () => { f.talked = true; advance(st, 1); addTrail(st, '與林志豪對話，核對證件'); } }]);
      }
      if (f.found && !f.cardBack) {
        return showTalk([
          { who: '你', text: '系統顯示您昨天 14:10 報到之後，還沒有離廠登記。請問昨天大概幾點離開？' },
          { who: '林志豪', text: '啊，昨天開完會大概 17:30 就走了。那時候櫃台剛好沒人，我就直接離開……' },
          { who: '林志豪', text: '這張 V-05 還在我身上，不好意思。' }
        ], [{
          label: '收回訪客證 V-05',
          run: () => {
            st.cards['V-05'] = 'player'; f.cardBack = true; advance(st, 1);
            addTrail(st, '向林志豪確認：昨天約 17:30 離開（口述）；收回 V-05');
          }
        }]);
      }
      const lines = [{ who: '林志豪', text: f.rejected && !f.found ? '咦，怎麼了？系統有問題嗎？' : '好，麻煩你了。' }];
      if (f.rejected && !f.found) lines.push({ kind: 'coach', text: '先到電腦「在廠名單」查看明細，找出系統為什麼拒絕。' });
      lines.push({ kind: 'memo', text: WHO.memo });
      const choices = f.cardBack ? heldCards(st).map(code => ({ label: '交付訪客證 ' + code, run: () => handCard(st, code) })) : [];
      showTalk(lines, choices);
    },
    onPhone(st, ext) {
      if (ext !== WHO.ext || !st.flags.talked) return null;
      st.flags.notified = true;
      addTrail(st, '撥打分機 2301 通知李俊傑');
      return [{ who: '李俊傑', text: '林先生到了？好，請他上來，謝謝。' }];
    },
    computerTabs() { return STD_TABS; },
    onSystem(st, evt) {
      const f = st.flags;
      switch (evt.type) {
        case 'lookup':
          addTrail(st, '以手機 ' + (evt.phone || '（空白）') + ' 查詢主檔：' + evt.results.length + ' 筆');
          return {};
        case 'selectVisitor':
          if (!f.talked) return { block: '先到櫃台和訪客對話、核對證件，再選用主檔。' };
          if (evt.visitor.id !== 1) return { block: '這筆主檔不是櫃台的林志豪，請再比對證件。' };
          f.selected = true;
          addTrail(st, '選用訪客主檔 #1（林志豪）');
          return {};
        case 'beforeCreateVisitor':
          return { warn: ['林志豪已經有訪客主檔，查詢結果裡就有。系統不限制重複建檔，但重複的主檔會讓之後的查詢更難判斷。'] };
        case 'createVisitor':
          addTrail(st, '建立訪客主檔 #' + evt.visitor.id + '（' + evt.visitor.name + '）');
          return {};
        case 'beforeCheckIn': {
          if (evt.input.visitorId && evt.input.visitorId !== 1) return { block: '「目前選用的主檔」不是櫃台的林志豪。' };
          const w = checkInMismatch(st.db, evt.input, WHO);
          return w.length ? { warn: w } : {};
        }
        case 'checkIn':
          if (evt.result.ok) {
            f.newVisitId = evt.result.visit.id;
            addTrail(st, '送出報到：來訪 #' + f.newVisitId + '，訪客證 ' + passCodeOf(st.db, evt.result.visit.pass_id));
            return {};
          }
          addTrail(st, '送出報到失敗：' + evt.result.errors.join('；'));
          if (evt.result.errors.some(e => e.indexOf('仍在廠內') >= 0)) {
            f.rejected = true;
            const p = evt.input.passId ? passCodeOf(st.db, evt.input.passId) + ' 目前狀態：' + passStatus(st.db, evt.input.passId) + '。' : '';
            return { coach: '報到被拒：沒有新增來訪紀錄，你選的訪客證也沒有被占用（' + p + '）到「在廠名單」找原因。' };
          }
          return {};
        case 'viewVisitDetail':
          if (evt.visitId === OLD_VISIT) {
            if (!f.found) addTrail(st, '在在廠名單找到昨天 14:10 的來訪 #2（離廠時間為空）');
            f.found = true;
            return { coach: '這筆是昨天 14:10 的報到，離廠時間是空的。系統因此認定林志豪仍在廠內，V-05 也還被占用。' };
          }
          if (evt.visitId === 3) return { coach: '這是陳美玲今天的來訪，和林志豪無關。' };
          return {};
        case 'beforeCheckOut':
          if (evt.visitId === OLD_VISIT) {
            if (!f.found) f.found = true;
            if (!f.cardBack) return { block: '系統其實允許直接按離廠，但接待員應先回櫃台向訪客確認昨天的情形、收回 V-05，再補登。' };
            if (!f.predicted) {
              return {
                intercept: proceed => openQuiz('補登前先預測', '按下離廠之前，先預測三件事。選完會看到說明，可以改選，不計分。',
                  predictionQuestions(st), st.predictions, '繼續補登', () => { f.predicted = true; proceed(); })
              };
            }
            return {};
          }
          if (evt.visitId === 3) return { warn: ['陳美玲今天 08:40 進廠維修，人還在廠內。確定要登記她離廠嗎？'] };
          return {};
        case 'checkOut':
          if (evt.result.ok && evt.result.visit.id === OLD_VISIT) {
            f.backfilled = true;
            addTrail(st, '補登離廠：來訪 #2，系統寫入 ' + evt.result.visit.check_out_at);
            return { coach: '系統寫入的離廠時間是 ' + evt.result.visit.check_out_at + '：這是你補登的操作時刻，不是林志豪說的昨天 17:30。V-05 已解除占用。' };
          }
          if (evt.result.ok) addTrail(st, '登記離廠：來訪 #' + evt.result.visit.id);
          return {};
      }
      return {};
    },
    onRack(st, action, code) { addTrail(st, (action === 'take' ? '從證架取出 ' : '把 ') + code + (action === 'take' ? '' : ' 放回證架')); }
  };
}

/* ---------- 6. CR scenario controller (final demo only) ---------- */

let FinalDemo = null;

/* @@FINAL_BEGIN */
const CR_SCENARIOS = {};

const CR_STD_RC = () => npcDef('rc', '接待員 林淑芬', '#db2777', 5, 3);

CR_SCENARIOS['CR-01'] = {
  title: '事前來訪預約與受訪員工確認',
  requester: '生產部經理 李俊傑（受訪員工代表）',
  requesterNpc: 'mgr',
  summary: '上午多位訪客同時抵達，櫃台逐位詢問來意、打分機找人，排隊變長。',
  tabs: [{ id: 'checkin', label: '來訪報到' }, { id: 'employees', label: '受訪員工分機' }, { id: 'onsite', label: '在廠名單' }],
  computerOptions: {
    checkinReadOnly: true, allowCheckout: false,
    banner: '期末情境 CR-01：以下是現況模擬畫面，只供觀察，不辦理報到。現況系統沒有預約登錄，受訪員工也不登入系統；系統安裝在櫃台單機。（依變更提案書所述現況，實際畫面請回原系統確認）'
  },
  setup(st) {
    st.db = {
      visitors: [
        { id: 1, name: '宋立群', company: '嘉和電子', phone: '0911001111', id_no: 'A100001111' },
        { id: 2, name: '劉文雄', company: '大展物流', phone: '0911001212', id_no: 'C100001212' },
        { id: 3, name: '邱國華', company: '正發機電', phone: '0911001313', id_no: 'D100001313' },
        { id: 4, name: '鍾佳穎', company: '永順包材', phone: '0911001414', id_no: 'E200001414' },
        { id: 5, name: '陳美玲', company: '順安水電', phone: '0911000606', id_no: 'B200000606' }
      ],
      employees: baseEmployees(),
      visitor_passes: makePasses(['V-01', 'V-02', 'V-03', 'V-04', 'V-05', 'V-06']),
      visits: [mkVisit(1, 5, 3, 1, '維修', 0, '2027-11-08 08:30', null)],
      users: baseUsers()
    };
    st.clock = clockAt(2027, 11, 8, 8, 58);
    st.player = { x: 2, y: 4, dir: 'right' };
    st.npcs = {
      rc: CR_STD_RC(),
      q1: npcDef('q1', '宋立群（開會）', '#0891b2', 7, 3),
      q2: npcDef('q2', '劉師傅（送貨）', '#65a30d', 8, 3),
      q3: npcDef('q3', '邱先生（維修）', '#ea580c', 9, 3),
      q4: npcDef('q4', '鍾小姐（送貨）', '#a21caf', 9, 8, false),
      mgr: npcDef('mgr', '李俊傑經理', '#0f766e', 19, 2, false)
    };
    ['V-02', 'V-03', 'V-04', 'V-05', 'V-06'].forEach(c => { st.cards[c] = 'rack'; });
    st.cards['V-01'] = 'inPlant';
  },
  intro: [
    { who: '旁白', text: '11 月 8 日上午 8:58。你是系統分析師，今天到櫃台旁觀察現場作業。櫃台前已經排了三位訪客。' },
    { who: '旁白', text: '在場景中走動、和人對話、查看電腦與電話，收集「觀察筆記」。從櫃台後方的門（左上）可以走到大廳。' }
  ],
  clues: [
    { id: 'meeting', hint: '和排在最前面、約好開會的訪客談談', text: '約好九點開會的訪客到達後，接待員才開始聯絡受訪員工，訪客在櫃台等候。' },
    { id: 'delivery', hint: '和排隊的送貨司機談談', text: '送貨訪客和開會訪客排同一個櫃台，要等前面的人登記完。' },
    { id: 'walkin', hint: '和臨時被叫來的維修廠商談談', text: '有臨時被叫來、沒有事先告知的訪客，仍需要在櫃台處理。' },
    { id: 'receptionist', hint: '問問接待員平常怎麼處理', text: '接待員逐位詢問來意、查分機、打電話通知；受訪員工常不在座位。' },
    { id: 'computer', hint: '查看櫃台電腦的來訪報到畫面', text: '模擬的報到畫面只能選擇受訪員工並看到分機；現況沒有預約登錄，受訪員工不登入系統，系統只裝在櫃台單機。' },
    { id: 'phone', hint: '用電話撥打受訪員工的分機', text: '撥打受訪員工分機無人接聽，等候時間增加，又有新訪客加入排隊。' }
  ],
  talk: {
    q1(st, api) {
      api.collect(st, 'meeting');
      showTalk([{ who: '宋立群', text: '我們跟生產部李經理約九點開會，現在已經 ' + fmtHM(st.clock) + ' 了，接待員還在幫我找人。' }]);
    },
    q2(st, api) {
      api.collect(st, 'delivery');
      showTalk([{ who: '劉師傅', text: '我只是來送貨的，每次都要排在開會的人後面，等他們登記完才能進去卸貨。' }]);
    },
    q3(st, api) {
      api.collect(st, 'walkin');
      showTalk([{ who: '邱先生', text: '我是今天早上臨時被叫來修空壓機的，應該沒有人事先跟櫃台講。' }]);
    },
    q4(st) { showTalk([{ who: '鍾小姐', text: '前面還有幾位啊？我車停在外面。' }]); },
    rc(st, api) {
      api.collect(st, 'receptionist');
      showTalk([
        { who: '林淑芬', text: '每一位我都要先問找誰、來做什麼，再查分機打電話。受訪的人常常不在座位上，要一直重打。' },
        { who: '林淑芬', text: '員工沒辦法在自己座位用這套系統，系統只裝在櫃台這台電腦。李經理的分機是 2301，你可以幫我打打看。' }
      ]);
    }
  },
  requesterWaiting: [{ who: '李俊傑', text: '……' }],
  phone(st, ext, api) {
    if (ext !== '2301') return null;
    const first = st.cr.clues.indexOf('phone') < 0;
    advance(st, 4);
    api.collect(st, 'phone');
    if (first) {
      showNpc('q4', 9, 8);
      walkNpc('q4', [[10, 3]]);
      log('又有一位送貨的訪客加入排隊。', 'scene');
    }
    return [{ who: '電話', text: '（嘟……嘟……響了很久，沒有人接。）' }, { who: '旁白', text: '時間過了 4 分鐘，櫃台前的隊伍還在等。' }];
  },
  onSystem(st, evt, api) {
    if (evt.type === 'openTab' && evt.tab === 'checkin') api.collect(st, 'computer');
    return {};
  },
  onCluesDone(st) {
    showNpc('mgr', 19, 2);
    walkNpc('mgr', [[8, 2]]);
    log('李俊傑經理從廠內走出來了。去和他談談。', 'scene');
  },
  requestLines: [
    { who: '李俊傑', text: '抱歉，我剛在產線，電話沒接到。宋先生他們等了快二十分鐘。' },
    { who: '李俊傑', text: '我希望訪客來之前，我就能知道誰會來、幾點來、來做什麼。這樣我可以先安排，櫃台也不用一位一位打給我。' },
    { who: '李俊傑', text: '還有，約好卻沒來的人，我也想知道，看要不要追蹤。' }
  ],
  requests: [
    '事前知道哪位訪客會來、何時來、什麼事由',
    '減少訪客到達後才逐位聯絡造成的櫃台等候',
    '追蹤約好卻沒有到的訪客'
  ],
  statements: [
    { text: '上午九點多，三位訪客在櫃台排隊等候登記。', cat: 'obs', explain: '這是你在現場看到的情形。' },
    { text: '撥打分機 2301 無人接聽，等候時間增加。', cat: 'obs', explain: '這是你操作電話後實際發生的結果。' },
    { text: '生產部經理希望訪客到達前就知道誰會來、何時來、什麼事由。', cat: 'want', explain: '這是需求提出者希望達成的業務結果，還不是系統規格。' },
    { text: '經理也想追蹤約好卻沒到的訪客。', cat: 'want', explain: '這是利害關係人的期望；要怎麼判斷「沒到」，還需要釐清。' },
    { text: '臨時被叫來的維修廠商沒有事先通知櫃台。', cat: 'obs', explain: '這是現場訪客的說法，也提醒你：未預約的訪客仍要能被處理。' },
    { text: '只要讓員工在自己的電腦登入系統，問題就解決了。', cat: 'infer', explain: '這是解法的猜想。現況系統裝在櫃台單機、員工不登入，部署與權限都還要查證。' },
    { text: '預約資料可以直接存在來訪紀錄裡。', cat: 'infer', explain: '這是資料設計的想法，不是現況事實；合理的做法可能不只一種。' }
  ],
  impacts: {
    '角色': '受訪員工會不會成為新的系統使用者？接待員的工作內容會怎麼改變？',
    '流程': '「訪客到達前」與「到達後」各有哪些步驟？未預約訪客的流程要不要保留？',
    '功能': '現有哪些功能和來訪報到有關？哪一個操作步驟是瓶頸？',
    '資料': '需要知道訪客的哪些資訊？其中哪些是個資？約好沒來的情況要怎麼看出來？',
    '權限': '受訪員工可以看到哪些訪客資料？現有的接待員、管理員兩類角色夠不夠？',
    '操作環境': '系統安裝在櫃台單機，受訪員工要從哪裡使用？'
  },
  verify: [
    '打開原系統的來訪報到畫面，確認選擇受訪員工時看得到哪些資訊。',
    '確認原系統有哪些角色可以登入、各自能用哪些畫面。',
    '確認系統安裝在哪裡、其他電腦能不能連到。',
    '在 SQLite 查看員工與來訪資料目前記錄哪些欄位（只看現況，不先設計新表）。'
  ],
  guide: [
    '需要先了解哪些利害關係人的工作？',
    '哪個現有操作步驟成為瓶頸？',
    '若要讓受訪員工參與，現有權限與單機櫃台部署有何限制？',
    '還有哪些資料使用與隱私問題需要詢問？'
  ]
};

CR_SCENARIOS['CR-02'] = {
  title: '未離廠追蹤',
  requester: '工安課 蔡明哲',
  requesterNpc: 'safety',
  summary: '交班前，工安課要確認目前到底還有哪些訪客在廠；名單和巡查結果對不上。',
  tabs: [{ id: 'onsite', label: '在廠名單' }, { id: 'employees', label: '受訪員工分機' }],
  computerOptions: {
    checkinReadOnly: true, allowCheckout: true,
    banner: '期末情境 CR-02：現況模擬畫面。「離廠」是原有功能，按下後會寫入操作當下的時間；本情境不提供改善後的補登功能。'
  },
  setup(st) {
    st.db = {
      visitors: [
        { id: 1, name: '郭哲維', company: '北辰設計', phone: '0911001010', id_no: 'N100001010' },
        { id: 2, name: '何俊宏', company: '大展物流', phone: '0911000707', id_no: 'P100000707' },
        { id: 3, name: '蘇怡安', company: '晨光科技', phone: '0911000808', id_no: 'Q200000808' },
        { id: 4, name: '江柏翰', company: '立信工程', phone: '0911000909', id_no: 'R100000909' },
        { id: 5, name: '張雅婷', company: '禾豐檢測', phone: '0911000303', id_no: 'G200000303' }
      ],
      employees: baseEmployees(),
      visitor_passes: makePasses(['V-01', 'V-02', 'V-03', 'V-04', 'V-05', 'V-06', 'V-07'], ['V-07']),
      visits: [
        mkVisit(1, 1, 5, 6, '參觀', 3, '2027-10-02 09:30', null),
        mkVisit(2, 2, 3, 3, '送貨', 0, '2027-10-05 15:20', null),
        mkVisit(3, 3, 1, 1, '開會', 0, '2027-10-06 09:30', null),
        mkVisit(4, 4, 2, 4, '維修', 2, '2027-10-06 13:10', null),
        mkVisit(5, 5, 2, 2, '維修', 0, '2027-10-06 10:00', '2027-10-06 10:45')
      ],
      users: baseUsers()
    };
    st.clock = clockAt(2027, 10, 6, 16, 50);
    st.player = { x: 2, y: 4, dir: 'right' };
    st.npcs = {
      rc: CR_STD_RC(),
      safety: npcDef('safety', '工安課 蔡明哲', '#ca8a04', 7, 3),
      guard: npcDef('guard', '保全 王志明', '#374151', 18, 4)
    };
    st.cards = { 'V-01': 'inPlant', 'V-02': 'rack', 'V-03': 'unknown', 'V-04': 'inPlant', 'V-05': 'rack', 'V-06': 'unknown', 'V-07': 'rack' };
  },
  intro: [
    { who: '旁白', text: '10 月 6 日 16:50，快要交班。你是系統分析師，工安課的蔡明哲來到櫃台。' },
    { who: '蔡明哲', text: '交班前我要確認，現在到底還有哪些訪客在廠。系統名單上有 4 筆，可是巡查好像沒看到那麼多人。' },
    { who: '旁白', text: '查看名單、證架，和保全、接待員談談，必要時打電話給受訪員工。收集「觀察筆記」後再回來找蔡明哲。' }
  ],
  clues: [
    { id: 'onsite', hint: '查看櫃台電腦的在廠名單', text: '在廠名單有 4 筆未離廠紀錄：2 筆是今天報到，另外 2 筆是 10 月 5 日與 10 月 2 日報到。' },
    { id: 'guard', hint: '問問廠內入口旁的保全', text: '保全 16:30 巡查只看到 2 組訪客（共 4 人），和名單的 4 筆對不上。' },
    { id: 'rack', hint: '查看訪客證架', text: '證架上少了 V-01、V-03、V-04、V-06，和系統裡被占用的 4 張相同；巡查只看到 2 組訪客。' },
    { id: 'call_zhou', hint: '打電話問 10 月 5 日那筆的受訪員工', text: '受訪員工周大衛說，何俊宏 10 月 5 日 16 點多就離開了，但系統仍列在廠。' },
    { id: 'try_checkout', hint: '在在廠名單對舊紀錄按一次「離廠」，看看會寫入什麼', text: '原有離廠操作只寫入操作當下的時間與目前登入帳號，畫面上沒有地方記下實際離開時間或補登原因。' },
    { id: 'call_huang', optional: true, hint: '（額外）打電話問 10 月 2 日那筆的受訪員工', text: '黃怡君不確定 10 月 2 日的參觀團何時離開，需要再查證。' }
  ],
  talk: {
    rc() {
      showTalk([
        { who: '林淑芬', text: '名單上的人還在不在，我只能看系統。人走了沒登記，系統不會自己知道。' },
        { who: '林淑芬', text: '受訪員工的分機可以在電腦的「受訪員工分機」查。保全王大哥在廠內入口那邊。' }
      ]);
    },
    guard(st, api) {
      api.collect(st, 'guard');
      showTalk([{ who: '王志明', text: '我 16:30 巡過一次。會議室有晨光科技 1 位，空壓機房有立信工程 3 個人。其他地方沒看到訪客。' }]);
    }
  },
  requesterWaiting: [{ who: '蔡明哲', text: '麻煩你先幫我查清楚：名單上 4 筆，到底哪些人還在？' }],
  phone(st, ext, api) {
    if (ext === '2155') {
      api.collect(st, 'call_zhou');
      return [{ who: '周大衛', text: '大展物流的何先生？他昨天下午四點多卸完貨就走了啊，我看著車開走的。' }];
    }
    if (ext === '2100') {
      api.collect(st, 'call_huang');
      return [{ who: '黃怡君', text: '10 月 2 日北辰設計那團參觀？我記得中午就結束了，不過他們幾點走出大門，我不確定。' }];
    }
    return null;
  },
  onObject(st, obj, api) { if (obj === 'rack') api.collect(st, 'rack'); },
  onSystem(st, evt, api) {
    if (evt.type === 'openTab' && evt.tab === 'onsite') api.collect(st, 'onsite');
    if (evt.type === 'beforeCheckOut' && (evt.visitId === 3 || evt.visitId === 4) && st.cr.clues.indexOf('guard') >= 0) {
      return { warn: ['保全 16:30 巡查時，這組訪客還在廠內。'] };
    }
    if (evt.type === 'checkoutConfirm') {
      api.collect(st, 'try_checkout');
      return { note: '（觀察）這個畫面沒有欄位可以輸入實際離開時間或補登原因。' };
    }
    if (evt.type === 'checkOut' && evt.result.ok) {
      addTrail(st, '以原有離廠功能送出來訪 #' + evt.result.visit.id + '：系統記錄 ' + evt.result.visit.check_out_at);
    }
    return {};
  },
  onCluesDone() { log('觀察已足夠，回櫃台找工安課蔡明哲說明。', 'scene'); },
  requestLines: [
    { who: '蔡明哲', text: '所以名單裡混了前幾天就走的人。交班的時候，我需要能看出哪些可能是漏登，先去核對。' },
    { who: '蔡明哲', text: '還有，補登的時候只留下按鍵當下的時間不夠。我要知道他實際幾點走的、為什麼是補登、是誰補的。' },
    { who: '蔡明哲', text: '真的出事的時候，我得知道廠裡到底有誰。' }
  ],
  requests: [
    '交班時能核對目前在廠的訪客，辨識可能漏登的紀錄',
    '補登時保留實際離開時間、補登原因與補登者等追溯資訊',
    '在廠名單的正確性影響緊急時的人員掌握'
  ],
  statements: [
    { text: '在廠名單顯示 4 筆未離廠紀錄，其中 2 筆是前幾天報到的。', cat: 'obs', explain: '這是你在模擬畫面上看到的內容；記得回原系統確認畫面顯示的欄位。' },
    { text: '倉儲課周大衛說，大展物流的訪客昨天 16 點多就離開了。', cat: 'obs', explain: '這是現場取得的口述資訊，屬於觀察，但要記下來源。' },
    { text: '按下離廠只會寫入現在的時間。', cat: 'obs', explain: '這是你在模擬中操作的結果；同樣要回原系統實際操作一次確認。' },
    { text: '工安課希望交班時能核對可能漏登的訪客。', cat: 'want', explain: '這是需求提出者的期望，「怎麼核對」還沒有定案。' },
    { text: '工安課希望補登時留下實際離開時間、原因與補登者。', cat: 'want', explain: '這是追溯需求；要怎麼記錄，屬於之後的設計。' },
    { text: '北辰設計的參觀團 10 月 2 日中午就離開了。', cat: 'infer', explain: '黃怡君自己也不確定，這只是推測，需要再查證。' },
    { text: '把超過一天沒離廠的紀錄自動刪掉就好。', cat: 'infer', explain: '這是解法的想法，而且依變更提案書，原訪客紀錄不能刪除。' }
  ],
  impacts: {
    '角色': '工安課、接待員、保全在交班核對中各做什麼？誰負責補登？',
    '流程': '交班核對在什麼時間、依什麼順序進行？發現漏登後怎麼處理？',
    '功能': '現有的在廠名單、離廠、再次報到檢查，哪些會受影響？',
    '資料': '「實際離開」和「補登操作」是兩個不同的事件，各自需要留下什麼？',
    '權限': '誰可以補登？補登後能不能再修改？',
    '操作環境': '核對在櫃台單機進行，巡查結果怎麼回報到櫃台？'
  },
  verify: [
    '在原系統的在廠名單確認顯示哪些欄位，看不看得到報到日期。',
    '實際操作一次離廠，確認系統寫入的時間與登記人。',
    '在 SQLite 查詢離廠時間為空的來訪紀錄，看各是哪一天報到。',
    '對仍在廠的訪客再次報到，確認系統的拒絕訊息。'
  ],
  guide: [
    '哪些紀錄需要優先核對？',
    '哪些事實可由原有畫面查到？',
    '實際離開與補登操作為何是不同事件？',
    '若要提出修改方案，還需釐清什麼驗證規則或責任歸屬？'
  ]
};

CR_SCENARIOS['CR-03'] = {
  title: '當日訪客總覽與匯出',
  requester: '總務課管理員 黃怡君',
  requesterNpc: 'admin',
  summary: '管理員臨時要一份今天所有外來人員的彙整交給主管存檔；現有兩個清單的範圍不同。',
  tabs: [{ id: 'onsite', label: '在廠名單' }, { id: 'history', label: '來訪紀錄查詢（情境示意）' }],
  computerOptions: {
    checkinReadOnly: true, allowCheckout: false,
    banner: '期末情境 CR-03：現況模擬畫面，只供查看。本情境沒有總覽頁，也沒有匯出功能。'
  },
  setup(st) {
    st.db = {
      visitors: [
        { id: 1, name: '何俊宏', company: '大展物流', phone: '0911000707', id_no: 'P100000707' },
        { id: 2, name: '蘇怡安', company: '晨光科技', phone: '0911000808', id_no: 'Q200000808' },
        { id: 3, name: '張雅婷', company: '禾豐檢測', phone: '0911000303', id_no: 'G200000303' },
        { id: 4, name: '江柏翰', company: '立信工程', phone: '0911000909', id_no: 'R100000909' },
        { id: 5, name: '宋立群', company: '嘉和電子', phone: '0911001111', id_no: 'A100001111' },
        { id: 6, name: '郭哲維', company: '北辰設計', phone: '0911001010', id_no: 'N100001010' },
        { id: 7, name: '黃建民', company: '東昇精機', phone: '0911000101', id_no: 'F100000101' }
      ],
      employees: baseEmployees(),
      visitor_passes: makePasses(['V-01', 'V-02', 'V-03', 'V-04', 'V-05', 'V-06']),
      visits: [
        mkVisit(1, 1, 3, 3, '送貨', 0, '2027-10-05 15:20', null),
        mkVisit(2, 2, 1, 1, '開會', 1, '2027-10-06 09:30', '2027-10-06 11:50'),
        mkVisit(3, 3, 2, 2, '維修', 0, '2027-10-06 10:00', '2027-10-06 10:45'),
        mkVisit(4, 4, 2, 4, '維修', 2, '2027-10-06 13:10', null),
        mkVisit(5, 5, 1, 5, '開會', 0, '2027-10-06 14:00', null),
        mkVisit(6, 6, 5, 6, '參觀', 3, '2027-10-05 09:30', '2027-10-05 11:40'),
        mkVisit(7, 7, 1, 2, '開會', 0, '2027-10-04 10:00', '2027-10-04 11:30')
      ],
      users: baseUsers()
    };
    st.clock = clockAt(2027, 10, 6, 15, 30);
    st.player = { x: 2, y: 4, dir: 'right' };
    st.npcs = { rc: CR_STD_RC(), admin: npcDef('admin', '總務課 黃怡君', '#9333ea', 7, 3) };
    st.cards = { 'V-01': 'rack', 'V-02': 'rack', 'V-03': 'unknown', 'V-04': 'inPlant', 'V-05': 'inPlant', 'V-06': 'rack' };
  },
  intro: [
    { who: '旁白', text: '10 月 6 日 15:30。你是系統分析師。總務課管理員黃怡君來到櫃台。' },
    { who: '黃怡君', text: '主管要一份今天所有外來人員的名單存檔：今天來過的、現在還在廠的，還有昨天進來還沒離開的。' },
    { who: '旁白', text: '查看電腦上現有的兩種清單，問問接待員，收集「觀察筆記」後再回來找黃怡君。' }
  ],
  clues: [
    { id: 'onsite', hint: '查看電腦的在廠名單', text: '在廠名單只列出尚未登記離廠的 3 筆，其中何俊宏是 10 月 5 日報到；今天已離開的蘇怡安、張雅婷不在名單上。' },
    { id: 'history', hint: '在「來訪紀錄查詢（情境示意）」查 10 月 6 日', text: '依報到日期查 10 月 6 日有 4 筆，昨天報到、還沒離廠的何俊宏不在其中。' },
    { id: 'companions', hint: '查看一筆有隨行人員的紀錄明細', text: '來訪紀錄只有隨行人數（例如江柏翰隨行 2 人），沒有每位隨行者的姓名。' },
    { id: 'rc', hint: '問問接待員平常怎麼整理名單', text: '現況沒有整合的當日總覽，也沒有匯出功能；接待員要分別查看兩個畫面。' }
  ],
  talk: {
    rc(st, api) {
      api.collect(st, 'rc');
      showTalk([{ who: '林淑芬', text: '要整理今天的名單，我只能兩個畫面各看一次，再自己抄。系統沒有總覽，也沒有匯出的按鈕。' }]);
    }
  },
  requesterWaiting: [{ who: '黃怡君', text: '麻煩你先看看系統現在能查到什麼。' }],
  onSystem(st, evt, api) {
    if (evt.type === 'openTab' && evt.tab === 'onsite') api.collect(st, 'onsite');
    if (evt.type === 'viewVisitDetail') {
      const v = st.db.visits.find(x => x.id === evt.visitId);
      if (v && v.companions > 0) api.collect(st, 'companions');
    }
    return {};
  },
  renderExtraTab(st, tab, panel, api) {
    if (tab !== 'history') return;
    const days = ['2027-10-04', '2027-10-05', '2027-10-06'];
    const day = st.cr.histDay || '';
    const rows = day ? st.db.visits.filter(v => v.check_in_at.slice(0, 10) === day).map(v => joinVisit(st.db, v)) : [];
    panel.innerHTML =
      '<p class="banner warn">情境模擬示意：只讀、固定資料，用來比較兩種現有清單的資訊範圍。這不是完整的查詢模組，也不是原系統的 SQLite 查詢。</p>' +
      '<label>報到日期 <select id="hist-day"><option value="">請選擇</option>' +
      days.map(d => '<option value="' + d + '"' + (d === day ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></label>' +
      (day ? '<table class="data"><thead><tr><th>來訪#</th><th>訪客</th><th>公司</th><th>受訪員工</th><th>訪客證</th><th>報到時間</th><th>離廠時間</th><th></th></tr></thead><tbody>' +
        rows.map(r => '<tr><td>' + r.id + '</td><td>' + esc(r.visitor_name) + '</td><td>' + esc(r.company) + '</td><td>' + esc(r.employee_name) +
          '</td><td>' + esc(r.pass_code) + '</td><td>' + esc(r.check_in_at) + '</td><td>' + esc(r.check_out_at || '（空）') +
          '</td><td><button type="button" class="small" data-hdetail="' + r.id + '">明細</button></td></tr>' +
          (st.cr.histDetail === r.id ? '<tr class="detail"><td colspan="8">' + visitDetailHtml(st.db, r) + '</td></tr>' : '')).join('') +
        '</tbody></table><p class="hint">共 ' + rows.length + ' 筆（依報到日期）。</p>' : '');
    panel.querySelector('#hist-day').addEventListener('change', e => {
      st.cr.histDay = e.target.value;
      st.cr.histDetail = null;
      if (st.cr.histDay === '2027-10-06') api.collect(st, 'history');
      rerenderComputer('hist-day');
    });
    panel.querySelectorAll('[data-hdetail]').forEach(b => b.addEventListener('click', () => {
      const id = Number(b.dataset.hdetail);
      st.cr.histDetail = st.cr.histDetail === id ? null : id;
      emit('viewVisitDetail', { visitId: id });
      rerenderComputer();
    }));
  },
  onCluesDone() { log('觀察已足夠，回櫃台找總務課黃怡君。', 'scene'); },
  requestLines: [
    { who: '黃怡君', text: '所以兩個畫面看到的範圍不一樣，要我自己拼起來。' },
    { who: '黃怡君', text: '我希望有一個當日總覽：今天來過的、還在廠的、前幾天進來還沒離廠的，都看得到，每個人現在是什麼狀態也要清楚。' },
    { who: '黃怡君', text: '最好能匯出成 CSV 交給主管存檔。還有，主管問過隨行的人是誰，現在只有人數。' },
    { who: '黃怡君', text: '對了，聽說生產部在提事前預約。如果那個也做了，預約了沒來、或取消的，要不要放進今天的名單？這個我也還不確定。' }
  ],
  requests: [
    '當日總覽：今天來過、仍在廠、前幾天報到仍未離廠的人員',
    '在總覽中看出每位訪客目前的狀態',
    '匯出 CSV 交主管存檔',
    '隨行人員的資訊（目前只有人數）',
    '有條件需求：若 CR-01 也被採用，總覽是否要納入當日預約與取消紀錄（待確認；本情境不假定預約功能已存在）'
  ],
  statements: [
    { text: '在廠名單只列出尚未登記離廠的來訪。', cat: 'obs', explain: '這是你在模擬畫面上看到的範圍。' },
    { text: '依報到日期查 10 月 6 日，看不到昨天報到、還沒離廠的何俊宏。', cat: 'obs', explain: '兩種清單的範圍不同，這是比較後看到的事實。' },
    { text: '隨行人員只記人數，沒有姓名。', cat: 'obs', explain: '明細裡只有人數；這代表有些資訊原本就沒有被記錄。' },
    { text: '管理員希望把今天的外來人員名單匯出成 CSV 給主管存檔。', cat: 'want', explain: '這是需求提出者的期望；要匯出哪些內容、給誰、存多久都還要澄清。' },
    { text: '管理員希望總覽能看出每位訪客目前的狀態。', cat: 'want', explain: '這是期望；「狀態」有哪些、怎麼判定，還沒有定義。' },
    { text: '總覽一定要包含今天的預約與取消紀錄。', cat: 'infer', explain: '只有在 CR-01 也被採用時才需要考慮，是有條件的需求，不是現況。' },
    { text: '隨行人員應該另外建一張資料表。', cat: 'infer', explain: '這是資料設計的想法，不是現況事實；合理的做法可能不只一種。' }
  ],
  impacts: {
    '角色': '管理員、接待員、主管各自要用這份名單做什麼？',
    '流程': '名單在什麼時間產生、交給誰、存多久？',
    '功能': '現有的在廠名單與依報到日期查詢，各自涵蓋哪些範圍？',
    '資料': '哪些資訊原本就沒有被記錄？',
    '權限': '誰可以看到、匯出這份名單？匯出檔包含哪些個資？',
    '操作環境': '匯出的檔案存在哪裡、怎麼交給主管？'
  },
  verify: [
    '在原系統分別打開在廠名單與依報到日期的來訪查詢，比較列出的範圍。',
    '在 SQLite 查看來訪資料中隨行資訊實際存了什麼。',
    '確認管理員角色現在能使用哪些畫面。',
    '詢問主管：CSV 給誰、存多久、需要包含哪些個資。'
  ],
  guide: [
    '目前兩個畫面的查詢範圍有何差異？',
    '有哪些資訊原本根本沒被記錄？',
    '管理員要的「今天所有外來人員」範圍該如何確認？',
    '如果要交付 CSV，必須再澄清哪些內容與資料保護要求？'
  ]
};

FinalDemo = (function () {
  const ORDER = ['CR-01', 'CR-02', 'CR-03'];
  const CATEGORIES = [
    { id: 'obs', label: '觀察到的問題（現場事實）' },
    { id: 'want', label: '利害關係人的期望' },
    { id: 'infer', label: '尚待查證的推論或設計想法' }
  ];
  const IMPACT_AREAS = ['角色', '流程', '功能', '資料', '權限', '操作環境'];

  function menuHtml() {
    return '<h2>期末：變更需求情境（教師示範）</h2>' +
      '<p class="hint">三項情境彼此獨立，可任選、不需依序；每項約 3–5 分鐘。玩其中一項，不代表其他項已經改好。你的角色是系統分析師：觀察現場問題、辨識需求與待查證事項，遊戲不提供改善後的系統。</p>' +
      '<p class="hint">這是教師示範案例的三項變更需求；一般小組的期末任務只有一項指定變更需求。</p>' +
      '<div class="cards">' + ORDER.map(id => {
        const sc = CR_SCENARIOS[id];
        return '<button type="button" class="card" data-start="' + id + '"><b>' + id + '　' + esc(sc.title) + '</b><span>需求提出者：' + esc(sc.requester) + '</span><span>' + esc(sc.summary) + '</span></button>';
      }).join('') + '</div>';
  }

  function makeController(id) {
    const sc = CR_SCENARIOS[id];
    const required = sc.clues.filter(c => !c.optional);
    const requiredDone = st => required.every(c => st.cr.clues.indexOf(c.id) >= 0);
    const api = { collect };

    function collect(st, clueId) {
      if (st.cr.clues.indexOf(clueId) >= 0) return;
      const c = sc.clues.find(x => x.id === clueId);
      if (!c) return;
      st.cr.clues.push(clueId);
      addTrail(st, '觀察：' + c.text);
      log('已記下觀察：' + c.text, 'note');
      if (st.cr.stage === 'explore' && requiredDone(st)) {
        st.cr.stage = 'request';
        sc.onCluesDone(st, api);
      }
      render();
    }

    function talkRequester(st) {
      if (st.cr.stage === 'explore') {
        return showTalk(sc.requesterWaiting.concat([{ kind: 'coach', text: '先在現場收集觀察筆記（右側清單），再回來聽需求說明。' }]));
      }
      if (st.cr.stage === 'request') {
        return showTalk(sc.requestLines, [{ label: '開始需求釐清練習', run: () => openExercise(st) }]);
      }
      return showTalk([{ who: sc.requester, text: '謝謝你整理。' }], [
        { label: '重做需求釐清練習', run: () => openExercise(st) },
        { label: '再看一次結算', run: () => openCRSettlement(st) }
      ]);
    }

    function feedback(s, chosen) {
      const ref = CATEGORIES.find(c => c.id === s.cat).label;
      return (chosen === s.cat ? '和參考分類相同。' : '參考分類是「' + ref + '」。') + s.explain;
    }

    function openExercise(st) {
      if (st.cr.stage !== 'done') st.cr.stage = 'exercise';
      openModal(id + ' 需求釐清練習（不計分）', body => {
        const a = st.cr.answers;
        body.innerHTML =
          '<p class="hint">下列說法來自剛才的現場。判斷每一句比較接近哪一類；選完會看到說明，可以改選，不計分、不記錄。</p>' +
          '<ol class="classify">' + sc.statements.map((s, i) =>
            '<li><p>' + esc(s.text) + '</p><div class="radios" role="radiogroup" aria-label="第 ' + (i + 1) + ' 句的分類">' +
            CATEGORIES.map(c => '<label><input type="radio" name="st' + i + '" value="' + c.id + '"' + (a[i] === c.id ? ' checked' : '') + '> ' + c.label + '</label>').join('') +
            '</div><p class="fb" id="fb' + i + '" aria-live="polite">' + (a[i] ? esc(feedback(s, a[i])) : '') + '</p></li>').join('') + '</ol>' +
          '<fieldset class="impacts"><legend>你認為這項需求可能影響哪些面向？（可複選）</legend>' +
          IMPACT_AREAS.map(x => '<label><input type="checkbox" value="' + x + '"' + (st.cr.impacts.indexOf(x) >= 0 ? ' checked' : '') + '> ' + x + '</label>').join('') + '</fieldset>' +
          '<label class="block">寫下你會追問利害關係人的問題（只存在這次遊玩的記憶體中，重新整理就會清除）<textarea id="cr-notes" rows="4">' + esc(st.cr.notes) + '</textarea></label>' +
          '<div class="choices"><button type="button" id="btn-to-settle">看結算</button><span id="ex-remain" class="hint"></span></div>';
        const btn = body.querySelector('#btn-to-settle');
        const remain = body.querySelector('#ex-remain');
        const refresh = () => {
          const left = sc.statements.filter((s, i) => !a[i]).length;
          btn.disabled = left > 0;
          remain.textContent = left > 0 ? '還有 ' + left + ' 句未分類' : '';
        };
        sc.statements.forEach((s, i) => {
          body.querySelectorAll('input[name="st' + i + '"]').forEach(r => r.addEventListener('change', () => {
            a[i] = r.value;
            body.querySelector('#fb' + i).textContent = feedback(s, r.value);
            refresh();
          }));
        });
        body.querySelectorAll('.impacts input').forEach(cb => cb.addEventListener('change', () => {
          st.cr.impacts = Array.from(body.querySelectorAll('.impacts input:checked')).map(x => x.value);
        }));
        body.querySelector('#cr-notes').addEventListener('input', e => { st.cr.notes = e.target.value; });
        btn.addEventListener('click', () => { st.cr.stage = 'done'; st.done = true; openCRSettlement(st); });
        refresh();
      }, { size: 'wide' });
    }

    function openCRSettlement(st) {
      const observed = sc.clues.filter(c => st.cr.clues.indexOf(c.id) >= 0).map(c => '<li>' + esc(c.text) + '</li>').join('');
      const html = '<div class="settle cr">' +
        '<p class="boundary">本情境只呈現現況困難與需求背景，不提供資料表、欄位、畫面或部署方案的答案。合理的做法可能不只一種，請回到原系統查證後，再提出有理由的設計。</p>' +
        '<div class="grid4">' +
        '<section><h3>觀察到的業務事件</h3><ul>' + observed + '</ul></section>' +
        '<section><h3>利害關係人的新要求（' + id + '｜' + esc(sc.requester) + '）</h3><ul>' + sc.requests.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></section>' +
        '<section><h3>可能受影響項目（分類問題）</h3><dl>' + IMPACT_AREAS.map(x =>
          '<dt>' + x + (st.cr.impacts.indexOf(x) >= 0 ? '　<span class="tag-sel">你有勾選</span>' : '') + '</dt><dd>' + esc(sc.impacts[x]) + '</dd>').join('') + '</dl></section>' +
        '<section><h3>回到實際系統確認</h3><ul>' + sc.verify.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></section>' +
        '</div>' +
        '<section><h3>結算引導問題</h3><ol>' + sc.guide.map(g => '<li>' + esc(g) + '</li>').join('') + '</ol></section>' +
        '<section><h3>你寫下的追問</h3><p class="notes">' + (st.cr.notes.trim() ? esc(st.cr.notes) : '（未填寫）') + '</p></section>' +
        '<p class="hint">課堂上可以用其中一項 CR，示範如何寫出「現況問題、需求釐清、影響範圍、驗收需求」，再對照期末修改建議書的架構。</p>' +
        '</div>';
      openSettlement(id + ' 結算：' + sc.title, html, [
        { label: '重做需求釐清練習', run: () => openExercise(st) },
        { label: '重新開始此情境', run: () => startMode(id) },
        { label: '回到標題', run: showTitle }
      ]);
    }

    return {
      id, title: id + '　' + sc.title, role: '系統分析師（觀察現場）', isCR: true, rackReadOnly: true,
      setup(st) {
        sc.setup(st);
        st.cr = { clues: [], answers: {}, impacts: [], notes: '', stage: 'explore', histDay: '', histDetail: null };
      },
      onStart() { showTalk(sc.intro, [], { closeLabel: '開始觀察' }); },
      objective(st) {
        if (st.cr.stage === 'explore') {
          return {
            title: '收集現況觀察（' + required.filter(c => st.cr.clues.indexOf(c.id) >= 0).length + '/' + required.length + '）',
            items: sc.clues.map(c => ({ text: c.hint, done: st.cr.clues.indexOf(c.id) >= 0 })), showAll: true
          };
        }
        if (st.cr.stage === 'request') return { title: '聽取需求', items: [{ text: '向' + sc.requester + '了解需求', done: false }] };
        if (st.cr.stage === 'exercise') return { title: '整理需求', items: [{ text: '完成需求釐清練習', done: false }] };
        return { title: '情境完成', items: [{ text: '可以找' + sc.requester + '重看結算，或從暫停選單回到標題', done: true }], showAll: true };
      },
      hudExtra(st) {
        const got = sc.clues.filter(c => st.cr.clues.indexOf(c.id) >= 0);
        return '<h3>觀察筆記</h3>' + (got.length ? '<ul class="notes-list">' + got.map(c => '<li>' + esc(c.text) + '</li>').join('') + '</ul>' : '<p class="hint">尚未記下觀察。</p>');
      },
      npcAttention(st, npcId) {
        if (npcId === sc.requesterNpc) return st.cr.stage === 'request';
        if (st.cr.stage !== 'explore') return false;
        const map = { q1: 'meeting', q2: 'delivery', q3: 'walkin', guard: 'guard' };
        if (npcId === 'rc') return id !== 'CR-02' && st.cr.clues.indexOf(id === 'CR-01' ? 'receptionist' : 'rc') < 0;
        return !!map[npcId] && st.cr.clues.indexOf(map[npcId]) < 0;
      },
      onTalk(st, npcId) {
        if (npcId === sc.requesterNpc) return talkRequester(st);
        const h = sc.talk[npcId];
        if (h) return h(st, api);
        showTalk([{ who: (st.npcs[npcId] || {}).name || '', text: '……' }]);
      },
      onPhone(st, ext) { return sc.phone ? sc.phone(st, ext, api) : null; },
      onObject(st, obj) { if (sc.onObject) sc.onObject(st, obj, api); },
      computerTabs() { return sc.tabs; },
      computerOptions() { return sc.computerOptions; },
      onSystem(st, evt) { return (sc.onSystem && sc.onSystem(st, evt, api)) || {}; },
      renderExtraTab(st, tab, panel) { if (sc.renderExtraTab) sc.renderExtraTab(st, tab, panel, api); }
    };
  }

  return { ORDER, menuHtml, makeController, editionLabel: '期末示範版（含現況回顧）', has: id => !!CR_SCENARIOS[id] };
})();
/* @@FINAL_END */

/* ---------- 6b. sound (Web Audio, synthesized in code, no audio files) ---------- */

const Sound = (function () {
  let ctx = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true, timer = null, nextTime = 0, stepIdx = 0;
  const STEP = 60 / 92 / 2; // eighth note at 92 BPM
  // C major pentatonic loop, 8 bars of eighth notes (0 = rest), one bass note per bar
  const MELODY = [
    72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 69, 0, 72, 0, 0, 0,
    74, 0, 76, 0, 79, 0, 81, 79, 76, 0, 74, 0, 72, 0, 0, 0,
    69, 0, 72, 0, 74, 0, 76, 74, 72, 0, 74, 0, 76, 0, 79, 0,
    81, 0, 79, 0, 76, 0, 74, 72, 74, 0, 0, 0, 72, 0, 0, 0
  ];
  const BASS = [48, 45, 50, 43, 45, 48, 41, 43];
  const SFX = {
    step: [[1100, 0, 0.03, 'square', 0.04]],
    bump: [[140, 0, 0.09, 'square', 0.2]],
    open: [[660, 0, 0.06, 'sine', 0.25], [880, 0.05, 0.08, 'sine', 0.2]],
    ok: [[660, 0, 0.1, 'triangle', 0.4], [990, 0.09, 0.16, 'triangle', 0.4]],
    error: [[220, 0, 0.14, 'sawtooth', 0.2], [165, 0.13, 0.2, 'sawtooth', 0.2]],
    notice: [[740, 0, 0.1, 'sine', 0.3], [587, 0.1, 0.14, 'sine', 0.25]],
    card: [[1800, 0, 0.025, 'square', 0.1], [1300, 0.04, 0.03, 'square', 0.08]],
    chime: [[1047, 0, 0.25, 'sine', 0.25], [1319, 0.08, 0.25, 'sine', 0.22], [1568, 0.16, 0.35, 'sine', 0.2]],
    ring: [[440, 0, 0.35, 'sine', 0.2], [480, 0, 0.35, 'sine', 0.2], [440, 0.5, 0.35, 'sine', 0.2], [480, 0.5, 0.35, 'sine', 0.2]],
    fanfare: [[523, 0, 0.14, 'triangle', 0.35], [659, 0.12, 0.14, 'triangle', 0.35], [784, 0.24, 0.14, 'triangle', 0.35], [1047, 0.36, 0.45, 'triangle', 0.35]]
  };

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // AudioContext must be created after a user gesture (browser autoplay policy).
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try {
      ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.1; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.35; sfxGain.connect(master);
      return true;
    } catch (e) { ctx = null; return false; }
  }

  function tone(dest, freq, start, dur, type, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function sfx(name) {
    if (!sfxOn || !SFX[name] || !ensure()) return;
    const t = ctx.currentTime + 0.01;
    SFX[name].forEach(([f, d, dur, type, vol]) => tone(sfxGain, f, t + d, dur, type, vol));
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.4) {
      const i = stepIdx % MELODY.length;
      if (MELODY[i]) tone(musicGain, midi(MELODY[i]), nextTime, STEP * 1.6, 'triangle', 0.5);
      if (i % 8 === 0) tone(musicGain, midi(BASS[i / 8]), nextTime, STEP * 7, 'sine', 0.6);
      nextTime += STEP;
      stepIdx++;
    }
  }
  function startMusic() {
    if (!musicOn || timer || !ensure()) return;
    nextTime = ctx.currentTime + 0.1;
    stepIdx = 0;
    timer = setInterval(schedule, 150);
    schedule();
  }
  function stopMusic() { if (timer) { clearInterval(timer); timer = null; } }

  return {
    sfx, startMusic, stopMusic,
    setMusic(on) { musicOn = on; if (!on) stopMusic(); },
    setSfx(on) { sfxOn = on; },
    isMusicOn: () => musicOn,
    isSfxOn: () => sfxOn
  };
})();

/* ---------- 7. UI ---------- */

const ui = {
  modalOpen: false, lastFocus: null, onClose: null, idleQueue: [], msgs: [], toastTimer: null, lastMoveAt: 0,
  compTab: 'lookup', compMsg: null, warn: null, selectedVisitorId: null, lookupPhone: '', lookupResults: null,
  draft: null, visitorDraft: null, detailVisitId: null, pendingCheckout: null, pendingNote: '', phoneLog: [], quickKey: ''
};
let ctrl = null;

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function emptyDraft() { return { emp: '', purpose: '', comp: '0', pass: '', plate: '', note: '' }; }
function emptyVisitorDraft() { return { name: '', company: '', phone: '', idNo: '' }; }

function resetUiState() {
  Object.assign(ui, {
    idleQueue: [], msgs: [], compTab: null, compMsg: null, warn: null, selectedVisitorId: null,
    lookupPhone: '', lookupResults: null, draft: emptyDraft(), visitorDraft: emptyVisitorDraft(),
    detailVisitId: null, pendingCheckout: null, pendingNote: '', phoneLog: [], quickKey: ''
  });
}

function emit(type, payload) {
  if (!ctrl || !ctrl.onSystem) return {};
  return ctrl.onSystem(gameState, Object.assign({ type }, payload || {})) || {};
}

/* modal */
function openModal(title, build, opts) {
  opts = opts || {};
  const dlg = $('#modal');
  if (!dlg.open) ui.lastFocus = document.activeElement;
  $('#modal-title').textContent = title;
  dlg.className = opts.size || '';
  const body = $('#modal-body');
  body.innerHTML = '';
  build(body);
  ui.onClose = opts.onClose || null;
  if (!dlg.open) { dlg.showModal(); Sound.sfx(opts.sound || 'open'); }
  ui.modalOpen = true;
  const target = body.querySelector('[data-autofocus]') ||
    body.querySelector('input:not([disabled]), select:not([disabled]), textarea, button:not([disabled])');
  if (target) target.focus();
}

function closeModal(skipFlush) {
  const dlg = $('#modal');
  if (!ui.modalOpen && !dlg.open) return;
  ui.modalOpen = false;
  if (dlg.open) dlg.close();
  const cb = ui.onClose;
  ui.onClose = null;
  const lf = ui.lastFocus;
  if (lf && document.contains(lf) && !dlg.contains(lf) && lf.offsetParent !== null) lf.focus();
  else if (!$('#game-screen').hidden) $('#map-wrap').focus();
  if (cb) cb();
  afterAction();
  if (!skipFlush) flushIdle();
}

function whenIdle(fn) { if (ui.modalOpen) ui.idleQueue.push(fn); else fn(); }
function flushIdle() { while (!ui.modalOpen && ui.idleQueue.length) ui.idleQueue.shift()(); }

function afterAction() {
  if (!gameState || !ctrl) return;
  if (ctrl.afterAction) ctrl.afterAction(gameState);
  render();
}

/* talk */
function lineHtml(l) {
  if (l.kind === 'idcard') {
    return '<div class="idcard"><b>身分證件（虛構）</b><span>姓名：' + esc(l.name) + '</span><span>身分證字號：' + esc(l.id_no) + '</span></div>';
  }
  if (l.kind === 'memo') return '<p class="memo">訪客資訊備忘：' + esc(l.text) + '</p>';
  if (l.kind === 'coach') return '<p class="coach">教學提示：' + esc(l.text) + '</p>';
  return '<p class="line' + (l.who === '旁白' ? ' narr' : '') + '">' + (l.who && l.who !== '旁白' ? '<b>' + esc(l.who) + '</b>' : '') + esc(l.text) + '</p>';
}

function showTalk(lines, choices, opts) {
  opts = opts || {};
  const list = (choices || []).slice();
  list.push({ label: opts.closeLabel || (list.length ? '先不要' : '結束對話'), run: null, secondary: list.length > 0 });
  openModal(opts.title || '對話', body => {
    body.innerHTML = '<div class="talk">' + lines.map(lineHtml).join('') + '</div><div class="choices">' +
      list.map((c, i) => '<button type="button" class="' + (c.secondary ? 'secondary' : '') + '" data-i="' + i + '">' + esc(c.label) + '</button>').join('') + '</div>';
    $all('.choices button', body).forEach(b => b.addEventListener('click', () => {
      const c = list[Number(b.dataset.i)];
      closeModal(true);
      if (c.run) c.run();
      afterAction();
      flushIdle();
    }));
  });
}
function coachTalk(text) { showTalk([{ kind: 'coach', text }]); }

/* messages */
const LOG_KIND = { system: '系統', coach: '提示', scene: '場景', note: '筆記' };
function log(text, kind) {
  kind = kind || 'scene';
  ui.msgs.push({ t: gameState ? fmtHM(gameState.clock) : '', text, kind });
  if (ui.msgs.length > 8) ui.msgs.shift();
  if (kind === 'note') Sound.sfx('chime');
  else if (kind === 'coach') Sound.sfx('notice');
  renderLog();
  const toast = $('#toast');
  if (toast) {
    toast.textContent = '［' + LOG_KIND[kind] + '］' + text;
    toast.className = 'show k-' + kind;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { toast.className = ''; }, 4200);
  }
}
function renderLog() {
  const el = $('#hud-log');
  if (!el) return;
  el.innerHTML = ui.msgs.slice().reverse().map(m => '<li class="k-' + m.kind + '"><span>' + m.t + '［' + LOG_KIND[m.kind] + '］</span>' + esc(m.text) + '</li>').join('');
}

/* title and mode start */
function showTitle() {
  RUN_SEQ++;
  Sound.stopMusic();
  if (ui.modalOpen) closeModal(true);
  gameState = null;
  ctrl = null;
  ui.idleQueue = [];
  $('#game-screen').hidden = true;
  $('#title-screen').hidden = false;
  renderTitle();
  const first = $('#title-screen button');
  if (first) first.focus();
}

function renderTitle() {
  const isFinal = EDITION === 'final' && !!FinalDemo;
  $('#edition-tag').textContent = isFinal ? FinalDemo.editionLabel : '期中版';
  $('#menu-midterm').innerHTML =
    '<h2>期中：現況理解（As-Is）</h2><p class="hint">扮演接待員，體驗原有系統的功能與例外。兩關合計約 10–15 分鐘。</p><div class="cards">' +
    '<button type="button" class="card" data-start="level1"><b>第一關　早班接待</b><span>正常流程：回訪者與新訪客的報到、發證與離廠。</span></button>' +
    '<button type="button" class="card" data-start="level2"><b>第二關　昨天走了，今天還在廠</b><span>現有系統的例外：昨天沒登記離廠的訪客，今天又來了。</span></button></div>';
  const fin = $('#menu-final');
  if (isFinal) { fin.hidden = false; fin.innerHTML = FinalDemo.menuHtml(); } else { fin.hidden = true; fin.innerHTML = ''; }
  $all('[data-start]').forEach(b => b.addEventListener('click', () => startMode(b.dataset.start)));
}

function startMode(mode) {
  if (mode === 'level1') ctrl = makeLevel1();
  else if (mode === 'level2') ctrl = makeLevel2();
  else if (FinalDemo && FinalDemo.has(mode)) ctrl = FinalDemo.makeController(mode);
  else return;
  if (ui.modalOpen) closeModal(true);
  gameState = newState(mode);
  resetUiState();
  ctrl.setup(gameState);
  $('#title-screen').hidden = true;
  $('#game-screen').hidden = false;
  $('#mode-title').textContent = ctrl.title;
  buildMap();
  $('#ents').innerHTML = '';
  render();
  renderLog();
  $('#map-wrap').focus();
  Sound.startMusic();
  if (ctrl.onStart) ctrl.onStart(gameState);
}

/* map and entities */
function tileClass(ch, x, y) {
  switch (ch) {
    case '#': return 'wall';
    case '.': return (x <= 5 && y <= 5) ? 'floor-staff' : 'floor-lobby';
    case 'D': return 'door';
    case 'K': return 'counter';
    case 'C': return 'obj t-computer';
    case 'T': return 'obj t-phone';
    case 'R': return 'obj t-rack';
    case 'S': return 'seat';
    case 'G': return 'gate';
    case 'F': return 'entrance';
  }
  return 'floor-lobby';
}
function tileLabel(ch, x, y) {
  if (ch === 'C') return '電腦';
  if (ch === 'T') return '電話';
  if (ch === 'R') return '證架';
  if (ch === 'K' && y === 3) return '櫃台';
  if (ch === 'G' && x === 9) return '大門';
  if (ch === 'F' && y === 2) return '廠內入口';
  if (ch === 'S' && x === 13 && y === 1) return '等候區';
  if (ch === 'D') return '門';
  return '';
}
function buildMap() {
  const map = $('#map');
  map.innerHTML = '';
  map.style.gridTemplateColumns = 'repeat(' + MAP_W + ', ' + TILE + 'px)';
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const ch = tileAt(x, y);
      const d = document.createElement('div');
      d.className = 'tile ' + tileClass(ch, x, y);
      const label = tileLabel(ch, x, y);
      if (label) d.dataset.label = label;
      map.appendChild(d);
    }
  }
}

function npcAt(x, y) {
  if (!gameState) return null;
  return Object.values(gameState.npcs).find(n => n.visible && n.x === x && n.y === y) || null;
}
function showNpc(id, x, y) {
  const n = gameState && gameState.npcs[id];
  if (!n) return;
  n.x = x; n.y = y; n.visible = true;
  renderEntities();
}
function hideNpc(id) {
  const n = gameState && gameState.npcs[id];
  if (n) { n.visible = false; renderEntities(); }
}

function walkNpc(id, waypoints, done) {
  const st = gameState;
  const npc = st.npcs[id];
  const steps = [];
  let cx = npc.x, cy = npc.y;
  waypoints.forEach(([tx, ty]) => {
    while (cx !== tx) { cx += Math.sign(tx - cx); steps.push([cx, cy]); }
    while (cy !== ty) { cy += Math.sign(ty - cy); steps.push([cx, cy]); }
  });
  let i = 0, waits = 0;
  const run = st.runId;
  function tick() {
    if (!gameState || gameState.runId !== run) return;
    if (i >= steps.length) { npc.walking = false; renderEntities(); if (done) done(); return; }
    const [nx, ny] = steps[i];
    const p = gameState.player;
    if (p.x === nx && p.y === ny && waits < 8) { waits++; setTimeout(tick, 250); return; }
    npc.x = nx; npc.y = ny; i++; waits = 0;
    renderEntities();
    setTimeout(tick, 130);
  }
  npc.walking = true;
  setTimeout(tick, 130);
}

function renderEntities() {
  const st = gameState;
  const layer = $('#ents');
  if (!st || !layer) return;
  const list = Object.values(st.npcs).filter(n => n.visible).map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y, color: n.color, kind: 'npc' }));
  list.push({ id: '__player', name: ctrl.isCR ? '你（分析師）' : '你（接待員）', x: st.player.x, y: st.player.y, color: '#2563a8', kind: 'player' });
  const seen = new Set();
  list.forEach(e => {
    let el = layer.querySelector('[data-id="' + e.id + '"]');
    const tf = 'translate(' + (e.x * TILE) + 'px, ' + (e.y * TILE) + 'px)';
    if (!el) {
      el = document.createElement('div');
      el.dataset.id = e.id;
      el.innerHTML = '<span class="head"></span><span class="body"></span><span class="tag"></span><span class="mark" aria-hidden="true"></span>';
      el.style.transform = tf;
      layer.appendChild(el);
    }
    el.className = 'ent ' + (e.kind === 'player' ? 'player dir-' + st.player.dir : 'npc');
    el.style.setProperty('--c', e.color);
    el.style.transform = tf;
    el.querySelector('.tag').textContent = e.name;
    const att = e.kind === 'npc' && ctrl.npcAttention && ctrl.npcAttention(st, e.id);
    el.querySelector('.mark').textContent = att ? '！' : '';
    seen.add(e.id);
  });
  $all('.ent', layer).forEach(el => { if (!seen.has(el.dataset.id)) el.remove(); });
}

/* HUD */
function render() {
  if (!gameState || !ctrl) return;
  renderEntities();
  renderHud();
  $('#clock').textContent = '模擬時間 ' + fmtDT(gameState.clock);
}

function renderHud() {
  const st = gameState;
  $('#hud-role').textContent = '角色：' + ctrl.role;
  const obj = ctrl.objective(st);
  let items = obj.items;
  if (!obj.showAll) {
    const firstOpen = items.findIndex(it => !it.done);
    items = firstOpen < 0 ? items : items.slice(0, firstOpen + 1);
  }
  $('#hud-task').innerHTML = '<h3>' + esc(obj.title) + '</h3><ul class="checklist">' +
    items.map(it => '<li class="' + (it.done ? 'done' : '') + '"><span aria-hidden="true">' + (it.done ? '☑' : '☐') + '</span> ' +
      esc(it.text) + '<span class="sr">' + (it.done ? '（已完成）' : '（未完成）') + '</span></li>').join('') + '</ul>';
  const t = interactTarget();
  $('#hud-near').textContent = t ? '面前：' + t.label + '（按 E 互動）' : '附近沒有可以互動的對象';
  const stats = $('#hud-stats');
  if (ctrl.showSummary) {
    const s = summarizeOnSite(st.db);
    stats.hidden = false;
    stats.innerHTML = '<h3>在廠統計（依系統在廠名單）</h3><p>訪客 ' + s.visitors + ' 人、隨行人員 ' + s.companions + ' 人、合計 ' + s.total + ' 人</p>' +
      '<h3>手上的訪客證</h3><p>' + (heldCards(st).join('、') || '（無）') + '</p>';
  } else { stats.hidden = true; stats.innerHTML = ''; }
  const extra = $('#hud-extra');
  if (ctrl.hudExtra) { extra.hidden = false; extra.innerHTML = ctrl.hudExtra(st); } else { extra.hidden = true; extra.innerHTML = ''; }
  renderQuick();
}

const QUICK_SPOTS = {
  computer: { x: 1, y: 2, dir: 'up', label: '電腦' },
  phone: { x: 3, y: 2, dir: 'up', label: '電話' },
  rack: { x: 5, y: 2, dir: 'up', label: '證架' },
  counter: { x: 5, y: 3, dir: 'right', label: '櫃台' }
};
function renderQuick() {
  const st = gameState;
  const keys = Object.keys(QUICK_SPOTS).filter(k => st.visited[k] && !(k === 'counter' && ctrl.isCR));
  const key = keys.join(',');
  if (key === ui.quickKey) return;
  ui.quickKey = key;
  $('#hud-quick').innerHTML = '<h3>快捷移動</h3>' + (keys.length
    ? keys.map(k => '<button type="button" class="small" data-quick="' + k + '">' + QUICK_SPOTS[k].label + '</button>').join(' ')
    : '<p class="hint">用過電腦、電話、證架或櫃台後，可以在這裡直接移過去。</p>');
  $all('[data-quick]').forEach(b => b.addEventListener('click', () => quickMove(b.dataset.quick)));
}
function quickMove(k) {
  const s = QUICK_SPOTS[k];
  if (npcAt(s.x, s.y)) { log('那個位置現在有人。', 'scene'); return; }
  gameState.player = { x: s.x, y: s.y, dir: s.dir };
  render();
  $('#map-wrap').focus();
}

/* movement and interaction */
function isWalkable(x, y) {
  if (BLOCKING.indexOf(tileAt(x, y)) >= 0) return false;
  return !npcAt(x, y);
}
function tryMove(dir) {
  const p = gameState.player;
  p.dir = dir;
  const [dx, dy] = DIRS[dir];
  if (isWalkable(p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; Sound.sfx('step'); } else Sound.sfx('bump');
  render();
}
function targetAt(x, y) {
  const p = gameState.player;
  const npc = npcAt(x, y);
  if (npc) return { kind: 'npc', id: npc.id, label: npc.name };
  const ch = tileAt(x, y);
  if (OBJECTS[ch]) return { kind: 'obj', id: OBJECTS[ch], label: OBJECT_LABELS[OBJECTS[ch]] };
  if (ch === 'K') {
    const across = npcAt(2 * x - p.x, 2 * y - p.y);
    if (across) return { kind: 'npc', id: across.id, label: '櫃台對面的' + across.name, counter: true };
  }
  return null;
}
function interactTarget() {
  if (!gameState) return null;
  const p = gameState.player;
  const order = [p.dir].concat(Object.keys(DIRS).filter(d => d !== p.dir));
  for (const d of order) {
    const t = targetAt(p.x + DIRS[d][0], p.y + DIRS[d][1]);
    if (t) return t;
  }
  return null;
}
function doInteract() {
  const t = interactTarget();
  if (!t) { log('附近沒有可以互動的對象。', 'scene'); return; }
  const st = gameState;
  if (t.kind === 'npc') {
    if (t.counter) st.visited.counter = true;
    ctrl.onTalk(st, t.id);
    return;
  }
  st.visited[t.id] = true;
  if (ctrl.onObject) ctrl.onObject(st, t.id);
  if (t.id === 'computer') openComputer();
  else if (t.id === 'phone') openPhone();
  else if (t.id === 'rack') openRack();
}

function onKey(e) {
  if (!gameState || $('#game-screen').hidden || ui.modalOpen) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const move = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' }[e.key];
  if (move) {
    e.preventDefault();
    const now = performance.now();
    if (e.repeat && now - ui.lastMoveAt < 110) return;
    ui.lastMoveAt = now;
    tryMove(move);
    return;
  }
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); if (!e.repeat) doInteract(); return; }
  if (e.key === 'Escape') { e.preventDefault(); openPause(); }
}

/* computer */
function compOptions() { return (ctrl.computerOptions && ctrl.computerOptions(gameState)) || {}; }

function openComputer() {
  const tabs = ctrl.computerTabs(gameState);
  if (!tabs.some(t => t.id === ui.compTab)) ui.compTab = tabs[0].id;
  ui.compMsg = null; ui.warn = null; ui.pendingCheckout = null;
  openModal('櫃台電腦', renderComputerBody, { size: 'wide' });
  emit('openTab', { tab: ui.compTab });
  render();
}

function rerenderComputer(focusId) {
  if (!ui.modalOpen) return;
  const active = focusId || (document.activeElement && document.activeElement.id);
  renderComputerBody($('#modal-body'));
  const el = active && document.getElementById(active);
  if (el) el.focus();
}

function setMsg(kind, lines) {
  ui.compMsg = { kind, lines: [].concat(lines) };
  if (kind === 'ok') Sound.sfx('ok');
  else if (kind === 'err') Sound.sfx('error');
}
function coachMsg(text) { ui.compMsg = { kind: 'coach', lines: [], coach: text }; Sound.sfx('notice'); }
function addCoach(res) { if (res && res.coach) Sound.sfx('notice'); if (res && res.coach) ui.compMsg = { kind: ui.compMsg ? ui.compMsg.kind : 'coach', lines: (ui.compMsg ? ui.compMsg.lines : []), coach: res.coach }; }

function renderComputerBody(body) {
  const st = gameState;
  const tabs = ctrl.computerTabs(st);
  const opt = compOptions();
  const u = st.db.users[0];
  body.innerHTML =
    '<div class="sys-bar"><b>訪客進出登記系統（遊戲模擬）</b><span>登入：' + esc(u.name) + '（' + esc(u.role) + '）</span><span>系統時間：' + fmtDT(st.clock) + '</span></div>' +
    (opt.banner ? '<p class="banner">' + esc(opt.banner) + '</p>' : '') +
    '<div class="tabs" role="tablist">' + tabs.map(t => '<button type="button" role="tab" id="tab-' + t.id + '" aria-selected="' + (t.id === ui.compTab) + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>').join('') + '</div>' +
    '<div id="comp-msg" aria-live="polite"></div><div class="tabpanel" id="tabpanel" role="tabpanel"></div>';
  $all('[data-tab]', body).forEach(b => b.addEventListener('click', () => {
    ui.compTab = b.dataset.tab; ui.compMsg = null; ui.warn = null; ui.pendingCheckout = null;
    emit('openTab', { tab: ui.compTab });
    rerenderComputer('tab-' + ui.compTab);
    render();
  }));
  const msg = $('#comp-msg', body);
  if (ui.compMsg) {
    const m = ui.compMsg;
    const head = { ok: '系統訊息', err: '系統訊息', coach: '教學提示（不是系統訊息）', info: '系統訊息' }[m.kind];
    msg.innerHTML = (m.lines.length ? '<div class="msg k-' + m.kind + '"><b>' + head + '</b><ul>' + m.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul></div>' : '') +
      (m.coach ? '<div class="msg k-coach"><b>教學提示（不是系統訊息）</b><p>' + esc(m.coach) + '</p></div>' : '');
  }
  if (ui.warn) {
    const w = ui.warn;
    msg.insertAdjacentHTML('beforeend', '<div class="msg k-warn"><b>教學提示（不是系統訊息）：和現場資訊不一致</b><ul>' +
      w.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul><div class="choices"><button type="button" id="warn-back">回去修改</button><button type="button" class="secondary" id="warn-go">' + esc(w.goLabel) + '</button></div></div>');
    $('#warn-back', body).addEventListener('click', () => { ui.warn = null; rerenderComputer(); });
    $('#warn-go', body).addEventListener('click', () => { const go = w.go; ui.warn = null; go(); });
  }
  const panel = $('#tabpanel', body);
  if (ui.compTab === 'lookup') renderLookup(panel);
  else if (ui.compTab === 'checkin') renderCheckin(panel, opt);
  else if (ui.compTab === 'onsite') renderOnsite(panel, opt);
  else if (ui.compTab === 'employees') renderEmployees(panel);
  else if (ctrl.renderExtraTab) ctrl.renderExtraTab(st, ui.compTab, panel);
}

function renderLookup(panel) {
  const st = gameState;
  const sel = st.db.visitors.find(v => v.id === ui.selectedVisitorId);
  const card = ctrl.counterIdCard ? ctrl.counterIdCard(st) : null;
  const d = ui.visitorDraft;
  const res = ui.lookupResults;
  panel.innerHTML =
    '<form id="f-lookup" class="row"><label>手機號碼 <input id="in-phone" inputmode="numeric" autocomplete="off" value="' + esc(ui.lookupPhone) + '"></label><button type="submit">查詢</button></form>' +
    (res === null ? '' : res.length === 0 ? '<p class="hint">查無此手機號碼的訪客主檔。</p>' :
      '<table class="data"><thead><tr><th>主檔#</th><th>姓名</th><th>公司</th><th>手機</th><th>身分證字號</th><th></th></tr></thead><tbody>' +
      res.map(v => '<tr><td>' + v.id + '</td><td>' + esc(v.name) + '</td><td>' + esc(v.company) + '</td><td>' + esc(v.phone) + '</td><td>' + esc(v.id_no) +
        '</td><td><button type="button" class="small" data-select="' + v.id + '">選用</button></td></tr>').join('') + '</tbody></table>') +
    '<p class="selected">目前選用的主檔：' + (sel ? '#' + sel.id + ' ' + esc(sel.name) + '（' + esc(sel.company) + '）' : '（尚未選用）') + '</p>' +
    '<details' + (res && res.length === 0 ? ' open' : '') + '><summary>新增訪客主檔</summary><form id="f-visitor" class="grid-form">' +
    '<label>姓名 <input id="nv-name" value="' + esc(d.name) + '"></label>' +
    '<label>公司 <input id="nv-company" value="' + esc(d.company) + '"></label>' +
    '<label>手機 <input id="nv-phone" inputmode="numeric" value="' + esc(d.phone) + '"></label>' +
    '<label>身分證字號 <input id="nv-idno" value="' + esc(d.idNo) + '"></label>' +
    '<div class="row">' + (card ? '<button type="button" class="secondary" id="nv-fill">依櫃台訪客的證件與口述代填</button>' : '') +
    '<button type="submit">建立主檔</button></div></form></details>';
  const sync = () => {
    d.name = $('#nv-name').value; d.company = $('#nv-company').value; d.phone = $('#nv-phone').value; d.idNo = $('#nv-idno').value;
  };
  $all('#f-visitor input', panel).forEach(i => i.addEventListener('input', sync));
  $('#in-phone', panel).addEventListener('input', e => { ui.lookupPhone = e.target.value; });
  $('#f-lookup', panel).addEventListener('submit', e => {
    e.preventDefault();
    const phone = $('#in-phone').value.trim();
    ui.lookupPhone = phone;
    ui.lookupResults = findVisitorsByPhone(st.db, phone);
    advance(st, 1);
    setMsg('info', phone ? '以手機 ' + phone + ' 查到 ' + ui.lookupResults.length + ' 筆主檔' : '請輸入手機號碼');
    emit('lookup', { phone, results: ui.lookupResults });
    rerenderComputer('in-phone');
    render();
  });
  $all('[data-select]', panel).forEach(b => b.addEventListener('click', () => {
    const v = st.db.visitors.find(x => x.id === Number(b.dataset.select));
    const r = emit('selectVisitor', { visitor: v });
    if (r.block) { coachMsg(r.block); }
    else { ui.selectedVisitorId = v.id; setMsg('ok', '已選用主檔 #' + v.id + ' ' + v.name + '，可到「來訪報到」繼續。'); }
    rerenderComputer();
    render();
  }));
  const fill = $('#nv-fill', panel);
  if (fill) fill.addEventListener('click', () => { Object.assign(d, card); rerenderComputer('nv-name'); });
  $('#f-visitor', panel).addEventListener('submit', e => {
    e.preventDefault();
    sync();
    const input = Object.assign({}, d);
    const doCreate = () => {
      const res2 = createVisitor(st.db, input);
      if (!res2.ok) { setMsg('err', ['建立失敗'].concat(res2.errors)); rerenderComputer(); return; }
      st.db = res2.db;
      advance(st, 2);
      ui.visitorDraft = emptyVisitorDraft();
      ui.lookupPhone = res2.visitor.phone;
      ui.lookupResults = findVisitorsByPhone(st.db, res2.visitor.phone);
      setMsg('ok', '已建立訪客主檔 #' + res2.visitor.id + ' ' + res2.visitor.name + '。請在查詢結果中選用。');
      emit('createVisitor', { visitor: res2.visitor });
      rerenderComputer();
      render();
    };
    if (validateVisitorInput(input).errors.length) { doCreate(); return; }
    const r = emit('beforeCreateVisitor', { input });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    if (r.warn && r.warn.length) { Sound.sfx('notice'); ui.warn = { lines: r.warn, goLabel: '仍要建立', go: doCreate }; rerenderComputer(); return; }
    doCreate();
  });
}

function renderCheckin(panel, opt) {
  const st = gameState;
  const d = ui.draft;
  const sel = st.db.visitors.find(v => v.id === ui.selectedVisitorId);
  const ro = !!opt.checkinReadOnly;
  const emps = listActiveEmployees(st.db);
  const passes = listAvailablePasses(st.db);
  panel.innerHTML =
    (ro ? '' : '<p class="selected">訪客：' + (sel ? '#' + sel.id + ' ' + esc(sel.name) + '（' + esc(sel.company) + '）' : '（尚未選用主檔，請先到「訪客查詢／建檔」）') + '</p>') +
    '<form id="f-checkin" class="grid-form">' +
    '<label>受訪員工 <select id="ci-emp"><option value="">請選擇</option>' + emps.map(e => '<option value="' + e.id + '"' + (String(e.id) === d.emp ? ' selected' : '') + '>' + esc(e.name) + '（分機 ' + esc(e.ext) + '）</option>').join('') + '</select></label>' +
    '<label>事由 <select id="ci-purpose"><option value="">請選擇</option>' + PURPOSES.map(p => '<option' + (p === d.purpose ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></label>' +
    '<label>隨行人數 <input id="ci-comp" inputmode="numeric" value="' + esc(d.comp) + '"></label>' +
    '<label>訪客證 <select id="ci-pass"><option value="">請選擇</option>' + passes.map(p => '<option value="' + p.id + '"' + (String(p.id) === d.pass ? ' selected' : '') + '>' + esc(p.code) + '</option>').join('') + '</select></label>' +
    '<label>車牌 <input id="ci-plate" value="' + esc(d.plate) + '"></label>' +
    '<label class="wide">備註 <textarea id="ci-note" rows="2">' + esc(d.note) + '</textarea></label>' +
    '<div class="row"><button type="submit"' + (ro ? ' disabled' : '') + '>送出報到</button>' + (ro ? '<span class="hint">本情境只觀察，不辦理報到。</span>' : '') + '</div></form>';
  const sync = () => {
    d.emp = $('#ci-emp').value; d.purpose = $('#ci-purpose').value; d.comp = $('#ci-comp').value;
    d.pass = $('#ci-pass').value; d.plate = $('#ci-plate').value; d.note = $('#ci-note').value;
  };
  $all('#f-checkin input, #f-checkin select, #f-checkin textarea', panel).forEach(i => { i.addEventListener('input', sync); i.addEventListener('change', sync); });
  $('#f-checkin', panel).addEventListener('submit', e => {
    e.preventDefault();
    if (ro) return;
    sync();
    const input = {
      visitorId: ui.selectedVisitorId, employeeId: Number(d.emp) || null, passId: Number(d.pass) || null,
      purpose: d.purpose, companions: d.comp, plate: d.plate, note: d.note
    };
    const doCheckIn = () => {
      const res = checkIn(st.db, input, nowStr(st), st.db.users[0].id);
      if (!res.ok) {
        setMsg('err', ['報到失敗，沒有新增來訪紀錄'].concat(res.errors));
      } else {
        st.db = res.db;
        advance(st, 2);
        setMsg('ok', '報到完成：來訪 #' + res.visit.id + '，訪客證 ' + passCodeOf(st.db, res.visit.pass_id) + '，報到時間 ' + res.visit.check_in_at);
        ui.draft = emptyDraft();
        ui.selectedVisitorId = null;
      }
      addCoach(emit('checkIn', { result: res, input }));
      rerenderComputer();
      render();
    };
    const r = emit('beforeCheckIn', { input });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    if (r.warn && r.warn.length) { Sound.sfx('notice'); ui.warn = { lines: r.warn, goLabel: '仍要送出', go: doCheckIn }; rerenderComputer(); return; }
    doCheckIn();
  });
}

function visitDetailHtml(db, r) {
  return '事由：' + esc(r.purpose) + '　隨行人數：' + r.companions + '　車牌：' + esc(r.plate || '（無）') + '　備註：' + esc(r.note || '（無）') +
    '　報到登記人：' + esc(userName(db, r.check_in_by)) + (r.check_out_at ? '　離廠時間：' + esc(r.check_out_at) + '　離廠登記人：' + esc(userName(db, r.check_out_by)) : '');
}

function renderOnsite(panel, opt) {
  const st = gameState;
  const rows = listOnSite(st.db);
  const s = summarizeOnSite(st.db);
  const allow = opt.allowCheckout !== false;
  panel.innerHTML = '<p class="selected">在廠：訪客 ' + s.visitors + ' 人、隨行人員 ' + s.companions + ' 人、合計 ' + s.total + ' 人</p>' +
    (rows.length === 0 ? '<p class="hint">目前沒有在廠的來訪紀錄。</p>' :
      '<table class="data"><thead><tr><th>來訪#</th><th>訪客</th><th>公司</th><th>受訪員工</th><th>訪客證</th><th>報到時間</th><th>隨行</th><th></th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + r.id + '</td><td>' + esc(r.visitor_name) + '</td><td>' + esc(r.company) + '</td><td>' + esc(r.employee_name) + '</td><td>' + esc(r.pass_code) +
        '</td><td>' + esc(r.check_in_at) + '</td><td>' + r.companions + '</td><td class="nowrap"><button type="button" class="small secondary" id="det-' + r.id + '" data-detail="' + r.id + '">明細</button>' +
        (allow ? ' <button type="button" class="small" id="out-' + r.id + '" data-out="' + r.id + '">離廠</button>' : '') + '</td></tr>' +
        (ui.detailVisitId === r.id ? '<tr class="detail"><td colspan="8">' + visitDetailHtml(st.db, r) + '</td></tr>' : '') +
        (ui.pendingCheckout === r.id ? '<tr class="confirm"><td colspan="8"><p>確定為來訪 #' + r.id + '（' + esc(r.visitor_name) + '）登記離廠？系統將寫入離廠時間 <b>' + nowStr(st) +
          '</b>、離廠登記人 <b>' + esc(st.db.users[0].name) + '</b>。</p>' + (ui.pendingNote ? '<p class="coach">' + esc(ui.pendingNote) + '</p>' : '') +
          '<div class="choices"><button type="button" id="out-yes">確定離廠</button><button type="button" class="secondary" id="out-no">取消</button></div></td></tr>' : '')).join('') +
      '</tbody></table>');
  $all('[data-detail]', panel).forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.detail);
    ui.detailVisitId = ui.detailVisitId === id ? null : id;
    ui.compMsg = null;
    addCoach(emit('viewVisitDetail', { visitId: id }));
    rerenderComputer('det-' + id);
    render();
  }));
  $all('[data-out]', panel).forEach(b => b.addEventListener('click', () => {
    const id = Number(b.dataset.out);
    ui.compMsg = null;
    const showConfirm = () => {
      ui.pendingCheckout = id;
      ui.pendingNote = emit('checkoutConfirm', { visitId: id }).note || '';
      rerenderComputer('out-yes');
      render();
    };
    const r = emit('beforeCheckOut', { visitId: id });
    if (r.block) { coachMsg(r.block); rerenderComputer(); return; }
    if (r.intercept) {
      r.intercept(() => {
        ui.compTab = 'onsite';
        openModal('櫃台電腦', renderComputerBody, { size: 'wide' });
        showConfirm();
      });
      return;
    }
    if (r.warn && r.warn.length) { Sound.sfx('notice'); ui.warn = { lines: r.warn, goLabel: '仍要離廠', go: showConfirm }; rerenderComputer(); return; }
    showConfirm();
  }));
  const yes = $('#out-yes', panel);
  if (yes) {
    yes.addEventListener('click', () => {
      const id = ui.pendingCheckout;
      ui.pendingCheckout = null;
      const res = checkOut(st.db, id, nowStr(st), st.db.users[0].id);
      if (res.ok) { st.db = res.db; advance(st, 1); setMsg('ok', '已登記離廠：來訪 #' + id + '，離廠時間 ' + res.visit.check_out_at); }
      else setMsg('err', res.errors);
      addCoach(emit('checkOut', { result: res }));
      rerenderComputer();
      render();
    });
    $('#out-no', panel).addEventListener('click', () => {
      const id = ui.pendingCheckout;
      ui.pendingCheckout = null;
      emit('checkoutCancel', { visitId: id });
      setMsg('info', '已取消，沒有寫入任何資料。');
      rerenderComputer();
    });
  }
}

function renderEmployees(panel) {
  const emps = listActiveEmployees(gameState.db);
  panel.innerHTML = '<table class="data"><thead><tr><th>員工#</th><th>姓名</th><th>分機</th></tr></thead><tbody>' +
    emps.map(e => '<tr><td>' + e.id + '</td><td>' + esc(e.name) + '</td><td>' + esc(e.ext) + '</td></tr>').join('') +
    '</tbody></table><p class="hint">只列在職員工。</p>';
}

/* phone */
function defaultPhone(st, ext) {
  const e = st.db.employees.find(x => x.ext === ext);
  if (!e) return [{ who: '電話', text: '（嘟嘟嘟——您撥的分機號碼不存在。）' }];
  if (!e.active) return [{ who: '電話', text: '（這支分機目前沒有人使用。）' }];
  return [{ who: e.name, text: '您好，我是' + e.name + '。……喔，不是要找我？好，沒關係。' }];
}
function openPhone() {
  ui.phoneLog = [];
  openModal('電話（系統以外的人工作業）', renderPhone);
}
function renderPhone(body) {
  body.innerHTML = '<p class="hint">輸入分機號碼後撥打。電話通知不會留在系統紀錄裡。</p>' +
    '<form id="f-phone" class="row"><label>分機 <input id="in-ext" inputmode="numeric" autocomplete="off" maxlength="6"></label><button type="submit">撥打</button></form>' +
    '<div class="talk" id="phone-log" aria-live="polite">' + ui.phoneLog.map(lineHtml).join('') + '</div>';
  $('#f-phone', body).addEventListener('submit', e => {
    e.preventDefault();
    const st = gameState;
    const ext = $('#in-ext').value.trim();
    if (!/^\d+$/.test(ext)) {
      ui.phoneLog.push({ who: '電話', text: '請輸入數字分機號碼。' });
    } else {
      advance(st, 1);
      Sound.sfx('ring');
      const lines = (ctrl.onPhone && ctrl.onPhone(st, ext)) || defaultPhone(st, ext);
      ui.phoneLog.push({ who: '你', text: '撥打分機 ' + ext });
      ui.phoneLog = ui.phoneLog.concat(lines);
    }
    renderPhone(body);
    $('#in-ext').focus();
    render();
  });
}

/* visitor pass rack */
function openRack() {
  openModal('訪客證架（實體卡片）', renderRack);
}
function renderRack(body) {
  const st = gameState;
  const ro = !!ctrl.rackReadOnly;
  const codes = Object.keys(st.cards).sort();
  const held = heldCards(st);
  body.innerHTML = '<p class="hint">實體卡片放在哪裡由場景追蹤；電腦裡的「占用／可用」是另一回事。</p>' +
    '<div class="rack">' + codes.map(c => {
      const on = st.cards[c] === 'rack';
      return '<div class="slot ' + (on ? 'filled' : 'empty') + '"><b>' + c + '</b>' +
        (on ? (ro ? '<span>在證架上</span>' : '<button type="button" class="small" data-take="' + c + '">取出</button>') : '<span>（空位）</span>') + '</div>';
    }).join('') + '</div>' +
    (ro ? '' : '<h3>你手上的卡</h3>' + (held.length ? held.map(c => '<button type="button" class="small" data-put="' + c + '">把 ' + c + ' 放回證架</button>').join(' ') : '<p class="hint">（無）</p>'));
  $all('[data-take]', body).forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.take;
    st.cards[c] = 'player';
    Sound.sfx('card');
    if (ctrl.onRack) ctrl.onRack(st, 'take', c);
    log('從證架取出 ' + c + '。', 'scene');
    renderRack(body);
    render();
    const nb = $('[data-put="' + c + '"]', body);
    if (nb) nb.focus();
  }));
  $all('[data-put]', body).forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.put;
    st.cards[c] = 'rack';
    Sound.sfx('card');
    if (ctrl.onRack) ctrl.onRack(st, 'put', c);
    log('把 ' + c + ' 放回證架。', 'scene');
    renderRack(body);
    render();
    const first = $('button', body);
    if (first) first.focus();
  }));
}

/* prediction quiz: explanation after each answer, can re-answer, no score */
function openQuiz(title, intro, questions, store, doneLabel, onDone) {
  openModal(title, body => {
    body.innerHTML = '<p class="hint">' + esc(intro) + '</p><ol class="classify">' + questions.map((q, i) =>
      '<li><p>' + esc(q.q) + '</p><div class="radios" role="radiogroup" aria-label="' + esc(q.q) + '">' +
      q.options.map(o => '<label><input type="radio" name="q' + i + '" value="' + esc(o) + '"' + (store[q.id] === o ? ' checked' : '') + '> ' + esc(o) + '</label>').join('') +
      '</div><p class="fb" id="qfb' + i + '" aria-live="polite"></p></li>').join('') + '</ol>' +
      '<div class="choices"><button type="button" id="quiz-done">' + esc(doneLabel) + '</button></div>';
    const btn = $('#quiz-done', body);
    const fb = (q, i) => {
      const v = store[q.id];
      $('#qfb' + i, body).textContent = v ? (v === q.answer ? '和系統規則相同。' : '和系統規則不同，可以再想想。') + q.explain : '';
    };
    const refresh = () => { btn.disabled = questions.some(q => !store[q.id]); };
    questions.forEach((q, i) => {
      fb(q, i);
      $all('input[name="q' + i + '"]', body).forEach(r => r.addEventListener('change', () => { store[q.id] = r.value; fb(q, i); refresh(); }));
    });
    btn.addEventListener('click', () => { closeModal(true); onDone(); });
    refresh();
  }, { size: 'wide' });
}

/* settlement */
function openSettlement(title, html, buttons) {
  openModal(title, body => {
    body.innerHTML = html + '<div class="choices">' + buttons.map((b, i) => '<button type="button" class="' + (i ? 'secondary' : '') + '" data-b="' + i + '">' + esc(b.label) + '</button>').join('') + '</div>';
    $all('[data-b]', body).forEach(el => el.addEventListener('click', () => {
      const b = buttons[Number(el.dataset.b)];
      closeModal(true);
      b.run();
    }));
  }, { size: 'wide', sound: 'fanfare' });
}

/* pause and help */
const HELP_HTML = '<table class="data"><tbody>' +
  '<tr><th>WASD／方向鍵</th><td>每次移動一格，只能上下左右，遇到障礙不移動</td></tr>' +
  '<tr><th>E</th><td>和相鄰（優先面向）的角色或物件互動；站在櫃台後方面向櫃台，可以和櫃台對面的人說話</td></tr>' +
  '<tr><th>Esc</th><td>關閉對話或表單；在場景中開啟暫停選單</td></tr>' +
  '<tr><th>滑鼠、Tab、Enter</th><td>操作表單、選單、對話與問題</td></tr>' +
  '<tr><th>音樂／音效</th><td>畫面右上角的按鈕可以分別開關</td></tr>' +
  '<tr><th>快捷移動</th><td>右側面板的按鈕，可直接移到用過的電腦、電話、證架或櫃台</td></tr>' +
  '</tbody></table><p class="hint">角色頭上的「！」表示現在和他說話會有進展。所有人名、電話、公司與證件資料都是虛構的。遊戲不連網、不儲存資料，重新整理就回到標題。</p>';

function openPause() {
  openModal('暫停', body => {
    body.innerHTML = '<div class="choices col">' +
      '<button type="button" id="p-resume">繼續</button>' +
      '<button type="button" class="secondary" id="p-help">操作說明</button>' +
      '<button type="button" class="secondary" id="p-restart">重新開始本關（資料回到初始狀態）</button>' +
      '<button type="button" class="secondary" id="p-title">回到標題</button></div>';
    $('#p-resume', body).addEventListener('click', () => closeModal());
    $('#p-help', body).addEventListener('click', () => openModal('操作說明', b => { b.innerHTML = HELP_HTML + '<div class="choices"><button type="button" id="h-ok">知道了</button></div>'; $('#h-ok', b).addEventListener('click', () => closeModal()); }));
    $('#p-restart', body).addEventListener('click', () => { const m = gameState.mode; closeModal(true); startMode(m); });
    $('#p-title', body).addEventListener('click', () => { closeModal(true); showTitle(); });
  });
}

function syncSoundButtons() {
  const m = $('#btn-music'), s = $('#btn-sfx');
  m.textContent = '音樂：' + (Sound.isMusicOn() ? '開' : '關');
  m.setAttribute('aria-pressed', String(Sound.isMusicOn()));
  s.textContent = '音效：' + (Sound.isSfxOn() ? '開' : '關');
  s.setAttribute('aria-pressed', String(Sound.isSfxOn()));
}

/* init */
function initUI() {
  const dlg = $('#modal');
  dlg.addEventListener('cancel', e => { e.preventDefault(); closeModal(); });
  dlg.addEventListener('close', () => { if (ui.modalOpen && !dlg.open) closeModal(); });
  $('#modal-close').addEventListener('click', () => closeModal());
  $('#btn-pause').addEventListener('click', openPause);
  $('#btn-music').addEventListener('click', () => {
    Sound.setMusic(!Sound.isMusicOn());
    if (Sound.isMusicOn() && gameState) Sound.startMusic();
    syncSoundButtons();
    $('#map-wrap').focus();
  });
  $('#btn-sfx').addEventListener('click', () => {
    Sound.setSfx(!Sound.isSfxOn());
    syncSoundButtons();
    $('#map-wrap').focus();
  });
  syncSoundButtons();
  $('#btn-help-title').addEventListener('click', () => openModal('操作說明', b => { b.innerHTML = HELP_HTML + '<div class="choices"><button type="button" id="h-ok">知道了</button></div>'; $('#h-ok', b).addEventListener('click', () => closeModal()); }));
  document.addEventListener('keydown', onKey);
  showTitle();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initUI);
