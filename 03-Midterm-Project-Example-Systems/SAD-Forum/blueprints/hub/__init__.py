import bcrypt
from flask import Blueprint, redirect, render_template, request, session, url_for

import db
from utils import _is_usable

hub_bp = Blueprint('hub', __name__)


@hub_bp.route('/', methods=['GET', 'POST'])
def home():
    """Hub 首頁：未登入可瀏覽，登入後顯示完整功能（含個人資料）。"""
    user = None
    if 'user_id' in session:
        user = db.find_user_by_id(session['user_id'])
        if not _is_usable(user):
            session.clear()
            user = None

    error = None

    if request.method == 'POST' and user is None:
        email         = request.form.get('email', '').strip()
        password      = request.form.get('password', '')
        captcha_input = request.form.get('captcha', '').strip().upper()
        captcha_ans   = session.get('captcha', '')

        if not captcha_input:
            error = '請輸入驗證碼'
        elif captcha_input != captcha_ans:
            error = '驗證碼錯誤，請重新輸入'
        elif not email or not password:
            error = '請輸入帳號與密碼'
        else:
            u = db.find_user_by_email(email)
            if not u or u['is_deleted'] or not bcrypt.checkpw(password.encode(), u['hash'].encode()):
                error = '帳號或密碼錯誤'
            elif not u['is_active']:
                error = '帳號已停用'
            else:
                db.update_last_login(u['id'])
                session['user_id'] = u['id']
                return redirect(url_for('hub.home'))

    return render_template('hub/home.html', user=user, error=error)
