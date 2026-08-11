"""
books Blueprint 測試：/books/、書目維護與複本維護
"""
import db
from tests.data.library import MESSAGES, SEED_BOOK_COUNT, SEED_BOOKS

_VALID_BOOK = {
    'isbn': '9789999999999', 'title': '新測試書', 'author': '新作者',
    'publisher': '測試出版社', 'publish_year': '2024', 'category': 'technology',
    'description': '簡介', 'copy_count': '2',
}


def _book_total():
    return db.list_books(1, 100)[1]


# ── 館藏主頁 ──────────────────────────────────────────────────────────────────

def test_index_renders_for_guest(client):
    resp = client.get('/books/')
    assert resp.status_code == 200
    assert '書目清單'.encode() in resp.data


def test_index_lists_seed_books(client):
    body = client.get('/books/').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body


def test_index_shows_total_count(client):
    body = client.get('/books/').get_data(as_text=True)
    assert f'共 {SEED_BOOK_COUNT} 筆' in body


def test_index_keyword_matches_title(client):
    body = client.get('/books/?q=資料庫').get_data(as_text=True)
    assert SEED_BOOKS['database']['title'] in body
    assert SEED_BOOKS['history']['title'] not in body


def test_index_keyword_matches_isbn(client):
    book = db.get_book(SEED_BOOKS['sad']['id'])
    body = client.get(f'/books/?q={book["isbn"]}').get_data(as_text=True)
    assert SEED_BOOKS['sad']['title'] in body


def test_index_category_filter(client):
    body = client.get('/books/?category=art').get_data(as_text=True)
    assert SEED_BOOKS['art']['title'] in body
    assert SEED_BOOKS['sad']['title'] not in body


def test_index_invalid_category_falls_back_to_all(client):
    body = client.get('/books/?category=nonsense').get_data(as_text=True)
    assert f'共 {SEED_BOOK_COUNT} 筆' in body


def test_index_pagination_second_page(client):
    body = client.get('/books/?page=2').get_data(as_text=True)
    # 十筆種子書目、每頁十筆，第二頁為空
    assert '查無符合條件的書目' in body


def test_index_selected_book_shows_detail(client):
    body = client.get(f'/books/?id={SEED_BOOKS["sad"]["id"]}').get_data(as_text=True)
    assert '館藏複本' in body
    assert '0001-001' in body


def test_index_placeholder_without_selection(client):
    body = client.get('/books/').get_data(as_text=True)
    assert 'book-placeholder' in body


def test_index_nonexistent_book_shows_placeholder(client):
    body = client.get('/books/?id=9999').get_data(as_text=True)
    assert 'book-placeholder' in body


# ── 借閱／預約入口的顯示邏輯 ──────────────────────────────────────────────────

def test_guest_sees_login_hint_not_borrow_button(client):
    body = client.get(f'/books/?id={SEED_BOOKS["sad"]["id"]}').get_data(as_text=True)
    assert '登入' in body
    assert '借閱這本書' not in body


def test_reader_sees_borrow_button(authed_client):
    body = authed_client.get(f'/books/?id={SEED_BOOKS["sad"]["id"]}').get_data(as_text=True)
    assert '借閱這本書' in body


def test_reader_sees_reserve_button_when_no_copy(authed_client, single_copy_book):
    db.borrow_book(single_copy_book, 2)
    body = authed_client.get(f'/books/?id={single_copy_book}').get_data(as_text=True)
    assert '預約候補' in body
    assert '借閱這本書' not in body


def test_borrowed_book_shows_my_loan_link(authed_client):
    db.borrow_book(SEED_BOOKS['sad']['id'], 1)
    body = authed_client.get(f'/books/?id={SEED_BOOKS["sad"]["id"]}').get_data(as_text=True)
    assert '您已借閱此書' in body


def test_unavailable_book_hides_borrow_button(authed_client, multi_copy_book):
    book = db.get_book(multi_copy_book)
    db.update_book(multi_copy_book, book['isbn'], book['title'], book['author'],
                   book['publisher'], book['publish_year'], book['category'],
                   book['description'], 'unavailable')
    body = authed_client.get(f'/books/?id={multi_copy_book}').get_data(as_text=True)
    assert '此書目前暫停借閱' in body


