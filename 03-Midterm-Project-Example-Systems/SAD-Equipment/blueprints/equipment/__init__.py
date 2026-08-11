from datetime import datetime

from flask import Blueprint, flash, redirect, render_template, request, session, url_for

import db
from utils import _is_usable, login_required

equipment_bp = Blueprint('equipment', __name__, url_prefix='/equipment')

_PAGE_SIZE = 10


# ── Helpers ───────────────────────────────────────────────────────────────────

def _current_user():
    """回傳目前登入且帳號有效的使用者；訪客與失效帳號皆回傳 None。

    器材清單開放訪客瀏覽，因此權限檢查的第 1、2 層收斂於此
    （見 rules/flask-blueprint.md「開放瀏覽的子系統」）。
    """
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None


def _is_admin(user):
    """role == 0 為管理員。"""
    return user is not None and user['role'] == 0


def _normalize_dt(s):
    """將表單 datetime string 正規化為 'YYYY-MM-DD HH:MM:SS'。"""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).strftime('%Y-%m-%d %H:%M:%S')
    except ValueError:
        return None


def _fmt_dt_for_input(s):
    """將 DB datetime string 轉為 datetime-local input 格式 (YYYY-MM-DDTHH:MM)。"""
    if not s:
        return ''
    return s[:16].replace(' ', 'T')


STATUS_LABELS = {
    'available':   '可借用',
    'unavailable': '暫停借用',
    'maintenance': '維修中',
}

ORDER_STATUS_LABELS = {
    'pending':   '待審核',
    'approved':  '已核准',
    'rejected':  '已拒絕',
    'borrowed':  '已借出',
    'returned':  '已歸還',
    'cancelled': '已取消',
    'overdue':   '逾期未還',
}


# ── 器材主頁 ──────────────────────────────────────────────────────────────────

@equipment_bp.route('/', strict_slashes=False)
def index():
    """器材主頁：左側器材清單（分頁）+ 右側器材詳細與借用申請入口。訪客可瀏覽。"""
    page         = request.args.get('page', 1, type=int) or 1
    equipment_id = request.args.get('id', type=int)
    user         = _current_user()

    equipments, total = db.list_equipment(page=page, page_size=_PAGE_SIZE)
    total_pages       = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    selected = None
    if equipment_id:
        selected = db.get_equipment(equipment_id)

    return render_template(
        'equipment/index.html',
        equipments=equipments,
        total=total,
        page=page,
        total_pages=total_pages,
        selected=selected,
        user=user,
        status_labels=STATUS_LABELS,
        order_status_labels=ORDER_STATUS_LABELS,
    )


# ── 器材管理（管理員） ─────────────────────────────────────────────────────────

@equipment_bp.route('/new', methods=['GET', 'POST'])
@login_required
def new_equipment():
    """管理員新增器材。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('equipment.index'))

    _blank = {
        'equipment_name': '', 'equipment_code': '', 'equipment_description': '',
        'total_quantity': '', 'available_quantity': '', 'equipment_status': 'available',
    }
    error = None
    form  = _blank.copy()

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _blank}
        error = _validate_equipment_form(form)
        if not error:
            db.create_equipment(
                name          = form['equipment_name'],
                code          = form['equipment_code'],
                description   = form['equipment_description'] or None,
                total_qty     = int(form['total_quantity']),
                available_qty = int(form['available_quantity']),
                status        = form['equipment_status'],
            )
            flash('器材已新增', 'success')
            return redirect(url_for('equipment.index'))

    return render_template(
        'equipment/equipment_form.html',
        user=user, form=form, error=error, mode='new',
    )


@equipment_bp.route('/edit/<int:equipment_id>', methods=['GET', 'POST'])
@login_required
def edit_equipment(equipment_id):
    """管理員修改器材。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('equipment.index'))

    eq = db.get_equipment(equipment_id)
    if not eq:
        flash('器材不存在', 'error')
        return redirect(url_for('equipment.index'))

    error = None

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in [
            'equipment_name', 'equipment_code', 'equipment_description',
            'total_quantity', 'available_quantity', 'equipment_status',
        ]}
        error = _validate_equipment_form(form)
        if not error:
            db.update_equipment(
                equipment_id  = equipment_id,
                name          = form['equipment_name'],
                code          = form['equipment_code'],
                description   = form['equipment_description'] or None,
                total_qty     = int(form['total_quantity']),
                available_qty = int(form['available_quantity']),
                status        = form['equipment_status'],
            )
            flash('器材已更新', 'success')
            return redirect(url_for('equipment.index', id=equipment_id))

        return render_template(
            'equipment/equipment_form.html',
            user=user, form=form, error=error, mode='edit', equipment=eq,
        )

    form = {
        'equipment_name':        eq['equipment_name'],
        'equipment_code':        eq['equipment_code'],
        'equipment_description': eq['equipment_description'] or '',
        'total_quantity':        str(eq['total_quantity']),
        'available_quantity':    str(eq['available_quantity']),
        'equipment_status':      eq['equipment_status'],
    }
    return render_template(
        'equipment/equipment_form.html',
        user=user, form=form, error=None, mode='edit', equipment=eq,
    )


