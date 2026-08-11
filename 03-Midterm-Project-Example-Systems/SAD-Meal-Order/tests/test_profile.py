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
    assert resp.status_code == 200
    assert '姓名'.encode() in resp.data
    assert '顯示名稱'.encode() in resp.data
    assert '最後登入'.encode() in resp.data


def test_profile_edit_mode_shows_inputs(authed_client):
    resp = authed_client.get('/profile?edit=1')
    assert resp.status_code == 200
    assert b'name="name"' in resp.data
    assert b'name="display_name"' in resp.data


def test_profile_update_redirects_when_not_logged_in(client):
    resp = client.post('/profile/update', data={'name': 'Test', 'display_name': 'Test'})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_profile_update_redirects_to_profile(authed_client):
    resp = authed_client.post('/profile/update', data={
        'name': '新姓名',
        'display_name': '新顯示名稱',
    })
    assert resp.status_code == 302
    assert resp.headers['Location'] == '/profile'


def test_profile_update_persists_changes(authed_client):
    authed_client.post('/profile/update', data={
        'name': '更新後姓名',
        'display_name': '更新後顯示名稱',
    })
    user = db.find_user_by_id(1)
    assert user['name'] == '更新後姓名'
    assert user['display_name'] == '更新後顯示名稱'


def test_profile_redirects_deleted_user_to_login(client):
    db.soft_delete_user(1)
    with client.session_transaction() as sess:
        sess['user_id'] = 1
    resp = client.get('/profile')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


# ── KI-03：刻意保留的缺陷 ─────────────────────────────────────────────────────
#
# 以下兩個測試「保護」的是一個**缺陷**，不是一個功能。
#
# `GET /profile` 有 `_is_usable` 檢查，`POST /profile/update` 沒有。因此被停用或
# 已刪除的會員仍然可以修改自己的姓名。這與 admin 的停用功能直接衝突。
#
# 它是本專案的核心教材（技術債如何跨功能傳染），**請勿「順手」補上那三行**。
# 若你補了，這兩個測試會失敗——那正是它們存在的目的：讓修補這件事變成一個
# 需要明確決定、而不是無聲發生的動作。
#
# 對照組：meal 子系統對同一個問題做了**相反**的處置（修補了守門）。判準見規格書
# §11.0——缺陷的影響是否會外溢到當事人以外的人。改自己的姓名只影響自己；
# 佔用餐點份數會讓別人訂不到。

def test_profile_update_succeeds_for_disabled_user_ki03(client):
    """停用中的帳號仍可更新自己的資料。這是 KI-03 的缺陷，不是功能。"""
    db.set_user_active(1, 0)
    with client.session_transaction() as sess:
        sess['user_id'] = 1

    resp = client.post('/profile/update', data={
        'name': 'KI-03 尚未修補',
        'display_name': '',
    })

    assert resp.status_code == 302
    assert db.find_user_by_id(1)['name'] == 'KI-03 尚未修補'


def test_profile_update_succeeds_for_deleted_user_ki03(client):
    """已軟刪除的帳號同樣可以更新。同上，這是 KI-03。"""
    db.soft_delete_user(1)
    with client.session_transaction() as sess:
        sess['user_id'] = 1

    client.post('/profile/update', data={'name': 'KI-03 尚未修補', 'display_name': ''})

    assert db.find_user_by_id(1)['name'] == 'KI-03 尚未修補'
