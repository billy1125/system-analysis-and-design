from .connection import _get_conn


def _init_equipment_tables(conn):
    """建立 equipment、borrow_orders、borrow_order_items 三張資料表。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS equipment (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            equipment_name        TEXT    NOT NULL,
            equipment_code        TEXT    NOT NULL,
            equipment_description TEXT,
            total_quantity        INTEGER NOT NULL DEFAULT 0,
            available_quantity    INTEGER NOT NULL DEFAULT 0,
            equipment_status      TEXT    NOT NULL DEFAULT 'available',
            created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted            INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS borrow_orders (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            borrower_id        INTEGER NOT NULL,
            borrow_start_at    TEXT    NOT NULL,
            borrow_end_at      TEXT    NOT NULL,
            actual_borrowed_at TEXT,
            actual_returned_at TEXT,
            borrow_reason      TEXT    NOT NULL,
            order_status       TEXT    NOT NULL DEFAULT 'pending',
            reviewed_by        INTEGER,
            reviewed_at        TEXT,
            review_note        TEXT,
            created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted         INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS borrow_order_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            borrow_order_id INTEGER NOT NULL,
            equipment_id    INTEGER NOT NULL,
            quantity        INTEGER NOT NULL,
            item_status     TEXT    NOT NULL DEFAULT 'pending',
            created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted      INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()


_SEED_EQUIPMENT = [
    # (equipment_name, equipment_code, equipment_description, total_quantity,
    #  available_quantity, equipment_status)
    #
    # 每一筆都刻意示範一種狀態組合，讓借用流程的每個分支都有可用的測試對象：
    ('單槍投影機',   'PRJ-001', '1080p 投影機，附 HDMI 與 VGA 訊號線。',           5, 5, 'available'),
    ('筆記型電腦',   'NB-001',  '課堂簡報用，已預裝 Office 與瀏覽器。',            8, 6, 'available'),
    ('無線麥克風組', 'MIC-001', '兩支手持麥克風加一台接收器。',                    4, 4, 'available'),
    ('數位單眼相機', 'CAM-001', '含 18-55mm 鏡頭與記憶卡，需自備電池。',           2, 1, 'available'),
    ('三腳架',       'TRP-001', '鋁合金三腳架，最高 160 公分。',                   6, 6, 'available'),
    # available_quantity = 0：狀態可借但無庫存，用來檢查「數量」與「狀態」是兩件事
    ('行動電源',     'PWR-001', '20000mAh，全部借出中。',                          3, 0, 'available'),
    # 非 available 狀態：借用入口應被伺服器端擋下，而不只是隱藏按鈕
    ('攝影機',       'VID-001', '4K 攝影機，鏡頭送修中。',                         1, 0, 'maintenance'),
    ('會議用喇叭',   'SPK-001', '藍牙會議喇叭，暫停外借。',                        2, 2, 'unavailable'),
]


def _seed_equipment_if_empty(conn):
    """植入種子器材（equipment table 為空時才執行）。

    與 _seed_users_if_empty 對稱，同樣由 init_db() 呼叫、共用同一個 conn。
    借用單（borrow_orders）不植入種子資料——借用流程涉及狀態轉移與數量扣減，
    由使用者實際操作產生的資料才會與 equipment.available_quantity 一致。
    """
    count = conn.execute('SELECT COUNT(*) FROM equipment').fetchone()[0]
    if count > 0:
        return

    for name, code, description, total_qty, available_qty, status in _SEED_EQUIPMENT:
        conn.execute(
            """INSERT INTO equipment
                   (equipment_name, equipment_code, equipment_description,
                    total_quantity, available_quantity, equipment_status)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, code, description, total_qty, available_qty, status),
        )
    conn.commit()


# ── 器材管理 ───────────────────────────────────────────────────────────────────

