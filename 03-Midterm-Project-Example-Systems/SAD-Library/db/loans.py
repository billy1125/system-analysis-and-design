"""借閱單（loans）的資料存取與借閱業務規則。

借閱規則（借期、冊數上限、續借次數）集中定義於本模組頂部的常數，
Blueprint 只負責顯示與權限，不重複判斷這些數值。
"""
from .connection import _get_conn

# ── 借閱政策常數 ──────────────────────────────────────────────────────────────
LOAN_PERIOD_DAYS  = 14   # 借期（天）
RENEW_PERIOD_DAYS = 14   # 每次續借延長（天）
MAX_ACTIVE_LOANS  = 5    # 每人同時可借冊數上限
MAX_RENEW_COUNT   = 1    # 每筆借閱可續借次數上限

# 逾期不另外用排程更新狀態，一律在查詢當下由 due_at 與現在時間比對推導。
_IS_OVERDUE = (
    "CASE WHEN l.returned_at IS NULL AND l.due_at < datetime('now')"
    ' THEN 1 ELSE 0 END AS is_overdue'
)

_LOAN_COLUMNS = f"""
    l.id, l.book_id, l.copy_id, l.borrower_id, l.borrowed_at, l.due_at,
    l.returned_at, l.renew_count, l.loan_status, l.created_at, l.updated_at,
    {_IS_OVERDUE},
    b.title, b.author, b.isbn,
    c.copy_barcode
"""

_LOAN_JOINS = """
    FROM loans l
    JOIN books       b ON b.id = l.book_id
    JOIN book_copies c ON c.id = l.copy_id
"""


def _init_loan_tables(conn):
    """建立 loans 資料表。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS loans (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id     INTEGER NOT NULL,
            copy_id     INTEGER NOT NULL,
            borrower_id INTEGER NOT NULL,
            borrowed_at TEXT    NOT NULL DEFAULT (datetime('now')),
            due_at      TEXT    NOT NULL,
            returned_at TEXT,
            returned_by INTEGER,
            renew_count INTEGER NOT NULL DEFAULT 0,
            loan_status TEXT    NOT NULL DEFAULT 'borrowed',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted  INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()


# ── 讀者狀態查詢 ──────────────────────────────────────────────────────────────

def count_active_loans(user_id):
    """該讀者目前未歸還的冊數。"""
    conn = _get_conn()
    n = conn.execute(
        """SELECT COUNT(*) FROM loans
           WHERE borrower_id = ? AND is_deleted = 0 AND returned_at IS NULL""",
        (user_id,),
    ).fetchone()[0]
    conn.close()
    return n


def has_overdue_loans(user_id):
    """該讀者是否有逾期未還的書。"""
    conn = _get_conn()
    n = conn.execute(
        """SELECT COUNT(*) FROM loans
           WHERE borrower_id = ? AND is_deleted = 0 AND returned_at IS NULL
             AND due_at < datetime('now')""",
        (user_id,),
    ).fetchone()[0]
    conn.close()
    return n > 0


def find_active_loan(book_id, user_id):
    """該讀者是否已借走這本書（同一書目未歸還的借閱）。找不到回傳 None。"""
    conn = _get_conn()
    row = conn.execute(
        """SELECT id FROM loans
           WHERE book_id = ? AND borrower_id = ? AND is_deleted = 0
             AND returned_at IS NULL""",
        (book_id, user_id),
    ).fetchone()
    conn.close()
    return row


# ── 借書 ──────────────────────────────────────────────────────────────────────

def borrow_book(book_id, user_id):
    """借出一本書，回傳 (狀態碼, loan_id)。loan_id 於失敗時為 None。

    狀態碼：
    'ok'               — 借閱成功
    'missing'          — 書目不存在或已下架
    'book_unavailable' — 書目狀態非可借閱
    'has_overdue'      — 讀者有逾期未還的書
    'limit_reached'    — 讀者已達同時借閱上限
    'already_borrowed' — 讀者已借閱同一書目且尚未歸還
    'no_copy'          — 目前無可借複本
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

    overdue = conn.execute(
        """SELECT COUNT(*) FROM loans
           WHERE borrower_id = ? AND is_deleted = 0 AND returned_at IS NULL
             AND due_at < datetime('now')""",
        (user_id,),
    ).fetchone()[0]
    if overdue > 0:
        conn.close()
        return 'has_overdue', None

    active = conn.execute(
        """SELECT COUNT(*) FROM loans
           WHERE borrower_id = ? AND is_deleted = 0 AND returned_at IS NULL""",
        (user_id,),
    ).fetchone()[0]
    if active >= MAX_ACTIVE_LOANS:
        conn.close()
        return 'limit_reached', None

    dup = conn.execute(
        """SELECT id FROM loans
           WHERE book_id = ? AND borrower_id = ? AND is_deleted = 0
             AND returned_at IS NULL""",
        (book_id, user_id),
    ).fetchone()
    if dup is not None:
        conn.close()
        return 'already_borrowed', None

    copy = conn.execute(
        """SELECT id FROM book_copies
           WHERE book_id = ? AND is_deleted = 0 AND copy_status = 'available'
           ORDER BY copy_barcode ASC LIMIT 1""",
        (book_id,),
    ).fetchone()
    if copy is None:
        conn.close()
        return 'no_copy', None

    with conn:
        loan_id = conn.execute(
            f"""INSERT INTO loans
                    (book_id, copy_id, borrower_id, borrowed_at, due_at, renew_count,
                     loan_status, created_at, updated_at, is_deleted)
                VALUES (?, ?, ?, datetime('now'),
                        datetime('now', '+{LOAN_PERIOD_DAYS} days'),
                        0, 'borrowed', datetime('now'), datetime('now'), 0)""",
            (book_id, copy['id'], user_id),
        ).lastrowid
        conn.execute(
            """UPDATE book_copies
               SET copy_status = 'borrowed', updated_at = datetime('now')
               WHERE id = ?""",
            (copy['id'],),
        )
        # 借到自己預約的書時，該筆預約即算完成。
        conn.execute(
            """UPDATE reservations
               SET reservation_status = 'fulfilled', updated_at = datetime('now')
               WHERE book_id = ? AND user_id = ? AND is_deleted = 0
                 AND reservation_status IN ('waiting', 'ready')""",
            (book_id, user_id),
        )
    conn.close()
    return 'ok', loan_id


