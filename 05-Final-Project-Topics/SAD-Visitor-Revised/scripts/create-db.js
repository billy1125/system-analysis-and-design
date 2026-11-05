// Build database.db with the schema and seed data.
// Seed = the original system's seed after the data conversion rules, plus CR-01 data.
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

const SEED_PASSWORD = 'visit1234';
const USER_CREATED_AT = '2026-10-01 08:00:00';

db.exec('BEGIN');

const insertEmployee = db.prepare(`
  INSERT INTO employees (emp_no, name, department, extension, is_active) VALUES (?, ?, ?, ?, ?)
`);
[
  ['E1001', '李志明', '生產部', '2101', 1],
  ['E1002', '黃美玲', '品保部', '2201', 1],
  ['E1003', '吳建國', '採購部', '2301', 1],
  ['E1004', '周雅婷', '品保課', '2202', 1],
  ['E1005', '鄭大偉', '設備課', '2401', 1],
  ['E1006', '許文傑', '生產部', '2102', 0],
].forEach((row) => insertEmployee.run(...row));

const empId = (name) => db.prepare('SELECT id FROM employees WHERE name = ?').get(name).id;

const insertUser = db.prepare(`
  INSERT INTO users (username, password_hash, name, role, employee_id, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
[
  ['admin', '王總務', 0, null, 1, USER_CREATED_AT],
  ['guard01', '陳警衛', 1, null, 1, USER_CREATED_AT],
  ['guard02', '林警衛', 1, null, 1, USER_CREATED_AT],
  ['guard03', '張警衛', 1, null, 0, USER_CREATED_AT],
  // CR-01: host employee accounts, created before go-live
  ['e1001', '李志明', 2, empId('李志明'), 1, '2026-11-01 08:00:00'],
  ['e1002', '黃美玲', 2, empId('黃美玲'), 1, '2026-11-01 08:00:00'],
  ['e1005', '鄭大偉', 2, empId('鄭大偉'), 1, '2026-11-01 08:00:00'],
].forEach(([username, name, role, employeeId, active, createdAt]) => {
  insertUser.run(username, hashPassword(SEED_PASSWORD), name, role, employeeId, active, createdAt);
});

const userId = (username) => db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;

const insertVisitor = db.prepare(`
  INSERT INTO visitors (id, name, company, phone, id_number, created_at) VALUES (?, ?, ?, ?, ?, ?)
`);
[
  [1, '張家豪', '宏昇精密', '0912345678', 'A123456789', '2026-11-02 09:05:00'],
  [2, '林淑芬', '順安物流', '0922333444', 'B223456780', '2026-11-02 10:20:00'],
  [3, '陳俊宏', '永協機電', '0933555666', 'C123456781', '2026-11-02 13:30:00'],
  [4, '王怡君', '立群電子', '0955111222', 'D223456782', '2026-11-03 09:00:00'],
  [5, '劉建志', '全盛包材', '0966777888', 'E123456783', '2026-11-03 14:00:00'],
  [6, '蔡宗翰', '德鑫自動化', '0977222333', 'F123456784', '2026-11-04 09:10:00'],
  [7, '張家豪', '宏昇精密', '0911888999', 'A123456789', '2026-11-04 08:55:00'],
].forEach((row) => insertVisitor.run(...row));

const insertPass = db.prepare('INSERT INTO visitor_passes (pass_no, is_active, note) VALUES (?, ?, ?)');
for (let i = 1; i <= 20; i++) {
  const passNo = 'V-' + String(i).padStart(2, '0');
  if (passNo === 'V-07') insertPass.run(passNo, 0, '2026-10 遺失');
  else insertPass.run(passNo, 1, null);
}
const passId = (no) => db.prepare('SELECT id FROM visitor_passes WHERE pass_no = ?').get(no).id;

// CR-01 appointments. Status 0 with a past date shows as "no-show".
const insertAppointment = db.prepare(`
  INSERT INTO appointments (id, employee_id, visitor_name, visitor_company, visitor_phone, visit_date,
                            expected_time, purpose, note, status, created_by, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
[
  [1, '李志明', '林國華', '鼎新模具', '0919555000', '2026-11-03', '14:00', '開會', null, 0, 'e1001', '2026-11-02 16:00:00', null],
  [2, '鄭大偉', '蔡宗翰', '德鑫自動化', '0977222333', '2026-11-04', '09:00', '維修', '沖床模具異音', 1, 'e1005', '2026-11-03 10:30:00', '2026-11-04 09:10:00'],
  [3, '李志明', '周志強', '冠宇科技', '0918222333', '2026-11-04', '10:00', '開會', null, 0, 'e1001', '2026-11-03 15:00:00', null],
  [4, '鄭大偉', '吳佩珊', '和泰工程', '0928444555', '2026-11-04', '14:00', '維修', null, 2, 'e1005', '2026-11-02 11:00:00', '2026-11-03 17:20:00'],
  [5, '黃美玲', '何美琪', '精達檢測', '0937666777', '2026-12-21', '10:00', '參觀', '供應商稽核', 0, 'e1002', '2026-11-04 11:00:00', null],
].forEach(([id, emp, name, company, phone, date, time, purpose, note, status, createdBy, createdAt, updatedAt]) => {
  insertAppointment.run(id, empId(emp), name, company, phone, date, time, purpose, note, status,
    userId(createdBy), createdAt, updatedAt);
});

// Old visits after conversion: checkout_recorded_at = check_out_at, no companion names
const insertVisit = db.prepare(`
  INSERT INTO visits (id, visitor_id, employee_id, purpose, companions, pass_id, appointment_id,
                      check_in_at, check_out_at, checkin_by, checkout_by, checkout_recorded_at,
                      note, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
[
  [1, 1, '李志明', '開會', 0, 'V-01', null, '2026-11-02 09:05:00', '2026-11-02 11:40:00', 'guard01', 'guard01'],
  [2, 2, '吳建國', '送貨', 0, 'V-02', null, '2026-11-02 10:20:00', '2026-11-02 10:45:00', 'guard01', 'guard01'],
  [3, 3, '鄭大偉', '維修', 1, 'V-03', null, '2026-11-02 13:30:00', null, 'guard02', null],
  [4, 4, '黃美玲', '開會', 2, 'V-01', null, '2026-11-03 09:00:00', '2026-11-03 12:10:00', 'guard01', 'guard02',
    '受訪人改為黃美玲', '2026-11-03 15:20:00'],
  [5, 5, '周雅婷', '參觀', 5, 'V-04', null, '2026-11-03 14:00:00', '2026-11-03 16:30:00', 'guard02', 'guard02'],
  [6, 7, '李志明', '開會', 0, 'V-05', null, '2026-11-04 08:55:00', null, 'guard01', null],
  [7, 6, '鄭大偉', '維修', 0, 'V-06', 2, '2026-11-04 09:10:00', null, 'guard01', null],
  [8, 2, '吳建國', '送貨', 0, 'V-02', null, '2026-11-04 09:30:00', '2026-11-04 09:50:00', 'guard01', 'guard01'],
].forEach(([id, visitorId, emp, purpose, comp, pass, apptId, inAt, outAt, inBy, outBy, note = null, updatedAt = null]) => {
  insertVisit.run(id, visitorId, empId(emp), purpose, comp, passId(pass), apptId, inAt, outAt,
    userId(inBy), outBy ? userId(outBy) : null, outAt, note, updatedAt);
});

db.exec('COMMIT');
db.close();
console.log('已建立 ' + DB_PATH);
