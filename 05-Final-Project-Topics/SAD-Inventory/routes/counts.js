// FR-CNT: count list, create, enter counted quantities, close.
// Stock moves are not blocked while a count is open (FR-STK-03).

const { getDb, transaction, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { signed, COUNT_SELECT, getCount, countLines, openCountOf, nextCountNo, addMove } = require('../lib/rules');
const { ROLE_MANAGER, COUNT_TYPES, COUNT_STATUSES, text, fail, toId, toIntIn } = require('../lib/validate');

// ---------- UI-02 count list (FR-CNT-01) ----------

function listCounts({ query }) {
  const status = text(query.get('status'));
  const where = COUNT_STATUSES.includes(status) ? 'WHERE c.status = ?' : '';
  const args = where ? [status] : [];
  const rows = getDb().prepare(`${COUNT_SELECT} ${where} ORDER BY c.created_at DESC, c.id DESC`).all(...args);
  return { rows };
}

// ---------- UI-03 create (FR-CNT-02, 03) ----------

// Choices for the create form: active accounts, and active items with the open count that holds each one
function newForm() {
  const db = getDb();
  const items = db.prepare(`
    SELECT id, item_no, name, spec, location, book_qty, unit FROM items WHERE is_active = 1 ORDER BY item_no
  `).all().map((i) => {
    const open = openCountOf(db, i.id);
    return { ...i, open_count_no: open ? open.count_no : null };
  });
  return {
    users: db.prepare('SELECT id, emp_no, name, title FROM users WHERE is_active = 1 ORDER BY emp_no').all(),
    items,
  };
}

// Spec 7.1
function createCount({ body, user }) {
  const created = transaction((db) => {
    // Steps 1-2: name
    const name = text(body.name);
    if (!name) fail('請輸入盤點單名稱');
    if (name.length > 30) fail('盤點單名稱不可超過 30 字');
    // Step 3: type
    const type = text(body.count_type);
    if (!COUNT_TYPES.includes(type)) fail('請選擇盤點類別');
    // Steps 4-5: counter
    if (text(body.counter_id) === '') fail('請選擇盤點人員');
    const counterId = toId(body.counter_id);
    const counter = counterId && db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(counterId);
    if (!counter || !counter.is_active) fail('盤點人員必須是啟用中的帳號');

    let items;
    if (type === '全盤') {
      items = db.prepare('SELECT id, item_no FROM items WHERE is_active = 1 ORDER BY item_no').all();
    } else {
      // Step 6: at least one item
      const ids = [...new Set((Array.isArray(body.item_ids) ? body.item_ids : []).map(toId).filter(Boolean))];
      if (ids.length === 0) fail('抽盤請至少選擇一個料號');
      // Step 7: every item exists and is active
      items = ids.map((id) => db.prepare('SELECT id, item_no, is_active FROM items WHERE id = ?').get(id));
      if (items.some((i) => !i)) fail('找不到這個料號');
      items.sort((a, b) => (a.item_no < b.item_no ? -1 : 1));
      const off = items.find((i) => !i.is_active);
      if (off) fail(`料號 ${off.item_no} 已停用，不能加入盤點`);
    }
    // Step 8: no item may already be in another open count
    for (const i of items) {
      const open = openCountOf(db, i.id);
      if (open) fail(`料號 ${i.item_no} 已在盤點單 ${open.count_no} 盤點中`);
    }

    const countNo = nextCountNo(db);
    const result = db.prepare(`
      INSERT INTO counts (count_no, name, count_type, counter_id, status, created_by, created_at)
      VALUES (?, ?, ?, ?, '盤點中', ?, ?)
    `).run(countNo, name, type, counter.id, user.id, now());
    const countId = Number(result.lastInsertRowid);
    const insertLine = db.prepare('INSERT INTO count_lines (count_id, item_id) VALUES (?, ?)');
    for (const i of items) insertLine.run(countId, i.id);
    return { id: countId, countNo, n: items.length };
  });
  return { id: created.id, message: `已建立盤點單 ${created.countNo}，共 ${created.n} 項` };
}

// ---------- UI-04 detail (FR-CNT-05) ----------

function countDetail({ params, user }) {
  const db = getDb();
  const count = getCount(db, toId(params.id));
  const lines = countLines(db, count);
  const open = count.status === '盤點中';
  return {
    count: {
      ...count,
      gain_count: lines.filter((l) => l.diff > 0).length,
      loss_count: lines.filter((l) => l.diff < 0).length,
    },
    lines,
    can_enter: open && (user.role === ROLE_MANAGER || user.id === count.counter_id),
    can_close: open && user.role === ROLE_MANAGER,
  };
}

// ---------- UI-04 enter a counted quantity (FR-CNT-04) ----------

// Spec 7.2. Entering again overwrites the earlier quantity, counter and time.
function enterLine({ params, body, user }) {
  return transaction((db) => {
    // Step 1
    const lineId = toId(params.id);
    const line = lineId && db.prepare(`
      SELECT l.id, l.count_id, c.status, c.counter_id, i.item_no, i.book_qty
        FROM count_lines l JOIN counts c ON c.id = l.count_id JOIN items i ON i.id = l.item_id
       WHERE l.id = ?
    `).get(lineId);
    if (!line) throw new UserError('找不到這個盤點項目', 404);
    // Step 2
    if (line.status !== '盤點中') fail('這張盤點單已結案，不能再輸入');
    // Step 3
    if (user.role !== ROLE_MANAGER && user.id !== line.counter_id) fail('只有被指派的盤點人員或主管可以輸入');
    // Step 4
    const qty = toIntIn(body.counted_qty, 0, 99999);
    if (qty === null) fail('實盤數量須為 0 到 99999 的整數');
    // Step 5
    const remark = text(body.remark);
    if (remark.length > 100) fail('差異說明不可超過 100 字');

    db.prepare('UPDATE count_lines SET counted_qty = ?, remark = ?, counted_by = ?, counted_at = ? WHERE id = ?')
      .run(qty, remark || null, user.id, now(), line.id);
    return { message: `已儲存 ${line.item_no}：實盤 ${qty}，盤差 ${signed(qty - line.book_qty)}` };
  });
}

// ---------- UI-04 close (FR-CNT-06) ----------

// Spec 7.3. Every line with a difference against the book quantity right now gets adjusted.
function closeCount({ params, user }) {
  return transaction((db) => {
    const count = getCount(db, toId(params.id));
    if (count.status !== '盤點中') fail('這張盤點單已結案');
    const left = count.line_count - count.counted_count;
    if (left > 0) fail(`還有 ${left} 項沒有盤點，不能結案`);

    const t = now();
    const lines = db.prepare(`
      SELECT l.item_id, l.counted_qty, i.book_qty FROM count_lines l JOIN items i ON i.id = l.item_id
       WHERE l.count_id = ? ORDER BY l.id
    `).all(count.id);
    let adjusted = 0;
    for (const l of lines) {
      const diff = l.counted_qty - l.book_qty;
      if (diff === 0) continue;
      addMove(db, {
        itemId: l.item_id, type: '盤點調整', change: diff, note: `${count.count_no} 盤點調整`,
        countId: count.id, userId: user.id, time: t,
      });
      adjusted += 1;
    }
    db.prepare("UPDATE counts SET status = '已結案', closed_by = ?, closed_at = ? WHERE id = ?").run(user.id, t, count.id);
    return { message: `已結案 ${count.count_no}，調整 ${adjusted} 個料號的帳面數量` };
  });
}

module.exports = [
  { method: 'GET', path: '/api/counts', access: 'login', handler: listCounts },
  { method: 'GET', path: '/api/counts/new-form', access: 'manager', handler: newForm },
  { method: 'POST', path: '/api/counts', access: 'manager', handler: createCount },
  { method: 'GET', path: '/api/counts/:id', access: 'login', handler: countDetail },
  { method: 'PUT', path: '/api/counts/:id/close', access: 'manager', handler: closeCount },
  { method: 'PUT', path: '/api/count-lines/:id', access: 'login', handler: enterLine },
];
