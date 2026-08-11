"""
auth Blueprint 測試：/login、/register、/logout、/captcha.png
"""
import db
from tests.data.users import MESSAGES, USERS


def _set_captcha(client, answer='ABCDE'):
    """直接將驗證碼答案寫入 session，繞過圖形產生流程。"""
    with client.session_transaction() as sess:
        sess['captcha'] = answer


# ── GET /login ────────────────────────────────────────────────────────────────

def test_login_page_renders(client):
    resp = client.get('/login')
    assert resp.status_code == 200
    assert '登入'.encode() in resp.data


def test_login_redirects_to_hub_when_logged_in(authed_client):
    resp = authed_client.get('/login')
    assert resp.status_code == 302
    assert resp.headers['Location'] == '/'


# ── POST /login ───────────────────────────────────────────────────────────────

def test_login_missing_captcha(client):
    resp = client.post('/login', data={
        'email': USERS['normal']['email'],
        'password': USERS['normal']['password'],
        'captcha': '',
    })
    assert resp.status_code == 200
    assert MESSAGES['captchaRequired'].encode() in resp.data


def test_login_wrong_captcha(client):
    _set_captcha(client, 'ABCDE')
    resp = client.post('/login', data={
        'email': USERS['normal']['email'],
        'password': USERS['normal']['password'],
        'captcha': 'ZZZZZ',
    })
    assert resp.status_code == 200
    assert MESSAGES['captchaInvalid'].encode() in resp.data


def test_login_missing_email_and_password(client):
    _set_captcha(client, 'ABCDE')
    resp = client.post('/login', data={'email': '', 'password': '', 'captcha': 'ABCDE'})
    assert resp.status_code == 200
    assert MESSAGES['missingCredentials'].encode() in resp.data


def test_login_wrong_password(client):
    _set_captcha(client, 'ABCDE')
    resp = client.post('/login', data={
        'email': USERS['normal']['email'],
        'password': 'wrongpassword',
        'captcha': 'ABCDE',
    })
    assert resp.status_code == 200
    assert MESSAGES['loginError'].encode() in resp.data


def test_login_nonexistent_email(client):
    _set_captcha(client, 'ABCDE')
    resp = client.post('/login', data={
        'email': 'nobody@example.com',
        'password': 'password123',
        'captcha': 'ABCDE',
    })
    assert resp.status_code == 200
    assert MESSAGES['loginError'].encode() in resp.data


def test_login_disabled_user(client):
    _set_captcha(client, 'ABCDE')
    resp = client.post('/login', data={
        'email': USERS['disabled']['email'],
        'password': USERS['disabled']['password'],
        'captcha': 'ABCDE',
    })
    assert resp.status_code == 200
    assert MESSAGES['accountDisabled'].encode() in resp.data


def test_login_deleted_user_gets_generic_error(client):
    """已軟刪除的帳號回傳「帳號或密碼錯誤」，不透露帳號存在過。"""
    db.soft_delete_user(1)
    _set_captcha(client, 'ABCDE')
    resp = client.post('/login', data={
        'email': USERS['normal']['email'],
        'password': USERS['normal']['password'],
        'captcha': 'ABCDE',
    })
    assert MESSAGES['loginError'].encode() in resp.data


def test_login_valid_redirects_to_hub(client):
    _set_captcha(client, 'ABCDE')
    resp = client.post('/login', data={
        'email': USERS['normal']['email'],
        'password': USERS['normal']['password'],
        'captcha': 'ABCDE',
    })
    assert resp.status_code == 302
    assert resp.headers['Location'] == '/'


def test_login_valid_sets_session(client):
    _set_captcha(client, 'ABCDE')
    client.post('/login', data={
        'email': USERS['normal']['email'],
        'password': USERS['normal']['password'],
        'captcha': 'ABCDE',
    })
    with client.session_transaction() as sess:
        assert sess.get('user_id') == USERS['normal']['id']


def test_login_valid_updates_last_login(client):
    assert db.find_user_by_id(1)['last_login_at'] is None
    _set_captcha(client, 'ABCDE')
    client.post('/login', data={
        'email': USERS['normal']['email'],
        'password': USERS['normal']['password'],
        'captcha': 'ABCDE',
    })
    assert db.find_user_by_id(1)['last_login_at'] is not None


# ── GET /register ─────────────────────────────────────────────────────────────

def test_register_page_renders(client):
    resp = client.get('/register')
    assert resp.status_code == 200
    assert '申請帳號'.encode() in resp.data


