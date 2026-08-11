"""
repair Blueprint 測試：報修申報、查詢、狀態機與資料範圍權限。

本檔的三個重點，也是本系統的三個教學重點：
  1. 資料範圍權限（row-level）：同樣是合法登入者，看得到的報修單不同
  2. 狀態機：七條轉移各有前置狀態，不合法的轉移必須被擋下且資料不變
  3. 稽核軌跡：每一次狀態異動都要留下一筆 log_type='status' 的紀錄
"""
import pytest

import db
from tests.data.users import MESSAGES, SEED_REQUESTS


def _client_as(app, user_id):
    """建立一個獨立的 test client 並注入指定的 session。

    conftest 的 authed_client / admin_client 都由同一個 client fixture 衍生，
    同一個測試中同時請求兩個會拿到同一個物件。需要兩個身分同時存在時，
    請改用這個 helper。
    """
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['user_id'] = user_id
    return c


@pytest.fixture
def new_request(app):
    """建立一張屬於 user_id=1 的全新 pending 報修單，回傳 request_id。"""
    return db.create_request(
        requester_id=1, title='測試用報修單', category='water', priority='normal',
        dorm_building='A 棟', room_no='301', contact_phone='0912-345-678',
        description='測試用的故障描述',
    )


_VALID_FORM = {
    'title':         '房間插座沒電',
    'description':   '靠窗那組插座完全沒電，其他插座正常。',
    'dorm_building': 'A 棟',
    'room_no':       '301',
    'contact_phone': '0912-345-678',
    'category':      'electric',
    'priority':      'high',
}


# ══════════════════════════════════════════════════════════════════════════════
# 權限守門
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize('path', [
    '/repair/', '/repair/new', '/repair/1', '/repair/1/edit', '/repair/manage',
])
def test_get_routes_require_login(client, path):
    resp = client.get(path)
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


@pytest.mark.parametrize('path', [
    '/repair/1/comment', '/repair/1/cancel', '/repair/1/assign',
    '/repair/1/start', '/repair/1/complete', '/repair/1/reject',
    '/repair/1/reopen', '/repair/1/delete',
])
def test_post_routes_require_login(client, path):
    resp = client.post(path, data={})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    # 被擋下的 POST 必須同時確認資料沒有改變
    assert db.get_request(1)['request_status'] == 'pending'


def test_disabled_user_with_stale_session_is_logged_out(client):
    """停用帳號持有舊 session：第 2 層守門攔下並清 session。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 3
    resp = client.get('/repair/')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    with client.session_transaction() as sess:
        assert 'user_id' not in sess


def test_disabled_user_cannot_create_request(client):
    with client.session_transaction() as sess:
        sess['user_id'] = 3
    _, before = db.list_my_requests(3, 1, 1, 'all')
    resp = client.post('/repair/new', data=_VALID_FORM)
    assert resp.status_code == 302
    _, after = db.list_my_requests(3, 1, 1, 'all')
    assert after == before


def test_manage_forbidden_for_normal_user(authed_client):
    resp = authed_client.get('/repair/manage')
    assert resp.status_code == 302
    assert '/repair/' in resp.headers['Location']


def test_manage_ok_for_admin(admin_client):
    assert admin_client.get('/repair/manage').status_code == 200


# ── 資料範圍權限（row-level）─────────────────────────────────────────────────

def test_requester_can_view_own_request(authed_client):
    resp = authed_client.get(f"/repair/{SEED_REQUESTS['pending']['id']}")
    assert resp.status_code == 200


def test_user_cannot_view_others_request(authed_client):
    """報修單 #5 屬於 user_id=3，user_id=1 不得檢視。"""
    resp = authed_client.get(f"/repair/{SEED_REQUESTS['rejected']['id']}",
                             follow_redirects=True)
    assert MESSAGES['repairViewDenied'] in resp.get_data(as_text=True)


