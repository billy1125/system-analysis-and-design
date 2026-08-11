"""
profile Blueprint 測試：/profile、/profile/update
"""
import db


def test_profile_redirects_to_login_when_not_logged_in(client):
    resp = client.get('/profile')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_profile_renders_when_logged_in(authed_client):
    resp = authed_client.get('/profile')
    assert resp.status_code == 200
    assert 'user@example.com'.encode() in resp.data


def test_profile_shows_user_fields(authed_client):
    resp = authed_client.get('/profile')
    assert '姓名'.encode() in resp.data
    assert '顯示名稱'.encode() in resp.data
    assert '最後登入'.encode() in resp.data


def test_profile_shows_dorm_fields(authed_client):
    resp = authed_client.get('/profile')
    assert '宿舍棟別'.encode() in resp.data
    assert '房號'.encode() in resp.data
    assert '聯絡電話'.encode() in resp.data
    assert 'A 棟'.encode() in resp.data


def test_profile_edit_mode_shows_inputs(authed_client):
    resp = authed_client.get('/profile?edit=1')
    assert resp.status_code == 200
    assert b'name="name"' in resp.data
    assert b'name="display_name"' in resp.data
    assert b'name="dorm_building"' in resp.data
    assert b'name="room_no"' in resp.data
    assert b'name="phone"' in resp.data


def test_profile_update_redirects_when_not_logged_in(client):
    resp = client.post('/profile/update', data={'name': 'Test'})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_profile_update_redirects_to_profile(authed_client):
    resp = authed_client.post('/profile/update', data={
        'name': '新姓名', 'display_name': '新顯示名稱',
        'dorm_building': 'A 棟', 'room_no': '301', 'phone': '0912-345-678',
    })
    assert resp.status_code == 302
    assert resp.headers['Location'] == '/profile'


def test_profile_update_persists_changes(authed_client):
    authed_client.post('/profile/update', data={
        'name': '更新後姓名', 'display_name': '更新後顯示名稱',
        'dorm_building': 'D 棟', 'room_no': '808', 'phone': '0900-000-000',
    })
    user = db.find_user_by_id(1)
    assert user['name'] == '更新後姓名'
    assert user['display_name'] == '更新後顯示名稱'
    assert user['dorm_building'] == 'D 棟'
    assert user['room_no'] == '808'
    assert user['phone'] == '0900-000-000'


def test_profile_update_blank_fields_become_null(authed_client):
    authed_client.post('/profile/update', data={
        'name': '', 'display_name': '', 'dorm_building': '', 'room_no': '', 'phone': '',
    })
    user = db.find_user_by_id(1)
    assert user['name'] is None
    assert user['dorm_building'] is None
    assert user['room_no'] is None


def test_profile_redirects_deleted_user_to_login(client):
    db.soft_delete_user(1)
    with client.session_transaction() as sess:
        sess['user_id'] = 1
    resp = client.get('/profile')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


# ── 帳號有效性檢查 ──────────────────────────────────────────────────────
#
# POST /profile/update 必須做 _is_usable 檢查，否則停用中的帳號只要 session
# 未清就能改自己的資料。房號與電話會印在報修單上、成為維修人員上門的依據，
# 因此這個檢查不可省略。以下兩個測試是它的迴歸防線。

def test_profile_update_rejects_disabled_user(client):
    """停用中的帳號持有舊 session 時，POST 也必須被擋下，且資料不變。"""
    before = db.find_user_by_id(3)['room_no']
    with client.session_transaction() as sess:
        sess['user_id'] = 3
    resp = client.post('/profile/update', data={
        'name': '不該寫入', 'display_name': '', 'dorm_building': 'Z 棟',
        'room_no': '999', 'phone': '',
    })
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    after = db.find_user_by_id(3)
    assert after['room_no'] == before
    assert after['name'] != '不該寫入'


def test_profile_update_rejects_deleted_user_and_clears_session(client):
    db.soft_delete_user(1)
    with client.session_transaction() as sess:
        sess['user_id'] = 1
    resp = client.post('/profile/update', data={
        'name': '不該寫入', 'display_name': '', 'dorm_building': '',
        'room_no': '', 'phone': '',
    })
    assert resp.status_code == 302
    assert db.find_user_by_id(1)['name'] != '不該寫入'
    with client.session_transaction() as sess:
        assert 'user_id' not in sess
