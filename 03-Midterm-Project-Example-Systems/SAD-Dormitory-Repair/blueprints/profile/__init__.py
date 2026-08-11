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
    """更新個人資料（姓名、顯示名稱、棟別、房號、聯絡電話）並 redirect 至 /profile。

    這三行 _is_usable 檢查不可省略：房號與電話會直接印在報修單上、成為維修
    人員上門的依據。停用中的帳號只要 session 未清就能改自己的資料的話，缺陷
    會外溢到當事人以外的人。
    """
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))

    name          = request.form.get('name', '').strip() or None
    display_name  = request.form.get('display_name', '').strip() or None
    dorm_building = request.form.get('dorm_building', '').strip() or None
    room_no       = request.form.get('room_no', '').strip() or None
    phone         = request.form.get('phone', '').strip() or None

    db.update_user_profile(session['user_id'], name, display_name,
                           dorm_building, room_no, phone)
    return redirect(url_for('profile.dashboard'))