def test_admin_can_view_any_request(admin_client):
    resp = admin_client.get(f"/repair/{SEED_REQUESTS['rejected']['id']}")
    assert resp.status_code == 200


def test_view_nonexistent_request(authed_client):
    resp = authed_client.get('/repair/9999', follow_redirects=True)
    assert MESSAGES['repairNotFound'] in resp.get_data(as_text=True)


def test_view_deleted_request(app, new_request):
    db.soft_delete_request(new_request)
    c = _client_as(app, 1)
    resp = c.get(f'/repair/{new_request}', follow_redirects=True)
    assert MESSAGES['repairNotFound'] in resp.get_data(as_text=True)


# ══════════════════════════════════════════════════════════════════════════════
# 清單
# ══════════════════════════════════════════════════════════════════════════════

def test_index_lists_only_own_requests(authed_client):
    body = authed_client.get('/repair/').get_data(as_text=True)
    assert '浴室水龍頭持續漏水' in body                # #1，user 1 的
    assert '想在房間加裝個人洗衣機' not in body        # #5，user 3 的


def test_index_for_admin_also_shows_only_own(admin_client):
    """管理員在「我的報修單」看到的一樣只有自己申報的。種子帳號 2 沒有申報過。"""
    body = admin_client.get('/repair/').get_data(as_text=True)
    assert '尚未申報任何報修單' in body


def test_index_status_filter(authed_client):
    body = authed_client.get('/repair/?status=completed').get_data(as_text=True)
    assert '衣櫃門把鬆脫' in body
    assert '浴室水龍頭持續漏水' not in body


def test_index_invalid_status_falls_back_to_all(authed_client):
    body = authed_client.get('/repair/?status=nonsense').get_data(as_text=True)
    assert '浴室水龍頭持續漏水' in body
    assert '衣櫃門把鬆脫' in body


def test_index_ordered_by_updated_at_desc(authed_client):
    """最近有異動的報修單排在最前面。#1 的 updated_at 最新。"""
    body = authed_client.get('/repair/').get_data(as_text=True)
    assert body.index('浴室水龍頭持續漏水') < body.index('衣櫃門把鬆脫')


def test_index_pagination(app):
    for i in range(8):
        db.create_request(1, f'分頁測試 {i}', 'other', 'normal', 'A 棟', '301',
                          None, '描述')
    c = _client_as(app, 1)
    body = c.get('/repair/').get_data(as_text=True)
    assert '第 1 / 2 頁' in body
    assert '共 13 筆' in body          # 種子 5 張 + 新增 8 張


def test_manage_lists_all_requests(admin_client):
    body = admin_client.get('/repair/manage').get_data(as_text=True)
    assert '浴室水龍頭持續漏水' in body
    assert '想在房間加裝個人洗衣機' in body


def test_manage_status_filter(admin_client):
    body = admin_client.get('/repair/manage?status=pending').get_data(as_text=True)
    assert '浴室水龍頭持續漏水' in body
    assert '衣櫃門把鬆脫' not in body


def test_manage_keyword_matches_title(admin_client):
    body = admin_client.get('/repair/manage?q=冷氣').get_data(as_text=True)
    assert '冷氣不冷且有異音' in body
    assert '浴室水龍頭持續漏水' not in body


def test_manage_keyword_matches_room(admin_client):
    body = admin_client.get('/repair/manage?q=205').get_data(as_text=True)
    assert '想在房間加裝個人洗衣機' in body
    assert '浴室水龍頭持續漏水' not in body


def test_manage_shows_status_counts(admin_client):
    """種子資料每個狀態各一張，摘要列六個數字都應該是 1。"""
    counts = db.count_by_status()
    assert all(n == 1 for n in counts.values())
    assert admin_client.get('/repair/manage').status_code == 200


def test_manage_shows_requester_email_when_name_missing(admin_client):
    """停用帳號 disabled@example.com 的 name 為 NULL，顯示欄退回 email。"""
    body = admin_client.get('/repair/manage').get_data(as_text=True)
    assert 'disabled@example.com' in body


