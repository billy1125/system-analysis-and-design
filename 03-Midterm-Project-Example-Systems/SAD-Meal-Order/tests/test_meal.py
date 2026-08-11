"""
meal Blueprint 測試：菜單、餐點管理、訂餐、訂單管理

種子資料（每個測試都有，見 db/meals.py）：
  餐點 6 道（id 1–6）：A01 雞腿便當、A02 素食便當、A03 排骨便當（售完）、
                        A04 牛肉麵（停售）、B01 燙青菜、C01 紅茶
  訂單 4 張（id 1–4）：#1 completed、#2 cancelled、#3 confirmed、#4 pending

因此斷言數量時一律用**相對式**（before / after），不寫死絕對值。
"""
from datetime import date, timedelta

import pytest

import db
from tests.data.users import MEALS, MESSAGES, ORDERS, USERS


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tomorrow():
    return (date.today() + timedelta(days=1)).isoformat()


def _order_payload(items, **overrides):
    """組出訂餐表單的 payload。items = [(meal_id, qty), ...]"""
    data = {
        'pickup_date':     _tomorrow(),
        'pickup_slot':     'lunch',
        'pickup_location': '行政大樓一樓服務台',
        'order_note':      '',
        'meal_id[]':       [str(mid) for mid, _ in items],
        'quantity[]':      [str(qty) for _, qty in items],
    }
    data.update(overrides)
    return data


@pytest.fixture
def clean_client(app):
    """獨立於 authed_client / admin_client 之外的第二個 test client。

    conftest 的三個已登入 fixture 都由同一個 client 衍生，同一個測試中同時
    請求兩個會拿到同一個物件。需要兩個不同 session 時用這個。
    """
    return app.test_client()


# ── 菜單瀏覽 ──────────────────────────────────────────────────────────────────

def test_index_open_to_guest(client):
    resp = client.get('/meal/')
    assert resp.status_code == 200
    assert '今日菜單'.encode() in resp.data
    assert '雞腿便當'.encode() in resp.data


def test_index_hides_order_entry_from_guest(client):
    body = client.get('/meal/').get_data(as_text=True)
    assert '/meal/order/new' not in body
    assert '登入' in body


def test_index_shows_order_entry_to_member(authed_client):
    body = authed_client.get('/meal/').get_data(as_text=True)
    assert '/meal/order/new' in body


def test_index_hides_meal_admin_from_normal_user(authed_client):
    body = authed_client.get('/meal/').get_data(as_text=True)
    assert '/meal/new' not in body
    assert '/meal/delete/' not in body


def test_index_shows_meal_admin_to_admin(admin_client):
    body = admin_client.get('/meal/').get_data(as_text=True)
    assert '/meal/new' in body
    assert '/meal/edit/' in body


def test_index_category_filter(client):
    body = client.get('/meal/?category=drink').get_data(as_text=True)
    assert '古早味紅茶' in body
    assert '雞腿便當' not in body


def test_index_invalid_category_falls_back_to_all(client):
    body = client.get('/meal/?category=dessert').get_data(as_text=True)
    assert '雞腿便當' in body
    assert '古早味紅茶' in body


def test_index_selected_meal_detail(client):
    body = client.get(f'/meal/?meal_id={MEALS["chicken"]["id"]}').get_data(as_text=True)
    assert '古早味炸雞腿' in body


def test_index_ignores_deleted_meal_selection(client):
    db.soft_delete_meal(MEALS['chicken']['id'])
    body = client.get(f'/meal/?meal_id={MEALS["chicken"]["id"]}').get_data(as_text=True)
    assert '請從左側選擇餐點' in body


def test_index_guest_sees_deleted_meal_gone_from_list(client):
    before = db.list_meals()[1]
    db.soft_delete_meal(MEALS['tea']['id'])
    after = db.list_meals()[1]
    assert after == before - 1
    assert '古早味紅茶'.encode() not in client.get('/meal/').data


# ── 餐點管理：權限 ────────────────────────────────────────────────────────────

def test_new_meal_requires_login(client):
    resp = client.get('/meal/new')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_new_meal_forbidden_for_normal_user(authed_client):
    before = db.list_meals()[1]
    resp = authed_client.post('/meal/new', data={
        'meal_code': 'Z99', 'meal_name': '偷渡餐點', 'category': 'main',
        'price': '1', 'daily_quantity': '1', 'remaining_quantity': '1',
        'meal_status': 'available',
    })
    assert resp.status_code == 302
    assert db.list_meals()[1] == before      # 資料庫沒有改變


