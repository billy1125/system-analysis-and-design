"""
admin Blueprint 測試：/admin/users 會員管理
"""
import pytest

import db
from tests.data.users import MESSAGES, USERS


@pytest.fixture
def many_users(app):
    """補 8 筆會員湊足 12 筆，供分頁測試使用（種子帳號 4 筆）。

    效能提醒：create_user 使用 bcrypt cost=10，8 筆約需 0.8 秒。
    """
    for i in range(8):
        db.create_user(f'u{i}@example.com', 'password123', f'測試{i}')
    return 12


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
    """role=0 但 is_active=0 的帳號應被第 2 層守門攔下，而非第 3 層。

    第 2 層失敗代表身分失效（處置是登出），第 3 層代表權限不足（導回首頁）。
    順序調換會讓停用中的管理員收到與事實不符的回饋。
    """
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
    resp = authed_client.post('/admin/users/4/role', data={'role': '1'})
    assert resp.status_code == 302
    assert db.find_user_by_id(4)['role'] == 0


def test_delete_normal_user_forbidden_and_db_unchanged(authed_client):
    resp = authed_client.post('/admin/users/2/delete')
    assert resp.status_code == 302
    assert db.find_user_by_id(2)['is_deleted'] == 0


def test_activate_anonymous_forbidden_and_db_unchanged(client):
    resp = client.post('/admin/users/3/activate')
    assert resp.status_code == 302
    assert db.find_user_by_id(3)['is_active'] == 0


# ── 清單 / 篩選 / 搜尋 / 分頁 ────────────────────────────────────────────────

def test_user_list_shows_all_seed_users(admin_client):
    body = admin_client.get('/admin/users').get_data(as_text=True)
    for key in ('normal', 'admin', 'disabled', 'staff'):
        assert USERS[key]['email'] in body


def test_user_list_shows_dorm_columns(admin_client):
    body = admin_client.get('/admin/users').get_data(as_text=True)
    assert '住宿位置' in body
    assert 'A 棟' in body
    assert '301' in body


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


def test_user_list_keyword_matches_room_no(admin_client):
    """搜尋涵蓋房號。"""
    body = admin_client.get('/admin/users?q=301').get_data(as_text=True)
    assert USERS['normal']['email'] in body
    assert USERS['admin']['email'] not in body


def test_user_list_invalid_status_falls_back_to_all(admin_client):
    body = admin_client.get('/admin/users?status=nonsense').get_data(as_text=True)
    assert USERS['disabled']['email'] in body
    assert USERS['normal']['email'] in body


def test_user_list_pagination(admin_client, many_users):
    body = admin_client.get('/admin/users').get_data(as_text=True)
    assert f'共 {many_users} 筆' in body
    assert '第 1 / 2 頁' in body
    page2 = admin_client.get('/admin/users?page=2').get_data(as_text=True)
    assert '第 2 / 2 頁' in page2


# ── 停用 / 啟用 ──────────────────────────────────────────────────────────────