def list_equipment(page, page_size):
    """器材清單（分頁），回傳 (items, total)，依器材名稱升冪排列。"""
    conn   = _get_conn()
    offset = (page - 1) * page_size
    items  = conn.execute(
        """SELECT id, equipment_name, equipment_code, equipment_description,
                  total_quantity, available_quantity, equipment_status, updated_at
           FROM equipment
           WHERE is_deleted = 0
           ORDER BY equipment_name ASC
           LIMIT ? OFFSET ?""",
        (page_size, offset),
    ).fetchall()
    total = conn.execute(
        'SELECT COUNT(*) FROM equipment WHERE is_deleted = 0'
    ).fetchone()[0]
    conn.close()
    return items, total


def get_equipment(equipment_id):
    """取得單一器材（已邏輯刪除者視為不存在）。"""
    conn = _get_conn()
    row  = conn.execute(
        'SELECT * FROM equipment WHERE id = ? AND is_deleted = 0',
        (equipment_id,),
    ).fetchone()
    conn.close()
    return row


def create_equipment(name, code, description, total_qty, available_qty, status):
    """新增器材，回傳新器材 id。"""
    conn   = _get_conn()
    row_id = conn.execute(
        """INSERT INTO equipment
               (equipment_name, equipment_code, equipment_description,
                total_quantity, available_quantity, equipment_status,
                created_at, updated_at, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0)""",
        (name, code, description, total_qty, available_qty, status),
    ).lastrowid
    conn.commit()
    conn.close()
    return row_id


def update_equipment(equipment_id, name, code, description, total_qty, available_qty, status):
    """更新器材欄位與 updated_at。"""
    conn = _get_conn()
    conn.execute(
        """UPDATE equipment
           SET equipment_name=?, equipment_code=?, equipment_description=?,
               total_quantity=?, available_quantity=?, equipment_status=?,
               updated_at=datetime('now')
           WHERE id = ? AND is_deleted = 0""",
        (name, code, description, total_qty, available_qty, status, equipment_id),
    )
    conn.commit()
    conn.close()


def soft_delete_equipment(equipment_id):
    """邏輯刪除器材（is_deleted = 1）。"""
    conn = _get_conn()
    conn.execute(
        "UPDATE equipment SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?",
        (equipment_id,),
    )
    conn.commit()
    conn.close()


# ── 借用單 ─────────────────────────────────────────────────────────────────────

def create_borrow_order(borrower_id, start_at, end_at, reason, items):
    """新增借用單主表與明細，在同一 transaction 完成。items = [(equipment_id, quantity), ...]"""
    conn = _get_conn()
    with conn:
        order_id = conn.execute(
            """INSERT INTO borrow_orders
                   (borrower_id, borrow_start_at, borrow_end_at, borrow_reason,
                    order_status, created_at, updated_at, is_deleted)
               VALUES (?, ?, ?, ?, 'pending', datetime('now'), datetime('now'), 0)""",
            (borrower_id, start_at, end_at, reason),
        ).lastrowid
        for equipment_id, quantity in items:
            conn.execute(
                """INSERT INTO borrow_order_items
                       (borrow_order_id, equipment_id, quantity, item_status,
                        created_at, updated_at, is_deleted)
                   VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'), 0)""",
                (order_id, equipment_id, quantity),
            )
    conn.close()
    return order_id


def get_borrow_order(order_id):
    """取得單一借用單，含借用者顯示名稱。"""
    conn = _get_conn()
    row  = conn.execute(
        """SELECT o.*, u.display_name AS borrower_display, u.name AS borrower_name,
                  u.email AS borrower_email
           FROM borrow_orders o
           JOIN users u ON u.id = o.borrower_id
           WHERE o.id = ? AND o.is_deleted = 0""",
        (order_id,),
    ).fetchone()
    conn.close()
    return row


