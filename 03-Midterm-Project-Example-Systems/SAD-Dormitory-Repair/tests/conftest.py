import pytest

import db as db_module
from app import app as flask_app


@pytest.fixture(scope='function')
def app(tmp_path):
    """每個測試函式獨立的 Flask app，使用暫存 DB（含種子帳號與種子報修單）。"""
    flask_app.config['TESTING'] = True
    db_module.DB_PATH = str(tmp_path / 'test.db')
    db_module.init_db()
    yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def authed_client(client):
    """已登入 session 的 test client（種子帳號 user@example.com，ID=1，住宿生）。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 1
    return client


@pytest.fixture
def admin_client(client):
    """已登入 session 的 test client（種子帳號 admin@example.com，ID=2，管理員）。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 2
    return client


@pytest.fixture
def other_client(client):
    """第三個使用者 session（disabled@example.com，ID=3，role=1，帳號停用）。

    session 直接注入，因此可用來測「持有舊 session 的停用帳號」。
    若要測「非本人但帳號有效」的權限邊界，請先 db.set_user_active(3, 1)。
    """
    with client.session_transaction() as sess:
        sess['user_id'] = 3
    return client


@pytest.fixture
def staff_client(client):
    """第四個使用者 session（staff@example.com，ID=4，role=0，第二位管理員）。

    存在的理由是 admin 的自我保護規則（R1–R3）需要「管理員對另一個管理員
    動手」的對象，而報修的派工也需要一個不是操作者本人的承辦人。
    """
    with client.session_transaction() as sess:
        sess['user_id'] = 4
    return client
