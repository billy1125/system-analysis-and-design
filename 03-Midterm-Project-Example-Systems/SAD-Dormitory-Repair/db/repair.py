"""報修單資料存取層。

管兩張資料表：
  repair_requests  報修單主檔（一張單一筆）
  repair_logs      處理紀錄明細（一張單多筆）

主檔／明細的拆分理由與 forum／forum_details 相同：一張報修單會累積多則
紀錄（申報描述、雙方留言、每一次狀態異動），把它們塞回主檔就得靠不斷
覆寫同一個欄位，歷程會消失。報修系統的價值有一半在歷程，因此明細獨立成表。

狀態異動一律經由本模組的六個 transition 函式，它們在**同一個 transaction**
中同時更新主檔狀態與寫入一筆 log_type='status' 的紀錄。Blueprint 不得直接
UPDATE request_status——否則會留下狀態變了但沒有紀錄的報修單。
"""
from .connection import _get_conn

# 報修單狀態。終態三個：completed、rejected、cancelled。
REQUEST_STATUSES = ('pending', 'assigned', 'in_progress', 'completed', 'rejected', 'cancelled')

# 已結案的狀態：不可再留言、不可再異動。
CLOSED_STATUSES = ('completed', 'rejected', 'cancelled')

CATEGORIES = ('water', 'electric', 'furniture', 'network', 'aircon', 'door', 'other')

PRIORITIES = ('low', 'normal', 'high', 'urgent')

# log_type：report 首則申報描述（與主檔同時建立，一張單恰有一筆）
#           comment 申報人或管理員的補充留言
#           status  狀態異動紀錄，由 transition 函式寫入，使用者不可直接建立
LOG_TYPES = ('report', 'comment', 'status')


def _init_repair_tables(conn):
    """建立 repair_requests 與 repair_logs 兩張資料表。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repair_requests (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id   INTEGER NOT NULL,
            title          TEXT    NOT NULL,
            category       TEXT    NOT NULL DEFAULT 'other',
            priority       TEXT    NOT NULL DEFAULT 'normal',
            dorm_building  TEXT    NOT NULL,
            room_no        TEXT    NOT NULL,
            contact_phone  TEXT,
            request_status TEXT    NOT NULL DEFAULT 'pending',
            assigned_to    INTEGER,
            assigned_at    TEXT,
            started_at     TEXT,
            closed_at      TEXT,
            created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted     INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repair_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            user_id    INTEGER NOT NULL,
            log_type   TEXT    NOT NULL DEFAULT 'comment',
            content    TEXT    NOT NULL,
            created_at TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()


# ── 查詢 ──────────────────────────────────────────────────────────────────────

_LIST_COLUMNS = """
    r.id, r.requester_id, r.title, r.category, r.priority,
    r.dorm_building, r.room_no, r.contact_phone, r.request_status,
    r.assigned_to, r.assigned_at, r.started_at, r.closed_at,
    r.created_at, r.updated_at,
    COALESCE(req.name, req.display_name, req.email) AS requester_display,
    COALESCE(asg.name, asg.display_name, asg.email) AS assignee_display
"""

_LIST_JOINS = """
    FROM repair_requests r
    JOIN users req ON req.id = r.requester_id
    LEFT JOIN users asg ON asg.id = r.assigned_to
