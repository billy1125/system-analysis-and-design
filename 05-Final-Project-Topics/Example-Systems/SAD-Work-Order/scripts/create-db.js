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

const SEED_PASSWORD = 'wo1234';
const MASTER_TIME = '2026-10-01 08:30:00';
const DISABLED_TIME = '2026-10-15 17:00:00';

db.exec('BEGIN');

const insertCenter = db.prepare(`
  INSERT INTO work_centers (id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
`);
[
  [1, 'CNC 車削組', 1],
  [2, 'CNC 銑削組', 1],
  [3, '組裝線', 1],
  [4, '傳統車床組', 0],
].forEach(([id, name, active]) => {
  insertCenter.run(id, name, active, MASTER_TIME, active ? null : DISABLED_TIME);
});

const insertUser = db.prepare(`
  INSERT INTO users (id, emp_no, password_hash, name, title, role, work_center_id, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-01 08:00:00')
`);
[
  [1, 'E7001', '柯美君', '生管課長', 0, null, 1],
  [2, 'E7002', '潘俊宏', '生管員', 0, null, 1],
  [3, 'E7101', '曾國峰', '車削組長', 1, 1, 1],
  [4, 'E7102', '羅士傑', '車削夜班組長', 1, 1, 1],
  [5, 'E7103', '方怡如', '銑削組長', 1, 2, 1],
  [6, 'E7104', '簡志豪', '組裝組長', 1, 3, 1],
  [7, 'E7105', '戴宗翰', '傳統車床組長', 1, 4, 0],
].forEach(([id, empNo, name, title, role, wc, active]) => {
  insertUser.run(id, empNo, hashPassword(SEED_PASSWORD), name, title, role, wc, active);
});

const insertProduct = db.prepare(`
  INSERT INTO products (id, part_no, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
`);
[
  [1, 'BP-1101', '前花鼓殼', 1],
  [2, 'BP-1102', '後花鼓殼', 1],
  [3, 'BP-2201', '曲柄（左）', 1],
  [4, 'BP-2202', '曲柄（右）', 1],
  [5, 'BP-3301', '座管束', 1],
  [6, 'BP-4401', '碟煞轉接座', 1],
  [7, 'BP-0901', '車首碗組（舊款）', 0],
].forEach(([id, no, name, active]) => {
  insertProduct.run(id, no, name, active, MASTER_TIME, active ? null : DISABLED_TIME);
});

// Opened fields: [id, wo no, so no, product, qty, due date, created at, created by, note]
const orders = [
  [1, 'WO-261001-01', 'SO-2609-015', 5, 300, '2026-10-08', '2026-10-01 09:00', 2, null],
  [2, 'WO-261001-02', 'SO-2609-015', 5, 300, '2026-10-10', '2026-10-01 09:05', 2, '接 WO-261001-01，銑削開槽'],
  [3, 'WO-261005-01', 'SO-2610-003', 1, 500, '2026-10-12', '2026-10-05 10:00', 1, null],
  [4, 'WO-261005-02', 'SO-2610-003', 1, 500, '2026-10-15', '2026-10-05 10:05', 1, '接 WO-261005-01，車削完成後才能開工'],
  [5, 'WO-261005-03', 'SO-2610-003', 1, 500, '2026-10-17', '2026-10-05 10:10', 1, '接 WO-261005-02，壓入軸承'],
  [6, 'WO-261012-01', 'SO-2610-008', 6, 800, '2026-10-20', '2026-10-12 14:00', 2, null],
  [7, 'WO-261015-01', 'SO-2610-010', 2, 400, '2026-10-30', '2026-10-15 09:30', 1, null],
  [8, 'WO-261020-01', 'SO-2610-014', 4, 600, '2026-10-31', '2026-10-20 10:00', 2, null],
  [9, 'WO-261020-02', 'SO-2610-014', 4, 600, '2026-11-03', '2026-10-20 10:05', 2, '接 WO-261020-01，銑削減重槽'],
  [10, 'WO-261020-03', 'SO-2610-014', 4, 600, '2026-11-06', '2026-10-20 10:10', 2, '接 WO-261020-02，組裝踏板螺牙護套'],
  [11, 'WO-261027-01', 'SO-2610-019', 3, 1200, '2026-11-06', '2026-10-27 09:00', 1, null],
  [12, 'WO-261027-02', 'SO-2610-019', 3, 1200, '2026-11-10', '2026-10-27 09:05', 1, '接 WO-261027-01，銑削減重槽'],
  [13, 'WO-261030-01', 'SO-2610-022', 6, 500, '2026-11-04', '2026-10-30 15:00', 2, null],
  [14, 'WO-261103-01', 'SO-2611-002', 2, 400, '2026-11-12', '2026-11-03 11:00', 1, null],
  [15, 'WO-261104-01', 'SO-2611-004', 5, 300, '2026-11-14', '2026-11-04 16:00', 2, null],
  [16, 'WO-261105-01', 'SO-2611-005', 1, 600, '2026-11-20', '2026-11-05 08:30', 1, null],
];