# ── 館員專屬的畫面元素 ────────────────────────────────────────────────────────

def test_admin_sees_book_maintenance_controls(admin_client):
    body = admin_client.get(f'/books/?id={SEED_BOOKS["sad"]["id"]}').get_data(as_text=True)
    assert '新增書目' in body
    assert '修改書目' in body
    assert '新增複本' in body
    assert '最近借閱紀錄' in body


def test_reader_does_not_see_maintenance_controls(authed_client):
    body = authed_client.get(f'/books/?id={SEED_BOOKS["sad"]["id"]}').get_data(as_text=True)
    assert '新增書目' not in body
    assert '新增複本' not in body


# ── 新增書目 ──────────────────────────────────────────────────────────────────

def test_new_book_page_requires_login(client):
    resp = client.get('/books/new')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_new_book_page_rejects_reader(authed_client):
    resp = authed_client.get('/books/new')
    assert resp.status_code == 302
    assert '/books/' in resp.headers['Location']


def test_new_book_page_renders_for_admin(admin_client):
    resp = admin_client.get('/books/new')
    assert resp.status_code == 200
    assert '新增書目'.encode() in resp.data


def test_new_book_rejected_for_reader_does_not_create(authed_client):
    before = _book_total()
    authed_client.post('/books/new', data=_VALID_BOOK)
    assert _book_total() == before


def test_new_book_creates_book_and_copies(admin_client):
    before = _book_total()
    resp   = admin_client.post('/books/new', data=_VALID_BOOK)
    assert resp.status_code == 302
    assert _book_total() == before + 1

    book = db.find_book_by_isbn(_VALID_BOOK['isbn'])
    assert book is not None
    assert len(db.list_copies(book['id'])) == int(_VALID_BOOK['copy_count'])


def test_new_book_strips_isbn_hyphens(admin_client):
    data = dict(_VALID_BOOK, isbn='978-986-123-456-7')
    admin_client.post('/books/new', data=data)
    assert db.find_book_by_isbn('9789861234567') is not None


def test_new_book_missing_title(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, title=''))
    assert MESSAGES['titleRequired'].encode() in resp.data


def test_new_book_missing_author(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, author=''))
    assert MESSAGES['authorRequired'].encode() in resp.data


def test_new_book_missing_isbn(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, isbn=''))
    assert MESSAGES['isbnRequired'].encode() in resp.data


def test_new_book_invalid_isbn(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, isbn='12345'))
    assert MESSAGES['isbnInvalid'].encode() in resp.data


def test_new_book_duplicate_isbn(admin_client):
    existing = db.get_book(SEED_BOOKS['sad']['id'])
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, isbn=existing['isbn']))
    assert MESSAGES['isbnDuplicate'].encode() in resp.data


def test_new_book_invalid_year(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, publish_year='abc'))
    assert MESSAGES['yearInvalid'].encode() in resp.data


def test_new_book_year_out_of_range(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, publish_year='3000'))
    assert MESSAGES['yearOutOfRange'].encode() in resp.data


def test_new_book_invalid_category(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, category='nonsense'))
    assert MESSAGES['categoryInvalid'].encode() in resp.data


def test_new_book_zero_copies(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, copy_count='0'))
    assert MESSAGES['copyCountTooSmall'].encode() in resp.data


def test_new_book_too_many_copies(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, copy_count='51'))
    assert MESSAGES['copyCountTooLarge'].encode() in resp.data


def test_new_book_preserves_form_data_on_error(admin_client):
    resp = admin_client.post('/books/new', data=dict(_VALID_BOOK, isbn='bad'))
    assert _VALID_BOOK['title'].encode() in resp.data


# ── 修改書目 ──────────────────────────────────────────────────────────────────

_EDIT_DATA = {
    'isbn': '9789999999999', 'title': '改過的書名', 'author': '改過的作者',
    'publisher': '新出版社', 'publish_year': '2020', 'category': 'science',
    'description': '新簡介', 'book_status': 'available',
}


def test_edit_book_rejects_reader(authed_client, multi_copy_book):
    authed_client.post(f'/books/edit/{multi_copy_book}', data=_EDIT_DATA)
    assert db.get_book(multi_copy_book)['title'] == '多複本測試書'