def test_delete_meal_forbidden_for_normal_user(authed_client):
    authed_client.post(f'/meal/delete/{MEALS["chicken"]["id"]}')
    assert db.get_meal(MEALS['chicken']['id'])['is_deleted'] == 0


def test_edit_meal_forbidden_for_normal_user(authed_client):
    authed_client.post(f'/meal/edit/{MEALS["chicken"]["id"]}', data={
        'meal_code': 'A01', 'meal_name': '被竄改', 'category': 'main',
        'price': '1', 'daily_quantity': '60', 'remaining_quantity': '60',
        'meal_status': 'available',
    })
    assert db.get_meal(MEALS['chicken']['id'])['meal_name'] == '雞腿便當'


def test_meal_admin_blocked_for_disabled_admin(other_client):
    """停用中的管理員應被第 2 層（帳號有效性）攔下，而非第 3 層。"""
    db.set_user_role(USERS['disabled']['id'], 0)
    before = db.list_meals()[1]
    resp = other_client.post('/meal/new', data={
        'meal_code': 'Z99', 'meal_name': 'X', 'category': 'main',
        'price': '1', 'daily_quantity': '1', 'remaining_quantity': '1',
        'meal_status': 'available',
    })
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_meals()[1] == before
    with other_client.session_transaction() as sess:
        assert 'user_id' not in sess       # 第 2 層失敗會清除 session


# ── 餐點管理：正常流程與驗證 ──────────────────────────────────────────────────

def test_admin_creates_meal(admin_client):
    before = db.list_meals()[1]
    resp = admin_client.post('/meal/new', data={
        'meal_code': 'A05', 'meal_name': '咖哩飯', 'meal_description': '中辣',
        'category': 'main', 'price': '85', 'daily_quantity': '30',
        'remaining_quantity': '30', 'meal_status': 'available',
    })
    assert resp.status_code == 302
    assert db.list_meals()[1] == before + 1


def test_admin_updates_meal(admin_client):
    admin_client.post(f'/meal/edit/{MEALS["chicken"]["id"]}', data={
        'meal_code': 'A01', 'meal_name': '香烤雞腿便當', 'meal_description': '改良版',
        'category': 'main', 'price': '105', 'daily_quantity': '60',
        'remaining_quantity': '50', 'meal_status': 'available',
    })
    meal = db.get_meal(MEALS['chicken']['id'])
    assert meal['meal_name'] == '香烤雞腿便當'
    assert meal['price'] == 105
    assert meal['remaining_quantity'] == 50


def test_admin_soft_deletes_meal(admin_client):
    resp = admin_client.post(f'/meal/delete/{MEALS["tea"]["id"]}')
    assert resp.status_code == 302
    assert db.get_meal(MEALS['tea']['id'])['is_deleted'] == 1   # 軟刪除，紀錄仍在


def test_edit_missing_meal_flashes(admin_client):
    resp = admin_client.get('/meal/edit/9999', follow_redirects=True)
    assert MESSAGES['mealNotFound'].encode() in resp.data


@pytest.mark.parametrize('field,value,message_key', [
    ('meal_code',          '',        'mealCodeRequired'),
    ('meal_name',          '',        'mealNameRequired'),
    ('category',           'dessert', 'mealBadCategory'),
    ('meal_status',        'yummy',   'mealBadStatus'),
    ('price',              'abc',     'mealBadPrice'),
    ('price',              '-1',      'mealNegativePrice'),
    ('daily_quantity',     'x',       'mealBadDaily'),
    ('remaining_quantity', 'x',       'mealBadRemaining'),
])
def test_meal_form_validation(admin_client, field, value, message_key):
    before = db.list_meals()[1]
    data = {
        'meal_code': 'Z01', 'meal_name': '測試餐點', 'meal_description': '',
        'category': 'main', 'price': '50', 'daily_quantity': '10',
        'remaining_quantity': '10', 'meal_status': 'available',
    }
    data[field] = value
    resp = admin_client.post('/meal/new', data=data)
    assert resp.status_code == 200
    assert MESSAGES[message_key].encode() in resp.data
    assert db.list_meals()[1] == before


