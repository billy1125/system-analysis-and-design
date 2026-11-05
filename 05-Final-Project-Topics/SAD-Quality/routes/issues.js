// FR-OPEN, FR-ISS, FR-QRY: open list, register, edit, assign, close, search.
// Any QC staff member may act on any issue, not only the one who registered it.

const { getDb, transaction, now } = require('../lib/db');
const { ISSUE_SELECT, isOpen, withDays, getIssue, nextIssueNo, checkIssueFields } = require('../lib/rules');
const { STATUSES, OPEN_STATUSES, text, fail, toId, isDate } = require('../lib/validate');

function allDepartments(db) {
  return db.prepare('SELECT id, name, contact, ext, is_active FROM departments ORDER BY id').all();
}

function allDefectTypes(db) {
  return db.prepare('SELECT id, name, is_active FROM defect_types ORDER BY id').all();
}

// ---------- UI-02 open list (FR-OPEN-01..03) ----------

function openList({ query }) {
  const db = getDb();
  const where = ["i.status IN ('待處理', '處理中')"];
  const args = [];
  const status = text(query.get('status'));
  if (OPEN_STATUSES.includes(status)) { where.push('i.status = ?'); args.push(status); }
  const deptId = toId(query.get('dept_id'));
  if (deptId) { where.push('i.dept_id = ?'); args.push(deptId); }
  const typeId = toId(query.get('defect_type_id'));
  if (typeId) { where.push('i.defect_type_id = ?'); args.push(typeId); }

  const rows = db.prepare(`${ISSUE_SELECT} WHERE ${where.join(' AND ')} ORDER BY i.found_at, i.id`)
    .all(...args).map(withDays);
  // The summary ignores the filters
  const summary = db.prepare(`
    SELECT SUM(status = '待處理') AS pending, SUM(status = '處理中') AS working FROM issues
  `).get();
  return {
    rows,
    summary: { pending: summary.pending || 0, working: summary.working || 0 },
    departments: allDepartments(db),
    defect_types: allDefectTypes(db),
  };
}

// ---------- UI-03 register (FR-ISS-01, 02) ----------

// Choices for the register form: active products and defect types only
function newForm() {
  const db = getDb();
  return {
    now: now().slice(0, 16),
    products: db.prepare('SELECT id, part_no, name FROM products WHERE is_active = 1 ORDER BY part_no').all(),
    defect_types: db.prepare('SELECT id, name FROM defect_types WHERE is_active = 1 ORDER BY id').all(),
  };
}

function createIssue({ body, user }) {
  const created = transaction((db) => {
    const t = now();
    const f = checkIssueFields(db, body, null, t);
    const issueNo = nextIssueNo(db);
    const result = db.prepare(`
      INSERT INTO issues (issue_no, found_at, reporter, line, station, product_id, lot_no, defect_type_id,
                          description, qty, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待處理', ?, ?)
    `).run(issueNo, f.found_at, f.reporter, f.line, f.station, f.product_id, f.lot_no, f.defect_type_id,
      f.description, f.qty, user.id, t);
    return { id: Number(result.lastInsertRowid), issueNo };
  });
  return { id: created.id, message: `已登記異常單 ${created.issueNo}` };
}

// ---------- UI-04 search (FR-QRY-01) ----------

function searchIssues({ query }) {
  const db = getDb();
  const where = [];
  const args = [];
  const from = text(query.get('from'));
  const to = text(query.get('to'));
  if (isDate(from) && isDate(to) && from > to) fail('起始日期不可晚於結束日期');
  if (isDate(from)) { where.push('substr(i.found_at, 1, 10) >= ?'); args.push(from); }
  if (isDate(to)) { where.push('substr(i.found_at, 1, 10) <= ?'); args.push(to); }
  const productId = toId(query.get('product_id'));
  if (productId) { where.push('i.product_id = ?'); args.push(productId); }
  const typeId = toId(query.get('defect_type_id'));
  if (typeId) { where.push('i.defect_type_id = ?'); args.push(typeId); }
  const deptId = toId(query.get('dept_id'));
  if (deptId) { where.push('i.dept_id = ?'); args.push(deptId); }
  const status = text(query.get('status'));
  if (STATUSES.includes(status)) { where.push('i.status = ?'); args.push(status); }
  const keyword = text(query.get('keyword'));
  if (keyword) { where.push('instr(i.description, ?) > 0'); args.push(keyword); }

  const sql = `${ISSUE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.found_at DESC, i.id DESC`;
  return {
    rows: db.prepare(sql).all(...args).map(withDays),
    products: db.prepare('SELECT id, part_no, name, is_active FROM products ORDER BY part_no').all(),
    defect_types: allDefectTypes(db),
    departments: allDepartments(db),
  };
}

// ---------- UI-05 detail (FR-QRY-02) ----------