def test_edit_book_page_renders_for_admin(admin_client, multi_copy_book):
    resp = admin_client.get(f'/books/edit/{multi_copy_book}')
    assert resp.status_code == 200
    assert '多複本測試書'.encode() in resp.data


def test_edit_book_missing_book(admin_client):
    resp = admin_client.get('/books/edit/9999')
    assert resp.status_code == 302


def test_edit_book_updates_fields(admin_client, multi_copy_book):
    resp = admin_client.post(f'/books/edit/{multi_copy_book}', data=_EDIT_DATA)
    assert resp.status_code == 302
    book = db.get_book(multi_copy_book)
    assert book['title']    == _EDIT_DATA['title']
    assert book['category'] == _EDIT_DATA['category']


def test_edit_book_keeps_own_isbn(admin_client, multi_copy_book):
    """改其他欄位、ISBN 不變時，不應被自己的 ISBN 判為重複。"""
    book = db.get_book(multi_copy_book)
    resp = admin_client.post(
        f'/books/edit/{multi_copy_book}',
        data=dict(_EDIT_DATA, isbn=book['isbn'], title='只改書名'),
    )
    assert resp.status_code == 302
    assert db.get_book(multi_copy_book)['title'] == '只改書名'


def test_edit_book_rejects_other_book_isbn(admin_client, multi_copy_book):
    other = db.get_book(SEED_BOOKS['sad']['id'])
    resp  = admin_client.post(f'/books/edit/{multi_copy_book}',
                              data=dict(_EDIT_DATA, isbn=other['isbn']))
    assert MESSAGES['isbnDuplicate'].encode() in resp.data


def test_edit_book_invalid_status(admin_client, multi_copy_book):
    resp = admin_client.post(f'/books/edit/{multi_copy_book}',
                             data=dict(_EDIT_DATA, book_status='nonsense'))
    assert MESSAGES['bookStatusInvalid'].encode() in resp.data


def test_edit_book_can_suspend_book(admin_client, multi_copy_book):
    admin_client.post(f'/books/edit/{multi_copy_book}',
                      data=dict(_EDIT_DATA, book_status='unavailable'))
    assert db.get_book(multi_copy_book)['book_status'] == 'unavailable'


# ── 下架書目 ──────────────────────────────────────────────────────────────────

def test_delete_book_rejects_reader(authed_client, multi_copy_book):
    authed_client.post(f'/books/delete/{multi_copy_book}')
    assert db.get_book(multi_copy_book) is not None


def test_delete_book_soft_deletes(admin_client, multi_copy_book):
    resp = admin_client.post(f'/books/delete/{multi_copy_book}')
    assert resp.status_code == 302
    assert db.get_book(multi_copy_book) is None


def test_delete_book_also_deletes_copies(admin_client, multi_copy_book):
    admin_client.post(f'/books/delete/{multi_copy_book}')
    assert db.list_copies(multi_copy_book) == []


def test_delete_book_blocked_while_on_loan(admin_client, multi_copy_book):
    db.borrow_book(multi_copy_book, 1)
    resp = admin_client.post(f'/books/delete/{multi_copy_book}', follow_redirects=True)
    assert MESSAGES['bookOnLoan'].encode() in resp.data
    assert db.get_book(multi_copy_book) is not None


def test_delete_book_cancels_waiting_reservations(admin_client, single_copy_book):
    db.borrow_book(single_copy_book, 2)
    db.create_reservation(single_copy_book, 1)
    db.return_loan(db.list_my_loans(2)[0]['id'], 2)   # 還書後複本回架，才可下架
    admin_client.post(f'/books/delete/{single_copy_book}')
    reservation = db.list_my_reservations(1)[0]
    assert reservation['reservation_status'] == 'cancelled'


def test_delete_missing_book(admin_client):
    resp = admin_client.post('/books/delete/9999', follow_redirects=True)
    assert MESSAGES['bookNotFound'].encode() in resp.data


# ── 複本維護 ──────────────────────────────────────────────────────────────────

def test_add_copy_rejects_reader(authed_client, multi_copy_book):
    before = len(db.list_copies(multi_copy_book))
    authed_client.post(f'/books/{multi_copy_book}/copies/add')
    assert len(db.list_copies(multi_copy_book)) == before


