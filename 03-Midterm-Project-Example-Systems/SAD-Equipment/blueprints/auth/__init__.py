import io
import re
import sqlite3

import bcrypt
from captcha.image import ImageCaptcha
from flask import (Blueprint, flash, redirect, render_template,
                   request, send_file, session, url_for)

import db
from utils import _gen_captcha

auth_bp = Blueprint('auth', __name__)

EMAIL_REGEX = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


@auth_bp.route('/captcha.png')
def captcha_image():
    """產生驗證碼圖片並將答案寫入 session['captcha']。"""
    text = _gen_captcha()
    session['captcha'] = text
    image = ImageCaptcha(width=160, height=50)
    data = image.generate(text)
    return send_file(io.BytesIO(data.read()), mimetype='image/png')


@auth_bp.route('/login', methods=['GET', 'POST'])
def login_page():
    """登入頁面：GET 顯示表單，POST 驗證並建立 session。"""
    if 'user_id' in session:
        return redirect(url_for('hub.home'))

    error = None

    if request.method == 'POST':
        email          = request.form.get('email', '').strip()
        password       = request.form.get('password', '')
        captcha_input  = request.form.get('captcha', '').strip().upper()
        captcha_answer = session.get('captcha', '')

        if not captcha_input:
            error = '請輸入驗證碼'
        elif captcha_input != captcha_answer:
            error = '驗證碼錯誤，請重新輸入'
        elif not email or not password:
            error = '請輸入帳號與密碼'
        else:
            user = db.find_user_by_email(email)
            if not user or user['is_deleted'] or not bcrypt.checkpw(password.encode(), user['hash'].encode()):
                error = '帳號或密碼錯誤'
            elif not user['is_active']:
                error = '帳號已停用'
            else:
                db.update_last_login(user['id'])
                session['user_id'] = user['id']
                return redirect(url_for('hub.home'))

    return render_template('auth/login.html', error=error)


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    """申請帳號頁面：GET 顯示表單，POST 建立使用者。"""
    if 'user_id' in session:
        return redirect(url_for('hub.home'))

    error     = None
    form_data = {}

    if request.method == 'POST':
        email            = request.form.get('email', '').strip()
        password         = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')
        name             = request.form.get('name', '').strip() or None
        display_name     = request.form.get('display_name', '').strip() or None

        form_data = {'email': email, 'name': name or '', 'display_name': display_name or ''}

        if not email or not password:
            error = '請輸入電子郵件與密碼'
        elif not EMAIL_REGEX.match(email):
            error = '電子郵件格式不正確'
        elif len(password) < 8:
            error = '密碼至少需要 8 個字元'
        elif password != confirm_password:
            error = '兩次密碼輸入不一致'
        else:
            try:
                db.create_user(email, password, name, display_name)
                flash('申請成功，請登入', 'success')
                return redirect(url_for('auth.login_page'))
            except sqlite3.IntegrityError:
                error = '此電子郵件已被使用'

    return render_template('auth/register.html', error=error, form_data=form_data)


@auth_bp.route('/logout')
def logout():
    """清除 session 並 redirect 至登入頁。"""
    session.clear()
    return redirect(url_for('auth.login_page'))