def test_meal_remaining_cannot_exceed_daily(admin_client):
    resp = admin_client.post('/meal/new', data={
        'meal_code': 'Z01', 'meal_name': '測試餐點', 'category': 'main',
        'price': '50', 'daily_quantity': '10', 'remaining_quantity': '11',
        'meal_status': 'available',
    })
    assert MESSAGES['mealRemainingTooBig'].encode() in resp.data


# ── 訂餐：權限 ────────────────────────────────────────────────────────────────

def test_new_order_requires_login(client):
    resp = client.get('/meal/order/new')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_new_order_blocked_for_disabled_account(other_client):
    """持有舊 session 的停用帳號不得下單，且 session 會被清除。"""
    before = db.list_my_orders(USERS['disabled']['id'])[1]
    resp = other_client.post('/meal/order/new',
                             data=_order_payload([(MEALS['chicken']['id'], 1)]))
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_my_orders(USERS['disabled']['id'])[1] == before
    with other_client.session_transaction() as sess:
        assert 'user_id' not in sess


def test_order_form_lists_only_orderable_meals(authed_client):
    body = authed_client.get('/meal/order/new').get_data(as_text=True)
    assert '雞腿便當' in body
    assert '排骨便當' not in body     # 售完
    assert '牛肉麵' not in body       # 停售


# ── 訂餐：正常流程 ────────────────────────────────────────────────────────────

def test_create_order_succeeds(authed_client):
    before = db.list_my_orders(USERS['normal']['id'])[1]
    resp = authed_client.post('/meal/order/new', data=_order_payload([
        (MEALS['chicken']['id'], 2),
        (MEALS['tea']['id'], 1),
    ]))
    assert resp.status_code == 302
    assert db.list_my_orders(USERS['normal']['id'])[1] == before + 1


def test_create_order_computes_total(authed_client):
    authed_client.post('/meal/order/new', data=_order_payload([
        (MEALS['chicken']['id'], 2),   # 95 × 2
        (MEALS['tea']['id'], 3),       # 20 × 3
    ]))
    orders, _ = db.list_my_orders(USERS['normal']['id'])
    assert orders[0]['total_amount'] == 95 * 2 + 20 * 3


def test_create_order_snapshots_unit_price(authed_client):
    """明細的 unit_price 是下單當下的快照，事後調價不影響既有訂單。"""
    authed_client.post('/meal/order/new',
                       data=_order_payload([(MEALS['chicken']['id'], 1)]))
    orders, _ = db.list_my_orders(USERS['normal']['id'])
    order_id = orders[0]['id']

    db.update_meal(MEALS['chicken']['id'], 'A01', '雞腿便當', None, 'main',
                   999, 60, 60, 'available')

    items = db.list_order_items(order_id)
    assert items[0]['unit_price'] == 95
    assert db.get_meal_order(order_id)['total_amount'] == 95


def test_create_order_does_not_consume_stock(authed_client):
    """pending 不佔用庫存——扣減發生在管理員確認時。"""
    before = db.get_meal(MEALS['chicken']['id'])['remaining_quantity']
    authed_client.post('/meal/order/new',
                       data=_order_payload([(MEALS['chicken']['id'], 3)]))
    assert db.get_meal(MEALS['chicken']['id'])['remaining_quantity'] == before


# ── 訂餐：驗證 ────────────────────────────────────────────────────────────────

def test_order_rejects_empty_items(authed_client):
    before = db.list_my_orders(USERS['normal']['id'])[1]
    resp = authed_client.post('/meal/order/new',
                              data=_order_payload([(MEALS['chicken']['id'], 0)]))
    assert resp.status_code == 200
    assert MESSAGES['orderNoItems'].encode() in resp.data
    assert db.list_my_orders(USERS['normal']['id'])[1] == before


def test_order_rejects_past_date(authed_client):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    resp = authed_client.post('/meal/order/new', data=_order_payload(
        [(MEALS['chicken']['id'], 1)], pickup_date=yesterday))
    assert MESSAGES['orderDatePast'].encode() in resp.data


def test_order_rejects_far_future_date(authed_client):
    far = (date.today() + timedelta(days=30)).isoformat()
    resp = authed_client.post('/meal/order/new', data=_order_payload(
        [(MEALS['chicken']['id'], 1)], pickup_date=far))
    assert '最多只能預訂'.encode() in resp.data


