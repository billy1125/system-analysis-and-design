"""書目（books）與館藏複本（book_copies）的資料存取。

books 為主檔（一筆書目 = 一個 ISBN），book_copies 為明細（一筆 = 架上一本實體書）。
可借數量不另存欄位，一律由 book_copies 即時彙總，避免主檔與明細不同步。
"""
from .connection import _get_conn

# 書目查詢的共用欄位清單：主檔欄位 + 由明細彙總出的兩個數量。
_BOOK_COLUMNS = """
    b.id, b.isbn, b.title, b.author, b.publisher, b.publish_year,
    b.category, b.description, b.book_status, b.created_at, b.updated_at,
    (SELECT COUNT(*) FROM book_copies c
      WHERE c.book_id = b.id AND c.is_deleted = 0) AS total_copies,
    (SELECT COUNT(*) FROM book_copies c
      WHERE c.book_id = b.id AND c.is_deleted = 0 AND c.copy_status = 'available')
      AS available_copies
"""

_SEED_BOOKS = [
    # (isbn, title, author, publisher, year, category, description, 複本數)
    ('9789861371234', '系統分析與設計', '陳建志', '碁峰資訊', 2023, 'technology',
     '涵蓋結構化分析、物件導向分析與 UML 建模的入門教材。', 3),
    ('9789862765432', '資料庫系統概論', '林美玲', '旗標科技', 2022, 'technology',
     '關聯式資料庫理論、正規化與 SQL 實務。', 2),
    ('9789573317654', '演算法圖鑑', '王大衛', '天下文化', 2021, 'technology',
     '以圖解方式說明常見排序、搜尋與圖論演算法。', 2),
    ('9789571478901', '台灣通史新編', '張文彬', '聯經出版', 2020, 'social',
     '從清領到戰後的台灣社會變遷。', 1),
    ('9789863594567', '經濟學原理', '李冠廷', '東華書局', 2019, 'social',
     '個體與總體經濟學的基礎概念。', 2),
    ('9789570859012', '百年孤寂', '賈西亞・馬奎斯', '皇冠文化', 2018, 'literature',
     '魔幻寫實主義的代表作品。', 2),
    ('9789864062345', '文心雕龍讀本', '劉勰', '三民書局', 2017, 'literature',
     '中國古典文學理論經典注譯本。', 1),
    ('9789862828765', '西洋美術史', '吳靜宜', '藝術家出版社', 2021, 'art',
     '從文藝復興到現代主義的西洋繪畫發展。', 1),
    ('9789865034321', '普通物理學', '黃俊傑', '全華圖書', 2022, 'science',
     '力學、電磁學與熱力學的大一普物教材。', 3),
    ('9789571076543', '有機化學導論', '蔡雅婷', '五南圖書', 2020, 'science',
     '官能基反應機構與立體化學入門。', 1),
]


def _init_book_tables(conn):
    """建立 books 與 book_copies 資料表。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS books (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            isbn         TEXT    NOT NULL,
            title        TEXT    NOT NULL,
            author       TEXT    NOT NULL,
            publisher    TEXT,
            publish_year INTEGER,
            category     TEXT    NOT NULL DEFAULT 'other',
            description  TEXT,
            book_status  TEXT    NOT NULL DEFAULT 'available',
            created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted   INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS book_copies (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id      INTEGER NOT NULL,
            copy_barcode TEXT    NOT NULL,
            copy_status  TEXT    NOT NULL DEFAULT 'available',
            created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted   INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()


def _seed_books_if_empty(conn):
    """植入種子書目與複本（books table 為空時才執行）。"""
    count = conn.execute('SELECT COUNT(*) FROM books').fetchone()[0]
    if count > 0:
        return
    for isbn, title, author, publisher, year, category, desc, copies in _SEED_BOOKS:
        book_id = conn.execute(
            """INSERT INTO books
                   (isbn, title, author, publisher, publish_year, category, description)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (isbn, title, author, publisher, year, category, desc),
        ).lastrowid
        for seq in range(1, copies + 1):
            conn.execute(
                'INSERT INTO book_copies (book_id, copy_barcode) VALUES (?, ?)',
                (book_id, _format_barcode(book_id, seq)),
            )
    conn.commit()


