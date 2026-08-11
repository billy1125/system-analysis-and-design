import bcrypt

from .connection import _get_conn

_SEED_USERS = [
    # (email, password, role, is_active, name)
    ('user@example.com',     'password123', 1, 1, '一般讀者'),
    ('admin@example.com',    'admin1234',   0, 1, '圖書館員'),
    ('disabled@example.com', 'disabled123', 1, 0, None),
]


def _seed_users_if_empty(conn):
    """植入種子帳號（users table 為空時才執行）。"""
    count = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    if count > 0:
        return
    for email, password, role, is_active, name in _SEED_USERS:
        h = bcrypt.hashpw(password.encode(), bcrypt.gensalt(4)).decode()
        conn.execute(
            'INSERT INTO users (email, hash, role, is_active, name) VALUES (?, ?, ?, ?, ?)',
            (email, h, role, is_active, name)
        )
    conn.commit()


def find_user_by_email(email):
    """以 email 查詢使用者，含 hash。"""
    conn = _get_conn()
    row = conn.execute(
        'SELECT id, email, hash, role, name, display_name, is_active, is_deleted,'
        ' created_at, last_login_at FROM users WHERE email = ?',
        (email,)
    ).fetchone()
    conn.close()
    return row


def find_user_by_id(user_id):
    """以 id 查詢使用者，不含 hash。"""
    conn = _get_conn()
    row = conn.execute(
        'SELECT id, email, role, name, display_name, is_active, is_deleted,'
        ' created_at, last_login_at FROM users WHERE id = ?',
        (user_id,)
    ).fetchone()
    conn.close()
    return row


def create_user(email, password, name=None, display_name=None):
    """新增使用者，密碼以 bcrypt 雜湊儲存。"""
    h = bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()
    conn = _get_conn()
    conn.execute(
        'INSERT INTO users (email, hash, name, display_name) VALUES (?, ?, ?, ?)',
        (email, h, name, display_name)
    )
    conn.commit()
    conn.close()


def update_user_profile(user_id, name, display_name):
    """更新使用者姓名與顯示名稱。"""
    conn = _get_conn()
    conn.execute(
        'UPDATE users SET name = ?, display_name = ? WHERE id = ?',
        (name, display_name, user_id)
    )
    conn.commit()
    conn.close()


def update_last_login(user_id):
    """更新最後登入時間為現在。"""
    conn = _get_conn()
    conn.execute("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()


def soft_delete_user(user_id):
    """邏輯刪除使用者（is_deleted = 1）。"""
    conn = _get_conn()
    conn.execute('UPDATE users SET is_deleted = 1 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()


def list_users(page, page_size, status='all', keyword=None):
    """會員清單（分頁），回傳 (items, total)。

    status: 'all' | 'active' | 'disabled' | 'deleted'，其他值視同 'all'。

    注意：本函式刻意不強制 is_deleted = 0 的過濾，因為管理員的職責就是
    要能檢視已刪除的紀錄。此為 rules/database.md 的明列例外。
    """
    where  = []
    params = []

    if status == 'active':
        where.append('is_deleted = 0 AND is_active = 1')
    elif status == 'disabled':
        where.append('is_deleted = 0 AND is_active = 0')
    elif status == 'deleted':
        where.append('is_deleted = 1')

    if keyword:
        where.append('(email LIKE ? OR name LIKE ? OR display_name LIKE ?)')
        like = f'%{keyword}%'
        params.extend([like, like, like])

    clause = (' WHERE ' + ' AND '.join(where)) if where else ''
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(f'SELECT COUNT(*) FROM users{clause}', params).fetchone()[0]
    items = conn.execute(
        'SELECT id, email, role, name, display_name, is_active, is_deleted,'
        f' created_at, last_login_at FROM users{clause}'
        ' ORDER BY id LIMIT ? OFFSET ?',
        params + [page_size, offset]
    ).fetchall()
    conn.close()
    return items, total


def set_user_active(user_id, is_active):
    """設定帳號啟用狀態（1 啟用 / 0 停用）。"""
    conn = _get_conn()
    conn.execute('UPDATE users SET is_active = ? WHERE id = ?', (is_active, user_id))
    conn.commit()
    conn.close()


def set_user_role(user_id, role):
    """設定角色（0 館員／管理員 / 1 讀者／一般使用者）。"""
    conn = _get_conn()
    conn.execute('UPDATE users SET role = ? WHERE id = ?', (role, user_id))
    conn.commit()
    conn.close()


def hard_delete_user_by_email(email):
    """實體刪除使用者，僅用於測試清理。"""
    conn = _get_conn()
    conn.execute('DELETE FROM users WHERE email = ?', (email,))
    conn.commit()
    conn.close()
