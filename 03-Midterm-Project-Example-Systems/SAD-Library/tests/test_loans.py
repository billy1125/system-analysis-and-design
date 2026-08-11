"""
loans Blueprint 測試：借書、續借、還書、我的借閱與借閱管理
"""
import db
from tests.data.library import MESSAGES, POLICY, SEED_BOOKS

_SAD_ID     = SEED_BOOKS['sad']['id']
_HISTORY_ID = SEED_BOOKS['history']['id']


def _client_for(app, user_id):
    """建立一個獨立的 test client 並注入 session。

    authed_client / admin_client / other_client 都由同一個 client fixture 衍生，
    同一個測試中同時取用會拿到同一個物件，故需要第二個身分時走這裡。
    """
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['user_id'] = user_id
    return c


# ── 借書 ──────────────────────────────────────────────────────────────────────

def test_borrow_requires_login(client):
    resp = client.post(f'/loans/borrow/{_SAD_ID}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_all_loans(1, 10)[1] == 0


def test_borrow_creates_loan(authed_client):
    resp = authed_client.post(f'/loans/borrow/{_SAD_ID}')
    assert resp.status_code == 302
    loans = db.list_my_loans(1)
    assert len(loans) == 1
    assert loans[0]['book_id'] == _SAD_ID


def test_borrow_redirects_to_loan_detail(authed_client):
    resp = authed_client.post(f'/loans/borrow/{_SAD_ID}')
    loan_id = db.list_my_loans(1)[0]['id']
    assert resp.headers['Location'] == f'/loans/{loan_id}'


def test_borrow_shows_success_message(authed_client):
    resp = authed_client.post(f'/loans/borrow/{_SAD_ID}', follow_redirects=True)
    assert MESSAGES['borrowSuccess'].encode() in resp.data


def test_borrow_decrements_available_copies(authed_client):
    before = db.get_book(_SAD_ID)['available_copies']
    authed_client.post(f'/loans/borrow/{_SAD_ID}')
    assert db.get_book(_SAD_ID)['available_copies'] == before - 1


def test_borrow_marks_copy_borrowed(authed_client):
    authed_client.post(f'/loans/borrow/{_SAD_ID}')
    loan = db.list_my_loans(1)[0]
    assert db.get_copy(loan['copy_id'])['copy_status'] == 'borrowed'


def test_borrow_sets_due_date(authed_client):
    authed_client.post(f'/loans/borrow/{_SAD_ID}')
    loan = db.list_my_loans(1)[0]
    assert loan['due_at'] > loan['borrowed_at']
    assert loan['renew_count'] == 0
    assert loan['loan_status'] == 'borrowed'


def test_borrow_same_book_twice_rejected(authed_client):
    authed_client.post(f'/loans/borrow/{_SAD_ID}')
    resp = authed_client.post(f'/loans/borrow/{_SAD_ID}', follow_redirects=True)
    assert MESSAGES['borrowDuplicate'].encode() in resp.data
    assert len(db.list_my_loans(1)) == 1


def test_borrow_missing_book(authed_client):
    resp = authed_client.post('/loans/borrow/9999', follow_redirects=True)
    assert MESSAGES['bookNotFound'].encode() in resp.data


def test_borrow_no_copy_available(authed_client, single_copy_book):
    db.borrow_book(single_copy_book, 2)
    resp = authed_client.post(f'/loans/borrow/{single_copy_book}', follow_redirects=True)
    assert MESSAGES['borrowNoCopy'].encode() in resp.data


def test_borrow_suspended_book(authed_client, multi_copy_book):
    book = db.get_book(multi_copy_book)
    db.update_book(multi_copy_book, book['isbn'], book['title'], book['author'],
                   book['publisher'], book['publish_year'], book['category'],
                   book['description'], 'unavailable')
    resp = authed_client.post(f'/loans/borrow/{multi_copy_book}', follow_redirects=True)
    assert MESSAGES['borrowUnavailable'].encode() in resp.data
    assert db.list_my_loans(1) == []


def test_borrow_blocked_at_limit(authed_client):
    for book_id in range(1, POLICY['max_active_loans'] + 1):
        db.borrow_book(book_id, 1)
    resp = authed_client.post('/loans/borrow/6', follow_redirects=True)
    assert MESSAGES['borrowLimit'].encode() in resp.data
    assert len(db.list_my_loans(1)) == POLICY['max_active_loans']


def test_borrow_blocked_when_overdue(authed_client, overdue_loan):
    resp = authed_client.post(f'/loans/borrow/{_HISTORY_ID}', follow_redirects=True)
    assert MESSAGES['borrowHasOverdue'].encode() in resp.data
    assert len(db.list_my_loans(1)) == 1


def test_borrow_allowed_again_after_returning_overdue(authed_client, overdue_loan):
    db.return_loan(overdue_loan, 1)
    resp = authed_client.post(f'/loans/borrow/{_HISTORY_ID}', follow_redirects=True)
    assert MESSAGES['borrowSuccess'].encode() in resp.data


def test_borrow_by_disabled_account_redirects_to_login(client):
    """持有舊 session 的停用帳號不得借書。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 3          # disabled@example.com，is_active = 0
    resp = client.post(f'/loans/borrow/{_SAD_ID}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_my_loans(3) == []


# ── 我的借閱 ──────────────────────────────────────────────────────────────────

def test_my_loans_requires_login(client):
    resp = client.get('/loans/my-loans')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_my_loans_renders(authed_client):
    resp = authed_client.get('/loans/my-loans')
    assert resp.status_code == 200
    assert '借閱紀錄'.encode() in resp.data


def test_my_loans_lists_borrowed_book(authed_client):
    db.borrow_book(_SAD_ID, 1)
    body = authed_client.get('/loans/my-loans').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body


def test_my_loans_hides_other_users_loans(authed_client):
    db.borrow_book(_SAD_ID, 2)
    body = authed_client.get('/loans/my-loans').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] not in body


def test_my_loans_active_filter(authed_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    db.return_loan(loan_id, 1)
    db.borrow_book(_HISTORY_ID, 1)
    body = authed_client.get('/loans/my-loans?status=active').get_data(as_text=True)
    assert SEED_BOOKS['history']['title'] in body
    assert SEED_BOOKS['sad']['title'] not in body


def test_my_loans_returned_filter(authed_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    db.return_loan(loan_id, 1)
    body = authed_client.get('/loans/my-loans?status=returned').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body


def test_my_loans_invalid_filter_falls_back_to_all(authed_client):
    db.borrow_book(_SAD_ID, 1)
    body = authed_client.get('/loans/my-loans?status=nonsense').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body


def test_my_loans_shows_overdue_badge(authed_client, overdue_loan):
    body = authed_client.get('/loans/my-loans').get_data(as_text=True)
    assert '逾期未還' in body


# ── 借閱明細 ──────────────────────────────────────────────────────────────────

def test_loan_detail_renders_for_owner(authed_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    resp = authed_client.get(f'/loans/{loan_id}')
    assert resp.status_code == 200
    assert SEED_BOOKS['sad']['title'].encode() in resp.data


def test_loan_detail_visible_to_admin(app):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    resp = _client_for(app, 2).get(f'/loans/{loan_id}')
    assert resp.status_code == 200


def test_loan_detail_hidden_from_other_reader(app):
    db.set_user_active(3, 1)
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    resp = _client_for(app, 3).get(f'/loans/{loan_id}', follow_redirects=True)
    assert MESSAGES['loanViewForbidden'].encode() in resp.data


def test_loan_detail_missing(authed_client):
    resp = authed_client.get('/loans/9999', follow_redirects=True)
    assert MESSAGES['loanNotFound'].encode() in resp.data


# ── 續借 ──────────────────────────────────────────────────────────────────────

def test_renew_extends_due_date(authed_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    before = db.get_loan(loan_id)['due_at']
    resp   = authed_client.post(f'/loans/{loan_id}/renew', follow_redirects=True)
    assert MESSAGES['renewSuccess'].encode() in resp.data
    after = db.get_loan(loan_id)
    assert after['due_at'] > before
    assert after['renew_count'] == 1


def test_renew_twice_blocked(authed_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    authed_client.post(f'/loans/{loan_id}/renew')
    resp = authed_client.post(f'/loans/{loan_id}/renew', follow_redirects=True)
    assert MESSAGES['renewLimit'].encode() in resp.data
    assert db.get_loan(loan_id)['renew_count'] == POLICY['max_renew_count']


def test_renew_by_other_user_rejected(app):
    db.set_user_active(3, 1)
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    resp = _client_for(app, 3).post(f'/loans/{loan_id}/renew', follow_redirects=True)
    assert MESSAGES['renewForbidden'].encode() in resp.data
    assert db.get_loan(loan_id)['renew_count'] == 0


def test_renew_by_admin_rejected(app):
    """館員也不能替讀者續借，續借是讀者本人的操作。"""
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    resp = _client_for(app, 2).post(f'/loans/{loan_id}/renew', follow_redirects=True)
    assert MESSAGES['renewForbidden'].encode() in resp.data


def test_renew_returned_loan_rejected(authed_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    db.return_loan(loan_id, 1)
    resp = authed_client.post(f'/loans/{loan_id}/renew', follow_redirects=True)
    assert MESSAGES['renewReturned'].encode() in resp.data


def test_renew_overdue_loan_rejected(authed_client, overdue_loan):
    resp = authed_client.post(f'/loans/{overdue_loan}/renew', follow_redirects=True)
    assert MESSAGES['renewOverdue'].encode() in resp.data
    assert db.get_loan(overdue_loan)['renew_count'] == 0


def test_renew_blocked_when_others_reserved(authed_client, single_copy_book):
    _, loan_id = db.borrow_book(single_copy_book, 1)
    db.create_reservation(single_copy_book, 2)
    resp = authed_client.post(f'/loans/{loan_id}/renew', follow_redirects=True)
    assert MESSAGES['renewReserved'].encode() in resp.data


def test_renew_missing_loan(authed_client):
    resp = authed_client.post('/loans/9999/renew', follow_redirects=True)
    assert MESSAGES['loanNotFound'].encode() in resp.data


# ── 還書 ──────────────────────────────────────────────────────────────────────

def test_return_by_owner(authed_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    resp = authed_client.post(f'/loans/{loan_id}/return', follow_redirects=True)
    assert MESSAGES['returnSuccess'].encode() in resp.data
    assert db.get_loan(loan_id)['returned_at'] is not None


def test_return_restores_available_copy(authed_client):
    before = db.get_book(_SAD_ID)['available_copies']
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    authed_client.post(f'/loans/{loan_id}/return')
    assert db.get_book(_SAD_ID)['available_copies'] == before


def test_return_by_admin(app):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    resp = _client_for(app, 2).post(f'/loans/{loan_id}/return',
                                    data={'from': 'admin'})
    assert resp.headers['Location'] == '/loans/admin/loans'
    assert db.get_loan(loan_id)['returned_at'] is not None


def test_return_by_other_reader_rejected(app):
    db.set_user_active(3, 1)
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    resp = _client_for(app, 3).post(f'/loans/{loan_id}/return', follow_redirects=True)
    assert MESSAGES['loanActForbidden'].encode() in resp.data
    assert db.get_loan(loan_id)['returned_at'] is None


def test_return_twice_rejected(authed_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    authed_client.post(f'/loans/{loan_id}/return')
    resp = authed_client.post(f'/loans/{loan_id}/return', follow_redirects=True)
    assert MESSAGES['returnAlready'].encode() in resp.data


def test_return_missing_loan(authed_client):
    resp = authed_client.post('/loans/9999/return', follow_redirects=True)
    assert MESSAGES['loanNotFound'].encode() in resp.data


def test_return_promotes_waiting_reservation(authed_client, single_copy_book):
    _, loan_id = db.borrow_book(single_copy_book, 1)
    db.create_reservation(single_copy_book, 2)
    authed_client.post(f'/loans/{loan_id}/return')
    assert db.list_my_reservations(2)[0]['reservation_status'] == 'ready'


def test_return_overdue_loan_clears_borrow_block(authed_client, overdue_loan):
    authed_client.post(f'/loans/{overdue_loan}/return')
    assert db.has_overdue_loans(1) is False


# ── 借閱管理（館員） ──────────────────────────────────────────────────────────

def test_admin_loans_requires_login(client):
    resp = client.get('/loans/admin/loans')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_admin_loans_rejects_reader(authed_client):
    resp = authed_client.get('/loans/admin/loans', follow_redirects=True)
    assert MESSAGES['forbidden'].encode() in resp.data


def test_admin_loans_renders(admin_client):
    resp = admin_client.get('/loans/admin/loans')
    assert resp.status_code == 200
    assert '全館借閱紀錄'.encode() in resp.data


def test_admin_loans_lists_all_readers(admin_client):
    db.borrow_book(_SAD_ID, 1)
    body = admin_client.get('/loans/admin/loans').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body
    assert '一般讀者' in body


def test_admin_loans_overdue_filter(admin_client, overdue_loan):
    db.borrow_book(_HISTORY_ID, 2)
    body = admin_client.get('/loans/admin/loans?status=overdue').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body
    assert SEED_BOOKS['history']['title'] not in body


def test_admin_loans_returned_filter(admin_client):
    _, loan_id = db.borrow_book(_SAD_ID, 1)
    db.return_loan(loan_id, 1)
    body = admin_client.get('/loans/admin/loans?status=returned').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body


def test_admin_loans_keyword_matches_borrower(admin_client):
    db.borrow_book(_SAD_ID, 1)
    db.borrow_book(_HISTORY_ID, 2)
    body = admin_client.get('/loans/admin/loans?q=一般讀者').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body
    assert SEED_BOOKS['history']['title'] not in body


def test_admin_loans_keyword_matches_title(admin_client):
    db.borrow_book(_SAD_ID, 1)
    db.borrow_book(_HISTORY_ID, 1)
    body = admin_client.get('/loans/admin/loans?q=台灣通史').get_data(as_text=True)
    assert SEED_BOOKS['history']['title'] in body
    assert SEED_BOOKS['sad']['title'] not in body


def test_admin_loans_shows_overdue_total(admin_client, overdue_loan):
    body = admin_client.get('/loans/admin/loans').get_data(as_text=True)
    assert '逾期 1 筆' in body


def test_admin_loans_pagination(admin_client):
    # 選用複本數 >= 2 的種子書目，確保兩位讀者都借得到，湊滿 12 筆跨到第二頁
    db.set_user_active(3, 1)
    for user_id in (1, 2):
        for book_id in (1, 2, 3, 5, 6):
            assert db.borrow_book(book_id, user_id)[0] == 'ok'
    for book_id in (1, 9):
        assert db.borrow_book(book_id, 3)[0] == 'ok'

    body = admin_client.get('/loans/admin/loans?status=all&page=2').get_data(as_text=True)
    assert '第 2 / 2 頁' in body
