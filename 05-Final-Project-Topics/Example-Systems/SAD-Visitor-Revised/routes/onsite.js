// FR-OUT: on-site visitor list, check-out, late check-out (CR-02-2)

const { getDb, transaction, now, today } = require('../lib/db');
const { UserError } = require('../lib/http');
const { text, fail, toId } = require('../lib/validate');

// "On site" is not a column: it means check_out_at IS NULL.
// "Today" is not a column either: it compares the check-in date with today (CR-02-1).
const ONSITE_SQL = `
  SELECT v.id, v.check_in_at, v.companions,
         substr(v.check_in_at, 1, 10) = ? AS is_today,
         vi.name AS visitor_name, vi.company, vi.phone,
         e.name AS employee_name, e.department, e.extension,
         p.pass_no
    FROM visits v
    JOIN visitors vi ON vi.id = v.visitor_id
    JOIN employees e ON e.id = v.employee_id
    JOIN visitor_passes p ON p.id = v.pass_id
   WHERE v.check_out_at IS NULL
   ORDER BY v.check_in_at ASC
`;

function listOnsite() {
  const rows = getDb().prepare(ONSITE_SQL).all(today());
  const summary = {
    today_count: rows.filter((r) => r.is_today).length,
    earlier_count: rows.filter((r) => !r.is_today).length,
    companion_count: rows.reduce((sum, r) => sum + r.companions, 0),
  };
  return { rows, summary };
}

function loadOnsiteVisit(db, id) {
  const visit = db.prepare(`
    SELECT v.id, v.check_in_at, v.check_out_at, vi.name AS visitor_name
      FROM visits v JOIN visitors vi ON vi.id = v.visitor_id
     WHERE v.id = ?
  `).get(id);
  if (!visit) throw new UserError('找不到這筆來訪紀錄', 404);
  if (visit.check_out_at !== null) fail('此筆來訪已登記離廠');
  return visit;
}

// FR-12: normal check-out, leave time and recorded time are both now
function checkOut({ params, user }) {
  return transaction((db) => {
    const visit = loadOnsiteVisit(db, toId(params.id));
    const time = now();
    db.prepare(`
      UPDATE visits SET check_out_at = ?, checkout_by = ?, checkout_recorded_at = ? WHERE id = ?
    `).run(time, user.id, time, visit.id);
    return { message: `已登記 ${visit.visitor_name} 離廠` };
  });
}

// FR-24: late check-out with the actual leave time and a reason (BR-03, BR-04)
function lateCheckOut({ params, body, user }) {
  return transaction((db) => {
    const visit = loadOnsiteVisit(db, toId(params.id));

    // Accept 'YYYY-MM-DDTHH:MM' (from <input type="datetime-local">) or 'YYYY-MM-DD HH:MM'
    const raw = text(body.check_out_at).replace('T', ' ');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)) fail('請輸入實際離廠時間');
    const leaveAt = raw.length === 16 ? raw + ':00' : raw;
    const time = now();
    if (leaveAt <= visit.check_in_at || leaveAt > time) fail('離廠時間須晚於報到時間，且不得晚於現在');

    const reason = text(body.reason);
    if (!reason) fail('請輸入補登原因');
    if (reason.length > 100) fail('補登原因不可超過 100 字');

    db.prepare(`
      UPDATE visits
         SET check_out_at = ?, checkout_by = ?, checkout_recorded_at = ?, checkout_reason = ?
       WHERE id = ?
    `).run(leaveAt, user.id, time, reason, visit.id);
    return { message: `已補登 ${visit.visitor_name} 離廠` };
  });
}

module.exports = [
  { method: 'GET', path: '/api/onsite', access: 'staff', handler: listOnsite },
  { method: 'POST', path: '/api/visits/:id/checkout', access: 'staff', handler: checkOut },
  { method: 'POST', path: '/api/visits/:id/late-checkout', access: 'staff', handler: lateCheckOut },
];
