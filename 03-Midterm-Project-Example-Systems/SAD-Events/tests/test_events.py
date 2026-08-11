"""
events Blueprint 測試：校園活動報名系統

種子資料共五筆活動（見 db/events.py 的 _SEED_EVENTS），
每一筆對應一種活動狀態，因此多數狀態測試不需要自行建立資料。
新建立的活動 id 從 6 開始。
"""
from datetime import datetime, timedelta

import pytest

import db
from tests.data.users import MESSAGES, SEED_EVENTS, USERS


# ── Helpers ────────────────────────────────────────────────────────────────────

def _dt(days=7, hours=0):
    """資料庫儲存格式 'YYYY-MM-DD HH:MM:SS'。"""
    return (datetime.now() + timedelta(days=days, hours=hours)).strftime('%Y-%m-%d %H:%M:%S')


def _dt_input(days=7, hours=0):
    """datetime-local input 送出的格式 'YYYY-MM-DDTHH:MM'。"""
    return (datetime.now() + timedelta(days=days, hours=hours)).strftime('%Y-%m-%dT%H:%M')


def _event_form(**overrides):
    """完整的活動表單資料，可用關鍵字覆寫個別欄位。"""
    form = {
        'event_title': '新建活動',
        'event_datetime': _dt_input(7),
        'event_place': '活動地點',
        'capacity': '20',
        'registration_start_at': '',
        'registration_end_at': '',
        'event_note': '活動說明內容',
        'event_target': '',
        'event_contact': '',
        'event_notice': '',
    }
    form.update(overrides)
    return form


def _enable_other(user_id=3):
    """啟用種子的停用帳號，使它能通過 _current_user() 的帳號有效性檢查。

    events 的 _current_user() 會把停用帳號視為 None，因此「非本人、非管理員」
    的權限測試必須先啟用，否則會被更前面的守門攔下，測不到權限那一層。
    """
    db.set_user_active(user_id, 1)


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def event(app):
    """可報名的未來活動，發起者為 user_id=1。"""
    return db.create_event(
        event_title='測試活動', event_datetime=_dt(7),
        event_place='測試地點', capacity=10,
        registration_start_at=None, registration_end_at=None,
        event_note='活動詳細內容', event_target=None,
        event_contact=None, event_notice=None, user_id=1,
    )


@pytest.fixture
def registered(app, event):
    """可報名活動，且 user_id=1 已完成報名。"""
    db.create_or_restore_registration(
        event_id=event, user_id=1, meal_type=1,
        participant_name='報名者姓名', participant_phone='0912345678',
        participant_email=None, registration_note=None,
    )
    return event


# ── 種子資料 ───────────────────────────────────────────────────────────────────

def test_seed_events_created(app):
    events, total = db.list_events(page=1, page_size=10)
    assert total == 5
    titles = [e['event_title'] for e in events]
    for meta in SEED_EVENTS.values():
        assert meta['title'] in titles


def test_seed_events_cover_all_five_statuses(client):
    """活動列表一開啟就應同時看到五種狀態 badge。"""
    body = client.get('/events').get_data(as_text=True)
    for status in ('available', 'full', 'closed', 'not_open', 'ended'):
        assert f'events-badge-{status}' in body


def test_seed_full_event_is_at_capacity(app):
    eid = SEED_EVENTS['full']['id']
    assert db.count_registered(eid) == SEED_EVENTS['full']['capacity']


# ── 瀏覽功能 ───────────────────────────────────────────────────────────────────

def test_events_index_anonymous(client, event):
    resp = client.get('/events')
    assert resp.status_code == 200
    assert '活動清單'.encode() in resp.data


def test_events_detail_anonymous(client, event):
    resp = client.get(f'/events?event_id={event}')
    assert resp.status_code == 200
    assert '活動詳細內容'.encode() in resp.data


def test_events_registrants_visible_anonymous(client, registered):
    """公開檢視只顯示報名者與報名時間，聯絡資訊不外流。"""
    body = client.get(f'/events?event_id={registered}').get_data(as_text=True)
    assert '一般使用者' in body
    assert '0912345678' not in body


def test_events_full_registrant_list_for_organizer(authed_client, registered):
    body = authed_client.get(f'/events?event_id={registered}').get_data(as_text=True)
    assert '0912345678' in body


def test_events_full_registrant_list_for_admin(admin_client, registered):
    body = admin_client.get(f'/events?event_id={registered}').get_data(as_text=True)
    assert '0912345678' in body


def test_events_full_registrant_list_hidden_from_other(other_client, registered):
    _enable_other()
    body = other_client.get(f'/events?event_id={registered}').get_data(as_text=True)
    assert '0912345678' not in body


