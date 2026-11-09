// Build database.db with the schema and seed data (spec 5.5).
// For maintainers only. Users who break their data should download database.db again.
// Refuses to run if database.db already exists.

const fs = require('node:fs');
const path = require('node:path');
const { DB_PATH, openDatabase } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

if (fs.existsSync(DB_PATH)) {
  console.error('database.db 已存在，不會覆蓋。要重建請先自行刪除它。');
  process.exit(1);
}

const db = openDatabase(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

const SEED_PASSWORD = 'ic1234';
const sec = (t) => (t ? t + ':00' : null);

db.exec('BEGIN');

const insertUser = db.prepare(`
  INSERT INTO users (id, emp_no, password_hash, name, title, role, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, '2026-09-01 07:30:00')
`);
[
  [1, 'E8001', '溫志遠', '倉庫課長', 0, 1],
  [2, 'E8002', '蕭淑貞', '倉庫副課長', 0, 1],
  [3, 'E8101', '呂佳蓉', '倉管員', 1, 1],
  [4, 'E8102', '施博凱', '倉管員', 1, 1],
  [5, 'E8103', '范雅琳', '倉管員', 1, 1],
  [6, 'E8104', '唐國維', '倉管員', 1, 0],
].forEach(([id, empNo, name, title, role, active]) => {
  insertUser.run(id, empNo, hashPassword(SEED_PASSWORD), name, title, role, active);
});

// book_qty starts at 0 and is built up by the stock moves below
const insertItem = db.prepare(`
  INSERT INTO items (id, item_no, name, spec, unit, location, book_qty, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, 0, ?, '2026-09-01 07:45:00', ?)
`);
[
  [1, 'TB-1001', '方形鋼管', '25×25 mm，長 6 m', '支', 'A-01-01', 1],
  [2, 'TB-1002', '圓形鋼管', 'φ32 mm，長 6 m', '支', 'A-01-02', 1],
  [3, 'PL-2001', '美耐板桌面', '120×60 cm', '片', 'B-02-01', 1],
  [4, 'PL-2002', '美耐板桌面', '140×70 cm', '片', 'B-02-02', 1],
  [5, 'HW-3001', '六角螺絲', 'M6×20，100 支裝', '盒', 'C-03-01', 1],
  [6, 'HW-3002', '自攻螺絲', '4×25，100 支裝', '盒', 'C-03-02', 1],
  [7, 'HW-3010', '椅腳滑輪', '50 mm', '個', 'C-04-01', 1],
  [8, 'HW-3011', '氣壓棒', '行程 120 mm', '支', 'C-04-02', 1],
  [9, 'PK-4001', '五層紙箱', '120×65×10 cm', '個', 'D-05-01', 1],
  [10, 'PK-4002', '氣泡布', '寬 1.2 m，長 100 m', '卷', 'D-05-02', 1],
  [11, 'HW-3020', '塑膠腳套（舊款）', '25 mm 方管用', '個', 'C-04-09', 0],
].forEach(([id, no, name, spec, unit, location, active]) => {
  insertItem.run(id, no, name, spec, unit, location, active, active ? null : '2026-10-01 09:00:00');
});

// [id, count no, name, type, counter, created by, created at, status, closed by, closed at]
const insertCount = db.prepare(`
  INSERT INTO counts (id, count_no, name, count_type, counter_id, created_by, created_at, status, closed_by, closed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
[
  [1, 'IC-2609-01', '九月抽盤（五金零件）', '抽盤', 3, 1, '2026-09-26 08:30', '已結案', 1, '2026-09-26 16:30'],
  [2, 'IC-2610-01', '十月全盤', '全盤', 4, 1, '2026-10-30 08:00', '已結案', 1, '2026-10-31 15:00'],
  [3, 'IC-2611-01', '十一月抽盤（板材與包材）', '抽盤', 5, 2, '2026-11-04 09:00', '盤點中', null, null],
].forEach(([id, no, name, type, counter, by, at, status, closedBy, closedAt]) => {
  insertCount.run(id, no, name, type, counter, by, sec(at), status, closedBy, sec(closedAt));
});

// [count, item, counted qty, remark, counted by, counted at]; ids follow this order
const insertLine = db.prepare(`
  INSERT INTO count_lines (count_id, item_id, counted_qty, remark, counted_by, counted_at) VALUES (?, ?, ?, ?, ?, ?)
`);
[
  [1, 5, 30, null, 3, '2026-09-26 09:10'],
  [1, 6, 36, null, 3, '2026-09-26 09:20'],
  [1, 7, 574, '疑似組裝線領用未登記', 3, '2026-09-26 09:40'],
  [1, 8, 240, null, 3, '2026-09-26 10:00'],
  [2, 1, 136, '切料損耗未扣帳', 4, '2026-10-30 10:20'],
  [2, 2, 150, null, 4, '2026-10-30 10:30'],
  [2, 3, 88, null, 4, '2026-10-30 09:10'],
  [2, 4, 50, null, 4, '2026-10-30 09:20'],
  [2, 5, 30, null, 4, '2026-10-30 08:30'],
  [2, 6, 36, null, 4, '2026-10-30 08:35'],
  [2, 7, 424, null, 4, '2026-10-30 08:50'],
  [2, 8, 240, null, 4, '2026-10-30 09:00'],
  [2, 9, 350, null, 4, '2026-10-30 11:00'],
  [2, 10, 21, '找到一卷放在出貨區', 4, '2026-10-30 11:10'],
  [3, 3, null, null, null, null],
  [3, 4, 40, '早上數 38，覆盤後改為 40', 5, '2026-11-04 15:30'],
  [3, 9, 300, null, 5, '2026-11-04 15:00'],
  [3, 10, 21, null, 5, '2026-11-04 16:00'],
].forEach(([count, item, qty, remark, by, at]) => {
  insertLine.run(count, item, qty, remark, by, sec(at));
});

// Stock moves in time order: [time, item, type, change, note, count, by]
const OPENING = [200, 150, 80, 60, 40, 35, 500, 300, 400, 20];
const moves = OPENING.map((qty, i) => ['2026-09-01 08:00', i + 1, '入庫', qty, '系統上線期初庫存', null, 1]);
moves.push(
  ['2026-09-08 10:00', 7, '出庫', -120, '領料單 PR-0908-03', null, 6],
  ['2026-09-08 10:05', 8, '出庫', -60, '領料單 PR-0908-03', null, 6],
  ['2026-09-15 14:00', 7, '入庫', 200, '採購單 PO-2609-11', null, 3],
  ['2026-09-18 09:30', 1, '出庫', -40, '領料單 PR-0918-01', null, 4],
  ['2026-09-22 11:00', 5, '出庫', -10, '領料單 PR-0922-02', null, 6],
  ['2026-09-26 16:30', 6, '盤點調整', 1, 'IC-2609-01 盤點調整', 1, 1],
  ['2026-09-26 16:30', 7, '盤點調整', -6, 'IC-2609-01 盤點調整', 1, 1],
  ['2026-10-05 10:00', 3, '出庫', -20, '領料單 PR-1005-01', null, 4],
  ['2026-10-05 10:10', 4, '出庫', -10, '領料單 PR-1005-01', null, 4],
  ['2026-10-12 13:00', 9, '出庫', -50, '出貨單 SH-1012-02', null, 3],
  ['2026-10-15 15:00', 3, '入庫', 30, '採購單 PO-2610-04', null, 3],
  ['2026-10-20 09:00', 7, '出庫', -150, '領料單 PR-1020-01', null, 5],
  ['2026-10-22 10:30', 1, '出庫', -20, '領料單 PR-1022-03', null, 4],
  ['2026-10-31 15:00', 1, '盤點調整', -4, 'IC-2610-01 盤點調整', 2, 1],
  ['2026-10-31 15:00', 3, '盤點調整', -2, 'IC-2610-01 盤點調整', 2, 1],
  ['2026-10-31 15:00', 10, '盤點調整', 1, 'IC-2610-01 盤點調整', 2, 1],
  ['2026-11-02 10:00', 9, '出庫', -50, '出貨單 SH-1102-01', null, 3],
  ['2026-11-03 14:00', 4, '出庫', -12, '領料單 PR-1103-02', null, 4],
);

const insertMove = db.prepare(`
  INSERT INTO stock_moves (item_id, move_type, qty_change, note, count_id, created_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const addBook = db.prepare('UPDATE items SET book_qty = book_qty + ? WHERE id = ?');
for (const [at, item, type, change, note, count, by] of moves) {
  insertMove.run(item, type, change, note, count, by, sec(at));
  addBook.run(change, item);
}

db.exec('COMMIT');
db.close();
console.log('已建立 ' + DB_PATH);
