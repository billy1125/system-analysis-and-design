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
from .equipment import (       # noqa: E402
    list_equipment,
    get_equipment,
    create_equipment,
    update_equipment,
    soft_delete_equipment,
    create_borrow_order,
    get_borrow_order,
    list_order_items,
    list_my_orders,
    list_all_orders,
    cancel_order,
    approve_order,
    reject_order,
    mark_order_borrowed,
    mark_order_returned,
    update_borrow_order,
)


def init_db():
    """建立所有資料表，並植入種子資料（對應 table 為空時）。"""
    from .connection import _get_conn
    from .users import _seed_users_if_empty
    from .equipment import _init_equipment_tables, _seed_equipment_if_empty

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
    _init_equipment_tables(conn)
    _seed_users_if_empty(conn)
    _seed_equipment_if_empty(conn)
    conn.close()