def _format_barcode(book_id, seq):
    """複本條碼格式：書目 id 補滿 4 位 + 流水號補滿 3 位，例如 0007-002。"""
    return f'{book_id:04d}-{seq:03d}'


# ── 書目查詢 ──────────────────────────────────────────────────────────────────

def list_books(page, page_size, keyword=None, category=None, available_only=False):
    """書目清單（分頁），回傳 (items, total)。

    keyword 同時比對書名、作者與 ISBN；category 為 None 或 'all' 時不過濾；
    available_only 為 True 時只列出目前尚有可借複本的書目。
    """
    where  = ['b.is_deleted = 0']
    params = []

    if keyword:
        where.append('(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)')
        like = f'%{keyword}%'
        params.extend([like, like, like])

    if category and category != 'all':
        where.append('b.category = ?')
        params.append(category)

    if available_only:
        where.append(
            "(SELECT COUNT(*) FROM book_copies c"
            "  WHERE c.book_id = b.id AND c.is_deleted = 0"
            "    AND c.copy_status = 'available') > 0"
        )

    clause = ' WHERE ' + ' AND '.join(where)
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(f'SELECT COUNT(*) FROM books b{clause}', params).fetchone()[0]
    items = conn.execute(
        f'SELECT {_BOOK_COLUMNS} FROM books b{clause}'
        ' ORDER BY b.title ASC, b.id ASC LIMIT ? OFFSET ?',
        params + [page_size, offset],
    ).fetchall()
    conn.close()
    return items, total


def get_book(book_id):
    """以 id 查詢書目，含 total_copies 與 available_copies。找不到回傳 None。"""
    conn = _get_conn()
    row  = conn.execute(
        f'SELECT {_BOOK_COLUMNS} FROM books b WHERE b.id = ? AND b.is_deleted = 0',
        (book_id,),
    ).fetchone()
    conn.close()
    return row


def find_book_by_isbn(isbn):
    """以 ISBN 查詢未刪除的書目，供重複性檢查使用。"""
    conn = _get_conn()
    row  = conn.execute(
        'SELECT id, isbn, title FROM books WHERE isbn = ? AND is_deleted = 0',
        (isbn,),
    ).fetchone()
    conn.close()
    return row


# ── 書目維護（管理員） ────────────────────────────────────────────────────────

def create_book(isbn, title, author, publisher, publish_year, category,
                description, copy_count):
    """新增書目並一次建立 copy_count 本複本，於同一 transaction 完成。回傳 book_id。"""
    conn = _get_conn()
    with conn:
        book_id = conn.execute(
            """INSERT INTO books
                   (isbn, title, author, publisher, publish_year, category, description,
                    book_status, created_at, updated_at, is_deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'available', datetime('now'), datetime('now'), 0)""",
            (isbn, title, author, publisher, publish_year, category, description),
        ).lastrowid
        for seq in range(1, copy_count + 1):
            conn.execute(
                """INSERT INTO book_copies
                       (book_id, copy_barcode, copy_status, created_at, updated_at, is_deleted)
                   VALUES (?, ?, 'available', datetime('now'), datetime('now'), 0)""",
                (book_id, _format_barcode(book_id, seq)),
            )
    conn.close()
    return book_id


def update_book(book_id, isbn, title, author, publisher, publish_year, category,
                description, book_status):
    """更新書目主檔欄位，不動複本。"""
    conn = _get_conn()
    conn.execute(
        """UPDATE books
           SET isbn = ?, title = ?, author = ?, publisher = ?, publish_year = ?,
               category = ?, description = ?, book_status = ?, updated_at = datetime('now')
           WHERE id = ? AND is_deleted = 0""",
        (isbn, title, author, publisher, publish_year, category, description,
         book_status, book_id),
    )
    conn.commit()
    conn.close()