def test_order_rejects_bad_slot(authed_client):
    resp = authed_client.post('/meal/order/new', data=_order_payload(
        [(MEALS['chicken']['id'], 1)], pickup_slot='midnight'))
    assert MESSAGES['orderBadSlot'].encode() in resp.data


def test_order_rejects_blank_location(authed_client):
    resp = authed_client.post('/meal/order/new', data=_order_payload(
        [(MEALS['chicken']['id'], 1)], pickup_location='   '))
    assert MESSAGES['orderLocationBlank'].encode() in resp.data


def test_order_rejects_sold_out_meal(authed_client):
    """A03 已售完。狀態檢查排在份數檢查之前，因此訊息是「無法訂購」而非「份數不足」。"""
    resp = authed_client.post('/meal/order/new',
                              data=_order_payload([(MEALS['pork']['id'], 1)]))
    assert '目前無法訂購'.encode() in resp.data


def test_order_rejects_available_meal_with_zero_remaining(authed_client):
    """狀態仍是「供應中」但剩餘歸零時，擋下它的才是份數檢查。"""
    db.update_meal(MEALS['vegetarian']['id'], 'A02', '素食便當', None, 'main',
                   75, 40, 0, 'available')
    resp = authed_client.post('/meal/order/new',
                              data=_order_payload([(MEALS['vegetarian']['id'], 1)]))
    assert '剩餘份數不足'.encode() in resp.data


def test_order_rejects_unavailable_meal(authed_client):
    """A04 停售但仍有剩餘份數，擋下它的是 meal_status 而非份數。"""
    resp = authed_client.post('/meal/order/new',
                              data=_order_payload([(MEALS['beef']['id'], 1)]))
    assert '目前無法訂購'.encode() in resp.data


def test_order_rejects_deleted_meal(authed_client):
    db.soft_delete_meal(MEALS['chicken']['id'])
    resp = authed_client.post('/meal/order/new',
                              data=_order_payload([(MEALS['chicken']['id'], 1)]))
    assert MESSAGES['orderItemNotFound'].encode() in resp.data


def test_order_rejects_quantity_over_remaining(authed_client):
    resp = authed_client.post('/meal/order/new',
                              data=_order_payload([(MEALS['chicken']['id'], 999)]))
    assert '剩餘份數不足'.encode() in resp.data


def test_order_rejects_negative_quantity(authed_client):
    resp = authed_client.post('/meal/order/new',
                              data=_order_payload([(MEALS['chicken']['id'], -1)]))
    assert MESSAGES['orderNegativeQty'].encode() in resp.data


def test_order_rejects_over_max_items(authed_client):
    """單張訂單總份數上限 20；本例 15 + 10 = 25。"""
    resp = authed_client.post('/meal/order/new', data=_order_payload([
        (MEALS['chicken']['id'], 15),
        (MEALS['veggie']['id'], 10),
    ]))
    assert '單張訂單最多'.encode() in resp.data


def test_order_ignores_tampered_price(authed_client):
    """表單傳來的價格一律忽略，價格從資料庫重新查詢。"""
    data = _order_payload([(MEALS['chicken']['id'], 1)])
    data['unit_price[]'] = ['1']
    data['price'] = '1'
    authed_client.post('/meal/order/new', data=data)
    orders, _ = db.list_my_orders(USERS['normal']['id'])
    assert orders[0]['total_amount'] == 95


# ── 訂單明細 ──────────────────────────────────────────────────────────────────

def test_order_detail_visible_to_owner(authed_client):
    resp = authed_client.get(f'/meal/orders/{ORDERS["pending"]["id"]}')
    assert resp.status_code == 200
    assert '訂購項目'.encode() in resp.data


def test_order_detail_visible_to_admin(admin_client):
    resp = admin_client.get(f'/meal/orders/{ORDERS["confirmed"]["id"]}')
    assert resp.status_code == 200


def test_order_detail_hidden_from_other_user(authed_client):
    """#3 是 disabled@example.com（id=3）的訂單，一般使用者不得檢視。"""
    resp = authed_client.get(f'/meal/orders/{ORDERS["confirmed"]["id"]}',
                             follow_redirects=True)
    assert MESSAGES['orderNoPermission'].encode() in resp.data