# ── 還書 ──────────────────────────────────────────────────────────────────────

def return_loan(loan_id, actor_id):
    """歸還一筆借閱，並把該書最早的等待中預約升級為可取書。

    'ok'       — 已歸還
    'missing'  — 借閱單不存在
    'returned' — 已經歸還過
    """
    conn = _get_conn()
    loan = conn.execute(
        'SELECT id, book_id, copy_id, returned_at FROM loans WHERE id = ? AND is_deleted = 0',
        (loan_id,),
    ).fetchone()
    if loan is None:
        conn.close()
        return 'missing'
    if loan['returned_at'] is not None:
        conn.close()
        return 'returned'

    with conn:
        conn.execute(
            """UPDATE loans
               SET returned_at = datetime('now'), returned_by = ?,
                   loan_status = 'returned', updated_at = datetime('now')
               WHERE id = ?""",
            (actor_id, loan_id),
        )
        conn.execute(
            """UPDATE book_copies
               SET copy_status = 'available', updated_at = datetime('now')
               WHERE id = ?""",
            (loan['copy_id'],),
        )
        _promote_next_reservation(conn, loan['book_id'])
    conn.close()
    return 'ok'


def _promote_next_reservation(conn, book_id):
    """把該書目排隊最久的 waiting 預約標記為 ready。無人排隊時不做任何事。

    在呼叫端已開啟的 transaction 內執行，故不自行 commit。
    """
    nxt = conn.execute(
        """SELECT id FROM reservations
           WHERE book_id = ? AND is_deleted = 0 AND reservation_status = 'waiting'
           ORDER BY reserved_at ASC, id ASC LIMIT 1""",
        (book_id,),
    ).fetchone()
    if nxt is None:
        return
    conn.execute(
        """UPDATE reservations
           SET reservation_status = 'ready', ready_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?""",
        (nxt['id'],),
    )


# ── 續借 ──────────────────────────────────────────────────────────────────────

def renew_loan(loan_id, user_id):
    """續借：自原到期日往後延長 RENEW_PERIOD_DAYS 天。

    'ok'            — 續借成功
    'missing'       — 借閱單不存在
    'forbidden'     — 非本人的借閱單
    'returned'      — 已歸還，無法續借
    'overdue'       — 已逾期，須先歸還
    'limit_reached' — 已達續借次數上限
    'reserved'      — 有其他讀者預約等待中
    """
    conn = _get_conn()
    loan = conn.execute(
        """SELECT id, book_id, borrower_id, returned_at, renew_count, due_at
           FROM loans WHERE id = ? AND is_deleted = 0""",
        (loan_id,),
    ).fetchone()
    if loan is None:
        conn.close()
        return 'missing'
    if loan['borrower_id'] != user_id:
        conn.close()
        return 'forbidden'
    if loan['returned_at'] is not None:
        conn.close()
        return 'returned'
    if loan['renew_count'] >= MAX_RENEW_COUNT:
        conn.close()
        return 'limit_reached'

    overdue = conn.execute(
        "SELECT 1 FROM loans WHERE id = ? AND due_at < datetime('now')", (loan_id,)
    ).fetchone()
    if overdue is not None:
        conn.close()
        return 'overdue'

    waiting = conn.execute(
        """SELECT COUNT(*) FROM reservations
           WHERE book_id = ? AND is_deleted = 0
             AND reservation_status IN ('waiting', 'ready')
             AND user_id != ?""",
        (loan['book_id'], user_id),
    ).fetchone()[0]
    if waiting > 0:
        conn.close()
        return 'reserved'

    conn.execute(
        f"""UPDATE loans
            SET due_at      = datetime(due_at, '+{RENEW_PERIOD_DAYS} days'),
                renew_count = renew_count + 1,
                updated_at  = datetime('now')
            WHERE id = ?""",
        (loan_id,),
    )
    conn.commit()
    conn.close()
    return 'ok'


