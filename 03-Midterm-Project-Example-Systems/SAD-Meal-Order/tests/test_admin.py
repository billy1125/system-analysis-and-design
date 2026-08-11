"""
admin Blueprint 測試：/admin/users 會員管理
"""
import pytest

import db
from tests.data.users import MESSAGES, USERS


def _set_captcha(client, answer='ABCDE'):
    with client.session_transaction() as sess:
        sess['captcha'] = answer


@pytest.fixture
def many_users(app):
    """補 8 筆會員湊足 11 筆，供分頁測試使用。

    效能提醒：create_user 使用 bcrypt cost=10，8 筆約需 0.8 秒。
    """
    for i in range(8):
        db.create_user(f'u{i}@example.com', 'password123', f'測試{i}')
    return 11


# ── 權限守門 ─────────────────────────────────────────────────────────────────

def test_user_list_anonymous_redirects_to_login(client):
    resp = client.get('/admin/users')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_user_list_normal_user_redirects_to_hub(authed_client):
    resp = authed_client.get('/admin/users')
    assert resp.status_code == 302
    assert resp.headers['Location'] == '/'


def test_user_list_disabled_admin_redirects_to_login(other_client):
    """role=0 但 is_active=0 的帳號應被第 2 層守門攔下，而非第 3 層。"""
    db.set_user_role(3, 0)
    resp = other_client.get('/admin/users')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_user_list_admin_ok(admin_client):
    resp = admin_client.get('/admin/users')
    assert resp.status_code == 200


def test_user_detail_normal_user_redirects_to_hub(authed_client):
    resp = authed_client.get('/admin/users/1')
    assert resp.status_code == 302
    assert resp.headers['Location'] == '/'


def test_user_detail_admin_ok(admin_client):
    resp = admin_client.get('/admin/users/1')
    assert resp.status_code == 200
    assert USERS['normal']['email'].encode() in resp.data


def test_user_detail_nonexistent_redirects_with_flash(admin_client):
    resp = admin_client.get('/admin/users/999', follow_redirects=True)
    assert MESSAGES['adminUserNotFound'] in resp.get_data(as_text=True)


def test_deactivate_normal_user_forbidden_and_db_unchanged(authed_client):
    resp = authed_client.post('/admin/users/2/deactivate')
    assert resp.status_code == 302
    assert db.find_user_by_id(2)['is_active'] == 1


def test_update_role_normal_user_forbidden_and_db_unchanged(authed_client):
    resp = authed_client.post('/admin/users/2/role', data={'role': '1'})
    assert resp.status_code == 302
    assert db.find_user_by_id(2)['role'] == 0


def test_delete_normal_user_forbidden_and_db_unchanged(authed_client):
    resp = authed_client.post('/admin/users/2/delete')
    assert resp.status_code == 302
    assert db.find_user_by_id(2)['is_deleted'] == 0


# ── 清單 / 篩選 / 搜尋 / 分頁 ────────────────────────────────────────────────

def test_user_list_shows_all_seed_users(admin_client):
    body = admin_client.get('/admin/users').get_data(as_text=True)
    for key in ('normal', 'admin', 'disabled'):
        assert USERS[key]['email'] in body


def test_user_list_filter_active_excludes_disabled(admin_client):
    body = admin_client.get('/admin/users?status=active').get_data(as_text=True)
    assert USERS['disabled']['email'] not in body
    assert USERS['normal']['email'] in body


def test_user_list_filter_disabled_shows_only_disabled(admin_client):
    body = admin_client.get('/admin/users?status=disabled').get_data(as_text=True)
    assert USERS['disabled']['email'] in body
    assert USERS['normal']['email'] not in body


def test_user_list_filter_deleted_shows_soft_deleted(admin_client):
    db.soft_delete_user(1)
    body = admin_client.get('/admin/users?status=deleted').get_data(as_text=True)
    assert USERS['normal']['email'] in body
    assert USERS['admin']['email'] not in body


def test_user_list_keyword_matches_email(admin_client):
    body = admin_client.get('/admin/users?q=disabled').get_data(as_text=True)
    assert USERS['disabled']['email'] in body
    assert USERS['normal']['email'] not in body


