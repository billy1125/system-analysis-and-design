import pytest

import db
from tests.data.users import MESSAGES


# ── Local fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def equipment(app):
    return db.create_equipment(
        name='測試投影機', code='PJ-001', description='教室用投影機',
        total_qty=3, available_qty=3, status='available',
    )


@pytest.fixture
def unavailable_equipment(app):
    return db.create_equipment(
        name='維修中設備', code='MNT-001', description=None,
        total_qty=1, available_qty=0, status='maintenance',
    )


@pytest.fixture
def borrow_order(app, equipment):
    return db.create_borrow_order(
        borrower_id=1,
        start_at='2099-01-01 09:00:00',
        end_at='2099-01-02 18:00:00',
        reason='課堂展示',
        items=[(equipment, 1)],
    )


# ── 器材清單瀏覽 ────────────────────────────────────────────────────────────────

def test_index_anonymous(client, equipment):
    """器材清單開放訪客瀏覽。"""
    resp = client.get('/equipment/')
    assert resp.status_code == 200
    assert '測試投影機' in resp.get_data(as_text=True)


def test_index_authed(authed_client, equipment):
    resp = authed_client.get('/equipment/')
    assert resp.status_code == 200
    assert '測試投影機' in resp.get_data(as_text=True)


def test_index_show_selected(client, equipment):
    resp = client.get(f'/equipment/?id={equipment}')
    assert resp.status_code == 200
    assert 'PJ-001' in resp.get_data(as_text=True)


def test_index_deleted_equipment_not_shown(client, equipment):
    db.soft_delete_equipment(equipment)
    resp = client.get('/equipment/')
    assert '測試投影機' not in resp.get_data(as_text=True)


def test_index_disabled_user_sees_guest_view(other_client):
    """停用帳號在開放瀏覽頁被視為訪客，不 redirect（_current_user 回傳 None）。"""
    resp = other_client.get('/equipment/')
    assert resp.status_code == 200
    assert '登入' in resp.get_data(as_text=True)


def test_seed_equipment_present(client):
    """init_db() 應植入種子器材。"""
    items, total = db.list_equipment(page=1, page_size=50)
    assert total == 8
    assert '單槍投影機' in [e['equipment_name'] for e in items]


# ── 器材管理 ────────────────────────────────────────────────────────────────────

def test_new_equipment_admin_get(admin_client):
    resp = admin_client.get('/equipment/new')
    assert resp.status_code == 200


def test_new_equipment_normal_user_redirect(authed_client):
    resp = authed_client.get('/equipment/new')
    assert resp.status_code == 302


def test_new_equipment_anonymous_redirect(client):
    resp = client.get('/equipment/new')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_new_equipment_disabled_user_redirects_to_login(other_client):
    """第 2 層守門：帳號失效時清 session 並導回登入，而非顯示權限不足。"""
    resp = other_client.get('/equipment/new')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_new_equipment_success(admin_client):
    resp = admin_client.post('/equipment/new', data={
        'equipment_name': '麥克風',
        'equipment_code': 'MIC-999',
        'equipment_description': '無線麥克風',
        'total_quantity': '5',
        'available_quantity': '5',
        'equipment_status': 'available',
    })
    assert resp.status_code == 302
    items, total = db.list_equipment(page=1, page_size=50)
    assert '麥克風' in [e['equipment_name'] for e in items]


def test_new_equipment_missing_name(admin_client):
    resp = admin_client.post('/equipment/new', data={
        'equipment_name': '',
        'equipment_code': 'MIC-002',
        'total_quantity': '1',
        'available_quantity': '1',
        'equipment_status': 'available',
    })
    assert resp.status_code == 200
    assert MESSAGES['eqNameRequired'] in resp.get_data(as_text=True)


def test_new_equipment_available_exceeds_total(admin_client):
    resp = admin_client.post('/equipment/new', data={
        'equipment_name': '測試器材',
        'equipment_code': 'TST-001',
        'total_quantity': '3',
        'available_quantity': '5',
        'equipment_status': 'available',
    })
    assert resp.status_code == 200
    assert MESSAGES['eqAvailableExceedsTotal'] in resp.get_data(as_text=True)