def test_events_deleted_hidden_from_list(client, event):
    db.soft_delete_event(event)
    body = client.get('/events?page=2').get_data(as_text=True)
    assert '測試活動' not in body


def test_events_deleted_detail_not_rendered(client, event):
    db.soft_delete_event(event)
    body = client.get(f'/events?event_id={event}').get_data(as_text=True)
    assert '活動詳細內容' not in body
    assert '請從左側選擇活動' in body


def test_events_pagination(client, event):
    """五筆種子活動 + 一筆 fixture 活動 = 6 筆，每頁 5 筆，應出現第二頁。"""
    body = client.get('/events?page=1').get_data(as_text=True)
    assert '下一頁' in body
    assert '第 1 頁 / 共 2 頁' in body


def test_events_index_hides_action_column_for_guest(client):
    body = client.get('/events').get_data(as_text=True)
    assert '+ 新增活動' not in body


# ── 新增活動 ───────────────────────────────────────────────────────────────────

def test_new_event_requires_login(client):
    resp = client.get('/events/new')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_new_event_get(authed_client):
    resp = authed_client.get('/events/new')
    assert resp.status_code == 200
    assert '新增活動'.encode() in resp.data


def test_new_event_post_success(authed_client):
    resp = authed_client.post('/events/new', data=_event_form())
    assert resp.status_code == 302
    events, _ = db.list_events(page=1, page_size=50)
    assert any(e['event_title'] == '新建活動' for e in events)


def test_new_event_creates_both_tables(authed_client):
    authed_client.post('/events/new', data=_event_form(event_title='雙表建立測試',
                                                       event_note='詳細說明'))
    events, _ = db.list_events(page=1, page_size=50)
    ev = next(e for e in events if e['event_title'] == '雙表建立測試')
    assert db.get_event(ev['id'])['event_note'] == '詳細說明'


def test_new_event_by_admin(admin_client):
    resp = admin_client.post('/events/new', data=_event_form(event_title='管理員活動'))
    assert resp.status_code == 302
    events, _ = db.list_events(page=1, page_size=50)
    assert any(e['event_title'] == '管理員活動' for e in events)


def test_new_event_disabled_user_redirected_to_login(other_client):
    """持有舊 session 的停用帳號應被 _current_user() 攔下並清除 session。"""
    before, _ = db.list_events(page=1, page_size=50)
    resp = other_client.post('/events/new', data=_event_form(event_title='停用帳號的活動'))
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    after, _ = db.list_events(page=1, page_size=50)
    assert len(after) == len(before)
    with other_client.session_transaction() as sess:
        assert 'user_id' not in sess


def test_new_event_missing_title(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(event_title=''))
    assert resp.status_code == 200
    assert MESSAGES['eventTitleRequired'].encode() in resp.data


def test_new_event_missing_note(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(event_note=''))
    assert MESSAGES['eventNoteRequired'].encode() in resp.data


def test_new_event_place_too_long(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(event_place='地' * 101))
    assert MESSAGES['eventPlaceTooLong'].encode() in resp.data


def test_new_event_capacity_zero(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(capacity='0'))
    assert MESSAGES['eventCapacityNotPositive'].encode() in resp.data


def test_new_event_capacity_not_a_number(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(capacity='abc'))
    assert MESSAGES['eventCapacityInvalid'].encode() in resp.data


def test_new_event_reg_end_after_event_start(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(
        event_datetime=_dt_input(7),
        registration_end_at=_dt_input(8),
    ))
    assert MESSAGES['eventRegEndAfterStart'].encode() in resp.data


def test_new_event_reg_start_after_reg_end(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(
        event_datetime=_dt_input(10),
        registration_start_at=_dt_input(6),
        registration_end_at=_dt_input(5),
    ))
    assert MESSAGES['eventRegStartAfterEnd'].encode() in resp.data


def test_new_event_invalid_data_creates_nothing(authed_client):
    before, total_before = db.list_events(page=1, page_size=50)
    authed_client.post('/events/new', data=_event_form(event_title=''))
    _, total_after = db.list_events(page=1, page_size=50)
    assert total_after == total_before


# ── 修改活動 ───────────────────────────────────────────────────────────────────

