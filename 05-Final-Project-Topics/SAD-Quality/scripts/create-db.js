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

const SEED_PASSWORD = 'qc1234';
const MASTER_TIME = '2026-09-01 08:30:00';

db.exec('BEGIN');

const insertUser = db.prepare(`
  INSERT INTO users (id, emp_no, password_hash, name, title, role, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, '2026-09-01 08:00:00')
`);
[
  [1, 'E6001', '鄭雅婷', '品保課長', 0, 1],
  [2, 'E6002', '江明軒', '品保副課長', 0, 1],
  [3, 'E6101', '吳承翰', '品管工程師', 1, 1],
  [4, 'E6102', '許佩珊', '品管工程師', 1, 1],
  [5, 'E6103', '邱家豪', '品管員', 1, 1],
  [6, 'E6104', '謝宛臻', '品管員', 1, 0],
].forEach(([id, empNo, name, title, role, active]) => {
  insertUser.run(id, empNo, hashPassword(SEED_PASSWORD), name, title, role, active);
});

const insertProduct = db.prepare(`
  INSERT INTO products (id, part_no, name, customer, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
[
  [1, 'AP-1001', '車燈外殼（左）', '東昇汽車', 1],
  [2, 'AP-1002', '車燈外殼（右）', '東昇汽車', 1],
  [3, 'AP-2015', '儀表板飾板', '東昇汽車', 1],
  [4, 'AP-3008', '門把底座', '宏邦車業', 1],
  [5, 'AP-3020', '後視鏡外蓋', '宏邦車業', 1],
  [6, 'AP-4100', '冷氣出風口葉片', '宏邦車業', 1],
  [7, 'AP-0901', '排檔飾蓋（舊款）', '宏邦車業', 0],
].forEach(([id, no, name, customer, active]) => {
  insertProduct.run(id, no, name, customer, active, MASTER_TIME, active ? null : '2026-09-30 17:00:00');
});

const insertDept = db.prepare(`
  INSERT INTO departments (id, name, contact, ext, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
[
  [1, '製造一課', '陳宏志', '2101', 1],
  [2, '製造二課', '林美玲', '2201', 1],
  [3, '模具課', '張志遠', '2301', 1],
  [4, '設備課', '黃國書', '2401', 1],
  [5, '採購課', '蔡依潔', '2501', 1],
  [6, '品保課', '許佩珊', '2601', 1],
  [7, '外包管理課', '何建良', '2701', 0],
].forEach(([id, name, contact, ext, active]) => {
  insertDept.run(id, name, contact, ext, active, MASTER_TIME, active ? null : '2026-10-01 09:00:00');
});

const insertType = db.prepare(`
  INSERT INTO defect_types (id, name, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
`);
[
  [1, '尺寸不良', 1],
  [2, '外觀不良', 1],
  [3, '功能不良', 1],
  [4, '材料不良', 1],
  [5, '設備異常', 1],
  [6, '其他', 1],
  [7, '包裝不良', 0],
].forEach(([id, name, active]) => {
  insertType.run(id, name, active, MASTER_TIME, active ? null : '2026-10-01 09:00:00');
});

// Registered fields:
// [id, issue no, found at, reporter, line, station, product, lot, type, qty, created at, created by, description]
const issues = [
  [1, 'QI-2609-001', '2026-09-03 10:20', '王志成（射出一線早班班長）', '射出一線', '射出機 #03', 1, '260903-A', 2, 120, '2026-09-03 10:45', 3, '車燈外殼分模線有毛邊，約 1 mm'],
  [2, 'QI-2609-002', '2026-09-10 14:05', '陳淑芬（組裝線組長）', '組裝線', '組裝站 2', 4, '260908-B', 1, 45, '2026-09-10 14:30', 4, '螺絲孔位偏移，鎖付時對不準'],
  [3, 'QI-2609-003', '2026-09-17 09:30', '邱家豪（進料檢驗）', '進料檢驗', 'IQC 檢驗台', 3, 'M260915', 4, 0, '2026-09-17 09:40', 5, 'ABS 塑膠粒含水率超標，20 包暫停使用'],
  [4, 'QI-2609-004', '2026-09-24 16:40', '陳淑芬（組裝線組長）', '組裝線', '包裝站', 6, '260923-C', 7, 300, '2026-09-24 17:00', 6, '包裝袋未封口，葉片沾到灰塵'],
  [5, 'QI-2610-001', '2026-10-02 08:50', '黃志明（射出二線早班班長）', '射出二線', '射出機 #07', 5, '261001-C', 2, 60, '2026-10-02 09:10', 3, '後視鏡外蓋表面縮水凹痕'],
  [6, 'QI-2610-002', '2026-10-06 10:15', '王志成（射出一線早班班長）', '射出一線', '射出機 #03', 1, '261006-A', 2, 85, '2026-10-06 10:40', 4, '車燈外殼分模線有毛邊'],
  [7, 'QI-2610-003', '2026-10-09 13:20', '張美惠（射出二線中班班長）', '射出二線', '射出機 #06', 4, '261008-B', 4, 200, '2026-10-09 13:50', 3, '門把底座表面有黑點雜質'],
  [8, 'QI-2610-004', '2026-10-14 15:00', '邱家豪（出貨檢驗）', '出貨檢驗', '成品倉', 2, '261013-A', 1, 40, '2026-10-14 15:20', 5, '卡扣寬度量測超出上限 0.15 mm'],
  [9, 'QI-2610-005', '2026-10-20 22:40', '李文雄（射出二線夜班班長）', '射出二線', '射出機 #07', 5, '261020-C', 2, 35, '2026-10-21 08:50', 3, '表面刮傷約 3 公分，照片已傳品管 LINE 群組'],
  [10, 'QI-2610-006', '2026-10-23 09:10', '陳淑芬（組裝線組長）', '組裝線', '組裝站 1', 6, '261022-A', 3, 150, '2026-10-23 09:30', 4, '出風口葉片撥動卡滯'],
  [11, 'QI-2610-007', '2026-10-27 10:30', '黃志明（射出二線早班班長）', '射出二線', '射出機 #05', 3, '261027-A', 2, 70, '2026-10-27 10:50', 3, '儀表板飾板表面有流痕'],
  [12, 'QI-2610-008', '2026-10-27 15:20', '張美惠（射出二線中班班長）', '射出二線', '射出機 #05', 3, '261027-A', 2, 40, '2026-10-27 15:40', 5, '飾板表面有波浪狀紋路'],
  [13, 'QI-2610-009', '2026-10-29 23:15', '李文雄（射出二線夜班班長）', '射出二線', '射出機 #06', 4, '261029-C', 5, 25, '2026-10-30 08:40', 4, '加熱段溫度不穩，產品尺寸忽大忽小，照片已傳品管 LINE 群組'],
  [14, 'QI-2611-001', '2026-11-03 09:40', '王志成（射出一線早班班長）', '射出一線', '射出機 #03', 1, '261103-A', 2, 150, '2026-11-03 10:00', 3, '車燈外殼分模線有毛邊'],
  [15, 'QI-2611-002', '2026-11-04 23:50', '李文雄（射出二線夜班班長）', '射出二線', '射出機 #07', 5, '261104-C', 1, 18, '2026-11-05 08:30', 5, '卡扣斷裂，自主檢查時發現'],
  [16, 'QI-2611-003', '2026-11-05 08:15', '陳淑芬（組裝線組長）', '組裝線', '組裝站 2', 2, '261104-A', 3, 30, '2026-11-05 08:40', 3, '燈殼與底座組裝後有間隙'],
];

// Handling: id -> [status, dept, assigned by, assigned at, resolution, closed by, closed at]
const handling = {
  1: ['已結案', 1, 3, '2026-09-03 11:00', '調整射出壓力與保壓時間，毛邊消除；120 件修邊後入庫', 3, '2026-09-04 15:30'],
  2: ['已結案', 3, 4, '2026-09-10 15:00', '更換磨耗的模具頂針，首件量測合格；45 件報廢', 4, '2026-09-15 16:00'],
  3: ['已結案', 5, 5, '2026-09-17 10:00', '供應商同意退貨換批，新批號 M260919 進料檢驗合格', 5, '2026-09-19 11:00'],
  4: ['已結案', 2, 6, '2026-09-25 08:30', '重新清潔並換袋包裝，調整封口機溫度', 6, '2026-09-25 14:00'],
  5: ['已結案', 1, 3, '2026-10-02 09:30', '冷卻時間延長 3 秒，凹痕消除', 3, '2026-10-03 10:00'],
  6: ['已結案', 1, 4, '2026-10-06 11:00', '調整射出參數並重新首件確認，毛邊消除；85 件修邊', 4, '2026-10-07 09:30'],
  7: ['處理中', 5, 3, '2026-10-15 10:00'],
  8: ['不成立', null, null, null, '複量發現卡尺未歸零，重新量測全數合格', 4, '2026-10-14 17:00'],
  9: ['已結案', 1, 3, '2026-10-21 09:30', '機械手夾爪加裝保護套；35 件拋光後複檢合格', 3, '2026-10-22 16:00'],
  10: ['已結案', 2, 4, '2026-10-23 10:00', '更換磨損的組裝治具定位銷，150 件重新組裝', 4, '2026-10-28 11:00'],
  11: ['處理中', 3, 3, '2026-10-27 11:30'],
  12: ['不成立', null, null, null, '與 QI-2610-007 同一批同一問題，重複登記', 3, '2026-10-28 09:00'],
  13: ['已結案', 4, 4, '2026-10-30 09:00', '更換加熱圈與熱電偶，溫度恢復穩定', 4, '2026-10-31 14:00'],
  14: ['處理中', 3, 3, '2026-11-03 10:30'],
};

const sec = (t) => (t ? t + ':00' : null);
const insertIssue = db.prepare(`
  INSERT INTO issues (id, issue_no, found_at, reporter, line, station, product_id, lot_no, defect_type_id,
                      description, qty, status, dept_id, assigned_by, assigned_at, resolution, closed_by, closed_at,
                      created_by, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const [id, no, found, reporter, line, station, product, lot, type, qty, created, by, description] of issues) {
  const [status, dept = null, assignedBy = null, assignedAt = null, resolution = null, closedBy = null, closedAt = null] =
    handling[id] || ['待處理'];
  insertIssue.run(id, no, sec(found), reporter, line, station, product, lot, type, description, qty, status,
    dept, assignedBy, sec(assignedAt), resolution, closedBy, sec(closedAt), by, sec(created));
}

db.exec('COMMIT');
db.close();
console.log('已建立 ' + DB_PATH);
