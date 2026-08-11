from flask import (Blueprint, flash, redirect, render_template,
                   request, session, url_for)

import db
from utils import _is_usable, login_required

repair_bp = Blueprint('repair', __name__, url_prefix='/repair')

_PAGE_SIZE = 10

CATEGORY_LABELS = {
    'water':     '給排水',
    'electric':  '電力照明',
    'furniture': '家具修繕',
    'network':   '網路',
    'aircon':    '空調',
    'door':      '門窗鎖具',
    'other':     '其他',
}

PRIORITY_LABELS = {
    'low':    '低',
    'normal': '一般',
    'high':   '高',
    'urgent': '緊急',
}

STATUS_LABELS = {
    'pending':     '待受理',
    'assigned':    '已派工',
    'in_progress': '處理中',
    'completed':   '已完成',
    'rejected':    '已退件',
    'cancelled':   '已取消',
}

LOG_TYPE_LABELS = {
    'report':  '申報內容',
    'comment': '回覆',
    'status':  '狀態異動',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _current_user():
    """從 session 取得目前登入的使用者。"""
    return db.find_user_by_id(session['user_id'])


def _is_admin(user):
    """role == 0 為管理員。"""
    return user is not None and user['role'] == 0


def _can_view(user, req):
    """資料範圍權限：申報人本人或管理員才能檢視這張報修單。

    內容公開的系統只需要分「能不能寫」；報修單帶著房號與電話，權限還要
    再分「能不能看」——同樣
    是登入中的合法使用者，看得到的資料範圍不同。這種 row-level 的權限
    無法用「路由能不能進」表達，必須逐筆比對。
    """
    return user is not None and req is not None and (
        req['requester_id'] == user['id'] or _is_admin(user)
    )


def _validate_request_form(form):
    """驗證報修表單，回傳第一個錯誤訊息或 None。"""
    if not form.get('title'):
        return '請輸入報修標題'
    if not form.get('description'):
        return '請描述故障情形'
    if not form.get('dorm_building'):
        return '請輸入宿舍棟別'
    if not form.get('room_no'):
        return '請輸入房號'
    if form.get('category') not in db.CATEGORIES:
        return '維修類別不正確'
    if form.get('priority') not in db.PRIORITIES:
        return '優先等級不正確'
    return None


_FORM_FIELDS = ('title', 'description', 'dorm_building', 'room_no',
                'contact_phone', 'category', 'priority')


# ── 我的報修單 ────────────────────────────────────────────────────────────────

@repair_bp.route('/', strict_slashes=False)
@login_required
def index():
    """我的報修單：只列出自己申報的，?status= 篩選、?page= 分頁。

    管理員在這裡看到的一樣只有自己申報的單。要看全部請到 /repair/manage
    ——兩個視角刻意分成兩條路由，而不是在同一頁用一個開關切換。理由是
    「我的報修單」與「全部報修單」的欄位、操作與心智模型都不同，混在
    一起會讓管理員分不清自己現在是住戶還是管理者。
    """
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))

    status = request.args.get('status', 'all')
    if status != 'all' and status not in db.REQUEST_STATUSES:
        status = 'all'
    page = request.args.get('page', 1, type=int) or 1

    requests, total = db.list_my_requests(user['id'], page, _PAGE_SIZE, status)
    total_pages     = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    return render_template(
        'repair/index.html',
        user=user,
        requests=requests,
        total=total,
        page=page,
        total_pages=total_pages,
        status=status,
        status_labels=STATUS_LABELS,
        category_labels=CATEGORY_LABELS,
        priority_labels=PRIORITY_LABELS,
    )


# ── 新增報修單 ────────────────────────────────────────────────────────────────