"""


def list_my_requests(user_id, page, page_size, status='all'):
    """列出某位使用者自己申報的報修單（分頁），回傳 (items, total)。

    status: 'all' 或 REQUEST_STATUSES 之一，其他值視同 'all'。
    一律過濾 is_deleted = 0。
    """
    where  = ['r.is_deleted = 0', 'r.requester_id = ?']
    params = [user_id]

    if status in REQUEST_STATUSES:
        where.append('r.request_status = ?')
        params.append(status)

    clause = ' WHERE ' + ' AND '.join(where)
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(
        f'SELECT COUNT(*) {_LIST_JOINS}{clause}', params
    ).fetchone()[0]
    items = conn.execute(
        f'SELECT {_LIST_COLUMNS} {_LIST_JOINS}{clause}'
        ' ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?',
        params + [page_size, offset]
    ).fetchall()
    conn.close()
    return items, total


def list_all_requests(page, page_size, status='all', keyword=None):
    """列出所有報修單（分頁），供管理員使用，回傳 (items, total)。

    status: 'all' 或 REQUEST_STATUSES 之一，其他值視同 'all'。
    keyword 比對標題、棟別、房號與申報人的 email／姓名。
    一律過濾 is_deleted = 0——管理端沒有檢視已刪除報修單的需求（對照 list_users）。
    """
    where  = ['r.is_deleted = 0']
    params = []

    if status in REQUEST_STATUSES:
        where.append('r.request_status = ?')
        params.append(status)

    if keyword:
        where.append('(r.title LIKE ? OR r.dorm_building LIKE ? OR r.room_no LIKE ?'
                     ' OR req.email LIKE ? OR req.name LIKE ?)')
        like = f'%{keyword}%'
        params.extend([like] * 5)

    clause = ' WHERE ' + ' AND '.join(where)
    offset = (page - 1) * page_size

    conn  = _get_conn()
    total = conn.execute(
        f'SELECT COUNT(*) {_LIST_JOINS}{clause}', params
    ).fetchone()[0]
    items = conn.execute(
        f'SELECT {_LIST_COLUMNS} {_LIST_JOINS}{clause}'
        ' ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?',
        params + [page_size, offset]
    ).fetchall()
    conn.close()
    return items, total


def get_request(request_id):
    """取得單一報修單（含申報人與承辦人的顯示名稱）。

    刻意不過濾 is_deleted：呼叫端需要區分「不存在」與「已刪除」。
    """
    conn = _get_conn()
    row  = conn.execute(
        f'SELECT {_LIST_COLUMNS}, r.is_deleted,'
        ' req.email AS requester_email, req.phone AS requester_phone'
        f' {_LIST_JOINS} WHERE r.id = ?',
        (request_id,)
    ).fetchone()
    conn.close()
    return row


def list_logs(request_id):
    """取得某張報修單未刪除的所有紀錄，依 created_at 遞增（時間軸由舊到新）。

    同一秒內建立的紀錄以 id 遞增作為次要排序鍵，確保順序穩定。
    """
    conn = _get_conn()
    rows = conn.execute(
        "SELECT l.id, l.request_id, l.user_id, l.log_type, l.content,"
        " l.created_at, l.updated_at,"
        " COALESCE(u.name, u.display_name, u.email) AS author_display,"
        " u.role AS author_role"
        " FROM repair_logs l JOIN users u ON u.id = l.user_id"
        " WHERE l.request_id = ? AND l.is_deleted = 0"
        " ORDER BY l.created_at ASC, l.id ASC",
        (request_id,)
    ).fetchall()
    conn.close()
    return rows


def get_report_log(request_id):
    """取得首則申報描述（log_type = 'report'）。供修改表單預填內容使用。

    一張報修單恰有一筆，由 create_request() 與主檔同時建立。
    """
    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_logs"
        " WHERE request_id = ? AND log_type = 'report' AND is_deleted = 0"
        " ORDER BY id LIMIT 1",
        (request_id,)
    ).fetchone()
    conn.close()
    return row


def count_by_status():
    """統計各狀態的報修單數量，回傳 dict（未出現的狀態補 0）。供管理清單的摘要列使用。"""
    conn = _get_conn()
    rows = conn.execute(
        'SELECT request_status, COUNT(*) AS n FROM repair_requests'
        ' WHERE is_deleted = 0 GROUP BY request_status'
    ).fetchall()
    conn.close()
    counts = {status: 0 for status in REQUEST_STATUSES}
    for row in rows:
        if row['request_status'] in counts:
            counts[row['request_status']] = row['n']
    return counts


# ── 建立與修改 ────────────────────────────────────────────────────────────────

def create_request(requester_id, title, category, priority, dorm_building,
                   room_no, contact_phone, description):
    """新增報修單與首則申報描述，回傳 request_id。

    主檔與首則 report 紀錄必須同時成功或同時失敗——一張沒有描述的報修單
    是無效狀態，維修人員無從判斷要修什麼。因此包在同一個 transaction 中。
    """
    conn = _get_conn()
    with conn:
        request_id = conn.execute(
            """INSERT INTO repair_requests
                   (requester_id, title, category, priority, dorm_building,
                    room_no, contact_phone, request_status, created_at, updated_at, is_deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'), 0)""",
            (requester_id, title, category, priority, dorm_building, room_no, contact_phone)
        ).lastrowid
        conn.execute(
            """INSERT INTO repair_logs
                   (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
               VALUES (?, ?, 'report', ?, datetime('now'), datetime('now'), 0)""",
            (request_id, requester_id, description)
        )
    conn.close()
    return request_id


