from .connection import _get_conn


def _init_forum_tables(conn):
    """建立 forum 與 forum_details 資料表。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forum (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT    NOT NULL,
            created_at TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
            user_id    INTEGER NOT NULL,
            is_deleted INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forum_details (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            master_id        INTEGER NOT NULL,
            content          TEXT    NOT NULL,
            created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
            user_id          INTEGER NOT NULL,
            is_original_post INTEGER NOT NULL DEFAULT 0,
            is_deleted       INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()


_SEED_POSTS = [
    # (title, user_id, 主檔建立於幾分鐘前, [ (content, user_id, 幾分鐘前, is_original_post), ... ])
    #
    # 時間以「幾分鐘前」表示，讓列表的 updated_at 降冪排序有穩定且可預期的結果。
    # 若全部用 datetime('now')，同一秒內建立的文章排序會不確定。
    (
        '【公告】討論區使用說明', 2, 4320,
        [(
            '這裡是課程的討論區，歡迎大家發問與交流。\n\n'
            '幾個基本規則：\n'
            '1. 發表文章需要先登入，訪客可以瀏覽但不能發言。\n'
            '2. 文章標題與內容都可以由原作者自行修改。\n'
            '3. 刪除文章與回覆的權限只開放給管理員——刪掉一篇文章會連同底下\n'
            '   所有回覆一起消失，這個決定影響的不只是發文者自己。\n\n'
            '有任何系統操作上的問題，可以直接在這裡提出。',
            2, 4320, 1,
        )],
    ),
    (
        '主檔與明細是怎麼分工的？', 1, 2880,
        [(
            '看了 db/forum.py，發現論壇用了兩張表：forum 存標題，forum_details\n'
            '存內容。想確認一下我的理解對不對——\n\n'
            '「文章」其實是 forum 的一列，加上 forum_details 裡 is_original_post\n'
            '等於 1 的那一列，兩者合起來才是我們在畫面上看到的一篇文章？\n'
            '那回覆就是 is_original_post 等於 0 的那些列。',
            1, 2880, 1,
        )],
    ),
    (
        '被停用的帳號，發過的文章會怎麼樣？', 3, 1440,
        [(
            '如果管理員把我的帳號停用了，我之前發過的文章會不會一起不見？\n\n'
            '（這篇文章本身就是用停用帳號 disabled@example.com 發的，\n'
            '可以直接看到答案。順帶一提，這個帳號沒有填姓名，所以作者欄\n'
            '顯示的是 email——那是 COALESCE(u.name, u.email) 的效果。）',
            3, 1440, 1,
        )],
    ),
    (
        '軟刪除和真的刪掉，差在哪裡？', 1, 720,
        [
            (
                '系統文件裡一直提到「軟刪除」，說是把 is_deleted 設成 1 而不是\n'
                '執行 DELETE。想問的是：既然資料還在資料庫裡，為什麼要說它被\n'
                '「刪除」了？這樣做的好處是什麼？',
                1, 720, 1,
            ),
            (
                '好處主要有三個：\n\n'
                '一是可回溯。管理員在會員清單切到「已刪除」篩選，仍然看得到那些\n'
                '紀錄，知道系統裡曾經有過這個人。真的 DELETE 掉就什麼都不剩了。\n\n'
                '二是關聯不會斷。論壇文章的 user_id 指向使用者，但資料庫層沒有\n'
                '外鍵約束，真的刪掉使用者之後，那些文章的作者欄位就會查不到人。\n\n'
                '三是誤操作可以救。不過要提醒的是，本系統目前並沒有實作還原功能，\n'
                '所以第三點在這裡只是理論上的好處。',
                2, 600, 0,
            ),
            (
                '原來如此，謝謝說明。\n\n'
                '那我再追問一個：既然沒有還原功能，軟刪除跟真的刪掉，對使用者\n'
                '來說結果不是一樣嗎？帳號一樣登不進來、文章一樣看不到。',
                1, 480, 0,
            ),
        ],
    ),
    (
        '期末專題可以自己選題目嗎？', 1, 300,
        [
            (
                '想請問期末專題的範圍。是一定要以這個範例系統為基礎去擴充，\n'
                '還是可以自己找一個題目重新分析？\n\n'
                '如果可以自己選，題目大概要做到什麼程度才算完整？',
                1, 300, 1,
            ),
            (
                '兩種都可以。\n\n'
                '選擇擴充這個系統的話，建議挑一個目前沒有的子系統來設計，例如\n'
                '「稽核紀錄」或「站內通知」，重點放在資料表怎麼設計、和既有的\n'
                '三張表怎麼關聯。\n\n'
                '自己選題目的話，範圍請控制在三到五個子系統之間，太大做不完，\n'
                '太小看不出分析的功夫。不論哪一種，都要交出資料模型、路由設計\n'
                '與畫面流程這三份東西。',
                2, 120, 0,
            ),
        ],
    ),
]


def _seed_forum_if_empty(conn):
    """植入種子文章（forum table 為空時才執行）。

    與 _seed_users_if_empty 對稱，同樣由 init_db() 呼叫、共用同一個 conn。
    **必須在 _seed_users_if_empty 之後執行**——文章的 user_id 指向種子帳號。
    """
    count = conn.execute('SELECT COUNT(*) FROM forum').fetchone()[0]
    if count > 0:
        return

    for title, user_id, created_ago, details in _SEED_POSTS:
        updated_ago = min(d[2] for d in details)
        cursor = conn.execute(
            'INSERT INTO forum (title, user_id, created_at, updated_at)'
            " VALUES (?, ?, datetime('now', ?), datetime('now', ?))",
            (title, user_id, f'-{created_ago} minutes', f'-{updated_ago} minutes')
        )
        master_id = cursor.lastrowid
        for content, author_id, ago, is_original in details:
            conn.execute(
                'INSERT INTO forum_details'
                ' (master_id, content, user_id, is_original_post, created_at, updated_at)'
                " VALUES (?, ?, ?, ?, datetime('now', ?), datetime('now', ?))",
                (master_id, content, author_id, is_original,
                 f'-{ago} minutes', f'-{ago} minutes')
            )
    conn.commit()


def list_forum_masters(page=1, page_size=10):
    """回傳 (items, total)，依 updated_at 降冪排列，支援分頁。"""
    offset = (page - 1) * page_size
    conn = _get_conn()
    total = conn.execute(
        'SELECT COUNT(*) FROM forum WHERE is_deleted = 0'
    ).fetchone()[0]
    items = conn.execute(
        'SELECT m.id, m.title, m.created_at, m.updated_at, m.user_id,'
        ' COALESCE(u.name, u.email) AS user_display'
        ' FROM forum m LEFT JOIN users u ON u.id = m.user_id'
        ' WHERE m.is_deleted = 0'
        ' ORDER BY m.updated_at DESC LIMIT ? OFFSET ?',
        (page_size, offset)
    ).fetchall()
    conn.close()
    return items, total


def get_forum_master(master_id):
    """以 id 取得單一文章主題，不過濾刪除狀態。"""
    conn = _get_conn()
    row = conn.execute(
        'SELECT id, title, created_at, updated_at, user_id, is_deleted'
        ' FROM forum WHERE id = ?',
        (master_id,)
    ).fetchone()
    conn.close()
    return row


def create_forum_master(title, content, user_id):
    """新增文章主題與第一筆內文（transaction）。"""
    conn = _get_conn()
    with conn:
        cursor = conn.execute(
            'INSERT INTO forum (title, user_id) VALUES (?, ?)',
            (title, user_id)
        )
        master_id = cursor.lastrowid
        conn.execute(
            'INSERT INTO forum_details (master_id, content, user_id, is_original_post)'
            ' VALUES (?, ?, ?, 1)',
            (master_id, content, user_id)
        )
    conn.close()
    return master_id


def update_forum_master_title(master_id, title):
    """更新文章標題與 updated_at。"""
    conn = _get_conn()
    conn.execute(
        "UPDATE forum SET title = ?, updated_at = datetime('now') WHERE id = ?",
        (title, master_id)
    )
    conn.commit()
    conn.close()


def soft_delete_forum_master(master_id):
    """邏輯刪除文章及所有回覆（transaction）。"""
    conn = _get_conn()
    with conn:
        conn.execute(
            "UPDATE forum SET is_deleted = 1, updated_at = datetime('now')"
            ' WHERE id = ?',
            (master_id,)
        )
        conn.execute(
            "UPDATE forum_details SET is_deleted = 1, updated_at = datetime('now')"
            ' WHERE master_id = ?',
            (master_id,)
        )
    conn.close()


def list_forum_details(master_id):
    """回傳指定文章的未刪除內文與回覆，依 created_at 降冪排列。"""
    conn = _get_conn()
    rows = conn.execute(
        'SELECT d.id, d.master_id, d.content, d.created_at, d.updated_at, d.user_id,'
        ' d.is_original_post, COALESCE(u.name, u.email) AS user_display'
        ' FROM forum_details d LEFT JOIN users u ON u.id = d.user_id'
        ' WHERE d.master_id = ? AND d.is_deleted = 0'
        ' ORDER BY d.created_at DESC',
        (master_id,)
    ).fetchall()
    conn.close()
    return rows


def get_forum_detail(detail_id):
    """以 id 取得單一內文或回覆，不過濾刪除狀態。"""
    conn = _get_conn()
    row = conn.execute(
        'SELECT id, master_id, content, created_at, updated_at, user_id,'
        ' is_original_post, is_deleted FROM forum_details WHERE id = ?',
        (detail_id,)
    ).fetchone()
    conn.close()
    return row


def create_forum_detail(master_id, content, user_id):
    """新增回覆並同步更新 master.updated_at（transaction）。"""
    conn = _get_conn()
    with conn:
        cursor = conn.execute(
            'INSERT INTO forum_details (master_id, content, user_id) VALUES (?, ?, ?)',
            (master_id, content, user_id)
        )
        detail_id = cursor.lastrowid
        conn.execute(
            "UPDATE forum SET updated_at = datetime('now') WHERE id = ?",
            (master_id,)
        )
    conn.close()
    return detail_id


def update_forum_detail_content(detail_id, content):
    """更新內文或回覆內容與 updated_at。"""
    conn = _get_conn()
    conn.execute(
        "UPDATE forum_details SET content = ?, updated_at = datetime('now') WHERE id = ?",
        (content, detail_id)
    )
    conn.commit()
    conn.close()


def soft_delete_forum_detail(detail_id):
    """邏輯刪除單一內文或回覆。"""
    conn = _get_conn()
    conn.execute(
        "UPDATE forum_details SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?",
        (detail_id,)
    )
    conn.commit()
    conn.close()
