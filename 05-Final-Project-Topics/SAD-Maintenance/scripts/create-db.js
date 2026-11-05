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

const SEED_PASSWORD = 'pm1234';

db.exec('BEGIN');

const insertUser = db.prepare(`
  INSERT INTO users (id, emp_no, password_hash, name, title, role, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, '2026-08-01 08:00:00')
`);
[
  [1, 'E5001', '周文彬', '設備課長', 0, 1],
  [2, 'E5002', '楊淑芬', '設備副課長', 0, 1],
  [3, 'E5101', '陳冠宇', '保養技術員', 1, 1],
  [4, 'E5102', '林志明', '保養技術員', 1, 1],
  [5, 'E5103', '黃柏翰', '保養技術員', 1, 1],
  [6, 'E5104', '蘇建宏', '保養技術員', 1, 0],
].forEach(([id, empNo, name, title, role, active]) => {
  insertUser.run(id, empNo, hashPassword(SEED_PASSWORD), name, title, role, active);
});

const insertEquipment = db.prepare(`
  INSERT INTO equipment (id, equip_no, name, model, maker, line, location, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-08-01 08:30:00', ?)
`);
[
  [1, 'EQ-001', '200 噸油壓沖床', 'HP-200', '信全機械', '沖壓一線', 'A 區 1 號', 1],
  [2, 'EQ-002', '110 噸沖床', 'SP-110', '信全機械', '沖壓一線', 'A 區 2 號', 1],
  [3, 'EQ-011', 'CNC 車床', 'TL-25', '達昇精機', '加工線', 'B 區 1 號', 1],
  [4, 'EQ-012', 'CNC 立式綜合加工機', 'VM-850', '達昇精機', '加工線', 'B 區 2 號', 1],
  [5, 'EQ-013', '立式銑床', 'M-3', null, '加工線', 'B 區 5 號', 0],
  [6, 'EQ-021', '焊接機器人', 'RW-6', '冠宇自動化', '焊接線', 'C 區 1 號', 1],
  [7, 'EQ-031', '螺旋式空壓機', 'AC-37', '永信氣體設備', '公用設備', '空壓機房', 1],
  [8, 'EQ-032', '冷卻水塔', 'CT-60', null, '公用設備', '廠房屋頂', 1],
  [9, 'EQ-041', '成品輸送帶', null, null, '包裝線', 'D 區', 1],
].forEach(([id, no, name, model, maker, line, place, active]) => {
  insertEquipment.run(id, no, name, model, maker, line, place, active, id === 5 ? '2026-09-30 16:00:00' : null);
});

const PRESS_ITEMS = ['檢查潤滑油位並補充', '清潔滑塊導軌', '檢查離合器與煞車作動', '檢查安全光柵功能'];
const ITEMS = {
  1: PRESS_ITEMS,
  2: ['更換液壓油', '檢查曲軸與連桿間隙', '校正下死點精度'],
  3: PRESS_ITEMS,
  4: ['清潔切屑與排屑機', '檢查切削液濃度與液位', '檢查主軸潤滑油位', '檢查夾頭夾持力'],
  5: ['更換切削液過濾網', '檢查刀塔定位精度', '檢查皮帶張力'],
  6: ['清潔切屑與排屑機', '檢查切削液濃度與液位', '檢查主軸潤滑油位', '清潔刀庫'],
  7: ['檢查主軸跳動', '更換主軸潤滑油', '校正三軸精度'],
  8: ['清潔床台與導軌', '檢查潤滑油位'],
  9: ['清潔焊槍噴嘴', '檢查送線輪磨耗', '檢查保護氣體流量', '校正焊槍 TCP'],
  10: ['更換空氣濾芯', '檢查冷卻器散熱片並清潔', '排放油水分離器積水'],
  11: ['更換壓縮機油與油濾芯', '更換油氣分離芯', '檢查安全閥'],
  12: ['檢查水質與補充藥劑', '清潔散水盤', '檢查散熱風扇皮帶'],
  13: ['檢查輸送皮帶磨耗與偏移', '檢查滾筒軸承有無異音', '清潔光電感測器'],
};