def test_add_copy_appends_new_barcode(admin_client, multi_copy_book):
    before = len(db.list_copies(multi_copy_book))
    resp   = admin_client.post(f'/books/{multi_copy_book}/copies/add')
    assert resp.status_code == 302
    copies = db.list_copies(multi_copy_book)
    assert len(copies) == before + 1
    assert copies[-1]['copy_barcode'].endswith('-004')


def test_add_copy_missing_book(admin_client):
    resp = admin_client.post('/books/9999/copies/add', follow_redirects=True)
    assert MESSAGES['bookNotFound'].encode() in resp.data


def test_update_copy_status_rejects_reader(authed_client, multi_copy_book):
    copy = db.list_copies(multi_copy_book)[0]
    authed_client.post(f'/books/copies/{copy["id"]}/status',
                       data={'copy_status': 'maintenance'})
    assert db.get_copy(copy['id'])['copy_status'] == 'available'


def test_update_copy_status_sets_maintenance(admin_client, multi_copy_book):
    copy = db.list_copies(multi_copy_book)[0]
    resp = admin_client.post(f'/books/copies/{copy["id"]}/status',
                             data={'copy_status': 'maintenance'})
    assert resp.status_code == 302
    assert db.get_copy(copy['id'])['copy_status'] == 'maintenance'


def test_maintenance_copy_is_not_borrowable(admin_client, single_copy_book):
    copy = db.list_copies(single_copy_book)[0]
    admin_client.post(f'/books/copies/{copy["id"]}/status',
                      data={'copy_status': 'maintenance'})
    assert db.get_book(single_copy_book)['available_copies'] == 0
    assert db.borrow_book(single_copy_book, 1)[0] == 'no_copy'


def test_update_copy_status_rejects_invalid_value(admin_client, multi_copy_book):
    copy = db.list_copies(multi_copy_book)[0]
    resp = admin_client.post(f'/books/copies/{copy["id"]}/status',
                             data={'copy_status': 'borrowed'}, follow_redirects=True)
    assert MESSAGES['copyStatusInvalid'].encode() in resp.data
    assert db.get_copy(copy['id'])['copy_status'] == 'available'


def test_update_copy_status_blocked_while_borrowed(admin_client, single_copy_book):
    db.borrow_book(single_copy_book, 1)
    copy = db.list_copies(single_copy_book)[0]
    resp = admin_client.post(f'/books/copies/{copy["id"]}/status',
                             data={'copy_status': 'lost'}, follow_redirects=True)
    assert MESSAGES['copyOnLoanStatus'].encode() in resp.data
    assert db.get_copy(copy['id'])['copy_status'] == 'borrowed'


def test_delete_copy_rejects_reader(authed_client, multi_copy_book):
    copy = db.list_copies(multi_copy_book)[0]
    authed_client.post(f'/books/copies/{copy["id"]}/delete')
    assert db.get_copy(copy['id']) is not None


def test_delete_copy_removes_it(admin_client, multi_copy_book):
    copy = db.list_copies(multi_copy_book)[0]
    resp = admin_client.post(f'/books/copies/{copy["id"]}/delete')
    assert resp.status_code == 302
    assert db.get_copy(copy['id']) is None
    assert len(db.list_copies(multi_copy_book)) == 2


def test_delete_copy_blocked_while_borrowed(admin_client, single_copy_book):
    db.borrow_book(single_copy_book, 1)
    copy = db.list_copies(single_copy_book)[0]
    resp = admin_client.post(f'/books/copies/{copy["id"]}/delete', follow_redirects=True)
    assert MESSAGES['copyOnLoanDelete'].encode() in resp.data
    assert db.get_copy(copy['id']) is not None


def test_delete_copy_missing(admin_client):
    resp = admin_client.post('/books/copies/9999/delete', follow_redirects=True)
    assert MESSAGES['copyNotFound'].encode() in resp.data


def test_new_copy_barcode_does_not_reuse_deleted_number(admin_client, multi_copy_book):
    copies = db.list_copies(multi_copy_book)
    admin_client.post(f'/books/copies/{copies[-1]["id"]}/delete')   # 刪掉 -003
    admin_client.post(f'/books/{multi_copy_book}/copies/add')
    barcodes = [c['copy_barcode'] for c in db.list_copies(multi_copy_book)]
    assert barcodes[-1].endswith('-004')
