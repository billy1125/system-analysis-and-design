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

# 對應 db.meals._SEED_MEALS 的種子餐點，ID 依 AUTOINCREMENT 順序
MEALS = {
    'chicken':   {'id': 1, 'code': 'A01', 'price': 95,  'daily': 60,  'status': 'available'},
    'vegetarian': {'id': 2, 'code': 'A02', 'price': 75,  'daily': 40,  'status': 'available'},
    'pork':      {'id': 3, 'code': 'A03', 'price': 90,  'daily': 50,  'status': 'sold_out'},
    'beef':      {'id': 4, 'code': 'A04', 'price': 130, 'daily': 30,  'status': 'unavailable'},
    'veggie':    {'id': 5, 'code': 'B01', 'price': 25,  'daily': 80,  'status': 'available'},
    'tea':       {'id': 6, 'code': 'C01', 'price': 20,  'daily': 100, 'status': 'available'},
}

# 對應 db.meals._SEED_ORDERS 的種子訂單，ID 依 AUTOINCREMENT 順序
ORDERS = {
    'completed': {'id': 1, 'orderer_id': 1},
    'cancelled': {'id': 2, 'orderer_id': 1},
    'confirmed': {'id': 3, 'orderer_id': 3},
    'pending':   {'id': 4, 'orderer_id': 1},
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

    # ── meal：餐點管理 ──
    'mealCreated':         '餐點已新增',
    'mealUpdated':         '餐點已更新',
    'mealDeleted':         '餐點已下架',
    'mealNotFound':        '餐點不存在或已下架',
    'mealCodeRequired':    '請輸入餐點編號',
    'mealNameRequired':    '請輸入餐點名稱',
    'mealBadCategory':     '餐點分類不正確',
    'mealBadStatus':       '餐點狀態不正確',
    'mealBadPrice':        '價格格式不正確',
    'mealNegativePrice':   '價格不可小於 0',
    'mealBadDaily':        '每日供應份數格式不正確',
    'mealBadRemaining':    '剩餘份數格式不正確',
    'mealRemainingTooBig': '剩餘份數不可大於每日供應份數',

    # ── meal：訂單 ──
    'orderCreated':        '訂單已送出，等待管理員確認',
    'orderUpdated':        '訂單已更新',
    'orderCancelled':      '訂單已取消',
    'orderCancelFailed':   '無法取消此訂單',
    'orderNotFound':       '訂單不存在',
    'orderNoPermission':   '無權限查看此訂單',
    'orderNoEditRight':    '無權限修改此訂單',
    'orderNotPending':     '只有待確認的訂單可以修改',
    'orderDateRequired':   '請選擇取餐日期',
    'orderDateFormat':     '取餐日期格式不正確',
    'orderDatePast':       '取餐日期不可早於今天',
    'orderBadSlot':        '取餐時段不正確',
    'orderLocationBlank':  '請輸入取餐地點',
    'orderNoItems':        '請至少訂購一項餐點',
    'orderItemNotFound':   '所選餐點不存在或已下架',
    'orderBadQuantity':    '訂購份數格式不正確',
    'orderNegativeQty':    '訂購份數不可小於 0',

    # ── meal：管理端審核 ──
    'orderConfirmed':      '訂單已確認',
    'orderConfirmFailed':  '確認失敗（餐點份數不足、已停售，或訂單狀態不符）',
    'orderRejected':       '訂單已拒絕',
    'orderRejectFailed':   '拒絕失敗（訂單狀態不符）',
    'orderCompleted':      '已登記取餐',
    'orderCompleteFailed': '登記取餐失敗（訂單狀態不符）',
}
