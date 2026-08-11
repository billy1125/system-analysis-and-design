"""
hub Blueprint 測試：/ （首頁）
"""


def test_hub_renders_for_guest(client):
    resp = client.get('/')
    assert resp.status_code == 200
    assert '器材借用'.encode() in resp.data
    assert '歡迎使用'.encode() in resp.data


def test_hub_renders_when_logged_in(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '歡迎回來'.encode() in resp.data


def test_hub_shows_profile_card(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '個人資料'.encode() in resp.data


def test_hub_shows_equipment_link(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '器材借用'.encode() in resp.data
    assert '/equipment'.encode() in resp.data


def test_hub_shows_my_orders_link(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '我的借用紀錄'.encode() in resp.data
    assert '/equipment/my-orders'.encode() in resp.data


def test_hub_shows_admin_orders_card_for_admin(admin_client):
    resp = admin_client.get('/')
    assert resp.status_code == 200
    assert '/equipment/admin/orders'.encode() in resp.data


def test_hub_hides_admin_orders_card_for_normal_user(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '/equipment/admin/orders'.encode() not in resp.data


def test_hub_shows_user_display_name(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    # hub 優先顯示 name 欄位；種子帳號 user@example.com 的 name 是 '一般使用者'
    assert '一般使用者'.encode() in resp.data


def test_hub_shows_guest_view_for_deleted_user(client):
    import db
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


def test_hub_guest_can_reach_equipment(client):
    """訪客視圖的器材卡片是可點擊的 <a>；其餘卡片是 locked 的 <div>。"""
    resp = client.get('/')
    body = resp.get_data(as_text=True)
    # equipment.index 宣告 strict_slashes=False，url_for 產生的是 /equipment/
    assert 'href="/equipment/"' in body
    assert 'hub-card-locked' in body