def test_order_detail_missing_order(authed_client):
    resp = authed_client.get('/meal/orders/9999', follow_redirects=True)
    assert MESSAGES['orderNotFound'].encode() in resp.data


def test_my_orders_lists_only_own_orders(authed_client):
    body = authed_client.get('/meal/my-orders').get_data(as_text=True)
    assert '#4' in body      # 自己的 pending 訂單
    assert '#3' not in body  # 別人的 confirmed 訂單


# ── 修改訂單 ──────────────────────────────────────────────────────────────────

def test_edit_pending_order_succeeds(authed_client):
    order_id = ORDERS['pending']['id']
    resp = authed_client.post(f'/meal/orders/{order_id}/edit', data=_order_payload(
        [(MEALS['tea']['id'], 4)], pickup_location='圖書館一樓大廳'))
    assert resp.status_code == 302

    order = db.get_meal_order(order_id)
    items = db.list_order_items(order_id)
    assert order['total_amount'] == 20 * 4
    assert len(items) == 1
    assert items[0]['meal_id'] == MEALS['tea']['id']


def test_edit_confirmed_order_rejected(other_client):
    """#3 已 confirmed，即使是本人也不能改。"""
    db.set_user_active(USERS['disabled']['id'], 1)   # 讓第 2 層放行，測第三個條件
    order_id = ORDERS['confirmed']['id']
    before = db.get_meal_order(order_id)['total_amount']

    resp = other_client.post(f'/meal/orders/{order_id}/edit',
                             data=_order_payload([(MEALS['tea']['id'], 1)]),
                             follow_redirects=True)
    assert MESSAGES['orderNotPending'].encode() in resp.data
    assert db.get_meal_order(order_id)['total_amount'] == before


def test_edit_other_users_order_rejected(authed_client):
    order_id = ORDERS['confirmed']['id']
    before = db.get_meal_order(order_id)['total_amount']
    resp = authed_client.post(f'/meal/orders/{order_id}/edit',
                              data=_order_payload([(MEALS['tea']['id'], 1)]),
                              follow_redirects=True)
    assert MESSAGES['orderNoEditRight'].encode() in resp.data
    assert db.get_meal_order(order_id)['total_amount'] == before


def test_edit_form_includes_unorderable_current_item(authed_client):
    """訂單中的餐點事後停售，修改表單仍須列出它，否則會被無聲刪掉。"""
    order_id = ORDERS['pending']['id']       # 內含 A01 與 B01
    db.update_meal(MEALS['chicken']['id'], 'A01', '雞腿便當', None, 'main',
                   95, 60, 60, 'unavailable')
    body = authed_client.get(f'/meal/orders/{order_id}/edit').get_data(as_text=True)
    assert '雞腿便當' in body
    assert '請將份數改為 0' in body


# ── 取消訂單 ──────────────────────────────────────────────────────────────────

def test_cancel_pending_order(authed_client):
    order_id = ORDERS['pending']['id']
    resp = authed_client.post(f'/meal/orders/{order_id}/cancel')
    assert resp.status_code == 302
    assert db.get_meal_order(order_id)['order_status'] == 'cancelled'


def test_cancel_pending_order_does_not_restock(authed_client):
    """pending 未佔用庫存，取消時也不該回補。"""
    before = db.get_meal(MEALS['chicken']['id'])['remaining_quantity']
    authed_client.post(f'/meal/orders/{ORDERS["pending"]["id"]}/cancel')
    assert db.get_meal(MEALS['chicken']['id'])['remaining_quantity'] == before


def test_cancel_confirmed_order_restocks(other_client):
    """#3 為 confirmed，含 A02 × 2 與 B01 × 1；取消後庫存須回補。"""
    db.set_user_active(USERS['disabled']['id'], 1)
    veg_before = db.get_meal(MEALS['vegetarian']['id'])['remaining_quantity']
    side_before = db.get_meal(MEALS['veggie']['id'])['remaining_quantity']

    other_client.post(f'/meal/orders/{ORDERS["confirmed"]["id"]}/cancel')

    assert db.get_meal(MEALS['vegetarian']['id'])['remaining_quantity'] == veg_before + 2
    assert db.get_meal(MEALS['veggie']['id'])['remaining_quantity'] == side_before + 1


