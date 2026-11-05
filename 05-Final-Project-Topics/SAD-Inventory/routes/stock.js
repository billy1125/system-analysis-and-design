// FR-STK and FR-ADM-01: items, stock moves.
// The book quantity is never edited directly; only stock moves change it.

const { getDb, transaction, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { signed, openCountOf, addMove } = require('../lib/rules');
const { MOVE_TYPES, text, fail, toId, toIntIn, isDate } = require('../lib/validate');

// ---------- UI-05 items (FR-STK-01, FR-ADM-01) ----------

function listItems({ query }) {
  const keyword = text(query.get('keyword'));
  const where = keyword ? 'WHERE instr(item_no, ?) > 0 OR instr(name, ?) > 0' : '';
  const args = keyword ? [keyword.toUpperCase(), keyword] : [];
  const rows = getDb().prepare(`SELECT * FROM items ${where} ORDER BY item_no`).all(...args);
  return { rows };
}

function getItem(db, id) {
  const item = id && db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) throw new UserError('找不到這個料號', 404);
  return item;
}

// Checked in the order item no, name, spec, unit, location (spec 7.5)
function checkItem(db, body, id) {
  const i = {
    item_no: text(body.item_no).toUpperCase(),
    name: text(body.name),
    spec: text(body.spec),
    unit: text(body.unit),
    location: text(body.location),
  };
  if (!/^[A-Z]{2}-\d{4}$/.test(i.item_no)) fail('料號格式錯誤，須為 2 個大寫英文字母、- 加 4 碼數字');
  if (db.prepare('SELECT 1 FROM items WHERE item_no = ? AND id != ?').get(i.item_no, id || 0)) fail('料號已存在');
  if (!i.name) fail('請輸入品名');
  if (i.name.length > 30) fail('品名不可超過 30 字');
  if (i.spec.length > 30) fail('規格不可超過 30 字');
  if (!i.unit) fail('請輸入單位');
  if (i.unit.length > 4) fail('單位不可超過 4 字');
  if (!i.location) fail('請輸入儲位');
  if (i.location.length > 10) fail('儲位不可超過 10 字');
  i.spec = i.spec || null;
  return i;
}

// A new item starts with book quantity 0
function createItem({ body }) {
  const db = getDb();
  const i = checkItem(db, body, null);
  db.prepare('INSERT INTO items (item_no, name, spec, unit, location, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(i.item_no, i.name, i.spec, i.unit, i.location, now());
  return { message: '已儲存料號資料' };
}

function updateItem({ params, body }) {
  const db = getDb();
  const old = getItem(db, toId(params.id));
  const i = checkItem(db, body, old.id);
  db.prepare('UPDATE items SET item_no = ?, name = ?, spec = ?, unit = ?, location = ?, updated_at = ? WHERE id = ?')
    .run(i.item_no, i.name, i.spec, i.unit, i.location, now(), old.id);
  return { message: '已儲存料號資料' };
}

function setItemActive({ params, body }) {
  const db = getDb();
  const item = getItem(db, toId(params.id));
  const active = body.is_active ? 1 : 0;
  if (!active) {
    const open = openCountOf(db, item.id);
    if (open) fail(`料號 ${item.item_no} 正在盤點單 ${open.count_no} 盤點中，不能停用`);
  }
  db.prepare('UPDATE items SET is_active = ?, updated_at = ? WHERE id = ?').run(active, now(), item.id);
  return { message: `已${active ? '啟用' : '停用'}料號 ${item.item_no}` };
}

// ---------- UI-06 stock moves (FR-STK-02..05) ----------

function listMoves({ query }) {
  const db = getDb();
  const where = [];
  const args = [];
  const itemId = toId(query.get('item_id'));
  if (itemId) { where.push('m.item_id = ?'); args.push(itemId); }
  const from = text(query.get('from'));
  const to = text(query.get('to'));
  if (isDate(from) && isDate(to) && from > to) fail('起始日期不可晚於結束日期');
  if (isDate(from)) { where.push('substr(m.created_at, 1, 10) >= ?'); args.push(from); }
  if (isDate(to)) { where.push('substr(m.created_at, 1, 10) <= ?'); args.push(to); }
  const type = text(query.get('move_type'));
  if (MOVE_TYPES.includes(type)) { where.push('m.move_type = ?'); args.push(type); }

  const rows = db.prepare(`
    SELECT m.*, i.item_no, i.name AS item_name, u.name AS created_by_name
      FROM stock_moves m JOIN items i ON i.id = m.item_id JOIN users u ON u.id = m.created_by
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY m.created_at DESC, m.id DESC
  `).all(...args);
  return {
    rows,
    // All items for the search filter; the register form shows the active ones only
    items: db.prepare('SELECT id, item_no, name, unit, book_qty, is_active FROM items ORDER BY item_no').all(),
  };
}

// Spec 7.4. The move time is always now; past times cannot be entered.
function createMove({ body, user }) {
  return transaction((db) => {
    // Steps 1-2: item
    const itemId = toId(body.item_id);
    const item = itemId && db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    if (!item) fail('請選擇料號');
    if (!item.is_active) fail(`料號 ${item.item_no} 已停用，不能登錄異動`);
    // Step 3: type (盤點調整 is made only by closing a count)
    const type = text(body.move_type);
    if (type !== '入庫' && type !== '出庫') fail('請選擇異動類別');
    // Step 4: quantity
    const qty = toIntIn(body.qty, 1, 99999);
    if (qty === null) fail('數量須為 1 到 99999 的整數');
    // Step 5: cannot take out more than the book quantity
    if (type === '出庫' && qty > item.book_qty) fail(`庫存不足：${item.item_no} 帳面只有 ${item.book_qty} ${item.unit}`);
    // Step 6: note
    const note = text(body.note);
    if (note.length > 50) fail('說明不可超過 50 字');

    // No check for an open count here (FR-STK-03)
    const change = type === '入庫' ? qty : -qty;
    addMove(db, { itemId: item.id, type, change, note: note || null, countId: null, userId: user.id, time: now() });
    return { message: `已登錄${type}：${item.item_no} ${signed(change)}，帳面 ${item.book_qty + change}` };
  });
}

module.exports = [
  { method: 'GET', path: '/api/items', access: 'login', handler: listItems },
  { method: 'POST', path: '/api/items', access: 'manager', handler: createItem },
  { method: 'PUT', path: '/api/items/:id', access: 'manager', handler: updateItem },
  { method: 'PUT', path: '/api/items/:id/active', access: 'manager', handler: setItemActive },
  { method: 'GET', path: '/api/moves', access: 'login', handler: listMoves },
  { method: 'POST', path: '/api/moves', access: 'login', handler: createMove },
];
