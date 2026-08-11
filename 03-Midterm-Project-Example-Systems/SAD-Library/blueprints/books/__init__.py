import re

from flask import (Blueprint, flash, redirect, render_template,
                   request, session, url_for)

import db
from utils import _is_usable, login_required

books_bp = Blueprint('books', __name__, url_prefix='/books')

_PAGE_SIZE = 10

# 複本數量上限只是防呆，避免手滑輸入 9999 產生大量列。
_MAX_COPY_COUNT = 50

CATEGORY_LABELS = {
    'literature': '文學',
    'science':    '自然科學',
    'technology': '應用科技',
    'social':     '社會科學',
    'art':        '藝術',
    'other':      '其他',
}

BOOK_STATUS_LABELS = {
    'available':   '可借閱',
    'unavailable': '暫停借閱',
}

COPY_STATUS_LABELS = {
    'available':   '在架',
    'borrowed':    '借出中',
    'maintenance': '整理中',
    'lost':        '遺失',
}

# 館員可手動指定的複本狀態。borrowed 由借還書流程自行維護，不開放手動設定。
_ASSIGNABLE_COPY_STATUS = ('available', 'maintenance', 'lost')

# ISBN 允許 10 碼（末碼可為 X）或 13 碼純數字，中間的連字號會先移除。
_ISBN_REGEX = re.compile(r'^(?:\d{9}[\dX]|\d{13})$')


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


def _require_admin():
    """館員專用頁面的共同守門，通過時回傳 user，否則回傳 redirect response。"""
    user = _current_user()
    if user is None:
        return None, redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return None, redirect(url_for('books.index'))
    return user, None


# ── 館藏主頁 ──────────────────────────────────────────────────────────────────

@books_bp.route('/', strict_slashes=False)
def index():
    """館藏主頁：左側書目清單（可搜尋、分頁）+ 右側書目詳細與借閱／預約入口。

    未登入亦可瀏覽，只是不顯示借閱與預約按鈕。
    """
    user     = _current_user()
    page     = request.args.get('page', 1, type=int) or 1
    book_id  = request.args.get('id', type=int)
    keyword  = request.args.get('q', '').strip()
    category = request.args.get('category', 'all')
    if category not in CATEGORY_LABELS and category != 'all':
        category = 'all'

    books, total = db.list_books(page, _PAGE_SIZE, keyword or None, category)
    total_pages  = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    selected     = None
    copies       = []
    waiting      = 0
    my_loan      = None
    my_reserve   = None
    loan_history = []
    if book_id:
        selected = db.get_book(book_id)
    if selected:
        copies  = db.list_copies(selected['id'])
        waiting = db.count_waiting_reservations(selected['id'])
        if user:
            my_loan    = db.find_active_loan(selected['id'], user['id'])
            my_reserve = db.find_active_reservation(selected['id'], user['id'])
        if _is_admin(user):
            loan_history = db.list_book_loan_history(selected['id'])

    return render_template(
        'books/index.html',
        user=user,
        books=books,
        total=total,
        page=page,
        total_pages=total_pages,
        keyword=keyword,
        category=category,
        selected=selected,
        copies=copies,
        waiting=waiting,
        my_loan=my_loan,
        my_reserve=my_reserve,
        loan_history=loan_history,
        category_labels=CATEGORY_LABELS,
        book_status_labels=BOOK_STATUS_LABELS,
        copy_status_labels=COPY_STATUS_LABELS,
        assignable_copy_status=_ASSIGNABLE_COPY_STATUS,
    )


# ── 書目維護（館員） ──────────────────────────────────────────────────────────

_BLANK_BOOK = {
    'isbn': '', 'title': '', 'author': '', 'publisher': '',
    'publish_year': '', 'category': 'other', 'description': '',
    'book_status': 'available', 'copy_count': '1',
}


@books_bp.route('/new', methods=['GET', 'POST'])
@login_required
def new_book():
    """館員新增書目，並一次建立指定數量的複本。"""
    user, response = _require_admin()
    if response:
        return response

    error = None
    form  = _BLANK_BOOK.copy()

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _BLANK_BOOK}
        error = _validate_book_form(form, require_copy_count=True)
        if not error:
            book_id = db.create_book(
                isbn         = _clean_isbn(form['isbn']),
                title        = form['title'],
                author       = form['author'],
                publisher    = form['publisher'] or None,
                publish_year = int(form['publish_year']) if form['publish_year'] else None,
                category     = form['category'],
                description  = form['description'] or None,
                copy_count   = int(form['copy_count']),
            )
            flash('書目已新增', 'success')
            return redirect(url_for('books.index', id=book_id))

    return render_template(
        'books/book_form.html',
        user=user, form=form, error=error, mode='new', book=None,
        category_labels=CATEGORY_LABELS,
        book_status_labels=BOOK_STATUS_LABELS,
    )


