"""
hub Blueprint 測試：/ （首頁）
"""
import db


def test_hub_renders_for_guest(client):
    resp = client.get('/')
    assert resp.status_code == 200
    assert '歡迎使用'.encode() in resp.data


def test_hub_guest_has_no_unlocked_card(client):
    """訪客沒有任何可進入的子系統，卡片全部鎖定。

    報修單載有房號與電話，因此沒有開放訪客瀏覽的頁面。
    """
    body = client.get('/').get_data(as_text=True)
    assert 'hub-card-locked' in body
    assert 'href="/repair/"' not in body
    assert 'href="/repair/new"' not in body


def test_hub_renders_when_logged_in(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '歡迎回來'.encode() in resp.data


def test_hub_shows_repair_cards(authed_client):
    body = authed_client.get('/').get_data(as_text=True)
    assert 'href="/repair/new"' in body
    assert 'href="/repair/"' in body


def test_hub_shows_profile_card(authed_client):
    resp = authed_client.get('/')
    assert '個人資料'.encode() in resp.data


def test_hub_shows_user_display_name(authed_client):
    """hub 優先顯示 name 欄位；種子帳號 user@example.com 的 name 是 '陳小明'。"""
    resp = authed_client.get('/')
    assert '陳小明'.encode() in resp.data


def test_hub_shows_room_for_user_with_dorm_info(authed_client):
    resp = authed_client.get('/')
    assert '住宿位置'.encode() in resp.data
    assert 'A 棟'.encode() in resp.data


def test_hub_shows_my_request_count(authed_client):
    """首頁的「我的報修單」卡片顯示自己的單數。種子資料中 user_id=1 有 5 張。"""
    _, total = db.list_my_requests(1, 1, 1, 'all')
    resp = authed_client.get('/')
    assert f'共 {total} 筆'.encode() in resp.data


def test_hub_shows_guest_view_for_deleted_user(client):
    db.soft_delete_user(1)
    with client.session_transaction() as sess:
        sess['user_id'] = 1
    resp = client.get('/')
    assert resp.status_code == 200
    assert '歡迎使用'.encode() in resp.data


def test_hub_clears_session_for_disabled_user(client):
    with client.session_transaction() as sess:
        sess['user_id'] = 3
    client.get('/')
    with client.session_transaction() as sess:
        assert 'user_id' not in sess


def test_hub_shows_admin_cards_for_admin(admin_client):
    body = admin_client.get('/').get_data(as_text=True)
    assert '/admin/users' in body
    assert '/repair/manage' in body


def test_hub_hides_admin_cards_for_normal_user(authed_client):
    body = authed_client.get('/').get_data(as_text=True)
    assert '/admin/users' not in body
    assert '/repair/manage' not in body


def test_hub_shows_pending_count_for_admin(admin_client):
    """管理員的報修管理卡片顯示待受理筆數。種子資料中恰有 1 張 pending。"""
    resp = admin_client.get('/')
    assert '筆待受理'.encode() in resp.data


# ── 內嵌登入表單 ──────────────────────────────────────────────────────────────

def test_hub_embedded_login_works(client):
    with client.session_transaction() as sess:
        sess['captcha'] = 'ABCDE'
    resp = client.post('/', data={
        'email': 'user@example.com', 'password': 'password123', 'captcha': 'ABCDE',
    })
    assert resp.status_code == 302
    with client.session_transaction() as sess:
        assert sess.get('user_id') == 1


def test_hub_embedded_login_wrong_captcha(client):
    with client.session_transaction() as sess:
        sess['captcha'] = 'ABCDE'
    resp = client.post('/', data={
        'email': 'user@example.com', 'password': 'password123', 'captcha': 'ZZZZZ',
    })
    assert resp.status_code == 200
    assert '驗證碼錯誤'.encode() in resp.data