@equipment_bp.route('/delete/<int:equipment_id>', methods=['POST'])
@login_required
def delete_equipment(equipment_id):
    """管理員刪除器材（邏輯刪除）。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('equipment.index'))

    eq = db.get_equipment(equipment_id)
    if not eq:
        flash('器材不存在', 'error')
        return redirect(url_for('equipment.index'))

    db.soft_delete_equipment(equipment_id)
    flash('器材已刪除', 'success')
    return redirect(url_for('equipment.index'))


# ── 借用申請 ──────────────────────────────────────────────────────────────────

@equipment_bp.route('/<int:equipment_id>/borrow', methods=['GET', 'POST'])
@login_required
def borrow(equipment_id):
    """送出借用申請（單項器材）。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    eq = db.get_equipment(equipment_id)
    if not eq:
        flash('器材不存在', 'error')
        return redirect(url_for('equipment.index'))
    if eq['equipment_status'] != 'available':
        flash('此器材目前無法借用', 'error')
        return redirect(url_for('equipment.index', id=equipment_id))

    _blank = {
        'borrow_start_at': '', 'borrow_end_at': '',
        'borrow_reason': '', 'quantity': '1',
    }
    error = None
    form  = _blank.copy()

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _blank}
        error = _validate_borrow_form(form, eq['available_quantity'])
        if not error:
            order_id = db.create_borrow_order(
                borrower_id = user['id'],
                start_at    = _normalize_dt(form['borrow_start_at']),
                end_at      = _normalize_dt(form['borrow_end_at']),
                reason      = form['borrow_reason'],
                items       = [(equipment_id, int(form['quantity']))],
            )
            flash('借用申請已送出', 'success')
            return redirect(url_for('equipment.order_detail', order_id=order_id))

    return render_template(
        'equipment/borrow_form.html',
        user=user, equipment=eq, form=form, error=error,
        status_labels=STATUS_LABELS,
    )


# ── 我的借用紀錄 ──────────────────────────────────────────────────────────────

@equipment_bp.route('/my-orders', strict_slashes=False)
@login_required
def my_orders():
    """查詢自己的借用紀錄。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    orders = db.list_my_orders(user['id'])
    return render_template(
        'equipment/my_orders.html',
        user=user, orders=orders,
        order_status_labels=ORDER_STATUS_LABELS,
    )


# ── 借用單詳細 ────────────────────────────────────────────────────────────────

@equipment_bp.route('/orders/<int:order_id>')
@login_required
def order_detail(order_id):
    """借用單詳細頁；限本人或管理員檢視。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    order = db.get_borrow_order(order_id)
    if not order:
        flash('借用單不存在', 'error')
        return redirect(url_for('equipment.my_orders'))

    if order['borrower_id'] != user['id'] and not _is_admin(user):
        flash('無權限查看此借用單', 'error')
        return redirect(url_for('equipment.my_orders'))

    items = db.list_order_items(order_id)
    return render_template(
        'equipment/order_detail.html',
        user=user, order=order, items=items,
        order_status_labels=ORDER_STATUS_LABELS,
        status_labels=STATUS_LABELS,
    )