@books_bp.route('/edit/<int:book_id>', methods=['GET', 'POST'])
@login_required
def edit_book(book_id):
    """館員修改書目主檔。複本在館藏主頁的右欄另行維護。"""
    user, response = _require_admin()
    if response:
        return response

    book = db.get_book(book_id)
    if not book:
        flash('書目不存在', 'error')
        return redirect(url_for('books.index'))

    error = None

    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _BLANK_BOOK if k != 'copy_count'}
        error = _validate_book_form(form, require_copy_count=False, book_id=book_id)
        if not error:
            db.update_book(
                book_id      = book_id,
                isbn         = _clean_isbn(form['isbn']),
                title        = form['title'],
                author       = form['author'],
                publisher    = form['publisher'] or None,
                publish_year = int(form['publish_year']) if form['publish_year'] else None,
                category     = form['category'],
                description  = form['description'] or None,
                book_status  = form['book_status'],
            )
            flash('書目已更新', 'success')
            return redirect(url_for('books.index', id=book_id))

        return render_template(
            'books/book_form.html',
            user=user, form=form, error=error, mode='edit', book=book,
            category_labels=CATEGORY_LABELS,
            book_status_labels=BOOK_STATUS_LABELS,
        )

    form = {
        'isbn':         book['isbn'],
        'title':        book['title'],
        'author':       book['author'],
        'publisher':    book['publisher'] or '',
        'publish_year': str(book['publish_year']) if book['publish_year'] else '',
        'category':     book['category'],
        'description':  book['description'] or '',
        'book_status':  book['book_status'],
    }
    return render_template(
        'books/book_form.html',
        user=user, form=form, error=None, mode='edit', book=book,
        category_labels=CATEGORY_LABELS,
        book_status_labels=BOOK_STATUS_LABELS,
    )


@books_bp.route('/delete/<int:book_id>', methods=['POST'])
@login_required
def delete_book(book_id):
    """館員下架書目（邏輯刪除）。尚有未歸還的借閱時拒絕。"""
    user, response = _require_admin()
    if response:
        return response

    result = db.soft_delete_book(book_id)
    if result == 'deleted':
        flash('書目已下架', 'success')
    elif result == 'on_loan':
        flash('尚有未歸還的借閱，無法下架此書目', 'error')
        return redirect(url_for('books.index', id=book_id))
    else:
        flash('書目不存在', 'error')
    return redirect(url_for('books.index'))


# ── 複本維護（館員） ──────────────────────────────────────────────────────────

@books_bp.route('/<int:book_id>/copies/add', methods=['POST'])
@login_required
def add_copy(book_id):
    """館員為書目新增一本複本，條碼由系統產生。"""
    user, response = _require_admin()
    if response:
        return response

    book = db.get_book(book_id)
    if not book:
        flash('書目不存在', 'error')
        return redirect(url_for('books.index'))

    db.add_copy(book_id)
    flash('複本已新增', 'success')
    return redirect(url_for('books.index', id=book_id))


@books_bp.route('/copies/<int:copy_id>/status', methods=['POST'])
@login_required
def update_copy_status(copy_id):
    """館員調整複本狀態（在架／整理中／遺失）。"""
    user, response = _require_admin()
    if response:
        return response

    copy = db.get_copy(copy_id)
    if not copy:
        flash('複本不存在', 'error')
        return redirect(url_for('books.index'))

    status = request.form.get('copy_status', '')
    if status not in _ASSIGNABLE_COPY_STATUS:
        flash('複本狀態不正確', 'error')
        return redirect(url_for('books.index', id=copy['book_id']))

    result = db.set_copy_status(copy_id, status)
    if result == 'updated':
        flash('複本狀態已更新', 'success')
    elif result == 'on_loan':
        flash('複本借出中，無法變更狀態', 'error')
    else:
        flash('複本不存在', 'error')
    return redirect(url_for('books.index', id=copy['book_id']))


@books_bp.route('/copies/<int:copy_id>/delete', methods=['POST'])
@login_required
def delete_copy(copy_id):
    """館員報廢單一複本（邏輯刪除）。借出中的複本不可刪除。"""
    user, response = _require_admin()
    if response:
        return response

    copy = db.get_copy(copy_id)
    if not copy:
        flash('複本不存在', 'error')
        return redirect(url_for('books.index'))

    result = db.soft_delete_copy(copy_id)
    if result == 'deleted':
        flash('複本已刪除', 'success')
    elif result == 'on_loan':
        flash('複本借出中，無法刪除', 'error')
    else:
        flash('複本不存在', 'error')
    return redirect(url_for('books.index', id=copy['book_id']))


# ── 表單驗證 helpers ──────────────────────────────────────────────────────────

def _clean_isbn(raw):
    """移除 ISBN 中的連字號與空白，統一存成連續字元。"""
    return raw.replace('-', '').replace(' ', '').upper()


def _validate_book_form(form, require_copy_count, book_id=None):
    """驗證書目表單，通過回傳 None，否則回傳錯誤訊息字串。"""
    if not form.get('title'):
        return '書名不可為空'
    if not form.get('author'):
        return '作者不可為空'

    isbn = _clean_isbn(form.get('isbn', ''))
    if not isbn:
        return 'ISBN 不可為空'
    if not _ISBN_REGEX.match(isbn):
        return 'ISBN 格式不正確（需為 10 碼或 13 碼）'

    existing = db.find_book_by_isbn(isbn)
    if existing and existing['id'] != book_id:
        return '此 ISBN 已有相同書目'

    year = form.get('publish_year', '')
    if year:
        try:
            year_value = int(year)
        except ValueError:
            return '出版年格式不正確'
        if year_value < 1000 or year_value > 2100:
            return '出版年需介於 1000 與 2100 之間'

    if form.get('category') not in CATEGORY_LABELS:
        return '分類不正確'

    if not require_copy_count and form.get('book_status') not in BOOK_STATUS_LABELS:
        return '書目狀態不正確'

    if require_copy_count:
        try:
            count = int(form.get('copy_count', ''))
        except ValueError:
            return '複本數量格式不正確'
        if count < 1:
            return '複本數量至少為 1'
        if count > _MAX_COPY_COUNT:
            return f'複本數量不可超過 {_MAX_COPY_COUNT}'

    return None