const insertPlan = db.prepare(`
  INSERT INTO pm_plans (id, equipment_id, plan_type, cycle_days, items, owner_id, first_due_date, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-08-01 09:00:00', ?)
`);
[
  [1, 1, '月保養', 30, 3, '2026-08-05', 1],
  [2, 1, '年度保養', 365, 3, '2026-12-15', 1],
  [3, 2, '月保養', 30, 3, '2026-08-10', 1],
  [4, 3, '月保養', 30, 4, '2026-08-12', 1],
  [5, 3, '季保養', 90, 4, '2026-08-20', 1],
  [6, 4, '月保養', 30, 4, '2026-08-15', 1],
  [7, 4, '半年保養', 180, 4, '2027-02-15', 0],
  [8, 5, '月保養', 30, 4, '2026-08-14', 1],
  [9, 6, '月保養', 30, 5, '2026-08-18', 1],
  [10, 7, '季保養', 90, 5, '2026-08-01', 1],
  [11, 7, '年度保養', 365, 5, '2027-03-01', 1],
  [12, 8, '月保養', 30, 5, '2026-08-25', 1],
  [13, 9, '月保養', 30, 3, '2026-08-08', 1],
].forEach(([id, equipmentId, type, cycle, owner, firstDue, active]) => {
  insertPlan.run(id, equipmentId, type, cycle, ITEMS[id].join('\n'), owner, firstDue, active,
    id === 7 ? '2026-10-01 10:00:00' : null);
});

// [id, plan, done date, done by, note]
const records = [
  [1, 10, '2026-08-01', 5],
  [2, 1, '2026-08-05', 3],
  [3, 13, '2026-08-08', 3],
  [4, 3, '2026-08-10', 3],
  [5, 4, '2026-08-12', 4],
  [6, 8, '2026-08-14', 4],
  [7, 6, '2026-08-15', 4],
  [8, 9, '2026-08-18', 5],
  [9, 5, '2026-08-20', 4],
  [10, 12, '2026-08-25', 5],
  [11, 13, '2026-09-07', 3],
  [12, 3, '2026-09-09', 3],
  [13, 4, '2026-09-11', 4],
  [14, 6, '2026-09-16', 3, '林志明休假，代為保養'],
  [15, 9, '2026-09-17', 5],
  [16, 1, '2026-09-24', 3, '沖壓一線趕貨，延到這天停機保養'],
  [17, 12, '2026-09-26', 5],
  [18, 13, '2026-10-06', 5],
  [19, 3, '2026-10-08', 3],
  [20, 4, '2026-10-13', 4],
  [21, 9, '2026-10-17', 5],
  [22, 1, '2026-10-24', 3],
  [23, 12, '2026-10-27', 5],
];

// Items that are not 正常: 'record-seq' -> [result, remark]
const EXCEPTIONS = {
  '15-4': ['未執行', '校正治具送修中'],
  '17-3': ['異常', '皮帶鬆動，已現場調整張力'],
  '19-3': ['異常', '離合器來令片磨損約 7 成，已請採購叫料'],
};

const insertRecord = db.prepare(`
  INSERT INTO pm_records (id, plan_id, done_date, done_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?)
`);
const insertItem = db.prepare(`
  INSERT INTO pm_record_items (record_id, seq, item, result, remark) VALUES (?, ?, ?, ?, ?)
`);
for (const [id, planId, date, by, note = null] of records) {
  insertRecord.run(id, planId, date, by, note, `${date} 16:30:00`);
  ITEMS[planId].forEach((item, n) => {
    const [result, remark] = EXCEPTIONS[`${id}-${n + 1}`] || ['正常', null];
    insertItem.run(id, n + 1, item, result, remark);
  });
}

db.exec('COMMIT');
db.close();
console.log('已建立 ' + DB_PATH);
