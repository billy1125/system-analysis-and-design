from flask import (Blueprint, flash, redirect, render_template,
                   request, session, url_for)

import db
from utils import _is_usable, login_required

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

_PAGE_SIZE = 10

ROLE_LABELS = {0: '館員（管理員）', 1: '讀者'}

_VALID_STATUS = ('all', 'active', 'disabled', 'deleted')


def _current_user():
    """從 session 取得目前登入的使用者。"""
    return db.find_user_by_id(session['user_id'])


def _is_admin(user):
    """role == 0 為管理員。"""
    return user is not None and user['role'] == 0


@admin_bp.route('/users')
@login_required
def user_list():
    """會員清單：?status= ?q= ?page= 三者可組合。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    status  = request.args.get('status', 'all')
    if status not in _VALID_STATUS:
        status = 'all'
    keyword = request.args.get('q', '').strip()
    page    = request.args.get('page', 1, type=int) or 1

    users, total = db.list_users(page, _PAGE_SIZE, status, keyword or None)
    total_pages  = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)

    return render_template(
        'admin/user_list.html',
        user=user,
        users=users,
        total=total,
        page=page,
        total_pages=total_pages,
        status=status,
        keyword=keyword,
        ROLE_LABELS=ROLE_LABELS,
    )


@admin_bp.route('/users/<int:user_id>')
@login_required
def user_detail(user_id):
    """會員明細；被檢視者命名為 target，避免與當前登入者混淆。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    target = db.find_user_by_id(user_id)
    if target is None:
        flash('找不到該使用者', 'error')
        return redirect(url_for('admin.user_list'))

    return render_template(
        'admin/user_detail.html',
        user=user,
        target=target,
        ROLE_LABELS=ROLE_LABELS,
    )


@admin_bp.route('/users/<int:user_id>/activate', methods=['POST'])
@login_required
def activate_user(user_id):
    """啟用帳號。對自己不設限（無害且冪等）。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    target = db.find_user_by_id(user_id)
    if target is None:
        flash('找不到該使用者', 'error')
        return redirect(url_for('admin.user_list'))
    if target['is_deleted']:
        flash('該帳號已刪除，無法操作', 'error')
        return redirect(url_for('admin.user_list'))

    db.set_user_active(user_id, 1)
    flash('帳號已啟用', 'success')
    return redirect(url_for('admin.user_list'))


@admin_bp.route('/users/<int:user_id>/deactivate', methods=['POST'])
@login_required
def deactivate_user(user_id):
    """停用帳號。R1：不可停用自己。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    target = db.find_user_by_id(user_id)
    if target is None:
        flash('找不到該使用者', 'error')
        return redirect(url_for('admin.user_list'))
    if target['id'] == user['id']:
        flash('不可停用自己的帳號', 'error')
        return redirect(url_for('admin.user_list'))
    if target['is_deleted']:
        flash('該帳號已刪除，無法操作', 'error')
        return redirect(url_for('admin.user_list'))

    db.set_user_active(user_id, 0)
    flash('帳號已停用', 'success')
    return redirect(url_for('admin.user_list'))


@admin_bp.route('/users/<int:user_id>/role', methods=['POST'])
@login_required
def update_role(user_id):
    """調整角色。R3：不可修改自己的角色。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    target = db.find_user_by_id(user_id)
    if target is None:
        flash('找不到該使用者', 'error')
        return redirect(url_for('admin.user_list'))
    if target['id'] == user['id']:
        flash('不可修改自己的角色', 'error')
        return redirect(url_for('admin.user_list'))
    if target['is_deleted']:
        flash('該帳號已刪除，無法操作', 'error')
        return redirect(url_for('admin.user_list'))

    role = request.form.get('role', '')
    if role not in ('0', '1'):
        flash('角色值不正確', 'error')
        return redirect(url_for('admin.user_list'))

    db.set_user_role(user_id, int(role))
    flash('角色已更新', 'success')
    return redirect(url_for('admin.user_list'))


@admin_bp.route('/users/<int:user_id>/delete', methods=['POST'])
@login_required
def delete_user(user_id):
    """軟刪除帳號。R2：不可刪除自己。"""
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))

    target = db.find_user_by_id(user_id)
    if target is None:
        flash('找不到該使用者', 'error')
        return redirect(url_for('admin.user_list'))
    if target['id'] == user['id']:
        flash('不可刪除自己的帳號', 'error')
        return redirect(url_for('admin.user_list'))
    if target['is_deleted']:
        flash('該帳號已刪除，無法操作', 'error')
        return redirect(url_for('admin.user_list'))

    db.soft_delete_user(user_id)
    flash('帳號已刪除', 'success')
    return redirect(url_for('admin.user_list'))