def list_order_items(order_id):
    """取得借用單明細，含器材名稱與編號。"""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT i.*, e.equipment_name, e.equipment_code
           FROM borrow_order_items i
           JOIN equipment e ON e.id = i.equipment_id
           WHERE i.borrow_order_id = ? AND i.is_deleted = 0""",
        (order_id,),
    ).fetchall()
    conn.close()
    return rows


def list_my_orders(user_id):
    """取得指定使用者的所有借用單，依建立時間降冪。"""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT * FROM borrow_orders
           WHERE borrower_id = ? AND is_deleted = 0
           ORDER BY created_at DESC""",
        (user_id,),
    ).fetchall()
    conn.close()
    return rows


def list_all_orders():
    """取得全部借用單（管理員用），依建立時間降冪。"""
    conn = _get_conn()
    rows = conn.execute(
        """SELECT o.*, u.display_name AS borrower_display, u.name AS borrower_name,
                  u.email AS borrower_email
           FROM borrow_orders o
           JOIN users u ON u.id = o.borrower_id
           WHERE o.is_deleted = 0
           ORDER BY o.created_at DESC""",
    ).fetchall()
    conn.close()
    return rows


def cancel_order(order_id, user_id):
    """取消借用申請；驗證借用者身份且狀態為 pending 或 approved。"""
    conn  = _get_conn()
    order = conn.execute(
        'SELECT * FROM borrow_orders WHERE id = ? AND is_deleted = 0',
        (order_id,),
    ).fetchone()
    if not order or order['borrower_id'] != user_id:
        conn.close()
        return False
    if order['order_status'] not in ('pending', 'approved'):
        conn.close()
        return False
    conn.execute(
        """UPDATE borrow_orders
           SET order_status = 'cancelled', updated_at = datetime('now')
           WHERE id = ?""",
        (order_id,),
    )
    conn.execute(
        """UPDATE borrow_order_items
           SET item_status = 'cancelled', updated_at = datetime('now')
           WHERE borrow_order_id = ? AND is_deleted = 0""",
        (order_id,),
    )
    conn.commit()
    conn.close()
    return True


def approve_order(order_id, admin_id, note):
    """核准借用單；再次確認各器材可借數量足夠。"""
    conn  = _get_conn()
    order = conn.execute(
        "SELECT * FROM borrow_orders WHERE id = ? AND is_deleted = 0 AND order_status = 'pending'",
        (order_id,),
    ).fetchone()
    if not order:
        conn.close()
        return False

    items = conn.execute(
        """SELECT i.*, e.available_quantity
           FROM borrow_order_items i
           JOIN equipment e ON e.id = i.equipment_id
           WHERE i.borrow_order_id = ? AND i.is_deleted = 0""",
        (order_id,),
    ).fetchall()

    for item in items:
        if item['quantity'] > item['available_quantity']:
            conn.close()
            return False

    conn.execute(
        """UPDATE borrow_orders
           SET order_status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'),
               review_note = ?, updated_at = datetime('now')
           WHERE id = ?""",
        (admin_id, note, order_id),
    )
    conn.execute(
        """UPDATE borrow_order_items
           SET item_status = 'approved', updated_at = datetime('now')
           WHERE borrow_order_id = ? AND is_deleted = 0""",
        (order_id,),
    )
    conn.commit()
    conn.close()
    return True


def reject_order(order_id, admin_id, note):
    """拒絕借用單。"""
    conn  = _get_conn()
    order = conn.execute(
        "SELECT * FROM borrow_orders WHERE id = ? AND is_deleted = 0 AND order_status = 'pending'",
        (order_id,),
    ).fetchone()
    if not order:
        conn.close()
        return False
    conn.execute(
        """UPDATE borrow_orders
           SET order_status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'),
               review_note = ?, updated_at = datetime('now')
           WHERE id = ?""",
        (admin_id, note, order_id),
    )
    conn.execute(
        """UPDATE borrow_order_items
           SET item_status = 'rejected', updated_at = datetime('now')
           WHERE borrow_order_id = ? AND is_deleted = 0""",
        (order_id,),
    )
    conn.commit()
    conn.close()
    return True


