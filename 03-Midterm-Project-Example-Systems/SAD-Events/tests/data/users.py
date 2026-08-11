# 對應 db.users._seed_users_if_empty() 的種子帳號，ID 依 AUTOINCREMENT 順序
USERS = {
    'normal': {
        'email': 'user@example.com',
        'password': 'password123',
        'id': 1,
    },
    'admin': {
        'email': 'admin@example.com',
        'password': 'admin1234',
        'id': 2,
    },
    'disabled': {
        'email': 'disabled@example.com',
        'password': 'disabled123',
        'id': 3,
    },
}

# 對應 db.events._SEED_EVENTS 的五筆種子活動，ID 依 AUTOINCREMENT 順序。
# 每一筆刻意對應一種活動狀態，供測試直接引用而不必自行建立資料。
SEED_EVENTS = {
    'ended':     {'id': 1, 'title': '新生入學說明會',       'capacity': 200},
    'closed':    {'id': 2, 'title': '春季校園路跑',         'capacity': 300},
    'full':      {'id': 3, 'title': '系學會迎新茶會',       'capacity': 2},
    'not_open':  {'id': 4, 'title': '生成式 AI 實作工作坊', 'capacity': 40},
    'available': {'id': 5, 'title': '期末專題成果發表會',   'capacity': 40},
}

MESSAGES = {
    # ── auth ──
    'captchaRequired': '請輸入驗證碼',
    'captchaInvalid': '驗證碼錯誤，請重新輸入',
    'missingCredentials': '請輸入帳號與密碼',
    'loginError': '帳號或密碼錯誤',
    'accountDisabled': '帳號已停用',
    'registerSuccess': '申請成功，請登入',
    'emailTaken': '此電子郵件已被使用',
    'invalidEmailFormat': '電子郵件格式不正確',
    'passwordTooShort': '密碼至少需要 8 個字元',
    'passwordMismatch': '兩次密碼輸入不一致',
    'missingEmailOrPassword': '請輸入電子郵件與密碼',

    # ── admin ──
    'adminForbidden':      '無操作權限',
    'adminSelfDeactivate': '不可停用自己的帳號',
    'adminSelfDelete':     '不可刪除自己的帳號',
    'adminSelfRole':       '不可修改自己的角色',
    'adminUserNotFound':   '找不到該使用者',
    'adminDeletedUser':    '該帳號已刪除，無法操作',
    'adminInvalidRole':    '角色值不正確',
    'adminActivated':      '帳號已啟用',
    'adminDeactivated':    '帳號已停用',
    'adminRoleUpdated':    '角色已更新',
    'adminUserDeleted':    '帳號已刪除',

    # ── events：活動表單驗證 ──
    'eventTitleRequired':    '請輸入活動標題',
    'eventDatetimeRequired': '請輸入活動日期時間',
    'eventPlaceRequired':    '請輸入活動地點',
    'eventPlaceTooLong':     '活動地點不可超過 100 字元',
    'eventNoteRequired':     '請輸入活動內容',
    'eventCapacityInvalid':  '請輸入正確活動名額',
    'eventCapacityNotPositive': '請輸入正確活動名額（必須大於 0）',
    'eventCapacityBelowRegistered': '名額不可低於目前有效報名人數',
    'eventDatetimeMalformed': '活動日期時間格式不正確',
    'eventRegTimeMalformed':  '報名時間格式不正確',
    'eventRegEndAfterStart':  '報名截止時間不可晚於活動開始時間',
    'eventRegStartAfterEnd':  '報名開始時間不可晚於報名截止時間',

    # ── events：活動操作 ──
    'eventCreated':   '活動已建立',
    'eventUpdated':   '活動已更新',
    'eventDeleted':   '活動已刪除',
    'eventNotFound':  '活動不存在或已刪除',
    'eventEditForbidden':   '無權限修改此活動',
    'eventDeleteForbidden': '無權限刪除此活動',

    # ── events：報名 ──
    'regSuccess':      '報名成功',
    'regDuplicate':    '您已報名此活動',
    'regCancelled':    '已取消報名',
    'regNotFound':     '您沒有有效的報名紀錄',
    'regUpdated':      '報名資訊已更新',
    'regMealInvalid':  '請選擇正確的用餐選項',

    # ── events：活動狀態擋下報名 ──
    'statusEnded':   '活動已結束',
    'statusClosed':  '報名已截止',
    'statusNotOpen': '尚未開放報名',
    'statusFull':    '活動名額已滿',
}