def test_register_page_shows_dorm_fields(client):
    """住宿欄位（棟別、房號、電話）三者皆為選填。"""
    resp = client.get('/register')
    assert b'name="dorm_building"' in resp.data
    assert b'name="room_no"' in resp.data
    assert b'name="phone"' in resp.data


def test_register_redirects_to_hub_when_logged_in(authed_client):
    resp = authed_client.get('/register')
    assert resp.status_code == 302
    assert resp.headers['Location'] == '/'


# ── POST /register ────────────────────────────────────────────────────────────

def test_register_missing_email(client):
    resp = client.post('/register', data={
        'email': '', 'password': 'password123', 'confirm_password': 'password123',
    })
    assert resp.status_code == 200
    assert MESSAGES['missingEmailOrPassword'].encode() in resp.data


def test_register_invalid_email_format(client):
    resp = client.post('/register', data={
        'email': 'notanemail', 'password': 'password123', 'confirm_password': 'password123',
    })
    assert resp.status_code == 200
    assert MESSAGES['invalidEmailFormat'].encode() in resp.data


def test_register_password_too_short(client):
    resp = client.post('/register', data={
        'email': 'new@example.com', 'password': 'short', 'confirm_password': 'short',
    })
    assert resp.status_code == 200
    assert MESSAGES['passwordTooShort'].encode() in resp.data


def test_register_password_mismatch(client):
    resp = client.post('/register', data={
        'email': 'new@example.com', 'password': 'password123', 'confirm_password': 'different123',
    })
    assert resp.status_code == 200
    assert MESSAGES['passwordMismatch'].encode() in resp.data


def test_register_duplicate_email(client):
    resp = client.post('/register', data={
        'email': USERS['normal']['email'],
        'password': 'password123',
        'confirm_password': 'password123',
    })
    assert resp.status_code == 200
    assert MESSAGES['emailTaken'].encode() in resp.data


def test_register_valid_redirects_to_login(client):
    resp = client.post('/register', data={
        'email': 'newuser@example.com',
        'password': 'password123',
        'confirm_password': 'password123',
        'name': '新住宿生',
    })
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_register_persists_dorm_fields(client):
    client.post('/register', data={
        'email': 'newuser@example.com',
        'password': 'password123',
        'confirm_password': 'password123',
        'name': '新住宿生',
        'dorm_building': 'C 棟',
        'room_no': '512',
        'phone': '0988-111-222',
    })
    user = db.find_user_by_email('newuser@example.com')
    assert user['dorm_building'] == 'C 棟'
    assert user['room_no'] == '512'
    assert user['phone'] == '0988-111-222'


def test_register_dorm_fields_optional(client):
    """住宿欄位未填時存 NULL，不擋下申請——分配房間前也要能開帳號。"""
    resp = client.post('/register', data={
        'email': 'nodorm@example.com',
        'password': 'password123',
        'confirm_password': 'password123',
    })
    assert resp.status_code == 302
    user = db.find_user_by_email('nodorm@example.com')
    assert user['dorm_building'] is None
    assert user['room_no'] is None


def test_register_new_user_is_normal_role(client):
    """新申請的帳號一律是住宿生（role=1），系統沒有申請成為管理員的途徑。"""
    client.post('/register', data={
        'email': 'newuser@example.com',
        'password': 'password123',
        'confirm_password': 'password123',
    })
    assert db.find_user_by_email('newuser@example.com')['role'] == 1


def test_register_valid_shows_flash_on_login_page(client):
    client.post('/register', data={
        'email': 'newuser@example.com',
        'password': 'password123',
        'confirm_password': 'password123',
    })
    resp = client.get('/login')
    assert MESSAGES['registerSuccess'].encode() in resp.data


def test_register_preserves_form_data_on_error(client):
    resp = client.post('/register', data={
        'email': 'bad-email',
        'password': 'password123',
        'confirm_password': 'password123',
        'name': '保留姓名',
        'room_no': '保留房號',
    })
    assert '保留姓名'.encode() in resp.data
    assert '保留房號'.encode() in resp.data


# ── GET /logout ───────────────────────────────────────────────────────────────

def test_logout_clears_session_and_redirects(authed_client):
    resp = authed_client.get('/logout')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    with authed_client.session_transaction() as sess:
        assert 'user_id' not in sess


# ── GET /captcha.png ──────────────────────────────────────────────────────────

def test_captcha_returns_png(client):
    resp = client.get('/captcha.png')
    assert resp.status_code == 200
    assert resp.content_type == 'image/png'


def test_captcha_sets_session(client):
    client.get('/captcha.png')
    with client.session_transaction() as sess:
        assert 'captcha' in sess
        assert len(sess['captcha']) == 5