def test_new_equipment_invalid_status(admin_client):
    resp = admin_client.post('/equipment/new', data={
        'equipment_name': '測試器材',
        'equipment_code': 'TST-002',
        'total_quantity': '1',
        'available_quantity': '1',
        'equipment_status': 'broken',
    })
    assert resp.status_code == 200
    assert MESSAGES['eqInvalidStatus'] in resp.get_data(as_text=True)


def test_edit_equipment_admin(admin_client, equipment):
    resp = admin_client.post(f'/equipment/edit/{equipment}', data={
        'equipment_name': '修改後投影機',
        'equipment_code': 'PJ-001',
        'equipment_description': '',
        'total_quantity': '3',
        'available_quantity': '2',
        'equipment_status': 'available',
    })
    assert resp.status_code == 302
    eq = db.get_equipment(equipment)
    assert eq['equipment_name'] == '修改後投影機'
    assert eq['available_quantity'] == 2


def test_edit_equipment_normal_user_redirect(authed_client, equipment):
    resp = authed_client.post(f'/equipment/edit/{equipment}', data={
        'equipment_name': '惡意修改',
        'equipment_code': 'PJ-001',
        'total_quantity': '3',
        'available_quantity': '3',
        'equipment_status': 'available',
    })
    assert resp.status_code == 302
    assert db.get_equipment(equipment)['equipment_name'] == '測試投影機'


def test_delete_equipment_admin(admin_client, equipment):
    resp = admin_client.post(f'/equipment/delete/{equipment}')
    assert resp.status_code == 302
    assert db.get_equipment(equipment) is None


def test_delete_equipment_normal_user_redirect(authed_client, equipment):
    resp = authed_client.post(f'/equipment/delete/{equipment}')
    assert resp.status_code == 302
    assert db.get_equipment(equipment) is not None


# ── 借用申請 ────────────────────────────────────────────────────────────────────

def test_borrow_anonymous_redirect(client, equipment):
    resp = client.get(f'/equipment/{equipment}/borrow')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_borrow_disabled_user_redirects_to_login(other_client, equipment):
    resp = other_client.post(f'/equipment/{equipment}/borrow', data={
        'quantity': '1',
        'borrow_start_at': '2099-06-01T09:00',
        'borrow_end_at':   '2099-06-02T18:00',
        'borrow_reason':   '測試',
    })
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_my_orders(3) == []


def test_borrow_get_authed(authed_client, equipment):
    resp = authed_client.get(f'/equipment/{equipment}/borrow')
    assert resp.status_code == 200
    assert '申請借用' in resp.get_data(as_text=True)


def test_borrow_success(authed_client, equipment):
    resp = authed_client.post(f'/equipment/{equipment}/borrow', data={
        'quantity': '1',
        'borrow_start_at': '2099-06-01T09:00',
        'borrow_end_at':   '2099-06-02T18:00',
        'borrow_reason':   '課堂展示',
    })
    assert resp.status_code == 302
    orders = db.list_my_orders(1)
    assert len(orders) == 1
    assert orders[0]['order_status'] == 'pending'
    items = db.list_order_items(orders[0]['id'])
    assert len(items) == 1
    assert items[0]['quantity'] == 1


def test_borrow_does_not_change_stock(authed_client, equipment):
    """送出申請不扣減庫存；扣減發生在登記借出。"""
    before = db.get_equipment(equipment)['available_quantity']
    authed_client.post(f'/equipment/{equipment}/borrow', data={
        'quantity': '2',
        'borrow_start_at': '2099-06-01T09:00',
        'borrow_end_at':   '2099-06-02T18:00',
        'borrow_reason':   '課堂展示',
    })
    assert db.get_equipment(equipment)['available_quantity'] == before