@repair_bp.route('/new', methods=['GET', 'POST'])
@login_required
def new_request():
    """申報報修：GET 顯示表單（以個人資料預填地點），POST 建立報修單。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))

    error = None
    form  = {
        'title':         '',
        'description':   '',
        'dorm_building': user['dorm_building'] or '',
        'room_no':       user['room_no'] or '',
        'contact_phone': user['phone'] or '',
        'category':      'other',
        'priority':      'normal',
    }

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _FORM_FIELDS}
        error = _validate_request_form(form)
        if not error:
            request_id = db.create_request(
                requester_id  = user['id'],
                title         = form['title'],
                category      = form['category'],
                priority      = form['priority'],
                dorm_building = form['dorm_building'],
                room_no       = form['room_no'],
                contact_phone = form['contact_phone'] or None,
                description   = form['description'],
            )
            flash('報修單已送出', 'success')
            return redirect(url_for('repair.detail', request_id=request_id))

    return render_template(
        'repair/request_form.html',
        user=user, form=form, error=error, mode='new', req=None,
        category_labels=CATEGORY_LABELS,
        priority_labels=PRIORITY_LABELS,
    )


# ── 報修單詳細 ────────────────────────────────────────────────────────────────

@repair_bp.route('/<int:request_id>')
@login_required
def detail(request_id):
    """報修單詳細：基本資料 + 處理歷程時間軸 + 可執行的操作。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))

    req = db.get_request(request_id)
    if not req or req['is_deleted']:
        flash('報修單不存在或已刪除', 'error')
        return redirect(url_for('repair.index'))
    if not _can_view(user, req):
        flash('無權限檢視此報修單', 'error')
        return redirect(url_for('repair.index'))

    logs      = db.list_logs(request_id)
    assignees = db.list_active_admins() if _is_admin(user) else []

    return render_template(
        'repair/detail.html',
        user=user, req=req, logs=logs, assignees=assignees,
        is_admin=_is_admin(user),
        is_requester=(req['requester_id'] == user['id']),
        closed_statuses=db.CLOSED_STATUSES,
        status_labels=STATUS_LABELS,
        category_labels=CATEGORY_LABELS,
        priority_labels=PRIORITY_LABELS,
        log_type_labels=LOG_TYPE_LABELS,
    )


# ── 修改報修單 ────────────────────────────────────────────────────────────────

@repair_bp.route('/<int:request_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_request(request_id):
    """修改報修單：限申報人本人，且限「待受理」狀態。

    一旦派工，內容就成為維修人員已經讀過並據以準備的依據，此時再改標題
    或地點會讓兩邊對不上。要補充資訊請改用回覆（`/comment`），它會留下
    時間與作者，不會覆蓋原本的敘述。
    """
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))

    req = db.get_request(request_id)
    if not req or req['is_deleted']:
        flash('報修單不存在或已刪除', 'error')
        return redirect(url_for('repair.index'))
    if req['requester_id'] != user['id']:
        flash('無權限修改此報修單', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))
    if req['request_status'] != 'pending':
        flash('只有待受理的報修單可以修改', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))

    error = None

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _FORM_FIELDS}
        error = _validate_request_form(form)
        if not error:
            db.update_request(
                request_id    = request_id,
                user_id       = user['id'],
                title         = form['title'],
                category      = form['category'],
                priority      = form['priority'],
                dorm_building = form['dorm_building'],
                room_no       = form['room_no'],
                contact_phone = form['contact_phone'] or None,
                description   = form['description'],
            )
            flash('報修單已更新', 'success')
            return redirect(url_for('repair.detail', request_id=request_id))
    else:
        report = db.get_report_log(request_id)
        form   = {
            'title':         req['title'],
            'description':   report['content'] if report else '',
            'dorm_building': req['dorm_building'],
            'room_no':       req['room_no'],
            'contact_phone': req['contact_phone'] or '',
            'category':      req['category'],
            'priority':      req['priority'],
        }

    return render_template(
        'repair/request_form.html',
        user=user, form=form, error=error, mode='edit', req=req,
        category_labels=CATEGORY_LABELS,
        priority_labels=PRIORITY_LABELS,
    )


# ── 回覆 ──────────────────────────────────────────────────────────────────────