// Dispatch and reports: id -> [status, work center, plan date, dispatched by, dispatched at,
//   started by, started at, good, ng, close note, closed by, closed at]
const progress = {
  1: ['已完工', 1, '2026-10-02', 2, '2026-10-01 09:30', 3, '2026-10-02 08:10', 296, 4, '外徑超差 4 件', 3, '2026-10-03 16:40'],
  2: ['已完工', 2, '2026-10-04', 2, '2026-10-01 09:30', 5, '2026-10-04 08:20', 290, 6, '開槽毛邊 6 件', 5, '2026-10-06 15:30'],
  3: ['已完工', 1, '2026-10-06', 1, '2026-10-05 10:30', 3, '2026-10-06 08:00', 497, 3, '早班 260、夜班 237；不良 3 件為內孔刀痕', 3, '2026-10-09 17:00'],
  4: ['已完工', 2, '2026-10-08', 1, '2026-10-05 10:30', 5, '2026-10-08 08:30', 480, 5, '輻條孔位偏 5 件', 5, '2026-10-14 16:00'],
  5: ['已完工', 3, '2026-10-15', 1, '2026-10-05 10:35', 6, '2026-10-15 08:00', 478, 2, '軸承壓入歪斜 2 件', 6, '2026-10-17 15:00'],
  6: ['已完工', 2, '2026-10-14', 2, '2026-10-12 14:30', 5, '2026-10-16 08:10', 800, 0, '鋁材 10/16 才到料，延後開工；10/19 13:00 主軸異音停機，10/20 10:00 修好恢復', 5, '2026-10-22 11:00'],
  7: ['已取消', 1, '2026-10-20', 1, '2026-10-15 10:00', null, null, null, null, '客戶取消訂單 SO-2610-010', 1, '2026-10-18 14:00'],
  8: ['已完工', 1, '2026-10-22', 2, '2026-10-20 10:30', 4, '2026-10-22 20:10', 588, 12, '早班 300、夜班 288；不良 12 件為夾痕', 3, '2026-10-27 17:30'],
  9: ['已完工', 2, '2026-10-28', 2, '2026-10-20 10:30', 5, '2026-10-28 08:00', 585, 3, '槽深不足 3 件', 5, '2026-11-02 16:00'],
  10: ['生產中', 3, '2026-11-04', 2, '2026-10-20 10:35', 6, '2026-11-04 08:00'],
  11: ['生產中', 1, '2026-10-29', 1, '2026-10-27 09:30', 3, '2026-10-29 08:00'],
  12: ['已派工', 2, '2026-11-03', 1, '2026-10-27 09:30'],
  13: ['生產中', 2, '2026-10-31', 2, '2026-10-30 15:30', 5, '2026-10-31 08:00'],
  14: ['已派工', 1, '2026-11-06', 1, '2026-11-03 11:30'],
};

const sec = (t) => (t ? t + ':00' : null);
const insertOrder = db.prepare(`
  INSERT INTO work_orders (id, wo_no, so_no, product_id, qty, due_date, note, status, work_center_id, plan_date,
                           dispatched_by, dispatched_at, started_by, started_at, good_qty, ng_qty, close_note,
                           closed_by, closed_at, created_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const [id, no, soNo, product, qty, due, created, by, note] of orders) {
  const [status, wc = null, plan = null, dispatchedBy = null, dispatchedAt = null, startedBy = null, startedAt = null,
    good = null, ng = null, closeNote = null, closedBy = null, closedAt = null] = progress[id] || ['待派工'];
  insertOrder.run(id, no, soNo, product, qty, due, note, status, wc, plan, dispatchedBy, sec(dispatchedAt),
    startedBy, sec(startedAt), good, ng, closeNote, closedBy, sec(closedAt), by, sec(created));
}

db.exec('COMMIT');
db.close();
console.log('已建立 ' + DB_PATH);
