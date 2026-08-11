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
from .events import (          # noqa: E402
    list_events,
    get_event,
    get_event_for_edit,
    create_event,
    update_event,
    soft_delete_event,
    list_registrations,
    list_all_registrations,
    get_registration,
    count_registered,
    create_or_restore_registration,
    cancel_registration,
    update_registration,
    list_my_registrations,
)


def init_db():
    """建立所有資料表，並植入種子帳號與種子活動（對應資料表為空時）。"""
    from .connection import _get_conn
    from .users import _seed_users_if_empty
    from .events import _init_event_tables, _seed_events_if_empty

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
    _init_event_tables(conn)
    _seed_users_if_empty(conn)
    _seed_events_if_empty(conn)   # 必須在種子帳號之後：活動與報名的 user_id 指向它們
    conn.close()
