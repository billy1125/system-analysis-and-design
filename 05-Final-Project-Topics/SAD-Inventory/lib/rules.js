// Business rules shared by the count and stock routes: count number,
// derived values (spec 5.4), and how a stock move changes the book quantity.

const { UserError } = require('./http');
const { today } = require('./db');

// '+5', '−3' (minus sign), '0'
function signed(n) {
  if (n > 0) return '+' + n;
  if (n < 0) return '−' + Math.abs(n);
  return '0';
}

// One count row with names and progress (spec 5.4)
const COUNT_SELECT = `
  SELECT c.*,
         ku.name AS counter_name, cu.name AS created_by_name, xu.name AS closed_by_name,
         (SELECT COUNT(*) FROM count_lines l WHERE l.count_id = c.id) AS line_count,
         (SELECT COUNT(*) FROM count_lines l WHERE l.count_id = c.id AND l.counted_qty IS NOT NULL) AS counted_count
    FROM counts c
    JOIN users ku ON ku.id = c.counter_id
    JOIN users cu ON cu.id = c.created_by
    LEFT JOIN users xu ON xu.id = c.closed_by`;

function getCount(db, id) {
  const count = id && db.prepare(COUNT_SELECT + ' WHERE c.id = ?').get(id);
  if (!count) throw new UserError('找不到這張盤點單', 404);
  return count;
}

// Lines of a count with book quantity and difference (spec 5.4).
// Open count: book is the item's book_qty right now, so it moves with later stock moves.
// Closed count: difference is the adjustment this count made (0 if none); book = counted - difference.
function countLines(db, count) {
  const rows = db.prepare(`
    SELECT l.*, i.item_no, i.name, i.spec, i.unit, i.location, i.book_qty,
           u.name AS counted_by_name,
           (SELECT m.qty_change FROM stock_moves m
             WHERE m.count_id = l.count_id AND m.item_id = l.item_id AND m.move_type = '盤點調整') AS adjusted
      FROM count_lines l
      JOIN items i ON i.id = l.item_id
      LEFT JOIN users u ON u.id = l.counted_by
     WHERE l.count_id = ?
     ORDER BY i.location, i.item_no
  `).all(count.id);
  return rows.map((l) => {
    let book = l.book_qty;
    let diff = l.counted_qty === null ? null : l.counted_qty - l.book_qty;
    if (count.status === '已結案') {
      diff = l.adjusted || 0;
      book = l.counted_qty - diff;
    }
    const { book_qty, adjusted, ...rest } = l;
    return { ...rest, book, diff };
  });
}

// The open count that already holds this item, or undefined
function openCountOf(db, itemId) {
  return db.prepare(`
    SELECT c.id, c.count_no FROM count_lines l JOIN counts c ON c.id = l.count_id
     WHERE l.item_id = ? AND c.status = '盤點中'
  `).get(itemId);
}

// Next number for this month: IC-YYMM-NN, based on the creation date
function nextCountNo(db) {
  const prefix = `IC-${today().slice(2, 4)}${today().slice(5, 7)}-`;
  const last = db.prepare('SELECT MAX(count_no) AS no FROM counts WHERE count_no LIKE ?').get(prefix + '%').no;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return prefix + String(seq).padStart(2, '0');
}

// Write one stock move and change the item's book quantity in the same transaction
function addMove(db, { itemId, type, change, note, countId, userId, time }) {
  db.prepare(`
    INSERT INTO stock_moves (item_id, move_type, qty_change, note, count_id, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(itemId, type, change, note, countId, userId, time);
  db.prepare('UPDATE items SET book_qty = book_qty + ? WHERE id = ?').run(change, itemId);
}

module.exports = { signed, COUNT_SELECT, getCount, countLines, openCountOf, nextCountNo, addMove };