def update_request(request_id, user_id, title, category, priority,
                   dorm_building, room_no, contact_phone, description):
    """修改報修單（限申報人本人、限 pending 狀態），回傳是否成功。

    狀態與身分的檢查在此重做一次，不倚賴 Blueprint 已經檢查過。理由是這個
    函式會直接改寫維修人員將要依據的內容，資料層自己守住不變條件比較安全。

    主檔與首則描述在同一個 transaction 中更新。
    """
    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status = 'pending'",
        (request_id,)
    ).fetchone()
    if not row or row['requester_id'] != user_id:
        conn.close()
        return False

    with conn:
        conn.execute(
            """UPDATE repair_requests
               SET title = ?, category = ?, priority = ?, dorm_building = ?,
                   room_no = ?, contact_phone = ?, updated_at = datetime('now')
               WHERE id = ?""",
            (title, category, priority, dorm_building, room_no, contact_phone, request_id)
        )
        conn.execute(
            """UPDATE repair_logs
               SET content = ?, updated_at = datetime('now')
               WHERE request_id = ? AND log_type = 'report' AND is_deleted = 0""",
            (description, request_id)
        )
    conn.close()
    return True


def create_log(request_id, user_id, content, log_type='comment'):
    """新增一則留言，同時更新主檔的 updated_at，回傳 log_id 或 None。

    updated_at 一併更新，報修單才會浮到列表最上面——「最近有人回應的單」
    應該最先被看到。這與 forum 的 create_forum_detail() 是同一個模式。

    log_type 不接受 'status'：狀態紀錄只能由六個 transition 函式產生，
    否則會出現「有狀態紀錄但主檔狀態沒變」的假歷程。
    """
    if log_type not in ('report', 'comment'):
        return None

    conn = _get_conn()
    row  = conn.execute(
        'SELECT id FROM repair_requests WHERE id = ? AND is_deleted = 0',
        (request_id,)
    ).fetchone()
    if not row:
        conn.close()
        return None

    with conn:
        log_id = conn.execute(
            """INSERT INTO repair_logs
                   (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
               VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 0)""",
            (request_id, user_id, log_type, content)
        ).lastrowid
        conn.execute(
            "UPDATE repair_requests SET updated_at = datetime('now') WHERE id = ?",
            (request_id,)
        )
    conn.close()
    return log_id


def soft_delete_request(request_id):
    """邏輯刪除報修單及其所有紀錄（管理員專用）。

    主檔與明細必須一起標記，否則會留下一批孤兒紀錄，因此包在同一個 transaction。
    """
    conn = _get_conn()
    with conn:
        conn.execute(
            "UPDATE repair_requests SET is_deleted = 1, updated_at = datetime('now')"
            " WHERE id = ?",
            (request_id,)
        )
        conn.execute(
            "UPDATE repair_logs SET is_deleted = 1, updated_at = datetime('now')"
            " WHERE request_id = ?",
            (request_id,)
        )
    conn.close()