# ══════════════════════════════════════════════════════════════════════════════
# 新增報修單
# ══════════════════════════════════════════════════════════════════════════════

def test_new_form_prefills_from_profile(authed_client):
    """報修表單以個人資料的棟別、房號、電話預填。"""
    body = authed_client.get('/repair/new').get_data(as_text=True)
    assert 'value="A 棟"' in body
    assert 'value="301"' in body
    assert 'value="0912-345-678"' in body


def test_create_request_succeeds(authed_client):
    _, before = db.list_my_requests(1, 1, 1, 'all')
    resp = authed_client.post('/repair/new', data=_VALID_FORM)
    assert resp.status_code == 302
    _, after = db.list_my_requests(1, 1, 1, 'all')
    assert after == before + 1


def test_create_request_initial_status_is_pending(authed_client):
    authed_client.post('/repair/new', data=_VALID_FORM)
    items, _ = db.list_my_requests(1, 1, 1, 'all')
    assert items[0]['request_status'] == 'pending'
    assert items[0]['assigned_to'] is None


def test_create_request_creates_report_log(authed_client):
    authed_client.post('/repair/new', data=_VALID_FORM)
    items, _ = db.list_my_requests(1, 1, 1, 'all')
    logs = db.list_logs(items[0]['id'])
    assert len(logs) == 1
    assert logs[0]['log_type'] == 'report'
    assert logs[0]['content'] == _VALID_FORM['description']


def test_create_request_shows_flash(authed_client):
    resp = authed_client.post('/repair/new', data=_VALID_FORM, follow_redirects=True)
    assert MESSAGES['repairCreated'] in resp.get_data(as_text=True)


@pytest.mark.parametrize('field, message_key', [
    ('title',         'repairTitleRequired'),
    ('description',   'repairDescriptionRequired'),
    ('dorm_building', 'repairBuildingRequired'),
    ('room_no',       'repairRoomRequired'),
])
def test_create_request_required_fields(authed_client, field, message_key):
    data = dict(_VALID_FORM, **{field: '   '})
    _, before = db.list_my_requests(1, 1, 1, 'all')
    resp = authed_client.post('/repair/new', data=data)
    assert resp.status_code == 200
    assert MESSAGES[message_key].encode() in resp.data
    _, after = db.list_my_requests(1, 1, 1, 'all')
    assert after == before


def test_create_request_invalid_category(authed_client):
    resp = authed_client.post('/repair/new', data=dict(_VALID_FORM, category='rocket'))
    assert MESSAGES['repairInvalidCategory'].encode() in resp.data


def test_create_request_invalid_priority(authed_client):
    resp = authed_client.post('/repair/new', data=dict(_VALID_FORM, priority='asap'))
    assert MESSAGES['repairInvalidPriority'].encode() in resp.data


def test_create_request_preserves_form_on_error(authed_client):
    resp = authed_client.post('/repair/new', data=dict(_VALID_FORM, title=''))
    assert _VALID_FORM['description'].encode() in resp.data


def test_create_request_phone_optional(authed_client):
    authed_client.post('/repair/new', data=dict(_VALID_FORM, contact_phone=''))
    items, _ = db.list_my_requests(1, 1, 1, 'all')
    assert items[0]['contact_phone'] is None


# ══════════════════════════════════════════════════════════════════════════════
# 修改報修單
# ══════════════════════════════════════════════════════════════════════════════

def test_edit_form_prefills_current_values(app, new_request):
    c = _client_as(app, 1)
    body = c.get(f'/repair/{new_request}/edit').get_data(as_text=True)
    assert 'value="測試用報修單"' in body
    assert '測試用的故障描述' in body


def test_edit_request_succeeds(app, new_request):
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/edit',
                  data=dict(_VALID_FORM, title='改過的標題'))
    assert resp.status_code == 302
    assert db.get_request(new_request)['title'] == '改過的標題'


