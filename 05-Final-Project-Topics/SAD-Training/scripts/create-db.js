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

const SEED_PASSWORD = 'train1234';
const CREATED_AT = '2026-07-01 08:00:00';

// 'YYYY-MM-DD' minus one day
function dayBefore(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d - 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

db.exec('BEGIN');

const insertEmployee = db.prepare(`
  INSERT INTO employees (id, emp_no, password_hash, name, department, job_title, hire_date, role, is_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
[
  [1, 'E1001', '林雅雯', '管理部', '人資專員', '2019-03-01', 0, 1],
  [2, 'E1002', '陳志豪', '管理部', '人資課長', '2015-06-01', 0, 1],
  [3, 'E2001', '王建民', '製造部', '組長', '2012-08-01', 1, 1],
  [4, 'E2002', '李宗翰', '製造部', '作業員', '2021-02-15', 1, 1],
  [5, 'E2003', '張雅琪', '製造部', '作業員', '2023-05-02', 1, 1],
  [6, 'E2004', '黃俊傑', '製造部', '堆高機操作員', '2020-11-09', 1, 1],
  [7, 'E2005', '許志偉', '製造部', '作業員', '2022-04-06', 1, 0],
  [8, 'E3001', '劉家銘', '倉儲課', '堆高機操作員', '2018-01-08', 1, 1],
  [9, 'E3002', '蔡明哲', '倉儲課', '倉管員', '2024-07-01', 1, 1],
  [10, 'E4001', '鄭淑惠', '品保部', '品管員', '2017-09-18', 1, 1],
  [11, 'E4002', '謝東霖', '品保部', '內部稽核員', '2016-03-21', 1, 1],
].forEach(([id, empNo, name, dept, title, hired, role, active]) => {
  insertEmployee.run(id, empNo, hashPassword(SEED_PASSWORD), name, dept, title, hired, role, active, CREATED_AT);
});

const insertCourse = db.prepare(`
  INSERT INTO courses (id, course_no, name, category, hours, is_active) VALUES (?, ?, ?, ?, ?, ?)
`);
[
  [1, 'TR-101', '堆高機操作安全訓練', '法規', 3, 1],
  [2, 'TR-102', '急救人員訓練', '法規', 3, 1],
  [3, 'TR-103', '消防安全與緊急應變訓練', '法規', 2, 1],
  [4, 'TR-201', 'ISO 9001 內部稽核員訓練', '客戶要求', 6, 1],
  [5, 'TR-301', '數控車床操作訓練', '內部', 4, 1],
  [6, 'TR-302', '5S 現場管理', '內部', 2, 0],
].forEach((row) => insertCourse.run(...row));

// [id, course id, date, start, end, location, instructor, capacity, status, created by]
const sessions = [
  [1, 3, '2026-08-20', '14:00', '16:00', '廠區集合點', '外聘講師（消防安全顧問）', 40, '截止報名', 1],
  [2, 1, '2026-09-10', '09:00', '12:00', '成品倉庫', '外聘講師（堆高機訓練機構）', 10, '截止報名', 1],
  [3, 4, '2026-10-15', '09:00', '16:00', '2F 會議室', '外聘講師（驗證機構）', 15, '截止報名', 2],
  [4, 5, '2026-10-28', '13:00', '17:00', '車床區', '王建民', 8, '截止報名', 1],
  [5, 3, '2027-01-13', '14:00', '16:00', '廠區集合點', '外聘講師（消防安全顧問）', 40, '開放報名', 1],
  [6, 1, '2027-01-20', '09:00', '12:00', '成品倉庫', '外聘講師（堆高機訓練機構）', 3, '開放報名', 1],
  [7, 2, '2027-01-27', '09:00', '12:00', '2F 訓練教室', '外聘講師（急救訓練機構）', 12, '已取消', 1],
  [8, 4, '2027-02-24', '09:00', '16:00', '2F 會議室', '外聘講師（驗證機構）', 15, '開放報名', 2],
];

// [id, session, employee, result, enrolled at, enrolled by, note]
const enrollments = [
  [1, 1, 3, '已完成', '2026-08-10 09:12', 3],
  [2, 1, 4, '已完成', '2026-08-10 09:30', 4],
  [3, 1, 5, '未完成', '2026-08-11 14:02', 5, '當天請假'],
  [4, 1, 6, '已完成', '2026-08-12 08:45', 1],
  [5, 1, 8, '已完成', '2026-08-12 08:46', 1],
  [6, 1, 10, '已完成', '2026-08-13 11:20', 10],
  [7, 1, 7, '已完成', '2026-08-14 09:05', 1],
  [8, 2, 8, '已完成', '2026-09-01 10:30', 1],
  [9, 2, 6, '未完成', '2026-09-01 10:31', 1, '當天請假'],
  [10, 3, 10, '已完成', '2026-10-02 13:15', 10, '測驗未達 70 分，10/22 補考通過'],
  [11, 3, 11, '已完成', '2026-10-02 14:20', 11],
  [12, 3, 3, '未完成', '2026-10-05 09:00', 2, '測驗未達 70 分'],
  [13, 3, 4, '已完成', '2026-10-05 09:01', 2],
  [14, 4, 5, '已完成', '2026-10-20 12:10', 5],
  [15, 4, 4, '已完成', '2026-10-21 08:40', 1],
  [16, 5, 5, '已報名', '2026-11-02 12:05', 5],
  [17, 5, 9, '已報名', '2026-11-03 10:15', 1],
  [18, 6, 6, '已報名', '2026-10-05 10:00', 1],
  [19, 6, 9, '已報名', '2026-10-06 09:30', 1],
  [20, 6, 3, '已報名', '2026-10-06 09:35', 1],
  [21, 7, 10, '已報名', '2026-10-08 16:00', 10],
  [22, 8, 3, '已報名', '2026-10-16 09:00', 2],
];

const insertSession = db.prepare(`
  INSERT INTO sessions (id, course_id, session_date, start_time, end_time, location, instructor,
                        capacity, status, created_by, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const [id, courseId, date, start, end, place, teacher, cap, status, by] of sessions) {
  // created_at: the day before the earliest sign-up, 09:00
  const first = enrollments.filter((e) => e[1] === id).map((e) => e[4]).sort()[0];
  const createdAt = `${dayBefore(first.slice(0, 10))} 09:00:00`;
  let updatedAt = null;
  if (id <= 4) updatedAt = `${dayBefore(date)} 17:00:00`; // closed the day before class
  if (id === 7) updatedAt = '2026-11-01 14:00:00'; // cancelled
  insertSession.run(id, courseId, date, start, end, place, teacher, cap, status, by, createdAt, updatedAt);
}

const insertEnrollment = db.prepare(`
  INSERT INTO enrollments (id, session_id, employee_id, status, enrolled_at, enrolled_by, note, result_by, result_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const [id, sessionId, empId, result, at, by, note = null] of enrollments) {
  let resultBy = null;
  let resultAt = null;
  if (result !== '已報名') {
    const date = sessions.find((s) => s[0] === sessionId)[2];
    resultBy = sessionId === 3 ? 2 : 1;
    resultAt = id === 10 ? '2026-10-22 10:05:00' : `${date} 17:30:00`;
  }
  insertEnrollment.run(id, sessionId, empId, result, `${at}:00`, by, note, resultBy, resultAt);
}

db.exec('COMMIT');
db.close();
console.log('已建立 ' + DB_PATH);