def test_borrow_empty_reason(authed_client, equipment):
    resp = authed_client.post(f'/equipment/{equipment}/borrow', data={
        'quantity': '1',
        'borrow_start_at': '2099-06-01T09:00',
        'borrow_end_at':   '2099-06-02T18:00',
        'borrow_reason':   '',
    })
    assert resp.status_code == 200
    assert MESSAGES['eqReasonRequired'] in resp.get_data(as_text=True)


def test_borrow_end_before_start(authed_client, equipment):
    resp = authed_client.post(f'/equipment/{equipment}/borrow', data={
        'quantity': '1',
        'borrow_start_at': '2099-06-02T09:00',
        'borrow_end_at':   '2099-06-01T18:00',
        'borrow_reason':   '測試',
    })
    assert resp.status_code == 200
    assert MESSAGES['eqEndBeforeStart'] in resp.get_data(as_text=True)


def test_borrow_quantity_exceeds_available(authed_client, equipment):
    resp = authed_client.post(f'/equipment/{equipment}/borrow', data={
        'quantity': '99',
        'borrow_start_at': '2099-06-01T09:00',
        'borrow_end_at':   '2099-06-02T18:00',
        'borrow_reason':   '測試',
    })
    assert resp.status_code == 200
    assert '借用數量不可大於可借數量' in resp.get_data(as_text=True)
    assert db.list_my_orders(1) == []


def test_borrow_unavailable_equipment(authed_client, unavailable_equipment):
    """器材狀態非 available 時，伺服器端擋下借用，不只是隱藏按鈕。"""
    resp = authed_client.post(f'/equipment/{unavailable_equipment}/borrow', data={
        'quantity': '1',
        'borrow_start_at': '2099-06-01T09:00',
        'borrow_end_at':   '2099-06-02T18:00',
        'borrow_reason':   '測試',
    })
    assert resp.status_code == 302
    assert db.list_my_orders(1) == []


# ── 我的借用紀錄 ────────────────────────────────────────────────────────────────

def test_my_orders_anonymous_redirect(client):
    resp = client.get('/equipment/my-orders')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_my_orders_authed(authed_client, borrow_order):
    resp = authed_client.get('/equipment/my-orders')
    assert resp.status_code == 200
    assert '課堂展示' in resp.get_data(as_text=True)


# ── 借用單詳細 ──────────────────────────────────────────────────────────────────

def test_order_detail_owner(authed_client, borrow_order):
    resp = authed_client.get(f'/equipment/orders/{borrow_order}')
    assert resp.status_code == 200
    assert '課堂展示' in resp.get_data(as_text=True)


def test_order_detail_other_user_redirect(other_client, borrow_order):
    """他人（有效帳號但非借用者、非管理員）不可檢視借用單。"""
    db.set_user_active(3, 1)
    resp = other_client.get(f'/equipment/orders/{borrow_order}', follow_redirects=True)
    assert MESSAGES['eqOrderForbidden'] in resp.get_data(as_text=True)


def test_order_detail_admin(admin_client, borrow_order):
    resp = admin_client.get(f'/equipment/orders/{borrow_order}')
    assert resp.status_code == 200


# ── 修改借用申請 ────────────────────────────────────────────────────────────────

def test_edit_order_owner_success(authed_client, borrow_order, equipment):
    resp = authed_client.post(f'/equipment/orders/{borrow_order}/edit', data={
        'borrow_start_at': '2099-07-01T09:00',
        'borrow_end_at':   '2099-07-03T18:00',
        'borrow_reason':   '改為社團活動',
        'equipment_id[]':  str(equipment),
        'quantity[]':      '2',
    })
    assert resp.status_code == 302
    order = db.get_borrow_order(borrow_order)
    assert order['borrow_reason'] == '改為社團活動'
    items = db.list_order_items(borrow_order)
    assert len(items) == 1
    assert items[0]['quantity'] == 2


def test_edit_order_other_user_forbidden(other_client, borrow_order):
    db.set_user_active(3, 1)
    resp = other_client.post(f'/equipment/orders/{borrow_order}/edit', data={
        'borrow_start_at': '2099-07-01T09:00',
        'borrow_end_at':   '2099-07-03T18:00',
        'borrow_reason':   '惡意修改',
    })
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['borrow_reason'] == '課堂展示'