# ── 修改借用申請 ──────────────────────────────────────────────────────────────

@equipment_bp.route('/orders/<int:order_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_order(order_id):
    """修改自己的借用申請（限 pending 狀態）。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    order = db.get_borrow_order(order_id)
    if not order:
        flash('借用單不存在', 'error')
        return redirect(url_for('equipment.my_orders'))
    if order['borrower_id'] != user['id']:
        flash('無權限修改此借用單', 'error')
        return redirect(url_for('equipment.my_orders'))
    if order['order_status'] != 'pending':
        flash('只有待審核的借用單可以修改', 'error')
        return redirect(url_for('equipment.order_detail', order_id=order_id))

    current_items = db.list_order_items(order_id)
    error = None

    if request.method == 'POST':
        start_at = request.form.get('borrow_start_at', '').strip()
        end_at   = request.form.get('borrow_end_at', '').strip()
        reason   = request.form.get('borrow_reason', '').strip()
        eq_ids   = request.form.getlist('equipment_id[]')
        qtys     = request.form.getlist('quantity[]')

        form = {
            'borrow_start_at': start_at, 'borrow_end_at': end_at,
            'borrow_reason': reason,
        }
        error = _validate_order_form(form)

        items = []
        if not error:
            for eq_id_str, qty_str in zip(eq_ids, qtys):
                try:
                    eq_id = int(eq_id_str)
                    qty   = int(qty_str)
                except ValueError:
                    error = '數量格式不正確'
                    break
                eq = db.get_equipment(eq_id)
                if not eq:
                    error = f'器材 {eq_id} 不存在'
                    break
                if qty <= 0:
                    error = '借用數量必須大於 0'
                    break
                if qty > eq['available_quantity']:
                    error = f'借用數量超過可借數量（{eq["equipment_name"]}）'
                    break
                items.append((eq_id, qty))

        if not error and not items:
            error = '至少需選擇一項器材'

        if not error:
            db.update_borrow_order(
                order_id = order_id,
                user_id  = user['id'],
                start_at = _normalize_dt(start_at),
                end_at   = _normalize_dt(end_at),
                reason   = reason,
                items    = items,
            )
            flash('借用申請已更新', 'success')
            return redirect(url_for('equipment.order_detail', order_id=order_id))

    form = {
        'borrow_start_at': _fmt_dt_for_input(order['borrow_start_at']),
        'borrow_end_at':   _fmt_dt_for_input(order['borrow_end_at']),
        'borrow_reason':   order['borrow_reason'],
    }
    return render_template(
        'equipment/edit_order_form.html',
        user=user, order=order, form=form,
        current_items=current_items, error=error,
        status_labels=STATUS_LABELS,
    )


# ── 取消借用申請 ──────────────────────────────────────────────────────────────

@equipment_bp.route('/orders/<int:order_id>/cancel', methods=['POST'])
@login_required
def cancel_order(order_id):
    """取消自己的借用申請（限 pending / approved）。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))

    ok = db.cancel_order(order_id, user['id'])
    if ok:
        flash('借用申請已取消', 'success')
    else:
        flash('無法取消此借用單', 'error')
    return redirect(url_for('equipment.order_detail', order_id=order_id))


# ── 管理員：查看所有借用單 ────────────────────────────────────────────────────

@equipment_bp.route('/admin/orders', strict_slashes=False)
@login_required
def admin_orders():
    """管理員查看所有借用單。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('equipment.index'))

    orders = db.list_all_orders()
    return render_template(
        'equipment/admin_orders.html',
        user=user, orders=orders,
        order_status_labels=ORDER_STATUS_LABELS,
    )


# ── 管理員：審核借用單 ────────────────────────────────────────────────────────

@equipment_bp.route('/admin/orders/<int:order_id>/approve', methods=['POST'])
@login_required
def admin_approve(order_id):
    """核准借用單；核准前再次確認可借數量。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('equipment.index'))

    note = request.form.get('review_note', '').strip() or None
    ok   = db.approve_order(order_id, user['id'], note)
    if ok:
        flash('借用單已核准', 'success')
    else:
        flash('核准失敗（器材可借數量不足或借用單狀態不符）', 'error')
    return redirect(url_for('equipment.admin_orders'))


