import random
from functools import wraps

from flask import redirect, session, url_for

CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
CAPTCHA_LENGTH = 5


def _gen_captcha():
    """產生 5 位大寫字母加數字的隨機驗證碼字串。"""
    return ''.join(random.choices(CAPTCHA_CHARS, k=CAPTCHA_LENGTH))


def _is_usable(user):
    """回傳 True 若使用者存在、啟用且未刪除。"""
    return user and user['is_active'] and not user['is_deleted']


def login_required(f):
    """裝飾器：未登入時 redirect 至 /login。"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('auth.login_page'))
        return f(*args, **kwargs)
    return decorated