def test_edit_order_not_pending_forbidden(authed_client, borrow_order):
    """已核准的借用單不可再由使用者自行修改。"""
    db.approve_order(borrow_order, admin_id=2, note=None)
    resp = authed_client.post(f'/equipment/orders/{borrow_order}/edit', data={
        'borrow_start_at': '2099-07-01T09:00',
        'borrow_end_at':   '2099-07-03T18:00',
        'borrow_reason':   '核准後修改',
    })
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['borrow_reason'] == '課堂展示'


# ── 取消借用申請 ────────────────────────────────────────────────────────────────

def test_cancel_order_owner(authed_client, borrow_order):
    resp = authed_client.post(f'/equipment/orders/{borrow_order}/cancel')
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['order_status'] == 'cancelled'


def test_cancel_order_other_user_fail(other_client, borrow_order):
    db.set_user_active(3, 1)
    resp = other_client.post(f'/equipment/orders/{borrow_order}/cancel')
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['order_status'] == 'pending'


def test_cancel_order_after_borrowed_fail(authed_client, borrow_order):
    """已借出的借用單不可取消，只能登記歸還。"""
    db.approve_order(borrow_order, admin_id=2, note=None)
    db.mark_order_borrowed(borrow_order)
    resp = authed_client.post(f'/equipment/orders/{borrow_order}/cancel')
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['order_status'] == 'borrowed'


# ── 管理員審核 ──────────────────────────────────────────────────────────────────

def test_admin_orders_normal_user_redirect(authed_client):
    resp = authed_client.get('/equipment/admin/orders', follow_redirects=True)
    assert MESSAGES['adminForbidden'] in resp.get_data(as_text=True)


def test_admin_orders_anonymous_redirect(client):
    resp = client.get('/equipment/admin/orders')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_admin_approve_success(admin_client, borrow_order):
    resp = admin_client.post(
        f'/equipment/admin/orders/{borrow_order}/approve',
        data={'review_note': '同意'},
    )
    assert resp.status_code == 302
    order = db.get_borrow_order(borrow_order)
    assert order['order_status'] == 'approved'
    assert order['reviewed_by'] == 2
    assert order['review_note'] == '同意'


def test_admin_approve_does_not_reserve_stock(admin_client, borrow_order, equipment):
    """核准不保留庫存——這是刻意保留的行為，扣減只發生在登記借出。"""
    before = db.get_equipment(equipment)['available_quantity']
    admin_client.post(f'/equipment/admin/orders/{borrow_order}/approve', data={})
    assert db.get_equipment(equipment)['available_quantity'] == before


def test_admin_reject_success(admin_client, borrow_order):
    resp = admin_client.post(
        f'/equipment/admin/orders/{borrow_order}/reject',
        data={'review_note': '數量不足'},
    )
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['order_status'] == 'rejected'


def test_admin_approve_normal_user_redirect(authed_client, borrow_order):
    resp = authed_client.post(
        f'/equipment/admin/orders/{borrow_order}/approve',
        data={'review_note': ''},
    )
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['order_status'] == 'pending'


def test_admin_approve_already_approved_fail(admin_client, borrow_order):
    db.approve_order(borrow_order, admin_id=2, note=None)
    resp = admin_client.post(
        f'/equipment/admin/orders/{borrow_order}/approve',
        data={'review_note': ''},
        follow_redirects=True,
    )
    assert MESSAGES['eqApproveFailed'] in resp.get_data(as_text=True)


# ── 登記借出與歸還 ──────────────────────────────────────────────────────────────

def test_admin_borrow_success(admin_client, borrow_order, equipment):
    db.approve_order(borrow_order, admin_id=2, note=None)
    eq_before = db.get_equipment(equipment)
    resp = admin_client.post(f'/equipment/admin/orders/{borrow_order}/borrow')
    assert resp.status_code == 302
    order = db.get_borrow_order(borrow_order)
    assert order['order_status'] == 'borrowed'
    assert order['actual_borrowed_at'] is not None
    eq_after = db.get_equipment(equipment)
    assert eq_after['available_quantity'] == eq_before['available_quantity'] - 1


