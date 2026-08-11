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
