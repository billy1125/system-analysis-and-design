from .connection import _get_conn

# 訂單狀態機（詳見 document/system-spec.md §6.11）：
#
#     pending ──confirm──> confirmed ──complete──> completed
#        │                     │
#        ├──reject──> rejected └──cancel──> cancelled
#        └──cancel──> cancelled
#
# 庫存（meals.remaining_quantity）只在 confirmed 狀態被佔用：
# confirm 時扣減，取消一張 confirmed 訂單時回補。pending 不佔用庫存，
# 因此 reject 不需要回補，completed 也不回補（餐點已被取走）。

ORDER_STATUSES = ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')

MEAL_STATUSES = ('available', 'sold_out', 'unavailable')

MEAL_CATEGORIES = ('main', 'side', 'drink')


def _init_meal_tables(conn):
    """建立 meals、meal_orders、meal_order_items 三張資料表。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS meals (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            meal_name          TEXT    NOT NULL,
            meal_code          TEXT    NOT NULL,
            meal_description   TEXT,
            category           TEXT    NOT NULL DEFAULT 'main',
            price              INTEGER NOT NULL DEFAULT 0,
            daily_quantity     INTEGER NOT NULL DEFAULT 0,
            remaining_quantity INTEGER NOT NULL DEFAULT 0,
            meal_status        TEXT    NOT NULL DEFAULT 'available',
            created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted         INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS meal_orders (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            orderer_id      INTEGER NOT NULL,
            pickup_date     TEXT    NOT NULL,
            pickup_slot     TEXT    NOT NULL,
            pickup_location TEXT    NOT NULL,
            order_note      TEXT,
            total_amount    INTEGER NOT NULL DEFAULT 0,
            order_status    TEXT    NOT NULL DEFAULT 'pending',
            reviewed_by     INTEGER,
            reviewed_at     TEXT,
            review_note     TEXT,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted      INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS meal_order_items (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            meal_order_id INTEGER NOT NULL,
            meal_id       INTEGER NOT NULL,
            quantity      INTEGER NOT NULL,
            unit_price    INTEGER NOT NULL,
            subtotal      INTEGER NOT NULL,
            item_status   TEXT    NOT NULL DEFAULT 'pending',
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted    INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()


# ── 種子資料 ───────────────────────────────────────────────────────────────────

_SEED_MEALS = [
    # (code, name, description, category, price, daily_qty, remaining_qty, status)
    #
    # 六道餐點各自對應一個值得觀察的狀態：兩道正常供應的主餐、一道已售完的主餐
    # （remaining_quantity = 0，驗證「售完不可訂」）、一道停售的主餐（meal_status
    # = 'unavailable'，驗證「停售不可訂」）、一道附餐、一道飲料。
    ('A01', '雞腿便當',   '古早味炸雞腿，附三樣配菜與白飯。',           'main',  95, 60, 60, 'available'),
    ('A02', '素食便當',   '全素，無蛋奶五辛，附四樣時蔬與糙米飯。',     'main',  75, 40, 40, 'available'),
    ('A03', '排骨便當',   '酥炸排骨，附三樣配菜與白飯。今日已售完。',   'main',  90, 50,  0, 'sold_out'),
    ('A04', '牛肉麵',     '紅燒牛肉麵。廚房整修期間暫停供應。',         'main', 130, 30, 30, 'unavailable'),
    ('B01', '燙青菜',     '當日時蔬，可選醬油膏或蒜蓉。',               'side',  25, 80, 80, 'available'),
    ('C01', '古早味紅茶', '無糖／半糖／全糖，取餐時告知。',             'drink', 20, 100, 100, 'available'),
]

_SEED_ORDERS = [
    # (orderer_id, 幾分鐘前建立, pickup_date 偏移天數, slot, location, note,
    #  status, reviewed_by, [ (meal_code, quantity), ... ])
    #
    # 四張訂單覆蓋狀態機的四個可達狀態。時間以「幾分鐘前」表示，讓
    # list_my_orders 的 created_at 降冪排序有穩定且可預期的結果。
    (1, 2880, 1, 'lunch',  '行政大樓一樓服務台', '紅茶請去冰',
     'completed', 2, [('A01', 1), ('C01', 1)]),
    (1, 1440, 1, 'dinner', '資訊學院 B1 交誼廳', None,
     'cancelled', None, [('A02', 1)]),
    (3,  720, 2, 'lunch',  '行政大樓一樓服務台', '素食者，請勿放蔥',
     'confirmed', 2, [('A02', 2), ('B01', 1)]),
    (1,  120, 2, 'lunch',  '圖書館一樓大廳', None,
     'pending', None, [('A01', 2), ('B01', 2)]),
]


def _seed_meals_if_empty(conn):
    """植入種子餐點與種子訂單（meals table 為空時才執行）。

    **必須在 _seed_users_if_empty 之後執行**——訂單的 orderer_id 指向種子帳號。

    種子訂單中唯一處於 confirmed 狀態的那張（id=3）會實際扣減 remaining_quantity，
    以維持「庫存只在 confirmed 狀態被佔用」這條不變量。若只寫入訂單而不扣庫存，
    系統一啟動就處於帳實不符的狀態，後續的取消回補會把庫存加到超過 daily_quantity。
    """
    count = conn.execute('SELECT COUNT(*) FROM meals').fetchone()[0]
    if count > 0:
        return

    code_to_id = {}
    for code, name, desc, category, price, daily, remaining, status in _SEED_MEALS:
        cursor = conn.execute(
            'INSERT INTO meals (meal_code, meal_name, meal_description, category,'
            ' price, daily_quantity, remaining_quantity, meal_status)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (code, name, desc, category, price, daily, remaining, status)
        )
        code_to_id[code] = cursor.lastrowid

    price_of = {code: m[4] for code, m in zip(
        [s[0] for s in _SEED_MEALS], _SEED_MEALS)}

    for (orderer_id, ago, day_offset, slot, location, note,
         status, reviewed_by, items) in _SEED_ORDERS:
        total = sum(price_of[code] * qty for code, qty in items)
        reviewed_at = f"datetime('now', '-{ago} minutes')" if reviewed_by else 'NULL'
        cursor = conn.execute(
            'INSERT INTO meal_orders'
            ' (orderer_id, pickup_date, pickup_slot, pickup_location, order_note,'
            '  total_amount, order_status, reviewed_by, reviewed_at,'
            '  created_at, updated_at)'
            " VALUES (?, date('now', ?), ?, ?, ?, ?, ?, ?,"
            f' {reviewed_at},'
            "  datetime('now', ?), datetime('now', ?))",
            (orderer_id, f'+{day_offset} days', slot, location, note,
             total, status, reviewed_by,
             f'-{ago} minutes', f'-{ago} minutes')
        )
        order_id = cursor.lastrowid
        item_status = 'pending' if status == 'pending' else status
        for code, qty in items:
            unit_price = price_of[code]
            conn.execute(
                'INSERT INTO meal_order_items'
                ' (meal_order_id, meal_id, quantity, unit_price, subtotal,'
                '  item_status, created_at, updated_at)'
                " VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))",
                (order_id, code_to_id[code], qty, unit_price, unit_price * qty,
                 item_status, f'-{ago} minutes', f'-{ago} minutes')
            )
        # 只有 confirmed 的訂單佔用庫存，見本函式 docstring
        if status == 'confirmed':
            for code, qty in items:
                conn.execute(
                    'UPDATE meals SET remaining_quantity = remaining_quantity - ?'
                    ' WHERE id = ?',
                    (qty, code_to_id[code])
                )
    conn.commit()


# ── 餐點（meals）─────────────────────────────────────────────────────────────

def list_meals(page=1, page_size=10, category=None):
    """回傳 (items, total)，依 meal_code 升冪排列，支援分頁與分類篩選。

    category 為 None 或不在 MEAL_CATEGORIES 中時不套用篩選。
    """
    where  = ['is_deleted = 0']
    params = []
    if category in MEAL_CATEGORIES:
        where.append('category = ?')
        params.append(category)
    clause = ' WHERE ' + ' AND '.join(where)
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(f'SELECT COUNT(*) FROM meals{clause}', params).fetchone()[0]
    items = conn.execute(
        'SELECT id, meal_code, meal_name, meal_description, category, price,'
        f' daily_quantity, remaining_quantity, meal_status, updated_at FROM meals{clause}'
        ' ORDER BY meal_code ASC LIMIT ? OFFSET ?',
        params + [page_size, offset]
    ).fetchall()
    conn.close()
    return items, total


def list_orderable_meals():
    """回傳所有可訂購的餐點（供應中且仍有剩餘份數），依 meal_code 升冪排列。

    訂餐表單只列出這些餐點。已售完（remaining_quantity = 0）與停售
    （meal_status != 'available'）的餐點不出現在表單中，但仍會出現在菜單頁，
    讓使用者知道有這道餐點、只是今天訂不到。
    """
    conn = _get_conn()
    rows = conn.execute(
        'SELECT id, meal_code, meal_name, meal_description, category, price,'
        ' daily_quantity, remaining_quantity, meal_status FROM meals'
        " WHERE is_deleted = 0 AND meal_status = 'available' AND remaining_quantity > 0"
        ' ORDER BY meal_code ASC'
    ).fetchall()
    conn.close()
    return rows


def get_meal(meal_id):
    """以 id 取得單一餐點，不過濾刪除狀態。

    過濾責任交給呼叫端（`if not m or m['is_deleted']`），讓「不存在」與
    「已下架」可以給出不同的錯誤訊息。此為 rules/database.md 的明列例外。
    """
    conn = _get_conn()
    row = conn.execute(
        'SELECT id, meal_code, meal_name, meal_description, category, price,'
        ' daily_quantity, remaining_quantity, meal_status, created_at, updated_at,'
        ' is_deleted FROM meals WHERE id = ?',
        (meal_id,)
    ).fetchone()
    conn.close()
    return row


def create_meal(code, name, description, category, price, daily_qty, remaining_qty, status):
    """新增餐點，回傳新增的 id。"""
    conn = _get_conn()
    cursor = conn.execute(
        'INSERT INTO meals (meal_code, meal_name, meal_description, category,'
        ' price, daily_quantity, remaining_quantity, meal_status)'
        ' VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        (code, name, description, category, price, daily_qty, remaining_qty, status)
    )
    meal_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return meal_id


def update_meal(meal_id, code, name, description, category, price,
                daily_qty, remaining_qty, status):
    """更新餐點與 updated_at。"""
    conn = _get_conn()
    conn.execute(
        'UPDATE meals SET meal_code = ?, meal_name = ?, meal_description = ?,'
        ' category = ?, price = ?, daily_quantity = ?, remaining_quantity = ?,'
        " meal_status = ?, updated_at = datetime('now')"
        ' WHERE id = ? AND is_deleted = 0',
        (code, name, description, category, price, daily_qty, remaining_qty,
         status, meal_id)
    )
    conn.commit()
    conn.close()


def soft_delete_meal(meal_id):
    """邏輯刪除餐點（is_deleted = 1）。

    **不連動既有訂單明細。** 已下架的餐點仍會出現在歷史訂單中——訂單記錄的是
    「當時訂了什麼、花了多少錢」，這個事實不因餐點後來下架而改變。明細的
    unit_price 是下單當下的價格快照，同樣是為了讓歷史訂單金額穩定。
    """
    conn = _get_conn()
    conn.execute(
        "UPDATE meals SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?",
        (meal_id,)
    )
    conn.commit()
    conn.close()


# ── 訂單（meal_orders / meal_order_items）────────────────────────────────────

def create_meal_order(orderer_id, pickup_date, pickup_slot, pickup_location,
                      order_note, items):
    """新增訂單主檔與明細（transaction），回傳新訂單 id。

    items = [(meal_id, quantity, unit_price), ...]。總金額由本函式計算後寫入
    主檔，**不由呼叫端傳入**——金額是明細的衍生值，交給兩個地方算會不一致。

    此時不扣減庫存：訂單處於 pending，尚未佔用任何份數。
    """
    total = sum(unit_price * qty for _, qty, unit_price in items)
    conn = _get_conn()
    with conn:
        cursor = conn.execute(
            'INSERT INTO meal_orders (orderer_id, pickup_date, pickup_slot,'
            ' pickup_location, order_note, total_amount)'
            ' VALUES (?, ?, ?, ?, ?, ?)',
            (orderer_id, pickup_date, pickup_slot, pickup_location, order_note, total)
        )
        order_id = cursor.lastrowid
        for meal_id, qty, unit_price in items:
            conn.execute(
                'INSERT INTO meal_order_items'
                ' (meal_order_id, meal_id, quantity, unit_price, subtotal)'
                ' VALUES (?, ?, ?, ?, ?)',
                (order_id, meal_id, qty, unit_price, unit_price * qty)
            )
    conn.close()
    return order_id


def get_meal_order(order_id):
    """以 id 取得單一訂單（含訂購者顯示名稱），不過濾刪除狀態。"""
    conn = _get_conn()
    row = conn.execute(
        'SELECT o.id, o.orderer_id, o.pickup_date, o.pickup_slot, o.pickup_location,'
        ' o.order_note, o.total_amount, o.order_status, o.reviewed_by, o.reviewed_at,'
        ' o.review_note, o.created_at, o.updated_at, o.is_deleted,'
        ' COALESCE(u.name, u.email) AS orderer_display,'
        ' COALESCE(r.name, r.email) AS reviewer_display'
        ' FROM meal_orders o'
        ' LEFT JOIN users u ON u.id = o.orderer_id'
        ' LEFT JOIN users r ON r.id = o.reviewed_by'
        ' WHERE o.id = ?',
        (order_id,)
    ).fetchone()
    conn.close()
    return row


def list_order_items(order_id):
    """回傳指定訂單的未刪除明細，依 id 升冪排列。"""
    conn = _get_conn()
    rows = conn.execute(
        'SELECT i.id, i.meal_order_id, i.meal_id, i.quantity, i.unit_price,'
        ' i.subtotal, i.item_status, m.meal_code, m.meal_name, m.category'
        ' FROM meal_order_items i LEFT JOIN meals m ON m.id = i.meal_id'
        ' WHERE i.meal_order_id = ? AND i.is_deleted = 0'
        ' ORDER BY i.id ASC',
        (order_id,)
    ).fetchall()
    conn.close()
    return rows


def list_my_orders(user_id, page=1, page_size=10):
    """回傳 (items, total)：指定會員的訂單，依 created_at 降冪排列。"""
    offset = (page - 1) * page_size
    conn  = _get_conn()
    total = conn.execute(
        'SELECT COUNT(*) FROM meal_orders WHERE orderer_id = ? AND is_deleted = 0',
        (user_id,)
    ).fetchone()[0]
    items = conn.execute(
        'SELECT id, pickup_date, pickup_slot, pickup_location, total_amount,'
        ' order_status, created_at, updated_at FROM meal_orders'
        ' WHERE orderer_id = ? AND is_deleted = 0'
        ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
        (user_id, page_size, offset)
    ).fetchall()
    conn.close()
    return items, total


def list_all_orders(page=1, page_size=10, status=None):
    """回傳 (items, total)：所有訂單（管理端），依 created_at 降冪排列。

    status 為 None 或不在 ORDER_STATUSES 中時不套用篩選。
    """
    where  = ['o.is_deleted = 0']
    params = []
    if status in ORDER_STATUSES:
        where.append('o.order_status = ?')
        params.append(status)
    clause = ' WHERE ' + ' AND '.join(where)
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(
        f'SELECT COUNT(*) FROM meal_orders o{clause}', params
    ).fetchone()[0]
    items = conn.execute(
        'SELECT o.id, o.orderer_id, o.pickup_date, o.pickup_slot, o.pickup_location,'
        ' o.total_amount, o.order_status, o.created_at,'
        ' COALESCE(u.name, u.email) AS orderer_display'
        ' FROM meal_orders o LEFT JOIN users u ON u.id = o.orderer_id'
        f'{clause} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?',
        params + [page_size, offset]
    ).fetchall()
    conn.close()
    return items, total


def update_meal_order(order_id, user_id, pickup_date, pickup_slot, pickup_location,
                      order_note, items):
    """修改訂單（限本人、限 pending），回傳 True／False（transaction）。

    明細採「全部軟刪除後重新寫入」，不做逐筆 diff。理由是明細沒有需要保留的
    身分（沒有外部引用它的 id），重寫比比對簡單得多；代價是明細 id 每次修改
    都會跳號，記錄為 KI-M4。
    """
    total = sum(unit_price * qty for _, qty, unit_price in items)
    conn  = _get_conn()
    order = conn.execute(
        'SELECT id, orderer_id, order_status FROM meal_orders'
        ' WHERE id = ? AND is_deleted = 0',
        (order_id,)
    ).fetchone()
    if not order or order['orderer_id'] != user_id or order['order_status'] != 'pending':
        conn.close()
        return False

    with conn:
        conn.execute(
            'UPDATE meal_orders SET pickup_date = ?, pickup_slot = ?,'
            ' pickup_location = ?, order_note = ?, total_amount = ?,'
            " updated_at = datetime('now') WHERE id = ?",
            (pickup_date, pickup_slot, pickup_location, order_note, total, order_id)
        )
        conn.execute(
            "UPDATE meal_order_items SET is_deleted = 1, updated_at = datetime('now')"
            ' WHERE meal_order_id = ?',
            (order_id,)
        )
        for meal_id, qty, unit_price in items:
            conn.execute(
                'INSERT INTO meal_order_items'
                ' (meal_order_id, meal_id, quantity, unit_price, subtotal)'
                ' VALUES (?, ?, ?, ?, ?)',
                (order_id, meal_id, qty, unit_price, unit_price * qty)
            )
    conn.close()
    return True


def cancel_meal_order(order_id, user_id):
    """取消訂單（限本人、限 pending 或 confirmed），回傳 True／False。

    若原狀態為 confirmed，同一個 transaction 內回補庫存——confirmed 是唯一
    佔用庫存的狀態。回補以 MIN(remaining + qty, daily_quantity) 封頂，避免
    管理員在訂單存續期間調低 daily_quantity 時把庫存加到超過當日供應量。
    """
    conn  = _get_conn()
    order = conn.execute(
        'SELECT id, orderer_id, order_status FROM meal_orders'
        ' WHERE id = ? AND is_deleted = 0',
        (order_id,)
    ).fetchone()
    if not order or order['orderer_id'] != user_id:
        conn.close()
        return False
    if order['order_status'] not in ('pending', 'confirmed'):
        conn.close()
        return False

    was_confirmed = order['order_status'] == 'confirmed'
    items = conn.execute(
        'SELECT meal_id, quantity FROM meal_order_items'
        ' WHERE meal_order_id = ? AND is_deleted = 0',
        (order_id,)
    ).fetchall()

    with conn:
        _set_order_status(conn, order_id, 'cancelled')
        if was_confirmed:
            _restock(conn, items)
    conn.close()
    return True


def confirm_meal_order(order_id, admin_id, note):
    """確認訂單（限 pending），扣減庫存，回傳 True／False（transaction）。

    扣減前重新檢查每一項的份數是否仍然足夠——使用者下單到管理員確認之間，
    其他人的訂單可能已經把庫存吃掉了。任何一項不足就整張退回 False，
    不做部分確認。
    """
    conn  = _get_conn()
    order = conn.execute(
        "SELECT id FROM meal_orders WHERE id = ? AND is_deleted = 0"
        " AND order_status = 'pending'",
        (order_id,)
    ).fetchone()
    if not order:
        conn.close()
        return False

    items = conn.execute(
        'SELECT i.meal_id, i.quantity, m.remaining_quantity, m.meal_status,'
        ' m.is_deleted AS meal_is_deleted'
        ' FROM meal_order_items i LEFT JOIN meals m ON m.id = i.meal_id'
        ' WHERE i.meal_order_id = ? AND i.is_deleted = 0',
        (order_id,)
    ).fetchall()

    for item in items:
        if item['meal_is_deleted'] or item['meal_status'] != 'available':
            conn.close()
            return False
        if item['quantity'] > item['remaining_quantity']:
            conn.close()
            return False

    with conn:
        conn.execute(
            "UPDATE meal_orders SET order_status = 'confirmed', reviewed_by = ?,"
            " reviewed_at = datetime('now'), review_note = ?,"
            " updated_at = datetime('now') WHERE id = ?",
            (admin_id, note, order_id)
        )
        conn.execute(
            "UPDATE meal_order_items SET item_status = 'confirmed',"
            " updated_at = datetime('now')"
            ' WHERE meal_order_id = ? AND is_deleted = 0',
            (order_id,)
        )
        for item in items:
            conn.execute(
                'UPDATE meals SET remaining_quantity = remaining_quantity - ?,'
                " updated_at = datetime('now')"
                ' WHERE id = ? AND remaining_quantity >= ?',
                (item['quantity'], item['meal_id'], item['quantity'])
            )
    conn.close()
    return True


def reject_meal_order(order_id, admin_id, note):
    """拒絕訂單（限 pending），回傳 True／False。

    pending 未佔用庫存，因此不需要回補。
    """
    conn  = _get_conn()
    order = conn.execute(
        "SELECT id FROM meal_orders WHERE id = ? AND is_deleted = 0"
        " AND order_status = 'pending'",
        (order_id,)
    ).fetchone()
    if not order:
        conn.close()
        return False

    with conn:
        conn.execute(
            "UPDATE meal_orders SET order_status = 'rejected', reviewed_by = ?,"
            " reviewed_at = datetime('now'), review_note = ?,"
            " updated_at = datetime('now') WHERE id = ?",
            (admin_id, note, order_id)
        )
        conn.execute(
            "UPDATE meal_order_items SET item_status = 'rejected',"
            " updated_at = datetime('now')"
            ' WHERE meal_order_id = ? AND is_deleted = 0',
            (order_id,)
        )
    conn.close()
    return True


def complete_meal_order(order_id):
    """登記取餐完成（限 confirmed），回傳 True／False。

    **不回補庫存**：餐點已經被做出來並取走，那份額度是真的消耗掉了。
    """
    conn  = _get_conn()
    order = conn.execute(
        "SELECT id FROM meal_orders WHERE id = ? AND is_deleted = 0"
        " AND order_status = 'confirmed'",
        (order_id,)
    ).fetchone()
    if not order:
        conn.close()
        return False

    with conn:
        _set_order_status(conn, order_id, 'completed')
    conn.close()
    return True


def admin_cancel_meal_order(order_id):
    """管理員取消訂單（限 pending 或 confirmed），回傳 True／False。

    與 cancel_meal_order 的差別只在不驗證 orderer_id。庫存回補規則相同。
    """
    conn  = _get_conn()
    order = conn.execute(
        'SELECT id, order_status FROM meal_orders WHERE id = ? AND is_deleted = 0',
        (order_id,)
    ).fetchone()
    if not order or order['order_status'] not in ('pending', 'confirmed'):
        conn.close()
        return False

    was_confirmed = order['order_status'] == 'confirmed'
    items = conn.execute(
        'SELECT meal_id, quantity FROM meal_order_items'
        ' WHERE meal_order_id = ? AND is_deleted = 0',
        (order_id,)
    ).fetchall()

    with conn:
        _set_order_status(conn, order_id, 'cancelled')
        if was_confirmed:
            _restock(conn, items)
    conn.close()
    return True


# ── 內部 helpers ──────────────────────────────────────────────────────────────

def _set_order_status(conn, order_id, status):
    """在既有連線上同步更新主檔與明細狀態。呼叫端負責 transaction。"""
    conn.execute(
        "UPDATE meal_orders SET order_status = ?, updated_at = datetime('now')"
        ' WHERE id = ?',
        (status, order_id)
    )
    conn.execute(
        "UPDATE meal_order_items SET item_status = ?, updated_at = datetime('now')"
        ' WHERE meal_order_id = ? AND is_deleted = 0',
        (status, order_id)
    )


def _restock(conn, items):
    """在既有連線上回補庫存，以 daily_quantity 封頂。呼叫端負責 transaction。"""
    for item in items:
        conn.execute(
            'UPDATE meals SET remaining_quantity ='
            ' MIN(remaining_quantity + ?, daily_quantity),'
            " updated_at = datetime('now') WHERE id = ?",
            (item['quantity'], item['meal_id'])
        )