# ── 狀態轉移 ──────────────────────────────────────────────────────────────────
#
# 六個函式涵蓋狀態圖上的七條轉移（cancel 一個函式吃 pending 與 assigned
# 兩個來源狀態）。每一個都遵守同一個結構：
#   1. 以「目前狀態」為條件撈出主檔，撈不到就代表這條轉移在此刻不可走 → False
#   2. 在同一個 transaction 中更新主檔，並寫入一筆 log_type='status' 的紀錄
#   3. 回傳 True
#
# 步驟 1 是本模組的核心防線：合法性判斷寫在 SQL 的 WHERE 子句裡，而不是
# 先讀出來再用 Python 比對。兩者的差別在於前者「查詢與更新之間沒有空隙」，
# 兩個管理員同時按下同一顆按鈕時，只有先到的那個會撈到資料。
#
# 六個函式的結構高度重複，刻意不抽象成單一的 _transition() ——讀者從任何
# 一個函式就能讀出「這條轉移的前置狀態、後置狀態、附帶欄位、紀錄文字」的
# 完整定義，不需要跳到別處查表。這與 Blueprint 中三層權限檢查明碼重複
# 是同一個取捨。

def assign_request(request_id, admin_id, assignee_id, note=None):
    """派工：pending → assigned。assignee_id 必須是啟用中的管理員。"""
    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status = 'pending'",
        (request_id,)
    ).fetchone()
    if not row:
        conn.close()
        return False

    assignee = conn.execute(
        'SELECT id, email, name, display_name FROM users'
        ' WHERE id = ? AND role = 0 AND is_active = 1 AND is_deleted = 0',
        (assignee_id,)
    ).fetchone()
    if not assignee:
        conn.close()
        return False

    display = assignee['name'] or assignee['display_name'] or assignee['email']
    content = f'已派工給 {display}' + (f'：{note}' if note else '')

    with conn:
        conn.execute(
            """UPDATE repair_requests
               SET request_status = 'assigned', assigned_to = ?,
                   assigned_at = datetime('now'), updated_at = datetime('now')
               WHERE id = ?""",
            (assignee_id, request_id)
        )
        conn.execute(
            """INSERT INTO repair_logs
                   (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
               VALUES (?, ?, 'status', ?, datetime('now'), datetime('now'), 0)""",
            (request_id, admin_id, content)
        )
    conn.close()
    return True


def start_request(request_id, admin_id, note=None):
    """開始處理：assigned → in_progress。"""
    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status = 'assigned'",
        (request_id,)
    ).fetchone()
    if not row:
        conn.close()
        return False

    content = '開始處理' + (f'：{note}' if note else '')

    with conn:
        conn.execute(
            """UPDATE repair_requests
               SET request_status = 'in_progress', started_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?""",
            (request_id,)
        )
        conn.execute(
            """INSERT INTO repair_logs
                   (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
               VALUES (?, ?, 'status', ?, datetime('now'), datetime('now'), 0)""",
            (request_id, admin_id, content)
        )
    conn.close()
    return True


def complete_request(request_id, admin_id, note=None):
    """完成修繕：in_progress → completed。"""
    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status = 'in_progress'",
        (request_id,)
    ).fetchone()
    if not row:
        conn.close()
        return False

    content = '已完成修繕' + (f'：{note}' if note else '')

    with conn:
        conn.execute(
            """UPDATE repair_requests
               SET request_status = 'completed', closed_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?""",
            (request_id,)
        )
        conn.execute(
            """INSERT INTO repair_logs
                   (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
               VALUES (?, ?, 'status', ?, datetime('now'), datetime('now'), 0)""",
            (request_id, admin_id, content)
        )
    conn.close()
    return True


