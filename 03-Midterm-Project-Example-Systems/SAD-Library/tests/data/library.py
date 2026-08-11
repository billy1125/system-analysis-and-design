"""圖書借閱相關的測試常數。

MESSAGES 刻意寫成字面值而非 import Blueprint 的字典：測試的用意就是在訊息被
改動時失敗，好提醒同步更新規格書 9.5 節的訊息字串總表。
"""

# 對應 db.books._SEED_BOOKS，id 依 AUTOINCREMENT 順序
SEED_BOOKS = {
    'sad':      {'id': 1,  'title': '系統分析與設計', 'copies': 3, 'category': 'technology'},
    'database': {'id': 2,  'title': '資料庫系統概論', 'copies': 2, 'category': 'technology'},
    'history':  {'id': 4,  'title': '台灣通史新編',   'copies': 1, 'category': 'social'},
    'art':      {'id': 8,  'title': '西洋美術史',     'copies': 1, 'category': 'art'},
    'chemistry': {'id': 10, 'title': '有機化學導論',  'copies': 1, 'category': 'science'},
}

SEED_BOOK_COUNT = 10

# 借閱政策，需與 db/loans.py 的常數一致
POLICY = {
    'loan_period_days':  14,
    'renew_period_days': 14,
    'max_active_loans':  5,
    'max_renew_count':   1,
}

MESSAGES = {
    # ── books ──
    'forbidden':          '無操作權限',
    'bookCreated':        '書目已新增',
    'bookUpdated':        '書目已更新',
    'bookDeleted':        '書目已下架',
    'bookOnLoan':         '尚有未歸還的借閱，無法下架此書目',
    'bookNotFound':       '書目不存在',
    'copyCreated':        '複本已新增',
    'copyStatusUpdated':  '複本狀態已更新',
    'copyDeleted':        '複本已刪除',
    'copyOnLoanStatus':   '複本借出中，無法變更狀態',
    'copyOnLoanDelete':   '複本借出中，無法刪除',
    'copyNotFound':       '複本不存在',
    'copyStatusInvalid':  '複本狀態不正確',
    'titleRequired':      '書名不可為空',
    'authorRequired':     '作者不可為空',
    'isbnRequired':       'ISBN 不可為空',
    'isbnInvalid':        'ISBN 格式不正確（需為 10 碼或 13 碼）',
    'isbnDuplicate':      '此 ISBN 已有相同書目',
    'yearInvalid':        '出版年格式不正確',
    'yearOutOfRange':     '出版年需介於 1000 與 2100 之間',
    'categoryInvalid':    '分類不正確',
    'bookStatusInvalid':  '書目狀態不正確',
    'copyCountInvalid':   '複本數量格式不正確',
    'copyCountTooSmall':  '複本數量至少為 1',
    'copyCountTooLarge':  '複本數量不可超過 50',

    # ── loans ──
    'borrowSuccess':      '借閱成功，請於 14 天內歸還',
    'borrowUnavailable':  '此書目目前暫停借閱',
    'borrowHasOverdue':   '您有逾期未還的書，請先歸還後再借閱',
    'borrowLimit':        '已達同時借閱上限（5 冊）',
    'borrowDuplicate':    '您已借閱此書且尚未歸還',
    'borrowNoCopy':       '此書目前無可借複本，可改為預約',
    'renewSuccess':       '續借成功，到期日延長 14 天',
    'renewForbidden':     '無權限操作他人的借閱紀錄',
    'renewReturned':      '此借閱已歸還，無法續借',
    'renewOverdue':       '已逾期的借閱無法續借，請先歸還',
    'renewLimit':         '已達續借次數上限（1 次）',
    'renewReserved':      '此書已有其他讀者預約，無法續借',
    'loanNotFound':       '借閱紀錄不存在',
    'loanViewForbidden':  '無權限查看此借閱紀錄',
    'loanActForbidden':   '無權限操作此借閱紀錄',
    'returnSuccess':      '歸還完成',
    'returnAlready':      '此借閱已歸還',

    # ── reservations ──
    'reserveSuccess':     '預約成功，可借閱時會在「我的預約」顯示可取書',
    'reserveAvailable':   '此書尚有可借複本，請直接借閱',
    'reserveBorrowed':    '您已借閱此書且尚未歸還',
    'reserveDuplicate':   '您已預約此書',
    'reserveUnavailable': '此書目目前暫停借閱',
    'cancelSuccess':      '預約已取消',
    'cancelNotFound':     '預約紀錄不存在',
    'cancelForbidden':    '無權限取消他人的預約',
    'cancelClosed':       '此預約已結束，無法取消',
}
