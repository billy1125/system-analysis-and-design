"""預約（reservations）的資料存取。

預約只在「該書目目前無可借複本」時成立，作用是排隊候補：
有人還書時，排隊最久的一筆會由 db.loans.return_loan() 升級為 ready（可取書）。
預約不實際保留複本，取書順序仍為先到先得，詳見規格書 KI-21。
"""
from .connection import _get_conn

_RESERVATION_COLUMNS = """
    r.id, r.book_id, r.user_id, r.reserved_at, r.ready_at,
    r.reservation_status, r.created_at, r.updated_at,
    b.title, b.author, b.isbn,
    (SELECT COUNT(*) FROM book_copies c
      WHERE c.book_id = b.id AND c.is_deleted = 0 AND c.copy_status = 'available')
      AS available_copies
"""


def _init_reservation_tables(conn):
    """建立 reservations 資料表。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id            INTEGER NOT NULL,
            user_id            INTEGER NOT NULL,
            reserved_at        TEXT    NOT NULL DEFAULT (datetime('now')),
            ready_at           TEXT,
            reservation_status TEXT    NOT NULL DEFAULT 'waiting',
            created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted         INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()


# ── 建立預約 ──────────────────────────────────────────────────────────────────

def create_reservation(book_id, user_id):
    """建立預約，回傳 (狀態碼, reservation_id)。失敗時 id 為 None。

    'ok'               — 預約成功
    'missing'          — 書目不存在或已下架
    'book_unavailable' — 書目狀態非可借閱
    'available'        — 尚有可借複本，應直接借閱而非預約
    'already_borrowed' — 讀者已借閱此書且尚未歸還
    'duplicate'        — 讀者已有進行中的預約
    """
    conn = _get_conn()
    book = conn.execute(
        'SELECT id, book_status FROM books WHERE id = ? AND is_deleted = 0', (book_id,)
    ).fetchone()
    if book is None:
        conn.close()
        return 'missing', None
    if book['book_status'] != 'available':
        conn.close()
        return 'book_unavailable', None

    available = conn.execute(
        """SELECT COUNT(*) FROM book_copies
           WHERE book_id = ? AND is_deleted = 0 AND copy_status = 'available'""",
        (book_id,),
    ).fetchone()[0]
    if available > 0:
        conn.close()
        return 'available', None

    borrowed = conn.execute(
        """SELECT 1 FROM loans
           WHERE book_id = ? AND borrower_id = ? AND is_deleted = 0
             AND returned_at IS NULL""",
        (book_id, user_id),
    ).fetchone()
    if borrowed is not None:
        conn.close()
        return 'already_borrowed', None

    dup = conn.execute(
        """SELECT 1 FROM reservations
           WHERE book_id = ? AND user_id = ? AND is_deleted = 0
             AND reservation_status IN ('waiting', 'ready')""",
        (book_id, user_id),
    ).fetchone()
    if dup is not None:
        conn.close()
        return 'duplicate', None

    reservation_id = conn.execute(
        """INSERT INTO reservations
               (book_id, user_id, reserved_at, reservation_status,
                created_at, updated_at, is_deleted)
           VALUES (?, ?, datetime('now'), 'waiting', datetime('now'), datetime('now'), 0)""",
        (book_id, user_id),
    ).lastrowid
    conn.commit()
    conn.close()
    return 'ok', reservation_id


# ── 取消預約 ──────────────────────────────────────────────────────────────────

def cancel_reservation(reservation_id, user_id, is_admin=False):
    """取消預約。取消的若是 ready 狀態，順位遞補給下一位等待者。

    'ok'        — 已取消
    'missing'   — 預約不存在
    'forbidden' — 非本人的預約且非管理員
    'closed'    — 預約已完成或已取消
    """
    conn = _get_conn()
    res = conn.execute(
        """SELECT id, book_id, user_id, reservation_status
           FROM reservations WHERE id = ? AND is_deleted = 0""",
        (reservation_id,),
    ).fetchone()
    if res is None:
        conn.close()
        return 'missing'
    if not is_admin and res['user_id'] != user_id:
        conn.close()
        return 'forbidden'
    if res['reservation_status'] not in ('waiting', 'ready'):
        conn.close()
        return 'closed'

    was_ready = res['reservation_status'] == 'ready'
    with conn:
        conn.execute(
            """UPDATE reservations
               SET reservation_status = 'cancelled', updated_at = datetime('now')
               WHERE id = ?""",
            (reservation_id,),
        )
        if was_ready:
            from .loans import _promote_next_reservation
            _promote_next_reservation(conn, res['book_id'])
    conn.close()
    return 'ok'


# ── 預約查詢 ──────────────────────────────────────────────────────────────────

def get_reservation(reservation_id):
    """單筆預約明細。找不到回傳 None。"""
    conn = _get_conn()
    row  = conn.execute(
        f"""SELECT {_RESERVATION_COLUMNS}
            FROM reservations r
            JOIN books b ON b.id = r.book_id
            WHERE r.id = ? AND r.is_deleted = 0""",
        (reservation_id,),
    ).fetchone()
    conn.close()
    return row


def list_my_reservations(user_id):
    """讀者自己的預約紀錄，進行中的排在前面。"""
    conn = _get_conn()
    rows = conn.execute(
        f"""SELECT {_RESERVATION_COLUMNS},
                   (SELECT COUNT(*) FROM reservations q
                     WHERE q.book_id = r.book_id AND q.is_deleted = 0
                       AND q.reservation_status = 'waiting'
                       AND (q.reserved_at < r.reserved_at
                            OR (q.reserved_at = r.reserved_at AND q.id < r.id))
                   ) + 1 AS queue_position
            FROM reservations r
            JOIN books b ON b.id = r.book_id
            WHERE r.user_id = ? AND r.is_deleted = 0
            ORDER BY r.reservation_status NOT IN ('waiting', 'ready'),
                     r.reserved_at ASC, r.id ASC""",
        (user_id,),
    ).fetchall()
    conn.close()
    return rows


def list_all_reservations(page, page_size, status='all'):
    """全館預約紀錄（分頁），回傳 (items, total)。

    status: 'all' | 'active'（waiting + ready）| 'waiting' | 'ready' | 'closed'
    """
    where  = ['r.is_deleted = 0']
    params = []

    if status == 'active':
        where.append("r.reservation_status IN ('waiting', 'ready')")
    elif status in ('waiting', 'ready'):
        where.append('r.reservation_status = ?')
        params.append(status)
    elif status == 'closed':
        where.append("r.reservation_status IN ('fulfilled', 'cancelled')")

    clause = ' WHERE ' + ' AND '.join(where)
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(
        f'SELECT COUNT(*) FROM reservations r{clause}', params
    ).fetchone()[0]
    items = conn.execute(
        f"""SELECT {_RESERVATION_COLUMNS},
                   u.email AS user_email, u.name AS user_name,
                   u.display_name AS user_display
            FROM reservations r
            JOIN books b ON b.id = r.book_id
            JOIN users u ON u.id = r.user_id{clause}
            ORDER BY r.reservation_status NOT IN ('waiting', 'ready'),
                     r.reserved_at ASC, r.id ASC
            LIMIT ? OFFSET ?""",
        params + [page_size, offset],
    ).fetchall()
    conn.close()
    return items, total


def count_waiting_reservations(book_id):
    """該書目進行中的預約筆數（waiting + ready），供書目頁顯示排隊人數。"""
    conn = _get_conn()
    n = conn.execute(
        """SELECT COUNT(*) FROM reservations
           WHERE book_id = ? AND is_deleted = 0
             AND reservation_status IN ('waiting', 'ready')""",
        (book_id,),
    ).fetchone()[0]
    conn.close()
    return n


def find_active_reservation(book_id, user_id):
    """讀者對該書目進行中的預約。找不到回傳 None。"""
    conn = _get_conn()
    row = conn.execute(
        """SELECT id, reservation_status FROM reservations
           WHERE book_id = ? AND user_id = ? AND is_deleted = 0
             AND reservation_status IN ('waiting', 'ready')""",
        (book_id, user_id),
    ).fetchone()
    conn.close()
    return row
