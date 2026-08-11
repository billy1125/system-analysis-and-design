"""
forum Blueprint 測試：/forum 論壇系統
"""
import pytest

import db


@pytest.fixture
def forum_post(app):
    """建立一篇論壇測試文章，發文者 user@example.com（ID=1）。"""
    return db.create_forum_master('測試文章標題', '測試文章內文', 1)


# ── 瀏覽（不需登入）──────────────────────────────────────────────────────────

def test_forum_index_anonymous(client):
    resp = client.get('/forum')
    assert resp.status_code == 200


def test_forum_index_shows_article(client, forum_post):
    resp = client.get('/forum')
    assert '測試文章標題'.encode() in resp.data


def test_forum_index_shows_details(client, forum_post):
    resp = client.get(f'/forum?master_id={forum_post}')
    assert '測試文章內文'.encode() in resp.data


def test_forum_index_deleted_master_hidden(client, forum_post):
    db.soft_delete_forum_master(forum_post)
    resp = client.get('/forum')
    assert '測試文章標題'.encode() not in resp.data


def test_forum_index_deleted_detail_hidden(client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    db.soft_delete_forum_detail(detail['id'])
    resp = client.get(f'/forum?master_id={forum_post}')
    assert '測試文章內文'.encode() not in resp.data


def test_forum_index_pagination(client):
    for i in range(11):
        db.create_forum_master(f'文章{i}', f'內文{i}', 1)
    resp = client.get('/forum?page=1')
    assert '下一頁'.encode() in resp.data


# ── 新增文章 ──────────────────────────────────────────────────────────────────

def test_new_post_requires_login(client):
    resp = client.get('/forum/new')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_new_post_get(authed_client):
    resp = authed_client.get('/forum/new')
    assert resp.status_code == 200
    assert '新增文章'.encode() in resp.data


def test_new_post_empty_title(authed_client):
    resp = authed_client.post('/forum/new', data={'title': '', 'content': '內容'})
    assert resp.status_code == 200
    assert '請輸入文章標題'.encode() in resp.data


def test_new_post_empty_content(authed_client):
    resp = authed_client.post('/forum/new', data={'title': '標題', 'content': ''})
    assert resp.status_code == 200
    assert '請輸入文章內容'.encode() in resp.data


def test_new_post_success_redirects(authed_client):
    resp = authed_client.post('/forum/new', data={'title': '新文章', 'content': '內文'})
    assert resp.status_code == 302
    assert 'master_id' in resp.headers['Location']


def test_new_post_creates_master_and_detail(authed_client):
    _, before = db.list_forum_masters()
    authed_client.post('/forum/new', data={'title': '文章', 'content': '原始內文'})
    masters, total = db.list_forum_masters()
    assert total == before + 1
    new_master = next(m for m in masters if m['title'] == '文章')
    details = db.list_forum_details(new_master['id'])
    assert len(details) == 1
    assert details[0]['is_original_post'] == 1


# ── 回覆 ──────────────────────────────────────────────────────────────────────

def test_reply_requires_login(client, forum_post):
    resp = client.post(f'/forum/reply/{forum_post}', data={'content': '回覆'})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_reply_get(authed_client, forum_post):
    resp = authed_client.get(f'/forum/reply/{forum_post}')
    assert resp.status_code == 200


def test_reply_empty_content(authed_client, forum_post):
    resp = authed_client.post(f'/forum/reply/{forum_post}', data={'content': ''})
    assert resp.status_code == 200
    assert '請輸入文章內容'.encode() in resp.data


def test_reply_success(authed_client, forum_post):
    resp = authed_client.post(f'/forum/reply/{forum_post}', data={'content': '我的回覆'})
    assert resp.status_code == 302
    assert str(forum_post) in resp.headers['Location']
    details = db.list_forum_details(forum_post)
    assert any(d['content'] == '我的回覆' for d in details)


def test_reply_nonexistent_master(authed_client):
    resp = authed_client.post('/forum/reply/9999', data={'content': '回覆'}, follow_redirects=True)
    assert '文章不存在或已刪除'.encode() in resp.data


def test_reply_deleted_master(authed_client, forum_post):
    db.soft_delete_forum_master(forum_post)
    resp = authed_client.post(
        f'/forum/reply/{forum_post}', data={'content': '回覆'}, follow_redirects=True
    )
    assert '文章不存在或已刪除'.encode() in resp.data


# ── 修改文章標題 ──────────────────────────────────────────────────────────────

def test_edit_master_requires_login(client, forum_post):
    resp = client.get(f'/forum/edit/master/{forum_post}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_edit_master_by_author(authed_client, forum_post):
    resp = authed_client.get(f'/forum/edit/master/{forum_post}')
    assert resp.status_code == 200


def test_edit_master_by_admin(admin_client, forum_post):
    resp = admin_client.get(f'/forum/edit/master/{forum_post}')
    assert resp.status_code == 200


def test_edit_master_by_other_user(other_client, forum_post):
    # id=3 種子帳號預設為停用，會先被 _current_user() 的帳號有效性檢查攔下。
    # 本案例要測的是「非本人、非管理員」的權限邊界，因此先讓它成為有效帳號。
    db.set_user_active(3, 1)
    resp = other_client.get(f'/forum/edit/master/{forum_post}', follow_redirects=True)
    assert '無權限修改此文章標題'.encode() in resp.data


def test_edit_master_empty_title(authed_client, forum_post):
    resp = authed_client.post(f'/forum/edit/master/{forum_post}', data={'title': ''})
    assert resp.status_code == 200
    assert '請輸入文章標題'.encode() in resp.data


def test_edit_master_success(authed_client, forum_post):
    resp = authed_client.post(f'/forum/edit/master/{forum_post}', data={'title': '修改後標題'})
    assert resp.status_code == 302
    assert db.get_forum_master(forum_post)['title'] == '修改後標題'


# ── 修改內文或回覆 ────────────────────────────────────────────────────────────

def test_edit_detail_requires_login(client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    resp = client.get(f'/forum/edit/detail/{detail["id"]}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_edit_detail_by_author(authed_client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    resp = authed_client.get(f'/forum/edit/detail/{detail["id"]}')
    assert resp.status_code == 200


def test_edit_detail_by_admin(admin_client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    resp = admin_client.get(f'/forum/edit/detail/{detail["id"]}')
    assert resp.status_code == 200


def test_edit_detail_by_other_user(other_client, forum_post):
    # 同 test_edit_master_by_other_user：先讓 id=3 成為有效帳號。
    db.set_user_active(3, 1)
    detail = db.list_forum_details(forum_post)[0]
    resp = other_client.get(f'/forum/edit/detail/{detail["id"]}', follow_redirects=True)
    assert '無權限修改此內容'.encode() in resp.data


def test_edit_detail_empty_content(authed_client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    resp = authed_client.post(f'/forum/edit/detail/{detail["id"]}', data={'content': ''})
    assert resp.status_code == 200
    assert '請輸入文章內容'.encode() in resp.data


def test_edit_detail_success(authed_client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    resp = authed_client.post(
        f'/forum/edit/detail/{detail["id"]}', data={'content': '修改後內文'}
    )
    assert resp.status_code == 302
    assert db.get_forum_detail(detail['id'])['content'] == '修改後內文'


# ── 刪除文章（僅管理員）──────────────────────────────────────────────────────

def test_delete_master_requires_login(client, forum_post):
    resp = client.post(f'/forum/delete/master/{forum_post}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_delete_master_by_regular_user(authed_client, forum_post):
    resp = authed_client.post(f'/forum/delete/master/{forum_post}', follow_redirects=True)
    assert '無權限刪除文章'.encode() in resp.data


def test_delete_master_is_soft_delete(admin_client, forum_post):
    admin_client.post(f'/forum/delete/master/{forum_post}')
    assert db.get_forum_master(forum_post)['is_deleted'] == 1


def test_delete_master_not_shown_after_delete(admin_client, forum_post):
    admin_client.post(f'/forum/delete/master/{forum_post}')
    masters, _ = db.list_forum_masters()
    assert not any(m['id'] == forum_post for m in masters)


def test_delete_master_cascades_to_details(admin_client, forum_post):
    db.create_forum_detail(forum_post, '回覆內文', 1)
    admin_client.post(f'/forum/delete/master/{forum_post}')
    assert len(db.list_forum_details(forum_post)) == 0


# ── 刪除回覆（僅管理員）──────────────────────────────────────────────────────

def test_delete_detail_requires_login(client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    resp = client.post(f'/forum/delete/detail/{detail["id"]}')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']


def test_delete_detail_by_regular_user(authed_client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    resp = authed_client.post(f'/forum/delete/detail/{detail["id"]}', follow_redirects=True)
    assert '無權限刪除回覆'.encode() in resp.data


def test_delete_detail_is_soft_delete(admin_client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    detail_id = detail['id']
    admin_client.post(f'/forum/delete/detail/{detail_id}')
    assert db.get_forum_detail(detail_id)['is_deleted'] == 1


def test_delete_detail_not_shown_after_delete(admin_client, forum_post):
    detail = db.list_forum_details(forum_post)[0]
    admin_client.post(f'/forum/delete/detail/{detail["id"]}')
    assert len(db.list_forum_details(forum_post)) == 0


# ── 守門修正：停用帳號持有舊 session ─────────────────────────────────────────

def test_new_post_disabled_user_redirects_to_login(other_client):
    """停用帳號持有舊 session 仍無法發文。"""
    before = db.list_forum_masters(1, 10)[1]
    resp = other_client.post('/forum/new',
                             data={'title': '不該成功', 'content': 'x'})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_forum_masters(1, 10)[1] == before


def test_reply_disabled_user_redirects_to_login(other_client, forum_post):
    """停用帳號持有舊 session 仍無法回覆。"""
    before = len(db.list_forum_details(forum_post))
    resp = other_client.post(f'/forum/reply/{forum_post}',
                             data={'content': '不該成功'})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert len(db.list_forum_details(forum_post)) == before


def test_index_disabled_user_sees_guest_view(other_client):
    """停用帳號仍可瀏覽論壇，但以訪客身分呈現。"""
    resp = other_client.get('/forum')
    assert resp.status_code == 200
    assert '發表文章'.encode() not in resp.data