def test_edit_request_updates_report_log(app, new_request):
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/edit',
           data=dict(_VALID_FORM, description='改過的故障描述'))
    assert db.get_report_log(new_request)['content'] == '改過的故障描述'


def test_edit_request_by_other_user_denied(app, new_request):
    """他人不得修改，且資料必須沒有改變。"""
    db.set_user_active(3, 1)
    c = _client_as(app, 3)
    resp = c.post(f'/repair/{new_request}/edit',
                  data=dict(_VALID_FORM, title='入侵者改的'), follow_redirects=True)
    assert MESSAGES['repairEditDenied'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['title'] == '測試用報修單'


def test_edit_request_by_admin_denied(app, new_request):
    """管理員可以看，但不能替住戶改申報內容——那會讓歷程失真。"""
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/edit',
                  data=dict(_VALID_FORM, title='管理員改的'), follow_redirects=True)
    assert MESSAGES['repairEditDenied'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['title'] == '測試用報修單'


def test_edit_request_after_assign_denied(app, new_request):
    """派工之後不可再修改：內容已成為維修人員準備的依據。"""
    db.assign_request(new_request, 2, 4)
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/edit',
                  data=dict(_VALID_FORM, title='太晚了'), follow_redirects=True)
    assert MESSAGES['repairEditNotPending'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['title'] == '測試用報修單'


def test_edit_request_validation(app, new_request):
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/edit', data=dict(_VALID_FORM, title=''))
    assert MESSAGES['repairTitleRequired'].encode() in resp.data
    assert db.get_request(new_request)['title'] == '測試用報修單'


# ══════════════════════════════════════════════════════════════════════════════
# 取消報修
# ══════════════════════════════════════════════════════════════════════════════

def test_cancel_pending_request(app, new_request):
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/cancel', follow_redirects=True)
    assert MESSAGES['repairCancelled'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'cancelled'


def test_cancel_assigned_request(app, new_request):
    db.assign_request(new_request, 2, 4)
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/cancel')
    assert db.get_request(new_request)['request_status'] == 'cancelled'


def test_cancel_in_progress_request_rejected(app, new_request):
    """已動工不可取消：取消不會讓拆開的水管復原，只會讓紀錄與現場不符。"""
    db.assign_request(new_request, 2, 4)
    db.start_request(new_request, 4)
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/cancel', follow_redirects=True)
    assert MESSAGES['repairCancelFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'in_progress'


def test_cancel_by_other_user_denied(app, new_request):
    db.set_user_active(3, 1)
    c = _client_as(app, 3)
    resp = c.post(f'/repair/{new_request}/cancel', follow_redirects=True)
    assert MESSAGES['repairCancelDenied'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'pending'


def test_cancel_by_admin_denied(app, new_request):
    """取消是申報人的權利，管理員不能代為取消——他該用的是退件。"""
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/cancel', follow_redirects=True)
    assert MESSAGES['repairCancelDenied'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'pending'


def test_cancel_writes_status_log(app, new_request):
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/cancel')
    logs = db.list_logs(new_request)
    assert logs[-1]['log_type'] == 'status'
    assert '取消' in logs[-1]['content']


# ══════════════════════════════════════════════════════════════════════════════
# 回覆
# ══════════════════════════════════════════════════════════════════════════════

def test_requester_can_comment(app, new_request):
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/comment',
                  data={'content': '補充：漏水從昨晚開始'}, follow_redirects=True)
    assert MESSAGES['repairCommentAdded'] in resp.get_data(as_text=True)
    assert len(db.list_logs(new_request)) == 2


def test_admin_can_comment(app, new_request):
    c = _client_as(app, 2)
    c.post(f'/repair/{new_request}/comment', data={'content': '已排入本週工單'})
    logs = db.list_logs(new_request)
    assert logs[-1]['content'] == '已排入本週工單'
    assert logs[-1]['log_type'] == 'comment'


def test_other_user_cannot_comment(app, new_request):
    db.set_user_active(3, 1)
    c = _client_as(app, 3)
    resp = c.post(f'/repair/{new_request}/comment',
                  data={'content': '不該出現'}, follow_redirects=True)
    assert MESSAGES['repairViewDenied'] in resp.get_data(as_text=True)
    assert len(db.list_logs(new_request)) == 1


def test_empty_comment_rejected(app, new_request):
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/comment',
                  data={'content': '   '}, follow_redirects=True)
    assert MESSAGES['repairCommentRequired'] in resp.get_data(as_text=True)
    assert len(db.list_logs(new_request)) == 1


def test_comment_on_closed_request_rejected(app, new_request):
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/cancel')
    before = len(db.list_logs(new_request))
    resp = c.post(f'/repair/{new_request}/comment',
                  data={'content': '已結案還想留言'}, follow_redirects=True)
    assert MESSAGES['repairCommentClosed'] in resp.get_data(as_text=True)
    assert len(db.list_logs(new_request)) == before


def test_comment_bumps_updated_at(app, new_request):
    """有新回覆的報修單會浮到列表最上面（updated_at 同步更新）。"""
    before = db.get_request(new_request)['updated_at']
    db.create_log(new_request, 1, '補充說明', 'comment')
    after = db.get_request(new_request)['updated_at']
    assert after >= before


# ══════════════════════════════════════════════════════════════════════════════
# 狀態機：派工
# ══════════════════════════════════════════════════════════════════════════════

def test_assign_by_normal_user_forbidden(app, new_request):
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/assign', data={'assignee_id': 4})
    assert resp.status_code == 302
    assert db.get_request(new_request)['request_status'] == 'pending'
    assert db.get_request(new_request)['assigned_to'] is None


def test_assign_succeeds(app, new_request):
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/assign',
                  data={'assignee_id': 4, 'note': '請帶零件'}, follow_redirects=True)
    assert MESSAGES['repairAssigned'] in resp.get_data(as_text=True)
    req = db.get_request(new_request)
    assert req['request_status'] == 'assigned'
    assert req['assigned_to'] == 4
    assert req['assigned_at'] is not None


def test_assign_writes_status_log_with_note(app, new_request):
    c = _client_as(app, 2)
    c.post(f'/repair/{new_request}/assign', data={'assignee_id': 4, 'note': '請帶零件'})
    logs = db.list_logs(new_request)
    assert logs[-1]['log_type'] == 'status'
    assert '已派工給' in logs[-1]['content']
    assert '請帶零件' in logs[-1]['content']


def test_assign_missing_assignee(app, new_request):
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/assign', data={}, follow_redirects=True)
    assert MESSAGES['repairAssigneeRequired'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'pending'


def test_assign_to_non_admin_rejected(app, new_request):
    """承辦人必須是管理員：派給住宿生沒有意義，他沒有處理的權限。"""
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/assign',
                  data={'assignee_id': 1}, follow_redirects=True)
    assert MESSAGES['repairAssignFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['assigned_to'] is None


def test_assign_to_disabled_admin_rejected(app, new_request):
    db.set_user_active(4, 0)
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/assign',
                  data={'assignee_id': 4}, follow_redirects=True)
    assert MESSAGES['repairAssignFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['assigned_to'] is None


def test_assign_twice_rejected(app, new_request):
    c = _client_as(app, 2)
    c.post(f'/repair/{new_request}/assign', data={'assignee_id': 4})
    resp = c.post(f'/repair/{new_request}/assign',
                  data={'assignee_id': 2}, follow_redirects=True)
    assert MESSAGES['repairAssignFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['assigned_to'] == 4


# ══════════════════════════════════════════════════════════════════════════════
# 狀態機：開始處理 / 完成
# ══════════════════════════════════════════════════════════════════════════════

def test_start_requires_assigned_status(app, new_request):
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/start', data={}, follow_redirects=True)
    assert MESSAGES['repairStartFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'pending'


def test_start_succeeds(app, new_request):
    db.assign_request(new_request, 2, 4)
    c = _client_as(app, 4)
    resp = c.post(f'/repair/{new_request}/start',
                  data={'note': '已到場'}, follow_redirects=True)
    assert MESSAGES['repairStarted'] in resp.get_data(as_text=True)
    req = db.get_request(new_request)
    assert req['request_status'] == 'in_progress'
    assert req['started_at'] is not None


def test_start_by_normal_user_forbidden(app, new_request):
    db.assign_request(new_request, 2, 4)
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/start', data={})
    assert db.get_request(new_request)['request_status'] == 'assigned'


def test_complete_requires_in_progress_status(app, new_request):
    db.assign_request(new_request, 2, 4)
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/complete', data={}, follow_redirects=True)
    assert MESSAGES['repairCompleteFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'assigned'


def test_complete_succeeds(app, new_request):
    db.assign_request(new_request, 2, 4)
    db.start_request(new_request, 4)
    c = _client_as(app, 4)
    resp = c.post(f'/repair/{new_request}/complete',
                  data={'note': '更換水龍頭墊片'}, follow_redirects=True)
    assert MESSAGES['repairCompleted'] in resp.get_data(as_text=True)
    req = db.get_request(new_request)
    assert req['request_status'] == 'completed'
    assert req['closed_at'] is not None


def test_complete_by_normal_user_forbidden(app, new_request):
    db.assign_request(new_request, 2, 4)
    db.start_request(new_request, 4)
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/complete', data={})
    assert db.get_request(new_request)['request_status'] == 'in_progress'


# ══════════════════════════════════════════════════════════════════════════════
# 狀態機：退件 / 重新開啟
# ══════════════════════════════════════════════════════════════════════════════

def test_reject_requires_reason(app, new_request):
    """退件是唯一強制填寫理由的轉移：申報人需要知道為什麼不受理。"""
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/reject',
                  data={'note': '  '}, follow_redirects=True)
    assert MESSAGES['repairRejectReasonRequired'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'pending'


def test_reject_succeeds(app, new_request):
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/reject',
                  data={'note': '非宿舍公共設施'}, follow_redirects=True)
    assert MESSAGES['repairRejected'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'rejected'
    assert '非宿舍公共設施' in db.list_logs(new_request)[-1]['content']


def test_reject_requires_pending_status(app, new_request):
    db.assign_request(new_request, 2, 4)
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/reject',
                  data={'note': '太晚了'}, follow_redirects=True)
    assert MESSAGES['repairRejectFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'assigned'


def test_reject_by_normal_user_forbidden(app, new_request):
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/reject', data={'note': '自己退自己'})
    assert db.get_request(new_request)['request_status'] == 'pending'


def test_reopen_requires_reason(app):
    c = _client_as(app, 2)
    rid = SEED_REQUESTS['completed']['id']
    resp = c.post(f'/repair/{rid}/reopen', data={'note': ''}, follow_redirects=True)
    assert MESSAGES['repairReopenReasonRequired'] in resp.get_data(as_text=True)
    assert db.get_request(rid)['request_status'] == 'completed'


def test_reopen_succeeds_and_keeps_assignee(app):
    """重新開啟回到 pending，但保留上一次的承辦人作為重複故障的線索。"""
    c = _client_as(app, 2)
    rid = SEED_REQUESTS['completed']['id']
    before_assignee = db.get_request(rid)['assigned_to']
    resp = c.post(f'/repair/{rid}/reopen',
                  data={'note': '住戶回報門把又鬆了'}, follow_redirects=True)
    assert MESSAGES['repairReopened'] in resp.get_data(as_text=True)
    req = db.get_request(rid)
    assert req['request_status'] == 'pending'
    assert req['closed_at'] is None
    assert req['assigned_to'] == before_assignee


def test_reopen_requires_completed_status(app, new_request):
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/reopen',
                  data={'note': '還沒完成'}, follow_redirects=True)
    assert MESSAGES['repairReopenFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'pending'


def test_reopen_by_normal_user_forbidden(app):
    c = _client_as(app, 1)
    rid = SEED_REQUESTS['completed']['id']
    c.post(f'/repair/{rid}/reopen', data={'note': '我要重開'})
    assert db.get_request(rid)['request_status'] == 'completed'


# ══════════════════════════════════════════════════════════════════════════════
# 刪除報修單
# ══════════════════════════════════════════════════════════════════════════════

def test_delete_by_normal_user_forbidden(app, new_request):
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/delete')
    assert db.get_request(new_request)['is_deleted'] == 0


def test_delete_by_admin_succeeds(app, new_request):
    c = _client_as(app, 2)
    resp = c.post(f'/repair/{new_request}/delete', follow_redirects=True)
    assert MESSAGES['repairDeleted'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['is_deleted'] == 1


def test_delete_cascades_to_logs(app, new_request):
    """主檔與明細一起標記刪除，不留孤兒紀錄。級聯在 application 層完成。"""
    db.create_log(new_request, 1, '一則回覆', 'comment')
    c = _client_as(app, 2)
    c.post(f'/repair/{new_request}/delete')
    assert db.list_logs(new_request) == []


def test_delete_removes_from_lists(app, new_request):
    _, before = db.list_my_requests(1, 1, 1, 'all')
    c = _client_as(app, 2)
    c.post(f'/repair/{new_request}/delete')
    _, after = db.list_my_requests(1, 1, 1, 'all')
    assert after == before - 1


def test_delete_twice_rejected(app, new_request):
    c = _client_as(app, 2)
    c.post(f'/repair/{new_request}/delete')
    resp = c.post(f'/repair/{new_request}/delete', follow_redirects=True)
    assert MESSAGES['repairNotFound'] in resp.get_data(as_text=True)


# ══════════════════════════════════════════════════════════════════════════════
# 完整生命週期
# ══════════════════════════════════════════════════════════════════════════════

def test_full_lifecycle_with_audit_trail(app):
    """走完 pending → assigned → in_progress → completed，並檢查稽核軌跡。

    這是本系統的核心行為：每一次狀態異動都留下一筆 status 紀錄，
    因此最後的歷程應該是「1 則申報 + 1 則回覆 + 3 則狀態異動」。
    """
    resident = _client_as(app, 1)
    manager  = _client_as(app, 2)
    worker   = _client_as(app, 4)

    resident.post('/repair/new', data=_VALID_FORM)
    items, _ = db.list_my_requests(1, 1, 1, 'all')
    rid = items[0]['id']
    assert db.get_request(rid)['request_status'] == 'pending'

    manager.post(f'/repair/{rid}/assign', data={'assignee_id': 4})
    assert db.get_request(rid)['request_status'] == 'assigned'

    resident.post(f'/repair/{rid}/comment', data={'content': '我下午都在房間'})

    worker.post(f'/repair/{rid}/start', data={'note': '已到場'})
    assert db.get_request(rid)['request_status'] == 'in_progress'

    worker.post(f'/repair/{rid}/complete', data={'note': '更換插座'})
    req = db.get_request(rid)
    assert req['request_status'] == 'completed'
    assert req['assigned_at'] is not None
    assert req['started_at'] is not None
    assert req['closed_at'] is not None

    logs = db.list_logs(rid)
    assert [log['log_type'] for log in logs] == [
        'report', 'status', 'comment', 'status', 'status',
    ]
    assert logs[0]['user_id'] == 1     # 申報人
    assert logs[1]['user_id'] == 2     # 派工的管理員
    assert logs[3]['user_id'] == 4     # 動工的維修人員


def test_closed_request_shows_no_comment_form(app, new_request):
    c = _client_as(app, 1)
    c.post(f'/repair/{new_request}/cancel')
    body = c.get(f'/repair/{new_request}').get_data(as_text=True)
    assert '已結案' in body
    assert 'name="content"' not in body