def test_user_list_keyword_matches_name(admin_client):
    body = admin_client.get('/admin/users?q=管理員').get_data(as_text=True)
    assert USERS['admin']['email'] in body
    assert USERS['normal']['email'] not in body


def test_user_list_pagination_second_page(admin_client, many_users):
    body = admin_client.get('/admin/users?page=2').get_data(as_text=True)
    assert 'u7@example.com' in body
    assert USERS['normal']['email'] not in body


# ── 啟用 / 停用 ──────────────────────────────────────────────────────────────

def test_deactivate_sets_is_active_zero(admin_client):
    admin_client.post('/admin/users/1/deactivate')
    assert db.find_user_by_id(1)['is_active'] == 0


def test_activate_sets_is_active_one(admin_client):
    db.set_user_active(1, 0)
    admin_client.post('/admin/users/1/activate')
    assert db.find_user_by_id(1)['is_active'] == 1


def test_deactivate_redirects_to_user_list(admin_client):
    resp = admin_client.post('/admin/users/1/deactivate')
    assert resp.status_code == 302
    assert resp.headers['Location'] == '/admin/users'


def test_deactivate_self_forbidden(admin_client):
    resp = admin_client.post('/admin/users/2/deactivate', follow_redirects=True)
    assert MESSAGES['adminSelfDeactivate'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(2)['is_active'] == 1


def test_deactivate_nonexistent_user_flashes_not_found(admin_client):
    resp = admin_client.post('/admin/users/999/deactivate', follow_redirects=True)
    assert MESSAGES['adminUserNotFound'] in resp.get_data(as_text=True)


def test_deactivate_deleted_user_forbidden(admin_client):
    db.soft_delete_user(1)
    resp = admin_client.post('/admin/users/1/deactivate', follow_redirects=True)
    assert MESSAGES['adminDeletedUser'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(1)['is_active'] == 1


# ── 角色 ─────────────────────────────────────────────────────────────────────

def test_update_role_to_admin(admin_client):
    admin_client.post('/admin/users/1/role', data={'role': '0'})
    assert db.find_user_by_id(1)['role'] == 0


def test_update_role_to_normal(admin_client):
    db.set_user_role(1, 0)
    admin_client.post('/admin/users/1/role', data={'role': '1'})
    assert db.find_user_by_id(1)['role'] == 1


def test_update_role_self_forbidden(admin_client):
    resp = admin_client.post('/admin/users/2/role', data={'role': '1'},
                             follow_redirects=True)
    assert MESSAGES['adminSelfRole'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(2)['role'] == 0


def test_update_role_invalid_value_flashes_error(admin_client):
    resp = admin_client.post('/admin/users/1/role', data={'role': '9'},
                             follow_redirects=True)
    assert MESSAGES['adminInvalidRole'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(1)['role'] == 1


# ── 刪除 ─────────────────────────────────────────────────────────────────────

def test_delete_user_sets_is_deleted(admin_client):
    admin_client.post('/admin/users/1/delete')
    assert db.find_user_by_id(1)['is_deleted'] == 1


def test_delete_self_forbidden(admin_client):
    resp = admin_client.post('/admin/users/2/delete', follow_redirects=True)
    assert MESSAGES['adminSelfDelete'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(2)['is_deleted'] == 0


def test_deleted_user_cannot_login(app, admin_client):
    """整合案例：軟刪除後無法登入，且訊息與帳號不存在相同。

    注意：conftest 的 admin_client 是由 client 衍生而來，兩者是同一個物件。
    因此這裡必須另建一個乾淨的 test client，不能同時請求 client fixture。
    """
    admin_client.post('/admin/users/1/delete')
    guest = app.test_client()
    _set_captcha(guest)
    resp = guest.post('/login', data={
        'email': USERS['normal']['email'],
        'password': USERS['normal']['password'],
        'captcha': 'ABCDE',
    })
    assert MESSAGES['loginError'] in resp.get_data(as_text=True)
