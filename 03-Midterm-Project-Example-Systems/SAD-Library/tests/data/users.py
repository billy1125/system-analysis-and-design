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

MESSAGES = {
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
}
