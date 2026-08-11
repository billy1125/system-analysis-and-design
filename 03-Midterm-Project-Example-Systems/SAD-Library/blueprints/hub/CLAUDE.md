# hub Blueprint

## 職責

系統首頁。未登入者看到館藏入口與內嵌登入表單；登入者看到個人借閱概況與全部服務卡片。

---

## 路由

| 方法         | 路徑 | 函式   | 說明                                   |
| ------------ | ---- | ------ | -------------------------------------- |
| `GET / POST` | `/`  | `home` | 首頁；POST 為內嵌登入表單的送出目標    |

---

## 業務邏輯

### 兩種視圖

`home()` 依 `session['user_id']` 是否存在且帳號有效，決定渲染哪一種版面：

- **訪客視圖**：左欄服務卡片（館藏可點、其餘標示 `hub-card-locked`）+ 右欄登入表單
- **登入視圖**：借閱概況統計列 + 服務卡片格線；館員多三張管理卡片

帳號在登入期間被停用或刪除時，`_is_usable()` 為假 → `session.clear()` → 以訪客視圖呈現，
**不 redirect 到登入頁**。首頁是開放頁面，把人踢出去反而突兀。

### 內嵌登入

POST 的驗證順序與 `auth.login_page` **完全一致**（驗證碼 → 帳密空白 → 查帳號 → 密碼 → 停用）。
兩處各自實作而非共用 helper，這是刻意保留的結構，記錄為規格書的 KI-11。

### 借閱概況

僅在登入後計算，資料來自：

```python
active_loans = db.list_my_loans(user['id'], 'active')
stats = {
    'active_count':      len(active_loans),
    'overdue_count':     sum(1 for row in active_loans if row['is_overdue']),
    'max_active_loans':  db.MAX_ACTIVE_LOANS,
    'reservation_count': …,   # 狀態為 waiting 或 ready 的預約
}
```

有逾期時額外顯示 `hub-notice-alert` 警示條，說明逾期期間無法再借。

### Flash 訊息

本頁負責顯示 flash。`loans`、`reservations` 的館員頁面在權限不足時會
`flash('無操作權限', 'error')` 並 redirect 回首頁，訊息要在這裡才看得到。

---

## Templates

`templates/hub/home.html` — 兩種視圖寫在同一個模板的 `{% if user %}` 兩側分支。

內嵌登入表單的 `<form>` 需保留 `class="login-form"`，`login.css` 的
`button[type="submit"]` 樣式限定在此 class 內。

---

## CSS

`static/hub.css`。其中 `.hub-stats` / `.hub-stat` / `.hub-notice` 三組樣式，
其餘沿用。`.hub-stat-alert` 與 `.hub-notice-alert` 的顏色引用 `var(--btn-danger-bg)`
與固定的警示色，不另外造 token。

---

## 測試

`tests/test_hub.py`，涵蓋：
- 訪客／登入兩種視圖的渲染
- 館員專屬卡片的顯示與隱藏
- 停用或刪除帳號持有舊 session 時回落為訪客視圖
- 借閱概況的三個數字與逾期警示條