def reject_request(request_id, admin_id, reason):
    """退件：pending → rejected。reason 為必填，不接受空字串。

    退件是唯一強制填寫理由的轉移——申報人需要知道為什麼不受理，
    否則他只會再申報一次同樣的問題。
    """
    if not reason:
        return False

    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status = 'pending'",
        (request_id,)
    ).fetchone()
    if not row:
        conn.close()
        return False

    with conn:
        conn.execute(
            """UPDATE repair_requests
               SET request_status = 'rejected', closed_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?""",
            (request_id,)
        )
        conn.execute(
            """INSERT INTO repair_logs
                   (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
               VALUES (?, ?, 'status', ?, datetime('now'), datetime('now'), 0)""",
            (request_id, admin_id, f'已退件：{reason}')
        )
    conn.close()
    return True


def cancel_request(request_id, user_id):
    """取消：pending 或 assigned → cancelled。限申報人本人。

    in_progress 之後不可取消——維修人員已經動工，取消不會讓已拆開的
    水管復原，只會讓紀錄與現場不符。
    """
    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status IN ('pending', 'assigned')",
        (request_id,)
    ).fetchone()
    if not row or row['requester_id'] != user_id:
        conn.close()
        return False

    with conn:
        conn.execute(
            """UPDATE repair_requests
               SET request_status = 'cancelled', closed_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?""",
            (request_id,)
        )
        conn.execute(
            """INSERT INTO repair_logs
                   (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
               VALUES (?, ?, 'status', '申報人取消報修', datetime('now'), datetime('now'), 0)""",
            (request_id, user_id)
        )
    conn.close()
    return True


def reopen_request(request_id, admin_id, reason):
    """重新開啟：completed → pending。限管理員，reason 必填。

    修好了又壞、或申報人回報沒修好時使用。狀態回到 pending 重走一次流程，
    但**不清空 assigned_to**——保留上一次的承辦人，作為「同一個問題重複
    發生」的線索。closed_at 清空，因為它不再是結案狀態。
    """
    if not reason:
        return False

    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status = 'completed'",
        (request_id,)
    ).fetchone()
    if not row:
        conn.close()
        return False

    with conn:
        conn.execute(
            """UPDATE repair_requests
               SET request_status = 'pending', closed_at = NULL,
                   started_at = NULL, updated_at = datetime('now')
               WHERE id = ?""",
            (request_id,)
        )
        conn.execute(
            """INSERT INTO repair_logs
                   (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
               VALUES (?, ?, 'status', ?, datetime('now'), datetime('now'), 0)""",
            (request_id, admin_id, f'重新開啟：{reason}')
        )
    conn.close()
    return True


# ── 種子資料 ──────────────────────────────────────────────────────────────────