def mark_order_borrowed(order_id):
    """登記借出：確認數量足夠，在同一 transaction 中更新借用單、明細、器材數量。"""
    conn  = _get_conn()
    order = conn.execute(
        "SELECT * FROM borrow_orders WHERE id = ? AND is_deleted = 0 AND order_status = 'approved'",
        (order_id,),
    ).fetchone()
    if not order:
        conn.close()
        return False

    items = conn.execute(
        """SELECT i.*, e.available_quantity
           FROM borrow_order_items i
           JOIN equipment e ON e.id = i.equipment_id
           WHERE i.borrow_order_id = ? AND i.is_deleted = 0""",
        (order_id,),
    ).fetchall()

    for item in items:
        if item['quantity'] > item['available_quantity']:
            conn.close()
            return False

    with conn:
        conn.execute(
            """UPDATE borrow_orders
               SET order_status = 'borrowed', actual_borrowed_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?""",
            (order_id,),
        )
        conn.execute(
            """UPDATE borrow_order_items
               SET item_status = 'borrowed', updated_at = datetime('now')
               WHERE borrow_order_id = ? AND is_deleted = 0""",
            (order_id,),
        )
        for item in items:
            conn.execute(
                """UPDATE equipment
                   SET available_quantity = available_quantity - ?,
                       updated_at = datetime('now')
                   WHERE id = ? AND available_quantity >= ?""",
                (item['quantity'], item['equipment_id'], item['quantity']),
            )
    conn.close()
    return True


def mark_order_returned(order_id):
    """登記歸還：在同一 transaction 中更新借用單、明細、器材數量（不超過總數量）。"""
    conn  = _get_conn()
    order = conn.execute(
        """SELECT * FROM borrow_orders
           WHERE id = ? AND is_deleted = 0 AND order_status IN ('borrowed', 'overdue')""",
        (order_id,),
    ).fetchone()
    if not order:
        conn.close()
        return False

    items = conn.execute(
        'SELECT * FROM borrow_order_items WHERE borrow_order_id = ? AND is_deleted = 0',
        (order_id,),
    ).fetchall()

    with conn:
        conn.execute(
            """UPDATE borrow_orders
               SET order_status = 'returned', actual_returned_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?""",
            (order_id,),
        )
        conn.execute(
            """UPDATE borrow_order_items
               SET item_status = 'returned', updated_at = datetime('now')
               WHERE borrow_order_id = ? AND is_deleted = 0""",
            (order_id,),
        )
        for item in items:
            conn.execute(
                """UPDATE equipment
                   SET available_quantity = MIN(available_quantity + ?, total_quantity),
                       updated_at = datetime('now')
                   WHERE id = ?""",
                (item['quantity'], item['equipment_id']),
            )
    conn.close()
    return True


def update_borrow_order(order_id, user_id, start_at, end_at, reason, items):
    """修改借用申請（限 pending 狀態，限本人）。items = [(equipment_id, quantity), ...]"""
    conn  = _get_conn()
    order = conn.execute(
        "SELECT * FROM borrow_orders WHERE id = ? AND is_deleted = 0 AND order_status = 'pending'",
        (order_id,),
    ).fetchone()
    if not order or order['borrower_id'] != user_id:
        conn.close()
        return False

    with conn:
        conn.execute(
            """UPDATE borrow_orders
               SET borrow_start_at = ?, borrow_end_at = ?, borrow_reason = ?,
                   updated_at = datetime('now')
               WHERE id = ?""",
            (start_at, end_at, reason, order_id),
        )
        conn.execute(
            'UPDATE borrow_order_items SET is_deleted = 1 WHERE borrow_order_id = ?',
            (order_id,),
        )
        for equipment_id, quantity in items:
            conn.execute(
                """INSERT INTO borrow_order_items
                       (borrow_order_id, equipment_id, quantity, item_status,
                        created_at, updated_at, is_deleted)
                   VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'), 0)""",
                (order_id, equipment_id, quantity),
            )
    conn.close()
    return True
