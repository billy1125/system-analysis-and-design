from flask import Blueprint, flash, redirect, render_template, request, session, url_for

import db
from utils import _is_usable, login_required

forum_bp = Blueprint('forum', __name__, url_prefix='/forum')

_PAGE_SIZE = 10


def _current_user():
    """從 session 取得目前登入且帳號有效的使用者，否則回傳 None。

    停用或已刪除的帳號一律視為 None，避免持有舊 session 的失效帳號
    繼續發文、回覆或修改。index 以外的路由收到 None 時須清除 session
    並導向登入頁；index 則把 None 當成合法的訪客狀態繼續渲染。
    """
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None


def _is_admin(user):
    """role == 0 為管理員。"""
    return user is not None and user['role'] == 0


# ── 瀏覽 ──────────────────────────────────────────────────────────────────────

@forum_bp.route('/', strict_slashes=False)
def index():
    """論壇主頁：左側文章列表（分頁）+ 右側依 ?master_id 顯示內文。"""
    page      = request.args.get('page', 1, type=int)
    master_id = request.args.get('master_id', type=int)

    masters, total = db.list_forum_masters(page=page, page_size=_PAGE_SIZE)
    total_pages    = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    details         = []
    selected_master = None
    if master_id:
        m = db.get_forum_master(master_id)
        if m and not m['is_deleted']:
            selected_master = m
            details         = db.list_forum_details(master_id)

    return render_template(
        'forum/index.html',
        masters=masters,
        total=total,
        page=page,
        total_pages=total_pages,
        details=details,
        selected_master=selected_master,
        user=_current_user(),
    )


# ── 新增 ──────────────────────────────────────────────────────────────────────

@forum_bp.route('/new', methods=['GET', 'POST'])
@login_required
def new_post():
    """新增文章：GET 顯示表單，POST 建立 master + detail。"""
    user      = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    error     = None
    form_data = {}

    if request.method == 'POST':
        title     = request.form.get('title', '').strip()
        content   = request.form.get('content', '').strip()
        form_data = request.form

        if not title:
            error = '請輸入文章標題'
        elif not content:
            error = '請輸入文章內容'
        else:
            master_id = db.create_forum_master(title, content, user['id'])
            return redirect(url_for('forum.index', master_id=master_id))

    return render_template(
        'forum/post_form.html',
        form_title='新增文章',
        show_title=True,
        show_content=True,
        form_data=form_data,
        error=error,
        user=user,
        back_url=url_for('forum.index'),
    )


@forum_bp.route('/reply/<int:master_id>', methods=['GET', 'POST'])
@login_required
def reply(master_id):
    """回覆文章：GET 顯示表單，POST 新增 detail。"""
    user   = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    master = db.get_forum_master(master_id)

    if not master or master['is_deleted']:
        flash('文章不存在或已刪除', 'error')
        return redirect(url_for('forum.index'))

    error     = None
    form_data = {}

    if request.method == 'POST':
        content   = request.form.get('content', '').strip()
        form_data = request.form

        if not content:
            error = '請輸入文章內容'
        else:
            db.create_forum_detail(master_id, content, user['id'])
            return redirect(url_for('forum.index', master_id=master_id))

    return render_template(
        'forum/post_form.html',
        form_title=f'回覆：{master["title"]}',
        show_title=False,
        show_content=True,
        form_data=form_data,
        error=error,
        user=user,
        back_url=url_for('forum.index', master_id=master_id),
    )


# ── 修改 ──────────────────────────────────────────────────────────────────────

@forum_bp.route('/edit/master/<int:master_id>', methods=['GET', 'POST'])
@login_required
def edit_master(master_id):
    """修改文章標題：GET 顯示表單，POST 更新標題。"""
    user   = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    master = db.get_forum_master(master_id)

    if not master or master['is_deleted']:
        flash('文章不存在或已刪除', 'error')
        return redirect(url_for('forum.index'))

    if not _is_admin(user) and user['id'] != master['user_id']:
        flash('無權限修改此文章標題', 'error')
        return redirect(url_for('forum.index', master_id=master_id))

    error     = None
    form_data = {'title': master['title']}

    if request.method == 'POST':
        title     = request.form.get('title', '').strip()
        form_data = request.form

        if not title:
            error = '請輸入文章標題'
        else:
            db.update_forum_master_title(master_id, title)
            return redirect(url_for('forum.index', master_id=master_id))

    return render_template(
        'forum/post_form.html',
        form_title='修改文章標題',
        show_title=True,
        show_content=False,
        form_data=form_data,
        error=error,
        user=user,
        back_url=url_for('forum.index', master_id=master_id),
    )


@forum_bp.route('/edit/detail/<int:detail_id>', methods=['GET', 'POST'])
@login_required
def edit_detail(detail_id):
    """修改內文或回覆：GET 顯示表單，POST 更新內容。"""
    user   = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    detail = db.get_forum_detail(detail_id)

    if not detail or detail['is_deleted']:
        flash('內文不存在或已刪除', 'error')
        return redirect(url_for('forum.index'))

    if not _is_admin(user) and user['id'] != detail['user_id']:
        flash('無權限修改此內容', 'error')
        return redirect(url_for('forum.index', master_id=detail['master_id']))

    error     = None
    form_data = {'content': detail['content']}

    if request.method == 'POST':
        content   = request.form.get('content', '').strip()
        form_data = request.form

        if not content:
            error = '請輸入文章內容'
        else:
            db.update_forum_detail_content(detail_id, content)
            return redirect(url_for('forum.index', master_id=detail['master_id']))

    return render_template(
        'forum/post_form.html',
        form_title='修改內文',
        show_title=False,
        show_content=True,
        form_data=form_data,
        error=error,
        user=user,
        back_url=url_for('forum.index', master_id=detail['master_id']),
    )


# ── 刪除（僅管理員）───────────────────────────────────────────────────────────

@forum_bp.route('/delete/master/<int:master_id>', methods=['POST'])
@login_required
def delete_master(master_id):
    """刪除文章（僅管理員）。"""
    user   = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    master = db.get_forum_master(master_id)

    if not master or master['is_deleted']:
        flash('文章不存在或已刪除', 'error')
        return redirect(url_for('forum.index'))

    if not _is_admin(user):
        flash('無權限刪除文章', 'error')
        return redirect(url_for('forum.index', master_id=master_id))

    db.soft_delete_forum_master(master_id)
    flash('文章已刪除', 'success')
    return redirect(url_for('forum.index'))


@forum_bp.route('/delete/detail/<int:detail_id>', methods=['POST'])
@login_required
def delete_detail(detail_id):
    """刪除回覆（僅管理員）。"""
    user   = _current_user()
    if user is None:
        session.clear()
        return redirect(url_for('auth.login_page'))
    detail = db.get_forum_detail(detail_id)

    if not detail or detail['is_deleted']:
        flash('回覆不存在或已刪除', 'error')
        return redirect(url_for('forum.index'))

    master_id = detail['master_id']

    if not _is_admin(user):
        flash('無權限刪除回覆', 'error')
        return redirect(url_for('forum.index', master_id=master_id))

    db.soft_delete_forum_detail(detail_id)
    flash('回覆已刪除', 'success')
    return redirect(url_for('forum.index', master_id=master_id))
