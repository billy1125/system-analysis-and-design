from flask import (Blueprint, flash, redirect, render_template,
                   request, session, url_for)

import db
from utils import _is_usable, login_required

reservations_bp = Blueprint('reservations', __name__, url_prefix='/reservations')

_PAGE_SIZE = 10

_VALID_ADMIN_STATUS = ('all', 'active', 'waiting', 'ready', 'closed')

STATUS_LABELS = {
    'waiting':   '等待中',
    'ready':     '可取書',
    'fulfilled': '已完成',
    'cancelled': '已取消',
}

# db.create_reservation() 的狀態碼 → 使用者看到的訊息。
RESERVE_MESSAGES = {
    'missing':          '書目不存在',
    'book_unavailable': '此書目目前暫停借閱',
    'available':        '此書尚有可借複本，請直接借閱',
    'already_borrowed': '您已借閱此書且尚未歸還',
    'duplicate':        '您已預約此書',
}

# db.cancel_reservation() 的狀態碼 → 使用者看到的訊息。
CANCEL_MESSAGES = {
    'missing':   '預約紀錄不存在',
    'forbidden': '無權限取消他人的預約',
    'closed':    '此預約已結束，無法取消',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _current_user():
    """取得目前登入且帳號有效的使用者；帳號失效時清除 session 並回傳 None。"""
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return None
    return user


def _is_admin(user):
    """role == 0 為館員（管理員）。"""
    return user is not None and user['role'] == 0


# ── 建立預約 ──────────────────────────────────────────────────────────────────

@reservations_bp.route('/new/<int:book_id>', methods=['POST'])
@login_required
def reserve(book_id):
    """讀者預約一本目前無可借複本的書。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))

    result, _ = db.create_reservation(book_id, user['id'])
    if result == 'ok':
        flash('預約成功，可借閱時會在「我的預約」顯示可取書', 'success')
        return redirect(url_for('reservations.my_reservations'))

    flash(RESERVE_MESSAGES.get(result, '預約失敗'), 'error')
    if result == 'missing':
        return redirect(url_for('books.index'))
    return redirect(url_for('books.index', id=book_id))


# ── 我的預約 ──────────────────────────────────────────────────────────────────

@reservations_bp.route('/my-reservations', strict_slashes=False)
@login_required
def my_reservations():
    """讀者自己的預約紀錄，含候補順位。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))

    reservations = db.list_my_reservations(user['id'])
    return render_template(
        'reservations/my_reservations.html',
        user=user,
        reservations=reservations,
        status_labels=STATUS_LABELS,
    )


# ── 取消預約 ──────────────────────────────────────────────────────────────────

@reservations_bp.route('/<int:reservation_id>/cancel', methods=['POST'])
@login_required
def cancel(reservation_id):
    """取消預約。讀者只能取消自己的，館員可取消任何一筆。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))

    is_admin = _is_admin(user)
    result   = db.cancel_reservation(reservation_id, user['id'], is_admin)
    if result == 'ok':
        flash('預約已取消', 'success')
    else:
        flash(CANCEL_MESSAGES.get(result, '取消失敗'), 'error')

    if is_admin and request.form.get('from') == 'admin':
        return redirect(url_for('reservations.admin_reservations'))
    return redirect(url_for('reservations.my_reservations'))


# ── 預約管理（館員） ──────────────────────────────────────────────────────────

@reservations_bp.route('/admin/reservations', strict_slashes=False)
@login_required
def admin_reservations():
    """館員檢視全館預約佇列：?status= ?page= 可組合。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    status = request.args.get('status', 'active')
    if status not in _VALID_ADMIN_STATUS:
        status = 'active'
    page = request.args.get('page', 1, type=int) or 1

    reservations, total = db.list_all_reservations(page, _PAGE_SIZE, status)
    total_pages         = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    return render_template(
        'reservations/admin_reservations.html',
        user=user,
        reservations=reservations,
        total=total,
        page=page,
        total_pages=total_pages,
        status=status,
        status_labels=STATUS_LABELS,
    )
