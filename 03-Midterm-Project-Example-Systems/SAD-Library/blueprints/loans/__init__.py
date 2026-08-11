from flask import (Blueprint, flash, redirect, render_template,
                   request, session, url_for)

import db
from utils import _is_usable, login_required

loans_bp = Blueprint('loans', __name__, url_prefix='/loans')

_PAGE_SIZE = 10

_VALID_MY_STATUS    = ('all', 'active', 'returned')
_VALID_ADMIN_STATUS = ('all', 'active', 'overdue', 'returned')

# db.borrow_book() 的狀態碼 → 使用者看到的訊息。
BORROW_MESSAGES = {
    'missing':          '書目不存在',
    'book_unavailable': '此書目目前暫停借閱',
    'has_overdue':      '您有逾期未還的書，請先歸還後再借閱',
    'limit_reached':    f'已達同時借閱上限（{db.MAX_ACTIVE_LOANS} 冊）',
    'already_borrowed': '您已借閱此書且尚未歸還',
    'no_copy':          '此書目前無可借複本，可改為預約',
}

# db.renew_loan() 的狀態碼 → 使用者看到的訊息。
RENEW_MESSAGES = {
    'missing':       '借閱紀錄不存在',
    'forbidden':     '無權限操作他人的借閱紀錄',
    'returned':      '此借閱已歸還，無法續借',
    'overdue':       '已逾期的借閱無法續借，請先歸還',
    'limit_reached': f'已達續借次數上限（{db.MAX_RENEW_COUNT} 次）',
    'reserved':      '此書已有其他讀者預約，無法續借',
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


# ── 借書 ──────────────────────────────────────────────────────────────────────

@loans_bp.route('/borrow/<int:book_id>', methods=['POST'])
@login_required
def borrow(book_id):
    """讀者借出一本書。所有借閱規則由 db.borrow_book() 判定。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))

    result, loan_id = db.borrow_book(book_id, user['id'])
    if result == 'ok':
        flash(f'借閱成功，請於 {db.LOAN_PERIOD_DAYS} 天內歸還', 'success')
        return redirect(url_for('loans.loan_detail', loan_id=loan_id))

    flash(BORROW_MESSAGES.get(result, '借閱失敗'), 'error')
    if result == 'missing':
        return redirect(url_for('books.index'))
    return redirect(url_for('books.index', id=book_id))


# ── 我的借閱 ──────────────────────────────────────────────────────────────────

@loans_bp.route('/my-loans', strict_slashes=False)
@login_required
def my_loans():
    """讀者自己的借閱紀錄：?status=all|active|returned。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))

    status = request.args.get('status', 'all')
    if status not in _VALID_MY_STATUS:
        status = 'all'

    loans = db.list_my_loans(user['id'], status)
    return render_template(
        'loans/my_loans.html',
        user=user,
        loans=loans,
        status=status,
        active_count=db.count_active_loans(user['id']),
        max_active_loans=db.MAX_ACTIVE_LOANS,
        max_renew_count=db.MAX_RENEW_COUNT,
    )


# ── 借閱明細 ──────────────────────────────────────────────────────────────────

@loans_bp.route('/<int:loan_id>')
@login_required
def loan_detail(loan_id):
    """借閱明細。僅本人與館員可查看。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))

    loan = db.get_loan(loan_id)
    if not loan:
        flash('借閱紀錄不存在', 'error')
        return redirect(url_for('loans.my_loans'))
    if loan['borrower_id'] != user['id'] and not _is_admin(user):
        flash('無權限查看此借閱紀錄', 'error')
        return redirect(url_for('loans.my_loans'))

    return render_template(
        'loans/loan_detail.html',
        user=user,
        loan=loan,
        is_admin=_is_admin(user),
        max_renew_count=db.MAX_RENEW_COUNT,
        renew_period_days=db.RENEW_PERIOD_DAYS,
    )


# ── 續借 ──────────────────────────────────────────────────────────────────────

@loans_bp.route('/<int:loan_id>/renew', methods=['POST'])
@login_required
def renew(loan_id):
    """續借。僅本人可操作，其餘條件由 db.renew_loan() 判定。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))

    result = db.renew_loan(loan_id, user['id'])
    if result == 'ok':
        flash(f'續借成功，到期日延長 {db.RENEW_PERIOD_DAYS} 天', 'success')
    else:
        flash(RENEW_MESSAGES.get(result, '續借失敗'), 'error')

    if result == 'missing':
        return redirect(url_for('loans.my_loans'))
    return redirect(url_for('loans.loan_detail', loan_id=loan_id))


# ── 還書 ──────────────────────────────────────────────────────────────────────

@loans_bp.route('/<int:loan_id>/return', methods=['POST'])
@login_required
def return_book(loan_id):
    """歸還。讀者可歸還自己的借閱，館員可代為登記任何一筆。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))

    loan = db.get_loan(loan_id)
    if not loan:
        flash('借閱紀錄不存在', 'error')
        return redirect(url_for('loans.my_loans'))
    if loan['borrower_id'] != user['id'] and not _is_admin(user):
        flash('無權限操作此借閱紀錄', 'error')
        return redirect(url_for('loans.my_loans'))

    result = db.return_loan(loan_id, user['id'])
    if result == 'ok':
        flash('歸還完成', 'success')
    elif result == 'returned':
        flash('此借閱已歸還', 'error')
    else:
        flash('借閱紀錄不存在', 'error')

    if _is_admin(user) and request.form.get('from') == 'admin':
        return redirect(url_for('loans.admin_loans'))
    return redirect(url_for('loans.loan_detail', loan_id=loan_id))


# ── 借閱管理（館員） ──────────────────────────────────────────────────────────

@loans_bp.route('/admin/loans', strict_slashes=False)
@login_required
def admin_loans():
    """館員檢視全館借閱紀錄：?status= ?q= ?page= 三者可組合。"""
    user = _current_user()
    if user is None:
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    status = request.args.get('status', 'active')
    if status not in _VALID_ADMIN_STATUS:
        status = 'active'
    keyword = request.args.get('q', '').strip()
    page    = request.args.get('page', 1, type=int) or 1

    loans, total = db.list_all_loans(page, _PAGE_SIZE, status, keyword or None)
    total_pages  = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    return render_template(
        'loans/admin_loans.html',
        user=user,
        loans=loans,
        total=total,
        page=page,
        total_pages=total_pages,
        status=status,
        keyword=keyword,
        overdue_total=db.count_overdue_loans(),
    )
