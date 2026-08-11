"""
hub Blueprint 測試：/ （首頁）
"""
import db


def test_hub_renders_for_guest(client):
    resp = client.get('/')
    assert resp.status_code == 200
    assert '館藏查詢'.encode() in resp.data
    assert '歡迎使用'.encode() in resp.data


def test_hub_renders_when_logged_in(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '歡迎回來'.encode() in resp.data


def test_hub_shows_profile_card(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    assert '個人資料'.encode() in resp.data


def test_hub_shows_library_links(authed_client):
    resp = authed_client.get('/')
    body = resp.get_data(as_text=True)
    assert '/books/' in body
    assert '/loans/my-loans' in body
    assert '/reservations/my-reservations' in body


def test_hub_shows_user_display_name(authed_client):
    resp = authed_client.get('/')
    assert resp.status_code == 200
    # hub 優先顯示 name 欄位；種子帳號 user@example.com 的 name 是 '一般讀者'
    assert '一般讀者'.encode() in resp.data


def test_hub_shows_guest_view_for_deleted_user(client):
    db.soft_delete_user(1)
    with client.session_transaction() as sess:
        sess['user_id'] = 1
    resp = client.get('/')
    assert resp.status_code == 200
    assert '歡迎使用'.encode() in resp.data


def test_hub_shows_admin_cards_for_admin(admin_client):
    resp = admin_client.get('/')
    body = resp.get_data(as_text=True)
    assert '會員管理' in body
    assert '/admin/users' in body
    assert '/loans/admin/loans' in body
    assert '/reservations/admin/reservations' in body


def test_hub_hides_admin_cards_for_reader(authed_client):
    body = authed_client.get('/').get_data(as_text=True)
    assert '/admin/users' not in body
    assert '/loans/admin/loans' not in body


def test_hub_guest_can_reach_books(client):
    """訪客視圖的館藏卡片是可點擊的 <a>；借閱相關卡片是 locked 的 <div>。"""
    body = client.get('/').get_data(as_text=True)
    # books.index 宣告 strict_slashes=False，url_for 產生的是 /books/
    assert 'href="/books/"' in body
    assert 'hub-card-locked' in body


# ── 借閱概況 ──────────────────────────────────────────────────────────────────

def test_hub_stats_show_zero_for_new_reader(authed_client):
    body = authed_client.get('/').get_data(as_text=True)
    assert '借閱中冊數' in body
    assert f'0 / {db.MAX_ACTIVE_LOANS}' in body


def test_hub_stats_count_active_loans(authed_client):
    db.borrow_book(1, 1)
    db.borrow_book(2, 1)
    body = authed_client.get('/').get_data(as_text=True)
    assert f'2 / {db.MAX_ACTIVE_LOANS}' in body


def test_hub_shows_overdue_notice(authed_client, overdue_loan):
    body = authed_client.get('/').get_data(as_text=True)
    assert '逾期' in body
    assert 'hub-notice-alert' in body


def test_hub_stats_count_reservations(authed_client, single_copy_book):
    db.borrow_book(single_copy_book, 2)      # 唯一一本被別人借走
    db.create_reservation(single_copy_book, 1)
    body = authed_client.get('/').get_data(as_text=True)
    assert '進行中的預約' in body