function issueDetail({ params }) {
  const db = getDb();
  const issue = withDays(getIssue(db, toId(params.id)));
  if (!isOpen(issue)) return { issue };
  // Choices for the edit and assign forms. The current product and type stay even if disabled.
  return {
    issue,
    now: now().slice(0, 16),
    products: db.prepare('SELECT id, part_no, name FROM products WHERE is_active = 1 OR id = ? ORDER BY part_no')
      .all(issue.product_id),
    defect_types: db.prepare('SELECT id, name FROM defect_types WHERE is_active = 1 OR id = ? ORDER BY id')
      .all(issue.defect_type_id),
    departments: db.prepare('SELECT id, name, contact, ext FROM departments WHERE is_active = 1 ORDER BY id').all(),
  };
}

// ---------- UI-05 actions (FR-ISS-03..07) ----------

// Spec 7.1 steps 1-2, then 3-17
function updateIssue({ params, body }) {
  return transaction((db) => {
    const issue = getIssue(db, toId(params.id));
    if (!isOpen(issue)) fail('這張異常單已結案或判定不成立，不能修改');
    const t = now();
    const f = checkIssueFields(db, body, issue, t);
    db.prepare(`
      UPDATE issues SET found_at = ?, reporter = ?, line = ?, station = ?, product_id = ?, lot_no = ?,
                        defect_type_id = ?, description = ?, qty = ?, updated_at = ?
       WHERE id = ?
    `).run(f.found_at, f.reporter, f.line, f.station, f.product_id, f.lot_no, f.defect_type_id,
      f.description, f.qty, t, issue.id);
    return { message: '已儲存異常單' };
  });
}

// Spec 7.2. Reassigning overwrites the previous department, assigner and time.
function assignIssue({ params, body, user }) {
  return transaction((db) => {
    const issue = getIssue(db, toId(params.id));
    if (!isOpen(issue)) fail('這張異常單已結案或判定不成立，不能指派');
    const deptId = toId(body.dept_id);
    const dept = deptId && db.prepare('SELECT id, name, is_active FROM departments WHERE id = ?').get(deptId);
    if (!dept) fail('請選擇責任單位');
    if (!dept.is_active) fail(`責任單位「${dept.name}」已停用，請重新選擇`);
    const reassign = issue.status === '處理中';
    if (reassign && issue.dept_id === dept.id) fail('責任單位沒有變更');
    db.prepare(`
      UPDATE issues SET status = '處理中', dept_id = ?, assigned_by = ?, assigned_at = ? WHERE id = ?
    `).run(dept.id, user.id, now(), issue.id);
    return { message: `已${reassign ? '改派' : '指派'}給 ${dept.name}` };
  });
}

// Spec 7.3, close with a countermeasure
function closeIssue({ params, body, user }) {
  return transaction((db) => {
    const issue = getIssue(db, toId(params.id));
    if (issue.status !== '處理中') fail('只有處理中的異常單可以結案');
    const resolution = text(body.resolution);
    if (!resolution) fail('請輸入處理對策');
    if (resolution.length > 200) fail('處理對策不可超過 200 字');
    db.prepare(`
      UPDATE issues SET status = '已結案', resolution = ?, closed_by = ?, closed_at = ? WHERE id = ?
    `).run(resolution, user.id, now(), issue.id);
    return { message: `已結案 ${issue.issue_no}` };
  });
}

// Spec 7.3, not a real issue. The department and assignment stay as they were.
function rejectIssue({ params, body, user }) {
  return transaction((db) => {
    const issue = getIssue(db, toId(params.id));
    if (!isOpen(issue)) fail('這張異常單已結案或判定不成立');
    const reason = text(body.resolution);
    if (!reason) fail('請輸入不成立的理由');
    if (reason.length > 200) fail('不成立的理由不可超過 200 字');
    db.prepare(`
      UPDATE issues SET status = '不成立', resolution = ?, closed_by = ?, closed_at = ? WHERE id = ?
    `).run(reason, user.id, now(), issue.id);
    return { message: `已判定 ${issue.issue_no} 不成立` };
  });
}

module.exports = [
  { method: 'GET', path: '/api/issues/open', access: 'login', handler: openList },
  { method: 'GET', path: '/api/issues/new-form', access: 'login', handler: newForm },
  { method: 'GET', path: '/api/issues', access: 'login', handler: searchIssues },
  { method: 'POST', path: '/api/issues', access: 'login', handler: createIssue },
  { method: 'GET', path: '/api/issues/:id', access: 'login', handler: issueDetail },
  { method: 'PUT', path: '/api/issues/:id', access: 'login', handler: updateIssue },
  { method: 'PUT', path: '/api/issues/:id/assign', access: 'login', handler: assignIssue },
  { method: 'PUT', path: '/api/issues/:id/close', access: 'login', handler: closeIssue },
  { method: 'PUT', path: '/api/issues/:id/reject', access: 'login', handler: rejectIssue },
];
