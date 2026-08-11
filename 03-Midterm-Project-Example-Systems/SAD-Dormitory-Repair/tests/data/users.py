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
    'staff': {
        'email': 'staff@example.com',
        'password': 'staff1234',
        'id': 4,
    },
}

# 對應 db.repair._SEED_REQUESTS 的種子報修單，ID 依 AUTOINCREMENT 順序。
# 六張單涵蓋六種狀態，測試可直接取用而不必自行建立。
SEED_REQUESTS = {
    'pending':     {'id': 1, 'requester_id': 1},
    'assigned':    {'id': 2, 'requester_id': 1},
    'in_progress': {'id': 3, 'requester_id': 1},
    'completed':   {'id': 4, 'requester_id': 1},
    'rejected':    {'id': 5, 'requester_id': 3},   # 由停用帳號申報
    'cancelled':   {'id': 6, 'requester_id': 1},
}

MESSAGES = {
    # ── auth ──
    'captchaRequired':        '請輸入驗證碼',
    'captchaInvalid':         '驗證碼錯誤，請重新輸入',
    'missingCredentials':     '請輸入帳號與密碼',
    'loginError':             '帳號或密碼錯誤',
    'accountDisabled':        '帳號已停用',
    'registerSuccess':        '申請成功，請登入',
    'emailTaken':             '此電子郵件已被使用',
    'invalidEmailFormat':     '電子郵件格式不正確',
    'passwordTooShort':       '密碼至少需要 8 個字元',
    'passwordMismatch':       '兩次密碼輸入不一致',
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

    # ── repair：表單驗證 ──
    'repairTitleRequired':       '請輸入報修標題',
    'repairDescriptionRequired': '請描述故障情形',
    'repairBuildingRequired':    '請輸入宿舍棟別',
    'repairRoomRequired':        '請輸入房號',
    'repairInvalidCategory':     '維修類別不正確',
    'repairInvalidPriority':     '優先等級不正確',

    # ── repair：申報人操作 ──
    'repairCreated':       '報修單已送出',
    'repairUpdated':       '報修單已更新',
    'repairCancelled':     '報修單已取消',
    'repairCancelFailed':  '無法取消此報修單（狀態不符）',
    'repairCancelDenied':  '無權限取消此報修單',
    'repairNotFound':      '報修單不存在或已刪除',
    'repairViewDenied':    '無權限檢視此報修單',
    'repairEditDenied':    '無權限修改此報修單',
    'repairEditNotPending': '只有待受理的報修單可以修改',

    # ── repair：回覆 ──
    'repairCommentAdded':    '已新增回覆',
    'repairCommentRequired': '請輸入回覆內容',
    'repairCommentClosed':   '此報修單已結案，無法新增回覆',

    # ── repair：管理員操作 ──
    'repairAssigned':       '已完成派工',
    'repairAssignFailed':   '派工失敗（報修單狀態不符，或承辦人不是啟用中的管理員）',
    'repairAssigneeRequired': '請選擇承辦人',
    'repairStarted':        '已開始處理',
    'repairStartFailed':    '無法開始處理（報修單狀態不符）',
    'repairCompleted':      '已登記完成',
    'repairCompleteFailed': '無法登記完成（報修單狀態不符）',
    'repairRejected':       '報修單已退件',
    'repairRejectReasonRequired': '請填寫退件原因',
    'repairRejectFailed':   '無法退件（報修單狀態不符）',
    'repairReopened':       '報修單已重新開啟',
    'repairReopenReasonRequired': '請填寫重新開啟的原因',
    'repairReopenFailed':   '無法重新開啟（報修單狀態不符）',
    'repairDeleted':        '報修單已刪除',
    'repairForbidden':      '無操作權限',
}