# ── 借閱查詢 ──────────────────────────────────────────────────────────────────

def get_loan(loan_id):
    """單筆借閱明細，含書目、複本與借閱人資訊。找不到回傳 None。"""
    conn = _get_conn()
    row  = conn.execute(
        f"""SELECT {_LOAN_COLUMNS},
                   u.email AS borrower_email, u.name AS borrower_name,
                   u.display_name AS borrower_display
            {_LOAN_JOINS}
            JOIN users u ON u.id = l.borrower_id
            WHERE l.id = ? AND l.is_deleted = 0""",
        (loan_id,),
    ).fetchone()
    conn.close()
    return row


def list_my_loans(user_id, status='all'):
    """讀者自己的借閱紀錄。status: 'all' | 'active' | 'returned'。"""
    where  = ['l.borrower_id = ?', 'l.is_deleted = 0']
    params = [user_id]

    if status == 'active':
        where.append('l.returned_at IS NULL')
    elif status == 'returned':
        where.append('l.returned_at IS NOT NULL')

    conn = _get_conn()
    rows = conn.execute(
        f"""SELECT {_LOAN_COLUMNS} {_LOAN_JOINS}
            WHERE {' AND '.join(where)}
            ORDER BY l.returned_at IS NOT NULL, l.due_at ASC, l.id DESC""",
        params,
    ).fetchall()
    conn.close()
    return rows


def list_all_loans(page, page_size, status='all', keyword=None):
    """全館借閱紀錄（分頁），回傳 (items, total)。

    status: 'all' | 'active' | 'overdue' | 'returned'
    keyword 同時比對書名與借閱人的 email、姓名。
    """
    where  = ['l.is_deleted = 0']
    params = []

    if status == 'active':
        where.append('l.returned_at IS NULL')
    elif status == 'overdue':
        where.append("l.returned_at IS NULL AND l.due_at < datetime('now')")
    elif status == 'returned':
        where.append('l.returned_at IS NOT NULL')

    if keyword:
        where.append('(b.title LIKE ? OR u.email LIKE ? OR u.name LIKE ?)')
        like = f'%{keyword}%'
        params.extend([like, like, like])

    clause = ' WHERE ' + ' AND '.join(where)
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(
        f'SELECT COUNT(*) {_LOAN_JOINS} JOIN users u ON u.id = l.borrower_id{clause}',
        params,
    ).fetchone()[0]
    items = conn.execute(
        f"""SELECT {_LOAN_COLUMNS},
                   u.email AS borrower_email, u.name AS borrower_name,
                   u.display_name AS borrower_display
            {_LOAN_JOINS}
            JOIN users u ON u.id = l.borrower_id{clause}
            ORDER BY l.returned_at IS NOT NULL, l.due_at ASC, l.id DESC
            LIMIT ? OFFSET ?""",
        params + [page_size, offset],
    ).fetchall()
    conn.close()
    return items, total


def list_book_loan_history(book_id, limit=10):
    """單一書目的最近借閱紀錄，供書目詳細頁顯示。"""
    conn = _get_conn()
    rows = conn.execute(
        f"""SELECT {_LOAN_COLUMNS},
                   u.email AS borrower_email, u.name AS borrower_name,
                   u.display_name AS borrower_display
            {_LOAN_JOINS}
            JOIN users u ON u.id = l.borrower_id
            WHERE l.book_id = ? AND l.is_deleted = 0
            ORDER BY l.borrowed_at DESC, l.id DESC
            LIMIT ?""",
        (book_id, limit),
    ).fetchall()
    conn.close()
    return rows


def count_overdue_loans():
    """全館逾期未還的筆數，供管理頁面顯示。"""
    conn = _get_conn()
    n = conn.execute(
        """SELECT COUNT(*) FROM loans
           WHERE is_deleted = 0 AND returned_at IS NULL AND due_at < datetime('now')"""
    ).fetchone()[0]
    conn.close()
    return n