@equipment_bp.route('/admin/orders/<int:order_id>/reject', methods=['POST'])
@login_required
def admin_reject(order_id):
    """拒絕借用單。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('equipment.index'))

    note = request.form.get('review_note', '').strip() or None
    ok   = db.reject_order(order_id, user['id'], note)
    if ok:
        flash('借用單已拒絕', 'success')
    else:
        flash('拒絕失敗（借用單狀態不符）', 'error')
    return redirect(url_for('equipment.admin_orders'))


# ── 管理員：登記借出 ──────────────────────────────────────────────────────────

@equipment_bp.route('/admin/orders/<int:order_id>/borrow', methods=['POST'])
@login_required
def admin_borrow(order_id):
    """登記借出，扣減 equipment.available_quantity。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('equipment.index'))

    ok = db.mark_order_borrowed(order_id)
    if ok:
        flash('已登記借出', 'success')
    else:
        flash('登記借出失敗（器材可借數量不足或借用單狀態不符）', 'error')
    return redirect(url_for('equipment.admin_orders'))


# ── 管理員：登記歸還 ──────────────────────────────────────────────────────────

@equipment_bp.route('/admin/orders/<int:order_id>/return', methods=['POST'])
@login_required
def admin_return(order_id):
    """登記歸還，恢復 equipment.available_quantity。"""
    user = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('equipment.index'))

    ok = db.mark_order_returned(order_id)
    if ok:
        flash('已登記歸還', 'success')
    else:
        flash('登記歸還失敗（借用單狀態不符）', 'error')
    return redirect(url_for('equipment.admin_orders'))


# ── 表單驗證 helpers ──────────────────────────────────────────────────────────

def _validate_equipment_form(form):
    """驗證器材表單，回傳錯誤訊息字串或 None。"""
    if not form.get('equipment_name'):
        return '器材名稱不可為空'
    if not form.get('equipment_code'):
        return '器材編號不可為空'
    try:
        total_qty = int(form.get('total_quantity', ''))
        if total_qty < 0:
            return '總數量不可小於 0'
    except ValueError:
        return '總數量格式不正確'
    try:
        available_qty = int(form.get('available_quantity', ''))
        if available_qty < 0:
            return '可借數量不可小於 0'
    except ValueError:
        return '可借數量格式不正確'
    if available_qty > total_qty:
        return '可借數量不可大於總數量'
    if form.get('equipment_status') not in ('available', 'unavailable', 'maintenance'):
        return '器材狀態不正確'
    return None


def _validate_borrow_form(form, available_quantity):
    """驗證借用申請表單（單項器材），回傳錯誤訊息字串或 None。"""
    if not form.get('borrow_start_at'):
        return '請填寫預計借用開始時間'
    if not form.get('borrow_end_at'):
        return '請填寫預計歸還時間'
    try:
        start = datetime.fromisoformat(form['borrow_start_at'])
        end   = datetime.fromisoformat(form['borrow_end_at'])
    except ValueError:
        return '時間格式不正確'
    if end <= start:
        return '預計歸還時間必須晚於借用開始時間'
    if not form.get('borrow_reason'):
        return '借用用途不可為空'
    try:
        qty = int(form.get('quantity', ''))
        if qty <= 0:
            return '借用數量必須大於 0'
        if qty > available_quantity:
            return f'借用數量不可大於可借數量（目前可借：{available_quantity}）'
    except ValueError:
        return '借用數量格式不正確'
    return None


def _validate_order_form(form):
    """驗證借用單表頭欄位（數量另行逐項檢查），回傳錯誤訊息字串或 None。"""
    if not form.get('borrow_start_at'):
        return '請填寫預計借用開始時間'
    if not form.get('borrow_end_at'):
        return '請填寫預計歸還時間'
    try:
        start = datetime.fromisoformat(form['borrow_start_at'])
        end   = datetime.fromisoformat(form['borrow_end_at'])
    except ValueError:
        return '時間格式不正確'
    if end <= start:
        return '預計歸還時間必須晚於借用開始時間'
    if not form.get('borrow_reason'):
        return '借用用途不可為空'
    return None
