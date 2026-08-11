from .connection import _get_conn


def _init_event_tables(conn):
    """建立 events、event_details、registrations 資料表。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            event_title           TEXT    NOT NULL,
            event_datetime        TEXT    NOT NULL,
            event_place           TEXT    NOT NULL,
            capacity              INTEGER NOT NULL,
            registration_start_at TEXT,
            registration_end_at   TEXT,
            created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
            user_id               INTEGER NOT NULL,
            is_deleted            INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS event_details (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id      INTEGER NOT NULL,
            event_note    TEXT    NOT NULL,
            event_target  TEXT,
            event_contact TEXT,
            event_notice  TEXT,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
            is_deleted    INTEGER NOT NULL DEFAULT 0
        )
    """)
    # registration_status 字串值：registered / cancelled / waiting / rejected
    # meal_type 整數值：0=不用餐 / 1=葷食 / 2=素食
    # 唯一性由 application 層控制（不加 DB UNIQUE 約束），支援取消後重新報名。
    conn.execute("""
        CREATE TABLE IF NOT EXISTS registrations (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id            INTEGER NOT NULL,
            user_id             INTEGER NOT NULL,
            registration_status TEXT    NOT NULL DEFAULT 'registered',
            meal_type           INTEGER NOT NULL DEFAULT 0,
            participant_name    TEXT,
            participant_phone   TEXT,
            participant_email   TEXT,
            registration_note   TEXT,
            created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
            cancelled_at        TEXT,
            is_deleted          INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()


# ── 種子活動 ──────────────────────────────────────────────────────────────────

# 每一筆是一個 dict，時間欄位以「相對現在的天數」表示，植入時交給
# SQLite 的 datetime('now', '±N days') 換算。理由與種子帳號的設計一致：
# 寫死絕對日期的種子資料會在幾個月後全部變成「已結束」，五種活動狀態
# 就看不出差異了。
#
# 五筆活動刻意各自對應 _event_status() 的一個回傳值，讓活動列表一開啟
# 就能同時看到五種狀態的 badge。
_SEED_EVENTS = [
    {
        'title': '新生入學說明會',
        'days': -30,                       # 活動時間已過 → ended
        'reg_start_days': None,
        'reg_end_days': None,
        'place': '綜合大樓 國際會議廳',
        'capacity': 200,
        'user_id': 2,
        'note': (
            '各位新生好，本場說明會將介紹選課系統、學分規定與校園資源。\n\n'
            '（這是一場已經結束的活動。活動時間早於現在，因此狀態顯示為\n'
            '「活動已結束」，報名按鈕不會出現——即使名額還有空位。）'
        ),
        'target': '一年級新生',
        'contact': '教務處註冊組 分機 2101',
        'notice': '請攜帶學生證。',
        'regs': [
            (1, 0, '一般使用者', '0912-345-678', None, None, 'registered'),
        ],
    },
    {
        'title': '春季校園路跑',
        'days': 3,
        'reg_start_days': -30,
        'reg_end_days': -1,                # 報名截止時間已過 → closed
        'place': '田徑場（集合點：司令台）',
        'capacity': 300,
        'user_id': 2,
        'note': (
            '五公里組與十公里組同時起跑，完賽者可獲得紀念毛巾一條。\n\n'
            '（這場活動還沒開始，但報名截止時間已過，因此狀態是「報名已\n'
            '截止」。它示範了 event_datetime 與 registration_end_at 是兩個\n'
            '獨立的時間點——活動未到，不代表還能報名。）'
        ),
        'target': '全校教職員生',
        'contact': '體育室 分機 3305',
        'notice': '請於起跑前 30 分鐘完成報到。',
        'regs': [
            (1, 1, '一般使用者', '0912-345-678', 'user@example.com', '想跑五公里組', 'registered'),
        ],
    },
    {
        'title': '系學會迎新茶會',
        'days': 7,
        'reg_start_days': None,
        'reg_end_days': None,
        'place': '工程二館 會議室 B203',
        'capacity': 2,                     # 兩人已報名 → full
        'user_id': 1,
        'note': (
            '學長姐帶你認識系上課程地圖，備有點心與飲料。\n\n'
            '（這場活動的名額只有 2 人，且兩個名額都已經被佔滿，因此狀態是\n'
            '「名額已滿」。名額的計算只看 registration_status = registered 的\n'
            '紀錄，已取消的不算。）'
        ),
        'target': '本系學生',
        'contact': '系學會 IG @dept_union',
        'notice': None,
        'regs': [
            (1, 1, '一般使用者', '0912-345-678', None, None, 'registered'),
            (2, 2, '管理員', '0922-111-222', 'admin@example.com', '素食', 'registered'),
        ],
    },
    {
        'title': '生成式 AI 實作工作坊',
        'days': 30,
        'reg_start_days': 7,               # 報名尚未開始 → not_open
        'reg_end_days': 28,
        'place': '資訊大樓 電腦教室 E301',
        'capacity': 40,
        'user_id': 2,
        'note': (
            '三小時的動手實作，從 API 呼叫到簡易應用程式的組裝。\n\n'
            '（報名開始時間還沒到，因此狀態是「尚未開放」。這是唯一一種\n'
            '「將來會自動變成可報名」的狀態，不需要任何人去按按鈕。）'
        ),
        'target': '對 AI 應用有興趣的同學，不限系所',
        'contact': '計算機中心 分機 5120',
        'notice': '請自備筆記型電腦。',
        'regs': [],
    },
    {
        'title': '期末專題成果發表會',
        'days': 14,
        'reg_start_days': None,            # 未設報名期間 → 建立後即可報名
        'reg_end_days': None,
        'place': '圖書館 一樓展演空間',
        'capacity': 40,
        'user_id': 1,
        'note': (
            '各組展示一學期的專題成果，開放自由參觀與提問。\n\n'
            '（這是唯一一場狀態為「可報名」的活動。報名開始與截止時間都\n'
            '留空，代表建立後到活動開始前都可以報名。）'
        ),
        'target': '全校師生',
        'contact': None,
        'notice': '現場座位有限，額滿為止。',
        'regs': [
            (2, 0, '管理員', None, None, None, 'registered'),
            (1, 2, '一般使用者', None, None, '臨時有事，先取消', 'cancelled'),
        ],
    },
]


def _seed_events_if_empty(conn):
    """植入種子活動與報名紀錄（events table 為空時才執行）。

    與 _seed_users_if_empty 對稱，同樣由 init_db() 呼叫、共用同一個 conn。
    **必須在 _seed_users_if_empty 之後執行**——活動與報名的 user_id 指向種子帳號。

    時間欄位一律以 datetime('now', '±N days') 換算，不寫死絕對日期。
    """
    count = conn.execute('SELECT COUNT(*) FROM events').fetchone()[0]
    if count > 0:
        return

    def _offset(days):
        return None if days is None else f'{days:+d} days'

    for ev in _SEED_EVENTS:
        # datetime('now', NULL) 在 SQLite 中回傳 NULL，因此 reg_start / reg_end
        # 留空的活動不需要另外分支處理。
        cursor = conn.execute(
            'INSERT INTO events'
            ' (event_title, event_datetime, event_place, capacity,'
            '  registration_start_at, registration_end_at, user_id)'
            " VALUES (?, datetime('now', ?), ?, ?,"
            "         datetime('now', ?), datetime('now', ?), ?)",
            (ev['title'], _offset(ev['days']), ev['place'], ev['capacity'],
             _offset(ev['reg_start_days']), _offset(ev['reg_end_days']),
             ev['user_id'])
        )
        event_id = cursor.lastrowid

        conn.execute(
            'INSERT INTO event_details'
            ' (event_id, event_note, event_target, event_contact, event_notice)'
            ' VALUES (?, ?, ?, ?, ?)',
            (event_id, ev['note'], ev['target'], ev['contact'], ev['notice'])
        )

        for user_id, meal_type, name, phone, email, note, status in ev['regs']:
            conn.execute(
                'INSERT INTO registrations'
                ' (event_id, user_id, registration_status, meal_type,'
                '  participant_name, participant_phone, participant_email,'
                '  registration_note, cancelled_at)'
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?,"
                "         CASE WHEN ? = 'cancelled' THEN datetime('now') ELSE NULL END)",
                (event_id, user_id, status, meal_type,
                 name, phone, email, note, status)
            )

    conn.commit()


# ── Events ────────────────────────────────────────────────────────────────────

def list_events(page=1, page_size=5):
    """回傳 (items, total)，依 event_datetime 升冪，含目前有效報名人數。"""
    offset = (page - 1) * page_size
    conn = _get_conn()
    total = conn.execute(
        'SELECT COUNT(*) FROM events WHERE is_deleted = 0'
    ).fetchone()[0]
    items = conn.execute(
        'SELECT e.id, e.event_title, e.event_datetime, e.event_place,'
        ' e.capacity, e.registration_start_at, e.registration_end_at,'
        ' e.created_at, e.updated_at, e.user_id,'
        ' COALESCE(u.name, u.email) AS user_display,'
        ' COUNT(r.id) AS registered_count'
        ' FROM events e'
        ' LEFT JOIN users u ON u.id = e.user_id'
        ' LEFT JOIN registrations r'
        '   ON e.id = r.event_id AND r.registration_status = ? AND r.is_deleted = 0'
        ' WHERE e.is_deleted = 0'
        ' GROUP BY e.id'
        ' ORDER BY e.event_datetime ASC'
        ' LIMIT ? OFFSET ?',
        ('registered', page_size, offset)
    ).fetchall()
    conn.close()
    return items, total


def get_event(event_id):
    """取得活動完整資料（events JOIN event_details），含報名人數。

    **不過濾 is_deleted**，過濾責任交給呼叫端（`if not ev or ev['is_deleted']`）。
    這讓「活動不存在」與「活動已刪除」在資料層可區分。
    """
    conn = _get_conn()
    row = conn.execute(
        'SELECT e.id, e.event_title, e.event_datetime, e.event_place,'
        ' e.capacity, e.registration_start_at, e.registration_end_at,'
        ' e.created_at, e.updated_at, e.user_id, e.is_deleted,'
        ' COALESCE(u.name, u.email) AS user_display,'
        ' d.id AS detail_id, d.event_note, d.event_target,'
        ' d.event_contact, d.event_notice,'
        ' COUNT(r.id) AS registered_count'
        ' FROM events e'
        ' LEFT JOIN event_details d ON e.id = d.event_id AND d.is_deleted = 0'
        ' LEFT JOIN users u ON u.id = e.user_id'
        ' LEFT JOIN registrations r'
        '   ON e.id = r.event_id AND r.registration_status = ? AND r.is_deleted = 0'
        ' WHERE e.id = ?'
        ' GROUP BY e.id',
        ('registered', event_id)
    ).fetchone()
    conn.close()
    return row


def get_event_for_edit(event_id):
    """取得活動編輯用資料，回傳 (event_row, detail_row)。

    **不過濾 is_deleted**，理由同 get_event()。
    """
    conn = _get_conn()
    event = conn.execute(
        'SELECT id, event_title, event_datetime, event_place, capacity,'
        ' registration_start_at, registration_end_at, user_id, is_deleted'
        ' FROM events WHERE id = ?',
        (event_id,)
    ).fetchone()
    detail = conn.execute(
        'SELECT id, event_id, event_note, event_target, event_contact, event_notice'
        ' FROM event_details WHERE event_id = ? AND is_deleted = 0',
        (event_id,)
    ).fetchone()
    conn.close()
    return event, detail


def create_event(event_title, event_datetime, event_place, capacity,
                 registration_start_at, registration_end_at,
                 event_note, event_target, event_contact, event_notice,
                 user_id):
    """新增活動主表與副表（transaction），回傳新活動 id。"""
    conn = _get_conn()
    with conn:
        cursor = conn.execute(
            'INSERT INTO events'
            ' (event_title, event_datetime, event_place, capacity,'
            '  registration_start_at, registration_end_at, user_id)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?)',
            (event_title, event_datetime, event_place, capacity,
             registration_start_at or None, registration_end_at or None, user_id)
        )
        event_id = cursor.lastrowid
        conn.execute(
            'INSERT INTO event_details'
            ' (event_id, event_note, event_target, event_contact, event_notice)'
            ' VALUES (?, ?, ?, ?, ?)',
            (event_id, event_note,
             event_target or None, event_contact or None, event_notice or None)
        )
    conn.close()
    return event_id


def update_event(event_id, event_title, event_datetime, event_place, capacity,
                 registration_start_at, registration_end_at,
                 event_note, event_target, event_contact, event_notice):
    """更新活動主表與副表（transaction）。"""
    conn = _get_conn()
    with conn:
        conn.execute(
            "UPDATE events"
            " SET event_title=?, event_datetime=?, event_place=?, capacity=?,"
            "     registration_start_at=?, registration_end_at=?,"
            "     updated_at=datetime('now')"
            " WHERE id=?",
            (event_title, event_datetime, event_place, capacity,
             registration_start_at or None, registration_end_at or None, event_id)
        )
        conn.execute(
            "UPDATE event_details"
            " SET event_note=?, event_target=?, event_contact=?, event_notice=?,"
            "     updated_at=datetime('now')"
            " WHERE event_id=? AND is_deleted=0",
            (event_note,
             event_target or None, event_contact or None, event_notice or None,
             event_id)
        )
    conn.close()


def soft_delete_event(event_id):
    """邏輯刪除活動及副表（transaction）。

    報名紀錄不一併標記——它們是報名者自己的資料，活動被撤銷不代表
    報名紀錄應該消失。`list_my_registrations` 因此仍查得到（見規格書 KI-12）。
    """
    conn = _get_conn()
    with conn:
        conn.execute(
            "UPDATE events SET is_deleted=1, updated_at=datetime('now') WHERE id=?",
            (event_id,)
        )
        conn.execute(
            "UPDATE event_details SET is_deleted=1, updated_at=datetime('now')"
            " WHERE event_id=?",
            (event_id,)
        )
    conn.close()


# ── Registrations ─────────────────────────────────────────────────────────────

def list_registrations(event_id):
    """回傳有效報名者（registered），供公開顯示，依報名時間升冪。"""
    conn = _get_conn()
    rows = conn.execute(
        'SELECT r.id, r.user_id, r.meal_type, r.created_at,'
        ' COALESCE(u.name, u.email) AS user_display'
        ' FROM registrations r'
        ' LEFT JOIN users u ON u.id = r.user_id'
        ' WHERE r.event_id=? AND r.registration_status=? AND r.is_deleted=0'
        ' ORDER BY r.created_at ASC',
        (event_id, 'registered')
    ).fetchall()
    conn.close()
    return rows


def list_all_registrations(event_id):
    """回傳全部報名紀錄（含已取消），供活動發起者或管理員使用。"""
    conn = _get_conn()
    rows = conn.execute(
        'SELECT r.id, r.user_id, r.registration_status, r.meal_type,'
        ' r.participant_name, r.participant_phone, r.participant_email,'
        ' r.registration_note, r.created_at, r.updated_at,'
        ' COALESCE(u.name, u.email) AS user_display'
        ' FROM registrations r'
        ' LEFT JOIN users u ON u.id = r.user_id'
        ' WHERE r.event_id=? AND r.is_deleted=0'
        ' ORDER BY r.created_at ASC',
        (event_id,)
    ).fetchall()
    conn.close()
    return rows


def get_registration(event_id, user_id):
    """取得指定使用者對指定活動的報名紀錄，找不到時回傳 None。"""
    conn = _get_conn()
    row = conn.execute(
        'SELECT id, event_id, user_id, registration_status, meal_type,'
        ' participant_name, participant_phone, participant_email,'
        ' registration_note, created_at, updated_at, cancelled_at'
        ' FROM registrations WHERE event_id=? AND user_id=? AND is_deleted=0',
        (event_id, user_id)
    ).fetchone()
    conn.close()
    return row


def count_registered(event_id):
    """回傳活動目前有效報名人數。"""
    conn = _get_conn()
    count = conn.execute(
        "SELECT COUNT(*) FROM registrations"
        " WHERE event_id=? AND registration_status='registered' AND is_deleted=0",
        (event_id,)
    ).fetchone()[0]
    conn.close()
    return count


def create_or_restore_registration(event_id, user_id, meal_type,
                                   participant_name, participant_phone,
                                   participant_email, registration_note):
    """建立或恢復報名（application 層唯一性控制，不依賴 DB UNIQUE 約束）。

    - 已有已取消紀錄 → UPDATE 恢復為 registered，回傳 `'restored'`
    - 無紀錄         → INSERT，回傳 `'created'`
    - 已有有效紀錄   → 不處理，回傳 `'duplicate'`
    """
    conn = _get_conn()
    result = 'created'
    with conn:
        existing = conn.execute(
            'SELECT id, registration_status FROM registrations'
            ' WHERE event_id=? AND user_id=? AND is_deleted=0',
            (event_id, user_id)
        ).fetchone()

        if existing:
            if existing['registration_status'] == 'cancelled':
                conn.execute(
                    "UPDATE registrations"
                    " SET registration_status='registered', meal_type=?,"
                    "     participant_name=?, participant_phone=?,"
                    "     participant_email=?, registration_note=?,"
                    "     cancelled_at=NULL, updated_at=datetime('now')"
                    " WHERE id=?",
                    (meal_type,
                     participant_name or None, participant_phone or None,
                     participant_email or None, registration_note or None,
                     existing['id'])
                )
                result = 'restored'
            else:
                result = 'duplicate'
        else:
            conn.execute(
                'INSERT INTO registrations'
                ' (event_id, user_id, meal_type, participant_name,'
                '  participant_phone, participant_email, registration_note)'
                ' VALUES (?, ?, ?, ?, ?, ?, ?)',
                (event_id, user_id, meal_type,
                 participant_name or None, participant_phone or None,
                 participant_email or None, registration_note or None)
            )
    conn.close()
    return result


def cancel_registration(event_id, user_id):
    """取消報名（設 status='cancelled'，填入 cancelled_at）。"""
    conn = _get_conn()
    conn.execute(
        "UPDATE registrations"
        " SET registration_status='cancelled',"
        "     cancelled_at=datetime('now'), updated_at=datetime('now')"
        " WHERE event_id=? AND user_id=?"
        "   AND registration_status IN ('registered', 'waiting') AND is_deleted=0",
        (event_id, user_id)
    )
    conn.commit()
    conn.close()


def update_registration(event_id, user_id, meal_type, participant_name,
                        participant_phone, participant_email, registration_note):
    """報名者修改自己的報名資訊（不含報名狀態）。"""
    conn = _get_conn()
    conn.execute(
        "UPDATE registrations"
        " SET meal_type=?, participant_name=?, participant_phone=?,"
        "     participant_email=?, registration_note=?,"
        "     updated_at=datetime('now')"
        " WHERE event_id=? AND user_id=? AND is_deleted=0",
        (meal_type,
         participant_name or None, participant_phone or None,
         participant_email or None, registration_note or None,
         event_id, user_id)
    )
    conn.commit()
    conn.close()


def list_my_registrations(user_id):
    """回傳使用者所有報名紀錄，依活動時間降冪。

    刻意不過濾 `events.is_deleted`：活動被撤銷後，報名者仍應在自己的
    紀錄中看得到這筆資料（見規格書 KI-12）。
    """
    conn = _get_conn()
    rows = conn.execute(
        'SELECT r.id, r.event_id, r.registration_status, r.meal_type,'
        ' r.created_at, r.updated_at,'
        ' e.event_title, e.event_datetime, e.event_place, e.is_deleted'
        ' FROM registrations r'
        ' JOIN events e ON e.id = r.event_id'
        ' WHERE r.user_id=? AND r.is_deleted=0'
        ' ORDER BY e.event_datetime DESC',
        (user_id,)
    ).fetchall()
    conn.close()
    return rows
