"""
hub Blueprint 測試：/ （首頁，訪客／已登入雙模式）
"""
import db


def test_hub_renders_for_guest(client):
    resp = client.get('/')
    assert resp.status_code == 200
    assert '歡迎使用'.encode() in resp.data
    assert '校園活動報名'.encode() in resp.data


def test_hub_renders_when_logged_in(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '歡迎回來'.encode() in resp.data


def test_hub_shows_profile_card(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '個人資料'.encode() in resp.data


def test_hub_shows_events_link(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '/events/'.encode() in resp.data


def test_hub_shows_my_registrations_link_when_logged_in(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '/events/my'.encode() in resp.data


def test_hub_hides_my_registrations_link_for_guest(client):
    """訪客視圖的「我的報名」是 locked 的 <div>，不應出現可點的連結。"""
    body = client.get('/').get_data(as_text=True)
    assert '/events/my' not in body
    assert 'hub-card-locked' in body


def test_hub_guest_can_reach_events(client):
    """訪客視圖的活動卡片是可點擊的 <a>（events.index 宣告 strict_slashes=False）。"""
    body = client.get('/').get_data(as_text=True)
    assert 'href="/events/"' in body


def test_hub_shows_user_display_name(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    # hub 優先顯示 name 欄位；種子帳號 user@example.com 的 name 是 '一般使用者'
    assert '一般使用者'.encode() in resp.data


def test_hub_shows_guest_view_for_deleted_user(client):
    db.soft_delete_user(1)
    with client.session_transaction() as sess:
        sess['user_id'] = 1
    resp = client.get('/')
    assert resp.status_code == 200
    assert '歡迎使用'.encode() in resp.data


def test_hub_shows_admin_card_for_admin(admin_client):
    resp = admin_client.get('/')
    assert resp.status_code == 200
    assert '會員管理'.encode() in resp.data
    assert '/admin/users'.encode() in resp.data


def test_hub_hides_admin_card_for_normal_user(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '/admin/users'.encode() not in resp.data
