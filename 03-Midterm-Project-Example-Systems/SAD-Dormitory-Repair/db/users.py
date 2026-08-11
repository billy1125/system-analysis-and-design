import bcrypt

from .connection import _get_conn

_SEED_USERS = [
    # (email, password, role, is_active, name, dorm_building, room_no, phone)
    ('user@example.com',     'password123', 1, 1, '陳小明',       'A 棟', '301', '0912-345-678'),
    ('admin@example.com',    'admin1234',   0, 1, '宿舍管理員',    None,   None,  '02-1234-5678'),
    ('disabled@example.com', 'disabled123', 1, 0, None,            'B 棟', '205', None),
    ('staff@example.com',    'staff1234',   0, 1, '維修組 王師傅', None,   None,  '02-1234-5679'),
]


def _seed_users_if_empty(conn):
    """植入種子帳號（users table 為空時才執行）。"""
    count = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    if count > 0:
        return
    for email, password, role, is_active, name, building, room_no, phone in _SEED_USERS:
        h = bcrypt.hashpw(password.encode(), bcrypt.gensalt(4)).decode()
        conn.execute(
            'INSERT INTO users (email, hash, role, is_active, name, dorm_building, room_no, phone)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (email, h, role, is_active, name, building, room_no, phone)
        )
    conn.commit()


def find_user_by_email(email):
    """以 email 查詢使用者，含 hash。

    刻意不過濾 is_deleted：呼叫端（登入流程）需要區分「查無此人」與「已刪除」。
    """
    conn = _get_conn()
    row = conn.execute(
        'SELECT id, email, hash, role, name, display_name, dorm_building, room_no, phone,'
        ' is_active, is_deleted, created_at, last_login_at FROM users WHERE email = ?',
        (email,)
    ).fetchone()
    conn.close()
    return row


def find_user_by_id(user_id):
    """以 id 查詢使用者，不含 hash。

    刻意不過濾 is_deleted：過濾責任交給呼叫端的 utils._is_usable(user)。
    """
    conn = _get_conn()
    row = conn.execute(
        'SELECT id, email, role, name, display_name, dorm_building, room_no, phone,'
        ' is_active, is_deleted, created_at, last_login_at FROM users WHERE id = ?',
        (user_id,)
    ).fetchone()
    conn.close()
    return row


def create_user(email, password, name=None, display_name=None,
                dorm_building=None, room_no=None, phone=None):
    """新增使用者，密碼以 bcrypt 雜湊儲存。"""
    h = bcrypt.hashpw(password.encode(), bcrypt.gensalt(10)).decode()
    conn = _get_conn()
    conn.execute(
        'INSERT INTO users (email, hash, name, display_name, dorm_building, room_no, phone)'
        ' VALUES (?, ?, ?, ?, ?, ?, ?)',
        (email, h, name, display_name, dorm_building, room_no, phone)
    )
    conn.commit()
    conn.close()


def update_user_profile(user_id, name, display_name, dorm_building, room_no, phone):
    """更新使用者姓名、顯示名稱與住宿聯絡資料。"""
    conn = _get_conn()
    conn.execute(
        'UPDATE users SET name = ?, display_name = ?, dorm_building = ?, room_no = ?, phone = ?'
        ' WHERE id = ?',
        (name, display_name, dorm_building, room_no, phone, user_id)
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
        where.append('(email LIKE ? OR name LIKE ? OR display_name LIKE ? OR room_no LIKE ?)')
        like = f'%{keyword}%'
        params.extend([like, like, like, like])

    clause = (' WHERE ' + ' AND '.join(where)) if where else ''
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(f'SELECT COUNT(*) FROM users{clause}', params).fetchone()[0]
    items = conn.execute(
        'SELECT id, email, role, name, display_name, dorm_building, room_no, phone,'
        f' is_active, is_deleted, created_at, last_login_at FROM users{clause}'
        ' ORDER BY id LIMIT ? OFFSET ?',
        params + [page_size, offset]
    ).fetchall()
    conn.close()
    return items, total


def list_active_admins():
    """列出所有可指派的管理員（role = 0、啟用中、未刪除），供派工下拉選單使用。

    回傳依 id 遞增排序的 Row 清單。
    """
    conn = _get_conn()
    rows = conn.execute(
        'SELECT id, email, name, display_name FROM users'
        ' WHERE role = 0 AND is_active = 1 AND is_deleted = 0 ORDER BY id'
    ).fetchall()
    conn.close()
    return rows


def set_user_active(user_id, is_active):
    """設定帳號啟用狀態（1 啟用 / 0 停用）。"""
    conn = _get_conn()
    conn.execute('UPDATE users SET is_active = ? WHERE id = ?', (is_active, user_id))
    conn.commit()
    conn.close()


def set_user_role(user_id, role):
    """設定角色（0 管理員 / 1 一般使用者）。"""
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