def test_admin_borrow_not_approved_fail(admin_client, borrow_order):
    resp = admin_client.post(f'/equipment/admin/orders/{borrow_order}/borrow')
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['order_status'] == 'pending'


def test_admin_return_success(admin_client, borrow_order, equipment):
    db.approve_order(borrow_order, admin_id=2, note=None)
    db.mark_order_borrowed(borrow_order)
    eq_after_borrow = db.get_equipment(equipment)
    resp = admin_client.post(f'/equipment/admin/orders/{borrow_order}/return')
    assert resp.status_code == 302
    order = db.get_borrow_order(borrow_order)
    assert order['order_status'] == 'returned'
    assert order['actual_returned_at'] is not None
    eq_after_return = db.get_equipment(equipment)
    assert eq_after_return['available_quantity'] == eq_after_borrow['available_quantity'] + 1


def test_admin_return_not_borrowed_fail(admin_client, borrow_order):
    resp = admin_client.post(f'/equipment/admin/orders/{borrow_order}/return')
    assert resp.status_code == 302
    assert db.get_borrow_order(borrow_order)['order_status'] == 'pending'


def test_return_twice_does_not_inflate_stock(admin_client, borrow_order, equipment):
    """重複登記歸還不會讓可借數量超過總數量（MIN 夾住）。"""
    total = db.get_equipment(equipment)['total_quantity']
    db.approve_order(borrow_order, admin_id=2, note=None)
    db.mark_order_borrowed(borrow_order)
    admin_client.post(f'/equipment/admin/orders/{borrow_order}/return')
    admin_client.post(f'/equipment/admin/orders/{borrow_order}/return')
    assert db.get_equipment(equipment)['available_quantity'] == total


def test_approve_rechecks_stock_after_borrowed(admin_client, app):
    """核准當下會重新檢查可借數量：庫存已被借光時，後一張單無法核准。"""
    eq_id = db.create_equipment(
        name='限量器材', code='LTD-001', description=None,
        total_qty=1, available_qty=1, status='available',
    )
    order1 = db.create_borrow_order(
        borrower_id=1, start_at='2099-01-01 09:00:00', end_at='2099-01-02 18:00:00',
        reason='第一張', items=[(eq_id, 1)],
    )
    db.approve_order(order1, admin_id=2, note=None)
    db.mark_order_borrowed(order1)

    order2 = db.create_borrow_order(
        borrower_id=1, start_at='2099-01-01 09:00:00', end_at='2099-01-02 18:00:00',
        reason='第二張', items=[(eq_id, 1)],
    )
    assert db.approve_order(order2, admin_id=2, note=None) is False
    assert db.get_borrow_order(order2)['order_status'] == 'pending'


def test_available_quantity_not_below_zero(admin_client, app):
    """核准不保留庫存：兩張單可同時核准，但第二張在登記借出時被擋下，數量不會變負數。"""
    eq_id = db.create_equipment(
        name='限量器材', code='LTD-002', description=None,
        total_qty=1, available_qty=1, status='available',
    )
    order1 = db.create_borrow_order(
        borrower_id=1, start_at='2099-01-01 09:00:00', end_at='2099-01-02 18:00:00',
        reason='第一張', items=[(eq_id, 1)],
    )
    order2 = db.create_borrow_order(
        borrower_id=1, start_at='2099-01-01 09:00:00', end_at='2099-01-02 18:00:00',
        reason='第二張', items=[(eq_id, 1)],
    )
    # 兩張都在庫存尚未扣減前核准——核准不保留庫存，因此兩張都會通過
    assert db.approve_order(order1, admin_id=2, note=None) is True
    assert db.approve_order(order2, admin_id=2, note=None) is True

    assert db.mark_order_borrowed(order1) is True
    assert db.mark_order_borrowed(order2) is False
    assert db.get_equipment(eq_id)['available_quantity'] == 0
    assert db.get_borrow_order(order2)['order_status'] == 'approved'