def test_edit_event_requires_login(client, event):
    resp = client.get(f'/events/edit/{event}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_edit_event_by_organizer(authed_client, event):
    resp = authed_client.get(f'/events/edit/{event}')
    assert resp.status_code == 200
    assert '修改活動'.encode() in resp.data


def test_edit_event_prefills_form(authed_client, event):
    body = authed_client.get(f'/events/edit/{event}').get_data(as_text=True)
    assert 'value="測試活動"' in body
    assert 'value="測試地點"' in body


def test_edit_event_by_admin(admin_client, event):
    resp = admin_client.get(f'/events/edit/{event}')
    assert resp.status_code == 200


def test_edit_event_by_other_rejected(other_client, event):
    _enable_other()
    resp = other_client.get(f'/events/edit/{event}')
    assert resp.status_code == 302
    assert MESSAGES['eventEditForbidden'] in \
        other_client.get('/events').get_data(as_text=True)


def test_edit_event_post_by_other_changes_nothing(other_client, event):
    _enable_other()
    other_client.post(f'/events/edit/{event}', data=_event_form(event_title='被竄改的標題'))
    assert db.get_event(event)['event_title'] == '測試活動'


def test_edit_event_post_success(authed_client, event):
    resp = authed_client.post(f'/events/edit/{event}', data=_event_form(
        event_title='修改後標題', event_place='修改後地點', capacity='30',
    ))
    assert resp.status_code == 302
    ev = db.get_event(event)
    assert ev['event_title'] == '修改後標題'
    assert ev['event_place'] == '修改後地點'
    assert ev['capacity'] == 30


def test_edit_event_updates_detail_table(authed_client, event):
    authed_client.post(f'/events/edit/{event}', data=_event_form(
        event_note='更新後的活動內容', event_notice='新的注意事項',
    ))
    ev = db.get_event(event)
    assert ev['event_note'] == '更新後的活動內容'
    assert ev['event_notice'] == '新的注意事項'


def test_edit_event_capacity_below_registered_rejected(authed_client, registered):
    resp = authed_client.post(f'/events/edit/{registered}', data=_event_form(capacity='0'))
    assert resp.status_code == 200
    assert db.get_event(registered)['capacity'] == 10


def test_edit_event_capacity_equal_to_registered_allowed(authed_client, registered):
    resp = authed_client.post(f'/events/edit/{registered}', data=_event_form(capacity='1'))
    assert resp.status_code == 302
    assert db.get_event(registered)['capacity'] == 1


def test_edit_deleted_event_rejected(authed_client, event):
    db.soft_delete_event(event)
    resp = authed_client.get(f'/events/edit/{event}', follow_redirects=True)
    assert MESSAGES['eventNotFound'] in resp.get_data(as_text=True)


def test_edit_nonexistent_event_rejected(authed_client):
    resp = authed_client.get('/events/edit/9999', follow_redirects=True)
    assert MESSAGES['eventNotFound'] in resp.get_data(as_text=True)


# ── 刪除活動 ───────────────────────────────────────────────────────────────────

def test_delete_event_requires_login(client, event):
    resp = client.post(f'/events/delete/{event}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.get_event(event)['is_deleted'] == 0


def test_delete_event_by_organizer(authed_client, event):
    resp = authed_client.post(f'/events/delete/{event}')
    assert resp.status_code == 302
    assert db.get_event(event)['is_deleted'] == 1


def test_delete_event_by_admin(admin_client, event):
    admin_client.post(f'/events/delete/{event}')
    assert db.get_event(event)['is_deleted'] == 1


def test_delete_event_by_other_rejected(other_client, event):
    _enable_other()
    other_client.post(f'/events/delete/{event}')
    assert db.get_event(event)['is_deleted'] == 0


def test_delete_event_is_soft(authed_client, event):
    authed_client.post(f'/events/delete/{event}')
    ev = db.get_event(event)
    assert ev is not None            # 資料仍存在
    assert ev['is_deleted'] == 1     # 僅標記刪除


def test_delete_event_cascades_to_detail(authed_client, event):
    authed_client.post(f'/events/delete/{event}')
    _, detail = db.get_event_for_edit(event)
    assert detail is None            # get_event_for_edit 只取 is_deleted = 0 的副表


# ── 報名活動 ───────────────────────────────────────────────────────────────────

def test_register_requires_login(client, event):
    resp = client.get(f'/events/{event}/register')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_register_get(authed_client, event):
    resp = authed_client.get(f'/events/{event}/register')
    assert resp.status_code == 200
    assert '報名活動'.encode() in resp.data


def test_register_post_success(authed_client, event):
    resp = authed_client.post(f'/events/{event}/register', data={'meal_type': '0'})
    assert resp.status_code == 302
    reg = db.get_registration(event, USERS['normal']['id'])
    assert reg is not None
    assert reg['registration_status'] == 'registered'


def test_register_stores_participant_fields(authed_client, event):
    authed_client.post(f'/events/{event}/register', data={
        'meal_type': '2',
        'participant_name': '王小明',
        'participant_phone': '0911222333',
        'participant_email': 'ming@example.com',
        'registration_note': '會晚到十分鐘',
    })
    reg = db.get_registration(event, 1)
    assert reg['meal_type'] == 2
    assert reg['participant_name'] == '王小明'
    assert reg['registration_note'] == '會晚到十分鐘'


def test_register_increases_count(authed_client, event):
    before = db.count_registered(event)
    authed_client.post(f'/events/{event}/register', data={'meal_type': '0'})
    assert db.count_registered(event) == before + 1


def test_register_duplicate_rejected(authed_client, registered):
    resp = authed_client.post(f'/events/{registered}/register',
                              data={'meal_type': '0'}, follow_redirects=True)
    assert MESSAGES['regDuplicate'] in resp.get_data(as_text=True)
    assert db.count_registered(registered) == 1


def test_register_invalid_meal_type_rejected(authed_client, event):
    resp = authed_client.post(f'/events/{event}/register', data={'meal_type': '9'})
    assert resp.status_code == 200
    assert MESSAGES['regMealInvalid'].encode() in resp.data
    assert db.get_registration(event, 1) is None


def test_register_disabled_user_redirected_to_login(other_client, event):
    resp = other_client.post(f'/events/{event}/register', data={'meal_type': '0'})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.get_registration(event, 3) is None


def test_register_deleted_event_rejected(authed_client, event):
    db.soft_delete_event(event)
    resp = authed_client.post(f'/events/{event}/register',
                              data={'meal_type': '0'}, follow_redirects=True)
    assert MESSAGES['eventNotFound'] in resp.get_data(as_text=True)
    assert db.get_registration(event, 1) is None


def test_register_ended_event_rejected(admin_client):
    eid = SEED_EVENTS['ended']['id']
    resp = admin_client.post(f'/events/{eid}/register',
                             data={'meal_type': '0'}, follow_redirects=True)
    assert MESSAGES['statusEnded'] in resp.get_data(as_text=True)
    assert db.get_registration(eid, 2) is None


def test_register_closed_event_rejected(admin_client):
    eid = SEED_EVENTS['closed']['id']
    resp = admin_client.post(f'/events/{eid}/register',
                             data={'meal_type': '0'}, follow_redirects=True)
    assert MESSAGES['statusClosed'] in resp.get_data(as_text=True)
    assert db.get_registration(eid, 2) is None


def test_register_not_open_event_rejected(authed_client):
    eid = SEED_EVENTS['not_open']['id']
    resp = authed_client.post(f'/events/{eid}/register',
                              data={'meal_type': '0'}, follow_redirects=True)
    assert MESSAGES['statusNotOpen'] in resp.get_data(as_text=True)
    assert db.get_registration(eid, 1) is None


def test_register_full_event_rejected(other_client):
    _enable_other()
    eid = SEED_EVENTS['full']['id']
    resp = other_client.post(f'/events/{eid}/register',
                             data={'meal_type': '0'}, follow_redirects=True)
    assert MESSAGES['statusFull'] in resp.get_data(as_text=True)
    assert db.get_registration(eid, 3) is None


def test_register_after_cancel_restores_same_row(authed_client, registered):
    """取消後重新報名走 UPDATE，不會新增第二筆紀錄。"""
    original_id = db.get_registration(registered, 1)['id']
    authed_client.post(f'/events/{registered}/cancel')
    authed_client.post(f'/events/{registered}/register', data={'meal_type': '1'})
    reg = db.get_registration(registered, 1)
    assert reg['id'] == original_id
    assert reg['registration_status'] == 'registered'
    assert reg['cancelled_at'] is None
    assert len(db.list_all_registrations(registered)) == 1


# ── 取消報名 ───────────────────────────────────────────────────────────────────

def test_cancel_requires_login(client, registered):
    resp = client.post(f'/events/{registered}/cancel')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.get_registration(registered, 1)['registration_status'] == 'registered'


def test_cancel_own_registration(authed_client, registered):
    resp = authed_client.post(f'/events/{registered}/cancel')
    assert resp.status_code == 302
    assert db.get_registration(registered, 1)['registration_status'] == 'cancelled'


def test_cancel_is_soft(authed_client, registered):
    authed_client.post(f'/events/{registered}/cancel')
    reg = db.get_registration(registered, 1)
    assert reg is not None                       # 資料仍存在
    assert reg['cancelled_at'] is not None       # 取消時間已填入


def test_cancel_frees_a_slot(authed_client, registered):
    before = db.count_registered(registered)
    authed_client.post(f'/events/{registered}/cancel')
    assert db.count_registered(registered) == before - 1


def test_cancel_other_registration_not_allowed(other_client, registered):
    """user_id=3 嘗試取消 user_id=1 的報名，只會動到自己（不存在的）紀錄。"""
    _enable_other()
    other_client.post(f'/events/{registered}/cancel')
    assert db.get_registration(registered, 1)['registration_status'] == 'registered'


def test_cancel_without_registration_flashes_error(authed_client, event):
    resp = authed_client.post(f'/events/{event}/cancel', follow_redirects=True)
    assert MESSAGES['regNotFound'] in resp.get_data(as_text=True)


def test_cancel_twice_is_rejected(authed_client, registered):
    authed_client.post(f'/events/{registered}/cancel')
    resp = authed_client.post(f'/events/{registered}/cancel', follow_redirects=True)
    assert MESSAGES['regNotFound'] in resp.get_data(as_text=True)


# ── 修改報名資訊 ───────────────────────────────────────────────────────────────

def test_edit_registration_requires_login(client, registered):
    resp = client.get(f'/events/{registered}/edit_registration')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_edit_registration_get(authed_client, registered):
    resp = authed_client.get(f'/events/{registered}/edit_registration')
    assert resp.status_code == 200
    assert '修改報名資訊'.encode() in resp.data


def test_edit_registration_prefills_form(authed_client, registered):
    body = authed_client.get(f'/events/{registered}/edit_registration').get_data(as_text=True)
    assert 'value="報名者姓名"' in body


def test_edit_registration_post_success(authed_client, registered):
    resp = authed_client.post(f'/events/{registered}/edit_registration', data={
        'meal_type': '2',
        'participant_name': '修改後姓名',
        'participant_phone': '0987654321',
        'participant_email': '',
        'registration_note': '修改備註',
    })
    assert resp.status_code == 302
    reg = db.get_registration(registered, 1)
    assert reg['meal_type'] == 2
    assert reg['participant_name'] == '修改後姓名'
    assert reg['participant_phone'] == '0987654321'
    assert reg['registration_note'] == '修改備註'


def test_edit_registration_does_not_change_status(authed_client, registered):
    authed_client.post(f'/events/{registered}/edit_registration',
                       data={'meal_type': '1', 'participant_name': '甲'})
    assert db.get_registration(registered, 1)['registration_status'] == 'registered'


def test_edit_registration_by_other_not_allowed(other_client, registered):
    _enable_other()
    resp = other_client.get(f'/events/{registered}/edit_registration')
    assert resp.status_code == 302
    assert db.get_registration(registered, 1)['participant_name'] == '報名者姓名'


def test_edit_registration_after_cancel_rejected(authed_client, registered):
    authed_client.post(f'/events/{registered}/cancel')
    resp = authed_client.get(f'/events/{registered}/edit_registration',
                             follow_redirects=True)
    assert MESSAGES['regNotFound'] in resp.get_data(as_text=True)


# ── 我的報名紀錄 ───────────────────────────────────────────────────────────────

def test_my_registrations_requires_login(client):
    resp = client.get('/events/my')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_my_registrations_shows_own(authed_client, registered):
    resp = authed_client.get('/events/my')
    assert resp.status_code == 200
    assert '測試活動'.encode() in resp.data


def test_my_registrations_shows_seed_records(authed_client):
    """種子資料給 user_id=1 三筆已報名與一筆已取消。"""
    rows = db.list_my_registrations(1)
    assert len(rows) == 4
    statuses = [r['registration_status'] for r in rows]
    assert statuses.count('registered') == 3
    assert statuses.count('cancelled') == 1


def test_my_registrations_shows_cancelled(authed_client, registered):
    db.cancel_registration(registered, 1)
    body = authed_client.get('/events/my').get_data(as_text=True)
    assert '已取消' in body


def test_my_registrations_empty(other_client):
    """user_id=3 沒有任何種子報名紀錄。"""
    _enable_other()
    resp = other_client.get('/events/my')
    assert resp.status_code == 200
    assert '尚無報名紀錄'.encode() in resp.data


def test_my_registrations_keeps_record_of_deleted_event(authed_client, registered):
    """活動被撤銷後，報名者仍應在自己的紀錄中看得到（KI-12）。"""
    db.soft_delete_event(registered)
    body = authed_client.get('/events/my').get_data(as_text=True)
    assert '測試活動' in body
    assert '活動已撤銷' in body


def test_my_registrations_disabled_user_redirected_to_login(other_client):
    resp = other_client.get('/events/my')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