@repair_bp.route('/<int:request_id>/comment', methods=['POST'])
@login_required
def add_comment(request_id):
    """新增一則回覆。申報人與管理員皆可，已結案的單不可再回覆。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))

    req = db.get_request(request_id)
    if not req or req['is_deleted']:
        flash('報修單不存在或已刪除', 'error')
        return redirect(url_for('repair.index'))
    if not _can_view(user, req):
        flash('無權限檢視此報修單', 'error')
        return redirect(url_for('repair.index'))
    if req['request_status'] in db.CLOSED_STATUSES:
        flash('此報修單已結案，無法新增回覆', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))

    content = request.form.get('content', '').strip()
    if not content:
        flash('請輸入回覆內容', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))

    db.create_log(request_id, user['id'], content, 'comment')
    flash('已新增回覆', 'success')
    return redirect(url_for('repair.detail', request_id=request_id))


# ── 取消報修 ──────────────────────────────────────────────────────────────────

@repair_bp.route('/<int:request_id>/cancel', methods=['POST'])
@login_required
def cancel(request_id):
    """取消報修：限申報人本人，限「待受理」或「已派工」狀態。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))

    req = db.get_request(request_id)
    if not req or req['is_deleted']:
        flash('報修單不存在或已刪除', 'error')
        return redirect(url_for('repair.index'))
    if req['requester_id'] != user['id']:
        flash('無權限取消此報修單', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))

    if db.cancel_request(request_id, user['id']):
        flash('報修單已取消', 'success')
    else:
        flash('無法取消此報修單（狀態不符）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))


# ── 管理清單 ──────────────────────────────────────────────────────────────────

@repair_bp.route('/manage', strict_slashes=False)
@login_required
def manage():
    """管理清單（管理員）：全部報修單，?status= ?q= ?page= 可組合。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))

    status = request.args.get('status', 'all')
    if status != 'all' and status not in db.REQUEST_STATUSES:
        status = 'all'
    keyword = request.args.get('q', '').strip()
    page    = request.args.get('page', 1, type=int) or 1

    requests, total = db.list_all_requests(page, _PAGE_SIZE, status, keyword or None)
    total_pages     = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    return render_template(
        'repair/manage.html',
        user=user,
        requests=requests,
        total=total,
        page=page,
        total_pages=total_pages,
        status=status,
        keyword=keyword,
        counts=db.count_by_status(),
        status_labels=STATUS_LABELS,
        category_labels=CATEGORY_LABELS,
        priority_labels=PRIORITY_LABELS,
    )


# ── 管理員操作 ────────────────────────────────────────────────────────────────
#
# 以下六條路由的開頭都是同一組三層檢查，明碼重複寫出，不抽象成裝飾器。
# 理由與 admin 子系統相同：讀者從任一路由的前幾行就能讀出完整的守門條件。

@repair_bp.route('/<int:request_id>/assign', methods=['POST'])
@login_required
def assign(request_id):
    """派工：pending → assigned。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))

    assignee_id = request.form.get('assignee_id', type=int)
    note        = request.form.get('note', '').strip() or None

    if not assignee_id:
        flash('請選擇承辦人', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))

    if db.assign_request(request_id, user['id'], assignee_id, note):
        flash('已完成派工', 'success')
    else:
        flash('派工失敗（報修單狀態不符，或承辦人不是啟用中的管理員）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))


@repair_bp.route('/<int:request_id>/start', methods=['POST'])
@login_required
def start(request_id):
    """開始處理：assigned → in_progress。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))

    note = request.form.get('note', '').strip() or None
    if db.start_request(request_id, user['id'], note):
        flash('已開始處理', 'success')
    else:
        flash('無法開始處理（報修單狀態不符）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))


@repair_bp.route('/<int:request_id>/complete', methods=['POST'])
@login_required
def complete(request_id):
    """完成修繕：in_progress → completed。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))

    note = request.form.get('note', '').strip() or None
    if db.complete_request(request_id, user['id'], note):
        flash('已登記完成', 'success')
    else:
        flash('無法登記完成（報修單狀態不符）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))


@repair_bp.route('/<int:request_id>/reject', methods=['POST'])
@login_required
def reject(request_id):
    """退件：pending → rejected。退件原因為必填。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))

    reason = request.form.get('note', '').strip()
    if not reason:
        flash('請填寫退件原因', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))

    if db.reject_request(request_id, user['id'], reason):
        flash('報修單已退件', 'success')
    else:
        flash('無法退件（報修單狀態不符）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))


@repair_bp.route('/<int:request_id>/reopen', methods=['POST'])
@login_required
def reopen(request_id):
    """重新開啟：completed → pending。原因為必填。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))

    reason = request.form.get('note', '').strip()
    if not reason:
        flash('請填寫重新開啟的原因', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))

    if db.reopen_request(request_id, user['id'], reason):
        flash('報修單已重新開啟', 'success')
    else:
        flash('無法重新開啟（報修單狀態不符）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))


@repair_bp.route('/<int:request_id>/delete', methods=['POST'])
@login_required
def delete(request_id):
    """刪除報修單（軟刪除，管理員專用）。連同其所有處理紀錄一併標記。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))

    req = db.get_request(request_id)
    if not req or req['is_deleted']:
        flash('報修單不存在或已刪除', 'error')
        return redirect(url_for('repair.manage'))

    db.soft_delete_request(request_id)
    flash('報修單已刪除', 'success')
    return redirect(url_for('repair.manage'))
