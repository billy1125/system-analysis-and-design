// CR-03 daily visitor overview (admin only)
//   FR-25: list everyone expected, on site or gone today, with a derived status (BR-08)
//   FR-26: export the same list as CSV, one row per person

const { getDb, now, today } = require('../lib/db');
const { FileResponse } = require('../lib/http');

// BR-08: none of these statuses is a column; all are derived.
// Appointments: only today's, and only booked or cancelled. A checked-in appointment
// is listed once, as its visit.
const APPOINTMENT_SQL = `
  SELECT a.id, a.status, a.expected_time, a.visitor_name, a.visitor_company, a.visitor_phone,
         e.name AS employee_name, e.department, e.extension
    FROM appointments a
    JOIN employees e ON e.id = a.employee_id
   WHERE a.visit_date = ? AND a.status IN (0, 2)
   ORDER BY a.expected_time ASC, a.id ASC
`;

// Visits: checked in today, still on site, or left today
const VISIT_SQL = `
  SELECT v.id, v.check_in_at, v.check_out_at, v.companions, v.appointment_id,
         a.expected_time,
         vi.name AS visitor_name, vi.company, vi.phone,
         e.name AS employee_name, e.department, e.extension,
         p.pass_no
    FROM visits v
    JOIN visitors vi ON vi.id = v.visitor_id
    JOIN employees e ON e.id = v.employee_id
    JOIN visitor_passes p ON p.id = v.pass_id
    LEFT JOIN appointments a ON a.id = v.appointment_id
   WHERE substr(v.check_in_at, 1, 10) = ?
      OR v.check_out_at IS NULL
      OR substr(v.check_out_at, 1, 10) = ?
   ORDER BY v.check_in_at ASC
`;

function visitStatus(v, day) {
  if (v.check_out_at !== null) return '已離廠';
  return v.check_in_at.slice(0, 10) === day ? '在廠' : '在廠（非今日報到）';
}

function buildOverview() {
  const db = getDb();
  const day = today();
  const namesOf = db.prepare('SELECT name FROM visit_companions WHERE visit_id = ? ORDER BY id');

  const appointments = db.prepare(APPOINTMENT_SQL).all(day).map((a) => ({
    status: a.status === 0 ? '預約中' : '已取消',
    expected_time: a.expected_time,
    visitor_name: a.visitor_name,
    company: a.visitor_company,
    phone: a.visitor_phone,
    employee_name: a.employee_name,
    department: a.department,
    extension: a.extension,
    check_in_at: null,
    check_out_at: null,
    pass_no: null,
    companions: 0,
    companion_names: [],
  }));

  const visits = db.prepare(VISIT_SQL).all(day, day).map((v) => ({
    status: visitStatus(v, day),
    expected_time: v.expected_time,
    visitor_name: v.visitor_name,
    company: v.company,
    phone: v.phone,
    employee_name: v.employee_name,
    department: v.department,
    extension: v.extension,
    check_in_at: v.check_in_at,
    check_out_at: v.check_out_at,
    pass_no: v.pass_no,
    companions: v.companions,
    companion_names: namesOf.all(v.id).map((c) => c.name),
  }));

  const rows = [...visits, ...appointments];
  const count = (status) => rows.filter((r) => r.status === status).length;
  const summary = {
    date: day,
    booked: count('預約中'),
    cancelled: count('已取消'),
    onsite: count('在廠'),
    onsite_earlier: count('在廠（非今日報到）'),
    left: count('已離廠'),
  };
  return { rows, summary };
}

// FR-25
function getOverview() {
  return buildOverview();
}

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return '"' + s.replace(/"/g, '""') + '"';
}

// FR-26: one row per person, visitor first and then each companion (report 11.3)
function exportOverview() {
  const { rows } = buildOverview();
  const header = ['狀態', '類別', '姓名', '公司', '手機', '受訪員工', '部門', '分機',
    '預計到達時間', '報到時間', '離廠時間', '訪客證'];
  const lines = [header];
  for (const r of rows) {
    const shared = [r.employee_name, r.department, r.extension,
      r.expected_time, r.check_in_at, r.check_out_at, r.pass_no];
    lines.push([r.status, '訪客', r.visitor_name, r.company, r.phone, ...shared]);
    for (const name of r.companion_names) lines.push([r.status, '隨行', name, r.company, '', ...shared]);
    // Old records only have a number (data conversion rule)
    if (r.companion_names.length === 0 && r.companions > 0) {
      lines.push([r.status, '隨行', `（未記錄姓名，共 ${r.companions} 人）`, r.company, '', ...shared]);
    }
  }

  // '2026-11-05 09:21:12' -> '20261105_0921'
  const stamp = now().replace(/-/g, '').replace(' ', '_').slice(0, 14).replace(':', '');
  const body = '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'; // BOM for Excel (NFR-08)
  return new FileResponse(`當日訪客總覽_${stamp}.csv`, 'text/csv; charset=utf-8', body);
}

module.exports = [
  { method: 'GET', path: '/api/overview', access: 'admin', handler: getOverview },
  { method: 'GET', path: '/api/overview/export', access: 'admin', handler: exportOverview },
];
