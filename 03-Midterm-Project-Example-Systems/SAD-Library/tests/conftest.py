import pytest

import db as db_module
from app import app as flask_app
from db.connection import _get_conn


@pytest.fixture(scope='function')
def app(tmp_path):
    """每個測試函式獨立的 Flask app，使用暫存 DB（含種子帳號與種子書目）。"""
    flask_app.config['TESTING'] = True
    db_module.DB_PATH = str(tmp_path / 'test.db')
    db_module.init_db()
    yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def authed_client(client):
    """已登入 session 的 test client（種子帳號 user@example.com，ID=1，讀者）。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 1
    return client


@pytest.fixture
def admin_client(client):
    """已登入 session 的 test client（種子帳號 admin@example.com，ID=2，館員）。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 2
    return client


@pytest.fixture
def other_client(client):
    """第三個使用者 session（disabled@example.com，ID=3，role=1，用於測試他人權限）。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 3
    return client


# ── 圖書相關 fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
def single_copy_book(app):
    """只有一本複本的書目：借走後即無可借複本，用於測試預約流程。"""
    return db_module.create_book(
        isbn='9781111111111', title='單一複本測試書', author='測試作者',
        publisher='測試出版社', publish_year=2024, category='other',
        description=None, copy_count=1,
    )


@pytest.fixture
def multi_copy_book(app):
    """三本複本的書目，用於測試複本維護與同書多人借閱。"""
    return db_module.create_book(
        isbn='9782222222222', title='多複本測試書', author='測試作者',
        publisher='測試出版社', publish_year=2024, category='technology',
        description='測試用', copy_count=3,
    )


@pytest.fixture
def overdue_loan(app):
    """ID=1 讀者的一筆逾期借閱，回傳 loan_id。

    逾期以直接把 due_at 改到過去製造，避免測試等待真實時間。
    """
    _, loan_id = db_module.borrow_book(1, 1)
    conn = _get_conn()
    conn.execute(
        "UPDATE loans SET due_at = datetime('now', '-1 day') WHERE id = ?", (loan_id,)
    )
    conn.commit()
    conn.close()
    return loan_id


@pytest.fixture
def make_overdue(app):
    """把指定借閱單改為逾期的 helper。"""
    def _make(loan_id, days=1):
        conn = _get_conn()
        conn.execute(
            f"UPDATE loans SET due_at = datetime('now', '-{days} days') WHERE id = ?",
            (loan_id,),
        )
        conn.commit()
        conn.close()
    return _make