def soft_delete_book(book_id):
    """邏輯刪除書目。仍有未歸還的借閱時拒絕，回傳字串狀態碼。

    'deleted'  — 已刪除書目與其所有複本
    'on_loan'  — 尚有未歸還的借閱，不予刪除
    'missing'  — 書目不存在或已刪除
    """
    conn = _get_conn()
    book = conn.execute(
        'SELECT id FROM books WHERE id = ? AND is_deleted = 0', (book_id,)
    ).fetchone()
    if book is None:
        conn.close()
        return 'missing'

    active = conn.execute(
        """SELECT COUNT(*) FROM loans
           WHERE book_id = ? AND is_deleted = 0 AND returned_at IS NULL""",
        (book_id,),
    ).fetchone()[0]
    if active > 0:
        conn.close()
        return 'on_loan'

    with conn:
        conn.execute(
            "UPDATE books SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?",
            (book_id,),
        )
        conn.execute(
            "UPDATE book_copies SET is_deleted = 1, updated_at = datetime('now')"
            ' WHERE book_id = ?',
            (book_id,),
        )
        # 書目下架後，等待中的預約已無意義，一併取消。
        conn.execute(
            """UPDATE reservations
               SET reservation_status = 'cancelled', updated_at = datetime('now')
               WHERE book_id = ? AND is_deleted = 0
                 AND reservation_status IN ('waiting', 'ready')""",
            (book_id,),
        )
    conn.close()
    return 'deleted'


# ── 複本維護（管理員） ────────────────────────────────────────────────────────

def list_copies(book_id):
    """列出某書目的所有未刪除複本。"""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT id, book_id, copy_barcode, copy_status, created_at, updated_at
           FROM book_copies
           WHERE book_id = ? AND is_deleted = 0
           ORDER BY copy_barcode ASC""",
        (book_id,),
    ).fetchall()
    conn.close()
    return rows


def get_copy(copy_id):
    """以 id 查詢複本。找不到回傳 None。"""
    conn = _get_conn()
    row  = conn.execute(
        """SELECT c.id, c.book_id, c.copy_barcode, c.copy_status, c.created_at,
                  c.updated_at, b.title
           FROM book_copies c
           JOIN books b ON b.id = c.book_id
           WHERE c.id = ? AND c.is_deleted = 0""",
        (copy_id,),
    ).fetchone()
    conn.close()
    return row


def add_copy(book_id):
    """為書目新增一本複本，條碼流水號接續既有（含已刪除）複本。回傳 copy_id。"""
    conn = _get_conn()
    # 流水號以歷來複本總數推算，避免刪除後重複使用同一條碼。
    used = conn.execute(
        'SELECT COUNT(*) FROM book_copies WHERE book_id = ?', (book_id,)
    ).fetchone()[0]
    copy_id = conn.execute(
        """INSERT INTO book_copies
               (book_id, copy_barcode, copy_status, created_at, updated_at, is_deleted)
           VALUES (?, ?, 'available', datetime('now'), datetime('now'), 0)""",
        (book_id, _format_barcode(book_id, used + 1)),
    ).lastrowid
    conn.commit()
    conn.close()
    return copy_id


def set_copy_status(copy_id, status):
    """設定複本狀態（available / maintenance / lost）。借出中的複本不可變更。

    'updated'  — 已更新
    'on_loan'  — 複本借出中，不予變更
    'missing'  — 複本不存在或已刪除
    """
    conn = _get_conn()
    copy = conn.execute(
        'SELECT copy_status FROM book_copies WHERE id = ? AND is_deleted = 0', (copy_id,)
    ).fetchone()
    if copy is None:
        conn.close()
        return 'missing'
    if copy['copy_status'] == 'borrowed':
        conn.close()
        return 'on_loan'

    conn.execute(
        "UPDATE book_copies SET copy_status = ?, updated_at = datetime('now') WHERE id = ?",
        (status, copy_id),
    )
    conn.commit()
    conn.close()
    return 'updated'


def soft_delete_copy(copy_id):
    """邏輯刪除單一複本。借出中的複本不可刪除。

    'deleted'  — 已刪除
    'on_loan'  — 複本借出中，不予刪除
    'missing'  — 複本不存在或已刪除
    """
    conn = _get_conn()
    copy = conn.execute(
        'SELECT copy_status FROM book_copies WHERE id = ? AND is_deleted = 0', (copy_id,)
    ).fetchone()
    if copy is None:
        conn.close()
        return 'missing'
    if copy['copy_status'] == 'borrowed':
        conn.close()
        return 'on_loan'

    conn.execute(
        "UPDATE book_copies SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?",
        (copy_id,),
    )
    conn.commit()
    conn.close()
    return 'deleted'