def test_deactivate_user_succeeds(admin_client):
    resp = admin_client.post('/admin/users/1/deactivate', follow_redirects=True)
    assert MESSAGES['adminDeactivated'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(1)['is_active'] == 0


def test_deactivate_self_rejected(admin_client):
    """R1：不可停用自己的帳號。"""
    resp = admin_client.post('/admin/users/2/deactivate', follow_redirects=True)
    assert MESSAGES['adminSelfDeactivate'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(2)['is_active'] == 1


def test_deactivate_other_admin_allowed(admin_client):
    """自我保護只限對自己，管理員之間可以互相停用。"""
    admin_client.post('/admin/users/4/deactivate')
    assert db.find_user_by_id(4)['is_active'] == 0


def test_deactivate_deleted_user_rejected(admin_client):
    db.soft_delete_user(1)
    resp = admin_client.post('/admin/users/1/deactivate', follow_redirects=True)
    assert MESSAGES['adminDeletedUser'] in resp.get_data(as_text=True)


def test_deactivate_nonexistent_user(admin_client):
    resp = admin_client.post('/admin/users/999/deactivate', follow_redirects=True)
    assert MESSAGES['adminUserNotFound'] in resp.get_data(as_text=True)


def test_activate_user_succeeds(admin_client):
    resp = admin_client.post('/admin/users/3/activate', follow_redirects=True)
    assert MESSAGES['adminActivated'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(3)['is_active'] == 1


def test_activate_self_allowed(admin_client):
    """啟用對自己不設限：無害且冪等。"""
    resp = admin_client.post('/admin/users/2/activate', follow_redirects=True)
    assert MESSAGES['adminActivated'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(2)['is_active'] == 1


def test_activate_deleted_user_rejected(admin_client):
    db.soft_delete_user(3)
    resp = admin_client.post('/admin/users/3/activate', follow_redirects=True)
    assert MESSAGES['adminDeletedUser'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(3)['is_active'] == 0


# ── 角色調整 ─────────────────────────────────────────────────────────────────

def test_update_role_succeeds(admin_client):
    resp = admin_client.post('/admin/users/1/role', data={'role': '0'}, follow_redirects=True)
    assert MESSAGES['adminRoleUpdated'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(1)['role'] == 0


def test_update_role_self_rejected(admin_client):
    """R3：不可修改自己的角色。"""
    resp = admin_client.post('/admin/users/2/role', data={'role': '1'}, follow_redirects=True)
    assert MESSAGES['adminSelfRole'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(2)['role'] == 0


def test_update_role_invalid_value_rejected(admin_client):
    resp = admin_client.post('/admin/users/1/role', data={'role': '7'}, follow_redirects=True)
    assert MESSAGES['adminInvalidRole'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(1)['role'] == 1


def test_update_role_missing_value_rejected(admin_client):
    resp = admin_client.post('/admin/users/1/role', data={}, follow_redirects=True)
    assert MESSAGES['adminInvalidRole'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(1)['role'] == 1


def test_update_role_deleted_user_rejected(admin_client):
    db.soft_delete_user(1)
    resp = admin_client.post('/admin/users/1/role', data={'role': '0'}, follow_redirects=True)
    assert MESSAGES['adminDeletedUser'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(1)['role'] == 1


# ── 軟刪除 ───────────────────────────────────────────────────────────────────

def test_delete_user_succeeds(admin_client):
    resp = admin_client.post('/admin/users/1/delete', follow_redirects=True)
    assert MESSAGES['adminUserDeleted'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(1)['is_deleted'] == 1


def test_delete_self_rejected(admin_client):
    """R2：不可刪除自己的帳號。"""
    resp = admin_client.post('/admin/users/2/delete', follow_redirects=True)
    assert MESSAGES['adminSelfDelete'] in resp.get_data(as_text=True)
    assert db.find_user_by_id(2)['is_deleted'] == 0


def test_delete_twice_rejected(admin_client):
    admin_client.post('/admin/users/1/delete')
    resp = admin_client.post('/admin/users/1/delete', follow_redirects=True)
    assert MESSAGES['adminDeletedUser'] in resp.get_data(as_text=True)


def test_delete_user_keeps_repair_requests(admin_client):
    """刪除帳號不連動刪除報修單——設施的維護歷程屬於宿舍，不屬於個人。"""
    _, before = db.list_my_requests(1, 1, 1, 'all')
    admin_client.post('/admin/users/1/delete')
    _, after = db.list_my_requests(1, 1, 1, 'all')
    assert after == before
    assert before > 0


def test_user_detail_shows_repair_requests(admin_client):
    """會員明細列出其報修單，讓管理員在停用帳號前先看到受影響的紀錄。"""
    body = admin_client.get('/admin/users/1').get_data(as_text=True)
    assert '此會員的報修單' in body
    assert '浴室水龍頭持續漏水' in body