def test_cancel_completed_order_fails(authed_client):
    order_id = ORDERS['completed']['id']
    resp = authed_client.post(f'/meal/orders/{order_id}/cancel', follow_redirects=True)
    assert MESSAGES['orderCancelFailed'].encode() in resp.data
    assert db.get_meal_order(order_id)['order_status'] == 'completed'


def test_cancel_other_users_order_fails(authed_client):
    order_id = ORDERS['confirmed']['id']
    authed_client.post(f'/meal/orders/{order_id}/cancel')
    assert db.get_meal_order(order_id)['order_status'] == 'confirmed'


# ── 管理端：清單與權限 ────────────────────────────────────────────────────────

def test_admin_orders_requires_admin(authed_client):
    """第 3 層失敗導回首頁。flash 的「無操作權限」不會顯示——hub/home.html
    沒有渲染 flash 區塊，這是刻意保留的缺陷，記錄為 KI-M6。"""
    resp = authed_client.get('/meal/admin/orders')
    assert resp.status_code == 302
    assert resp.headers['Location'].endswith('/')


def test_admin_orders_lists_all(admin_client):
    body = admin_client.get('/meal/admin/orders').get_data(as_text=True)
    for key in ('completed', 'cancelled', 'confirmed', 'pending'):
        assert f'#{ORDERS[key]["id"]}' in body


def test_admin_orders_status_filter(admin_client):
    body = admin_client.get('/meal/admin/orders?status=pending').get_data(as_text=True)
    assert f'#{ORDERS["pending"]["id"]}' in body
    assert f'#{ORDERS["completed"]["id"]}' not in body


def test_admin_orders_invalid_status_shows_all(admin_client):
    body = admin_client.get('/meal/admin/orders?status=weird').get_data(as_text=True)
    assert f'#{ORDERS["completed"]["id"]}' in body


# ── 管理端：審核動作 ──────────────────────────────────────────────────────────

def test_confirm_order_deducts_stock(admin_client):
    """#4 為 pending，含 A01 × 2 與 B01 × 2。"""
    order_id = ORDERS['pending']['id']
    a01_before = db.get_meal(MEALS['chicken']['id'])['remaining_quantity']
    b01_before = db.get_meal(MEALS['veggie']['id'])['remaining_quantity']

    resp = admin_client.post(f'/meal/admin/orders/{order_id}/confirm',
                             data={'review_note': '已通知廚房'})
    assert resp.status_code == 302

    order = db.get_meal_order(order_id)
    assert order['order_status'] == 'confirmed'
    assert order['reviewed_by'] == USERS['admin']['id']
    assert order['review_note'] == '已通知廚房'
    assert db.get_meal(MEALS['chicken']['id'])['remaining_quantity'] == a01_before - 2
    assert db.get_meal(MEALS['veggie']['id'])['remaining_quantity'] == b01_before - 2


def test_confirm_fails_when_stock_insufficient(admin_client):
    """管理員確認前，餐點已被調低到不足以支應這張訂單。"""
    order_id = ORDERS['pending']['id']
    db.update_meal(MEALS['chicken']['id'], 'A01', '雞腿便當', None, 'main',
                   95, 60, 1, 'available')

    resp = admin_client.post(f'/meal/admin/orders/{order_id}/confirm',
                             data={}, follow_redirects=True)
    assert MESSAGES['orderConfirmFailed'].encode() in resp.data
    assert db.get_meal_order(order_id)['order_status'] == 'pending'
    # 整張退回，另一項也不得被扣
    assert db.get_meal(MEALS['chicken']['id'])['remaining_quantity'] == 1


def test_confirm_fails_when_meal_unavailable(admin_client):
    order_id = ORDERS['pending']['id']
    db.update_meal(MEALS['chicken']['id'], 'A01', '雞腿便當', None, 'main',
                   95, 60, 60, 'unavailable')
    resp = admin_client.post(f'/meal/admin/orders/{order_id}/confirm',
                             data={}, follow_redirects=True)
    assert MESSAGES['orderConfirmFailed'].encode() in resp.data
    assert db.get_meal_order(order_id)['order_status'] == 'pending'


def test_confirm_non_pending_order_fails(admin_client):
    order_id = ORDERS['confirmed']['id']
    resp = admin_client.post(f'/meal/admin/orders/{order_id}/confirm',
                             data={}, follow_redirects=True)
    assert MESSAGES['orderConfirmFailed'].encode() in resp.data


