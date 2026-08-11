import os

# DB_PATH 定義於此，供 conftest.py 以 db.DB_PATH = '...' 動態替換測試路徑。
# db/connection.py 的 _get_conn() 在呼叫時才讀取此值，確保替換即時生效。
DB_PATH = os.environ.get('DB_PATH', 'database.db')

from .users import (           # noqa: E402
    find_user_by_email,
    find_user_by_id,
    create_user,
    update_user_profile,
    update_last_login,
    soft_delete_user,
    hard_delete_user_by_email,
    list_users,
    set_user_active,
    set_user_role,
)
from .books import (           # noqa: E402
    list_books,
    get_book,
    find_book_by_isbn,
    create_book,
    update_book,
    soft_delete_book,
    list_copies,
    get_copy,
    add_copy,
    set_copy_status,
    soft_delete_copy,
)
from .loans import (           # noqa: E402
    LOAN_PERIOD_DAYS,
    RENEW_PERIOD_DAYS,
    MAX_ACTIVE_LOANS,
    MAX_RENEW_COUNT,
    borrow_book,
    return_loan,
    renew_loan,
    get_loan,
    list_my_loans,
    list_all_loans,
    list_book_loan_history,
    count_active_loans,
    count_overdue_loans,
    has_overdue_loans,
    find_active_loan,
)
from .reservations import (    # noqa: E402
    create_reservation,
    cancel_reservation,
    get_reservation,
    list_my_reservations,
    list_all_reservations,
    count_waiting_reservations,
    find_active_reservation,
)


def init_db():
    """建立所有資料表，並植入種子帳號與種子書目（對應資料表為空時）。"""
    from .connection import _get_conn
    from .users import _seed_users_if_empty
    from .books import _init_book_tables, _seed_books_if_empty
    from .loans import _init_loan_tables
    from .reservations import _init_reservation_tables

    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    UNIQUE NOT NULL,
            hash          TEXT    NOT NULL,
            role          INTEGER NOT NULL DEFAULT 1,
            name          TEXT,
            display_name  TEXT,
            is_active     INTEGER NOT NULL DEFAULT 1,
            is_deleted    INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            last_login_at TEXT
        )
    """)
    conn.commit()
    _init_book_tables(conn)
    _init_loan_tables(conn)          # 必須在 books 之後：查詢會 JOIN books 與 book_copies
    _init_reservation_tables(conn)
    _seed_users_if_empty(conn)
    _seed_books_if_empty(conn)
    conn.close()