# 六張報修單，每一張示範一個值得觀察的系統行為。
# 時間戳以 datetime('now', '-N minutes') 明確指定：若全用預設值，同一秒內
# 建立的報修單 updated_at 完全相同，列表排序會不確定，看不出「最近有異動
# 的單會浮到最上面」這個行為。
_SEED_REQUESTS = [
    # (requester_id, title, category, priority, building, room, phone, status,
    #  assigned_to, minutes_ago, description, logs)
    #
    # logs 為 [(user_id, log_type, content, minutes_ago), ...]，依時間軸由舊到新。
    (
        1, '浴室水龍頭持續漏水', 'water', 'high', 'A 棟', '301', '0912-345-678',
        'pending', None, 12,
        '浴室洗手台的水龍頭關不緊，整晚都在滴水，地板已經積水。',
        [],
    ),
    (
        1, '房間日光燈管閃爍', 'electric', 'normal', 'A 棟', '301', '0912-345-678',
        'assigned', 4, 40,
        '書桌上方的日光燈開機後會閃爍約十分鐘才穩定，最近越來越嚴重。',
        [(2, 'status', '已派工給 維修組 王師傅：請帶備用燈管', 38)],
    ),
    (
        1, '冷氣不冷且有異音', 'aircon', 'urgent', 'A 棟', '301', '0912-345-678',
        'in_progress', 4, 180,
        '冷氣開到最低溫仍然不冷，室外機運轉時有明顯的金屬摩擦聲。',
        [
            (2, 'status',  '已派工給 維修組 王師傅', 170),
            (4, 'status',  '開始處理：已到場檢查，研判為壓縮機問題', 120),
            (4, 'comment', '需向廠商叫料，預計三個工作天到貨，期間可先使用電風扇。', 60),
        ],
    ),
    (
        1, '衣櫃門把鬆脫', 'furniture', 'low', 'A 棟', '301', '0912-345-678',
        'completed', 4, 1440,
        '衣櫃右側門把的螺絲鬆掉，門關不緊。',
        [
            (2, 'status',  '已派工給 維修組 王師傅', 1400),
            (4, 'status',  '開始處理', 1300),
            (1, 'comment', '我下午都在房間，隨時可以進來施工。', 1280),
            (4, 'status',  '已完成修繕：更換門把螺絲並上緊', 1200),
        ],
    ),
    (
        3, '想在房間加裝個人洗衣機', 'other', 'normal', 'B 棟', '205', None,
        'rejected', None, 2880,
        '想在陽台加裝一台個人用洗衣機，需要拉一條專用電源。',
        [(2, 'status', '已退件：依宿舍管理辦法，房間內不得私自加裝大型電器，請使用一樓公共洗衣間。', 2870)],
    ),
    (
        1, '走廊燈泡不亮（已自行更換）', 'electric', 'low', 'A 棟', '3 樓走廊', '0912-345-678',
        'cancelled', None, 300,
        '三樓走廊靠樓梯口的燈泡不亮。',
        [(1, 'status', '申報人取消報修', 290)],
    ),
]


def _seed_repair_if_empty(conn):
    """植入種子報修單（repair_requests 表為空時才執行）。

    必須排在 _seed_users_if_empty() 之後——報修單的 requester_id 與
    assigned_to 都指向那四個種子帳號。
    """
    count = conn.execute('SELECT COUNT(*) FROM repair_requests').fetchone()[0]
    if count > 0:
        return

    for (requester_id, title, category, priority, building, room, phone,
         status, assigned_to, minutes_ago, description, logs) in _SEED_REQUESTS:
        created  = f"datetime('now', '-{minutes_ago} minutes')"
        # updated_at 取最後一則紀錄的時間，沒有紀錄時就等於建立時間。
        last_min = logs[-1][3] if logs else minutes_ago
        updated  = f"datetime('now', '-{last_min} minutes')"
        assigned = f"datetime('now', '-{minutes_ago - 2} minutes')" if assigned_to else 'NULL'
        closed   = updated if status in CLOSED_STATUSES else 'NULL'
        started  = (f"datetime('now', '-{minutes_ago - 60} minutes')"
                    if status in ('in_progress', 'completed') else 'NULL')

        request_id = conn.execute(
            f"""INSERT INTO repair_requests
                    (requester_id, title, category, priority, dorm_building, room_no,
                     contact_phone, request_status, assigned_to, assigned_at,
                     started_at, closed_at, created_at, updated_at, is_deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, {assigned},
                        {started}, {closed}, {created}, {updated}, 0)""",
            (requester_id, title, category, priority, building, room, phone,
             status, assigned_to)
        ).lastrowid

        conn.execute(
            f"""INSERT INTO repair_logs
                    (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
                VALUES (?, ?, 'report', ?, {created}, {created}, 0)""",
            (request_id, requester_id, description)
        )

        for user_id, log_type, content, log_minutes in logs:
            stamp = f"datetime('now', '-{log_minutes} minutes')"
            conn.execute(
                f"""INSERT INTO repair_logs
                        (request_id, user_id, log_type, content, created_at, updated_at, is_deleted)
                    VALUES (?, ?, ?, ?, {stamp}, {stamp}, 0)""",
                (request_id, user_id, log_type, content)
            )

    conn.commit()
