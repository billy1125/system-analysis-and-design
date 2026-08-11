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
    list_active_admins,
    set_user_active,
    set_user_role,
)
from .repair import (          # noqa: E402
    REQUEST_STATUSES,
    CLOSED_STATUSES,
    CATEGORIES,
    PRIORITIES,
    LOG_TYPES,
    list_my_requests,
    list_all_requests,
    get_request,
    list_logs,
    get_report_log,
    count_by_status,
    create_request,
    update_request,
    create_log,
    soft_delete_request,
    assign_request,
    start_request,
    complete_request,
    reject_request,
    cancel_request,
    reopen_request,
)


def init_db():
    """建立所有資料表，並植入種子資料（各表為空時）。"""
    from .connection import _get_conn
    from .users import _seed_users_if_empty
    from .repair import _init_repair_tables, _seed_repair_if_empty

    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT    UNIQUE NOT NULL,
            hash          TEXT    NOT NULL,
            role          INTEGER NOT NULL DEFAULT 1,
            name          TEXT,
            display_name  TEXT,
            dorm_building TEXT,
            room_no       TEXT,
            phone         TEXT,
            is_active     INTEGER NOT NULL DEFAULT 1,
            is_deleted    INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            last_login_at TEXT
        )
    """)
    conn.commit()
    _init_repair_tables(conn)
    _seed_users_if_empty(conn)
    _seed_repair_if_empty(conn)   # 必須在種子帳號之後：報修單的 requester_id 指向它們
    conn.close()
