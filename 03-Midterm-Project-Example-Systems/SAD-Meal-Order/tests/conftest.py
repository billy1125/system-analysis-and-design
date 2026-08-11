import pytest

import db as db_module
from app import app as flask_app


@pytest.fixture(scope='function')
def app(tmp_path):
    """每個測試函式獨立的 Flask app，使用暫存 DB（含種子帳號）。"""
    flask_app.config['TESTING'] = True
    db_module.DB_PATH = str(tmp_path / 'test.db')
    db_module.init_db()
    yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def authed_client(client):
    """已登入 session 的 test client（種子帳號 user@example.com，ID=1）。"""
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
    """第三個使用者 session（disabled@example.com，ID=3，role=1，用於測試他人權限）。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 3
    return client
