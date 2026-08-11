from flask import Blueprint, redirect, render_template, request, session, url_for

import db
from utils import _is_usable, login_required

profile_bp = Blueprint('profile', __name__)


@profile_bp.route('/profile')
@login_required
def dashboard():
    """個人資料頁：?edit=1 進入編輯模式。"""
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    edit_mode = request.args.get('edit') == '1'
    return render_template('profile/dashboard.html', user=user, edit_mode=edit_mode)


@profile_bp.route('/profile/update', methods=['POST'])
@login_required
def dashboard_update():
    """更新個人資料（name、display_name）並 redirect 至 /profile。"""
    name         = request.form.get('name', '').strip() or None
    display_name = request.form.get('display_name', '').strip() or None
    db.update_user_profile(session['user_id'], name, display_name)
    return redirect(url_for('profile.dashboard'))