def test_reject_order(admin_client):
    order_id = ORDERS['pending']['id']
    a01_before = db.get_meal(MEALS['chicken']['id'])['remaining_quantity']

    resp = admin_client.post(f'/meal/admin/orders/{order_id}/reject',
                             data={'review_note': '今日已額滿'})
    assert resp.status_code == 302

    order = db.get_meal_order(order_id)
    assert order['order_status'] == 'rejected'
    assert order['review_note'] == '今日已額滿'
    # pending 未佔用庫存，拒絕也不動庫存
    assert db.get_meal(MEALS['chicken']['id'])['remaining_quantity'] == a01_before


def test_reject_non_pending_order_fails(admin_client):
    resp = admin_client.post(f'/meal/admin/orders/{ORDERS["completed"]["id"]}/reject',
                             data={}, follow_redirects=True)
    assert MESSAGES['orderRejectFailed'].encode() in resp.data


def test_complete_confirmed_order(admin_client):
    order_id = ORDERS['confirmed']['id']
    veg_before = db.get_meal(MEALS['vegetarian']['id'])['remaining_quantity']

    resp = admin_client.post(f'/meal/admin/orders/{order_id}/complete')
    assert resp.status_code == 302
    assert db.get_meal_order(order_id)['order_status'] == 'completed'
    # 已取餐不回補：那份額度是真的消耗掉了
    assert db.get_meal(MEALS['vegetarian']['id'])['remaining_quantity'] == veg_before


def test_complete_pending_order_fails(admin_client):
    order_id = ORDERS['pending']['id']
    resp = admin_client.post(f'/meal/admin/orders/{order_id}/complete',
                             follow_redirects=True)
    assert MESSAGES['orderCompleteFailed'].encode() in resp.data
    assert db.get_meal_order(order_id)['order_status'] == 'pending'


def test_admin_cancel_confirmed_order_restocks(admin_client):
    order_id = ORDERS['confirmed']['id']
    veg_before = db.get_meal(MEALS['vegetarian']['id'])['remaining_quantity']

    resp = admin_client.post(f'/meal/admin/orders/{order_id}/cancel')
    assert resp.status_code == 302
    assert db.get_meal_order(order_id)['order_status'] == 'cancelled'
    assert db.get_meal(MEALS['vegetarian']['id'])['remaining_quantity'] == veg_before + 2


def test_admin_review_actions_forbidden_for_normal_user(authed_client):
    order_id = ORDERS['pending']['id']
    for action in ('confirm', 'reject', 'complete', 'cancel'):
        resp = authed_client.post(f'/meal/admin/orders/{order_id}/{action}', data={})
        assert resp.status_code == 302
    assert db.get_meal_order(order_id)['order_status'] == 'pending'


# ── 庫存不變量：確認後取消，庫存回到原點 ──────────────────────────────────────

def test_confirm_then_cancel_restores_stock(admin_client, clean_client):
    """confirm 扣減、cancel 回補，兩者相消後庫存必須回到原值。"""
    order_id = ORDERS['pending']['id']
    a01_before = db.get_meal(MEALS['chicken']['id'])['remaining_quantity']

    admin_client.post(f'/meal/admin/orders/{order_id}/confirm', data={})
    assert db.get_meal(MEALS['chicken']['id'])['remaining_quantity'] == a01_before - 2

    with clean_client.session_transaction() as sess:
        sess['user_id'] = USERS['normal']['id']
    clean_client.post(f'/meal/orders/{order_id}/cancel')

    assert db.get_meal(MEALS['chicken']['id'])['remaining_quantity'] == a01_before


def test_restock_capped_by_daily_quantity(admin_client):
    """回補以 daily_quantity 封頂，避免管理員調低供應量後庫存溢出。"""
    order_id = ORDERS['confirmed']['id']     # 含 A02 × 2
    # 目前 A02：daily 40、remaining 38（種子訂單 #3 已佔用 2 份）
    db.update_meal(MEALS['vegetarian']['id'], 'A02', '素食便當', None, 'main',
                   75, 38, 38, 'available')
    admin_client.post(f'/meal/admin/orders/{order_id}/cancel')
    meal = db.get_meal(MEALS['vegetarian']['id'])
    assert meal['remaining_quantity'] == meal['daily_quantity'] == 38
