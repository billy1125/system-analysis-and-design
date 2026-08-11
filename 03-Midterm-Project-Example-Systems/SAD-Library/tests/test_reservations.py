"""
reservations Blueprint 測試：預約、取消預約、我的預約與預約管理
"""
import db
from tests.data.library import MESSAGES, SEED_BOOKS

_SAD_ID = SEED_BOOKS['sad']['id']


def _client_for(app, user_id):
    """建立獨立的 test client 並注入 session（同一測試需要兩個身分時使用）。"""
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['user_id'] = user_id
    return c


def _lock_book(book_id, borrower_id=2):
    """讓書目沒有可借複本，好進入可預約狀態。"""
    result, loan_id = db.borrow_book(book_id, borrower_id)
    assert result == 'ok'
    return loan_id


# ── 建立預約 ──────────────────────────────────────────────────────────────────

def test_reserve_requires_login(client, single_copy_book):
    _lock_book(single_copy_book)
    resp = client.post(f'/reservations/new/{single_copy_book}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_all_reservations(1, 10)[1] == 0


def test_reserve_creates_reservation(authed_client, single_copy_book):
    _lock_book(single_copy_book)
    resp = authed_client.post(f'/reservations/new/{single_copy_book}',
                              follow_redirects=True)
    assert MESSAGES['reserveSuccess'].encode() in resp.data
    reservations = db.list_my_reservations(1)
    assert len(reservations) == 1
    assert reservations[0]['reservation_status'] == 'waiting'


def test_reserve_redirects_to_my_reservations(authed_client, single_copy_book):
    _lock_book(single_copy_book)
    resp = authed_client.post(f'/reservations/new/{single_copy_book}')
    assert resp.headers['Location'] == '/reservations/my-reservations'


def test_reserve_rejected_when_copy_available(authed_client):
    resp = authed_client.post(f'/reservations/new/{_SAD_ID}', follow_redirects=True)
    assert MESSAGES['reserveAvailable'].encode() in resp.data
    assert db.list_my_reservations(1) == []


def test_reserve_rejected_when_already_borrowed(authed_client, multi_copy_book):
    """自己借走最後一本時不可預約同一本書。"""
    db.borrow_book(multi_copy_book, 2)
    db.borrow_book(multi_copy_book, 3)
    db.borrow_book(multi_copy_book, 1)     # 三本複本借光，其中一本是自己借的
    resp = authed_client.post(f'/reservations/new/{multi_copy_book}',
                              follow_redirects=True)
    assert MESSAGES['reserveBorrowed'].encode() in resp.data


def test_reserve_twice_rejected(authed_client, single_copy_book):
    _lock_book(single_copy_book)
    authed_client.post(f'/reservations/new/{single_copy_book}')
    resp = authed_client.post(f'/reservations/new/{single_copy_book}',
                              follow_redirects=True)
    assert MESSAGES['reserveDuplicate'].encode() in resp.data
    assert len(db.list_my_reservations(1)) == 1


def test_reserve_suspended_book_rejected(authed_client, single_copy_book):
    _lock_book(single_copy_book)
    book = db.get_book(single_copy_book)
    db.update_book(single_copy_book, book['isbn'], book['title'], book['author'],
                   book['publisher'], book['publish_year'], book['category'],
                   book['description'], 'unavailable')
    resp = authed_client.post(f'/reservations/new/{single_copy_book}',
                              follow_redirects=True)
    assert MESSAGES['reserveUnavailable'].encode() in resp.data


def test_reserve_missing_book(authed_client):
    resp = authed_client.post('/reservations/new/9999', follow_redirects=True)
    assert MESSAGES['bookNotFound'].encode() in resp.data


def test_reserve_by_disabled_account_redirects_to_login(client, single_copy_book):
    _lock_book(single_copy_book)
    with client.session_transaction() as sess:
        sess['user_id'] = 3          # disabled@example.com
    resp = client.post(f'/reservations/new/{single_copy_book}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_my_reservations(3) == []


# ── 我的預約 ──────────────────────────────────────────────────────────────────

def test_my_reservations_requires_login(client):
    resp = client.get('/reservations/my-reservations')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_my_reservations_renders(authed_client):
    resp = authed_client.get('/reservations/my-reservations')
    assert resp.status_code == 200
    assert '預約紀錄'.encode() in resp.data


def test_my_reservations_lists_book(authed_client, single_copy_book):
    _lock_book(single_copy_book)
    authed_client.post(f'/reservations/new/{single_copy_book}')
    body = authed_client.get('/reservations/my-reservations').get_data(as_text=True)
    assert '單一複本測試書' in body
    assert '等待中' in body


def test_my_reservations_hides_other_users(authed_client, single_copy_book):
    _lock_book(single_copy_book, borrower_id=1)
    db.create_reservation(single_copy_book, 2)
    body = authed_client.get('/reservations/my-reservations').get_data(as_text=True)
    assert '單一複本測試書' not in body


def test_queue_position_reflects_order(app, single_copy_book):
    _lock_book(single_copy_book)
    db.set_user_active(3, 1)
    db.create_reservation(single_copy_book, 1)
    db.create_reservation(single_copy_book, 3)
    assert db.list_my_reservations(1)[0]['queue_position'] == 1
    assert db.list_my_reservations(3)[0]['queue_position'] == 2


def test_ready_reservation_shows_borrow_button(authed_client, single_copy_book):
    loan_id = _lock_book(single_copy_book)
    db.create_reservation(single_copy_book, 1)
    db.return_loan(loan_id, 2)
    body = authed_client.get('/reservations/my-reservations').get_data(as_text=True)
    assert '可取書' in body
    assert '立即借閱' in body


def test_borrowing_ready_book_fulfills_reservation(authed_client, single_copy_book):
    loan_id = _lock_book(single_copy_book)
    db.create_reservation(single_copy_book, 1)
    db.return_loan(loan_id, 2)
    authed_client.post(f'/loans/borrow/{single_copy_book}')
    assert db.list_my_reservations(1)[0]['reservation_status'] == 'fulfilled'


# ── 取消預約 ──────────────────────────────────────────────────────────────────

def test_cancel_own_reservation(authed_client, single_copy_book):
    _lock_book(single_copy_book)
    _, reservation_id = db.create_reservation(single_copy_book, 1)
    resp = authed_client.post(f'/reservations/{reservation_id}/cancel',
                              follow_redirects=True)
    assert MESSAGES['cancelSuccess'].encode() in resp.data
    assert db.get_reservation(reservation_id)['reservation_status'] == 'cancelled'


def test_cancel_other_users_reservation_rejected(app, single_copy_book):
    _lock_book(single_copy_book, borrower_id=1)
    db.set_user_active(3, 1)
    _, reservation_id = db.create_reservation(single_copy_book, 3)
    resp = _client_for(app, 1).post(
        f'/reservations/{reservation_id}/cancel', follow_redirects=True)
    assert MESSAGES['cancelForbidden'].encode() in resp.data
    assert db.get_reservation(reservation_id)['reservation_status'] == 'waiting'


def test_admin_can_cancel_any_reservation(app, single_copy_book):
    _lock_book(single_copy_book, borrower_id=1)
    _, reservation_id = db.create_reservation(single_copy_book, 2)
    admin = _client_for(app, 2)
    resp  = admin.post(f'/reservations/{reservation_id}/cancel',
                       data={'from': 'admin'})
    assert resp.headers['Location'] == '/reservations/admin/reservations'
    assert db.get_reservation(reservation_id)['reservation_status'] == 'cancelled'


def test_cancel_closed_reservation_rejected(authed_client, single_copy_book):
    _lock_book(single_copy_book)
    _, reservation_id = db.create_reservation(single_copy_book, 1)
    db.cancel_reservation(reservation_id, 1)
    resp = authed_client.post(f'/reservations/{reservation_id}/cancel',
                              follow_redirects=True)
    assert MESSAGES['cancelClosed'].encode() in resp.data


def test_cancel_missing_reservation(authed_client):
    resp = authed_client.post('/reservations/9999/cancel', follow_redirects=True)
    assert MESSAGES['cancelNotFound'].encode() in resp.data


def test_cancelling_ready_reservation_promotes_next(app, single_copy_book):
    loan_id = _lock_book(single_copy_book)
    db.set_user_active(3, 1)
    _, first  = db.create_reservation(single_copy_book, 1)
    _, second = db.create_reservation(single_copy_book, 3)
    db.return_loan(loan_id, 2)
    assert db.get_reservation(first)['reservation_status'] == 'ready'

    _client_for(app, 1).post(f'/reservations/{first}/cancel')
    assert db.get_reservation(second)['reservation_status'] == 'ready'


# ── 預約管理（館員） ──────────────────────────────────────────────────────────

def test_admin_reservations_requires_login(client):
    resp = client.get('/reservations/admin/reservations')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_admin_reservations_rejects_reader(authed_client):
    resp = authed_client.get('/reservations/admin/reservations', follow_redirects=True)
    assert MESSAGES['forbidden'].encode() in resp.data


def test_admin_reservations_renders(admin_client):
    resp = admin_client.get('/reservations/admin/reservations')
    assert resp.status_code == 200
    assert '全館預約佇列'.encode() in resp.data


def test_admin_reservations_lists_all(admin_client, single_copy_book):
    _lock_book(single_copy_book, borrower_id=1)
    db.create_reservation(single_copy_book, 2)
    body = admin_client.get('/reservations/admin/reservations').get_data(as_text=True)
    assert '單一複本測試書' in body
    assert '圖書館員' in body


def test_admin_reservations_status_filter(admin_client, single_copy_book):
    loan_id = _lock_book(single_copy_book, borrower_id=1)
    _, reservation_id = db.create_reservation(single_copy_book, 2)
    db.cancel_reservation(reservation_id, 2)

    active = admin_client.get(
        '/reservations/admin/reservations?status=active').get_data(as_text=True)
    closed = admin_client.get(
        '/reservations/admin/reservations?status=closed').get_data(as_text=True)
    assert '沒有符合條件的預約紀錄' in active
    assert '單一複本測試書' in closed


def test_admin_reservations_invalid_status_falls_back(admin_client):
    resp = admin_client.get('/reservations/admin/reservations?status=nonsense')
    assert resp.status_code == 200


def test_admin_reservations_pagination(admin_client):
    """湊出 12 筆預約跨到第二頁。

    書目改以「唯一複本設為整理中」變成無可借複本，不必真的借書——
    這樣既避開每人 5 冊的借閱上限，也不必用 bcrypt 建立大量測試帳號。
    """
    db.set_user_active(3, 1)
    for i in range(6):
        book_id = db.create_book(
            isbn=f'978000000{i:04d}', title=f'分頁測試書 {i}', author='測試',
            publisher=None, publish_year=2024, category='other',
            description=None, copy_count=1,
        )
        db.set_copy_status(db.list_copies(book_id)[0]['id'], 'maintenance')
        for user_id in (1, 3):
            assert db.create_reservation(book_id, user_id)[0] == 'ok'

    body = admin_client.get(
        '/reservations/admin/reservations?status=all&page=2').get_data(as_text=True)
    assert '第 2 / 2 頁' in body
