# books Blueprint

## 職責

館藏查詢（開放瀏覽）與館藏維護（館員專用）。維護包含書目主檔與館藏複本兩層。

---

## 路由

| 方法         | 路徑                             | 函式                 | 權限 | 說明                       |
| ------------ | -------------------------------- | -------------------- | ---- | -------------------------- |
| `GET`        | `/books/`                        | `index`              | 公開 | 左清單右詳細；可搜尋、分頁 |
| `GET / POST` | `/books/new`                     | `new_book`           | 館員 | 新增書目並一次建立複本     |
| `GET / POST` | `/books/edit/<book_id>`          | `edit_book`          | 館員 | 修改書目主檔               |
| `POST`       | `/books/delete/<book_id>`        | `delete_book`        | 館員 | 下架書目（邏輯刪除）       |
| `POST`       | `/books/<book_id>/copies/add`    | `add_copy`           | 館員 | 新增一本複本               |
| `POST`       | `/books/copies/<copy_id>/status` | `update_copy_status` | 館員 | 調整複本狀態               |
| `POST`       | `/books/copies/<copy_id>/delete` | `delete_copy`        | 館員 | 報廢複本（邏輯刪除）       |

`index` 宣告 `strict_slashes=False`，`/books` 與 `/books/` 皆可。

---

## 權限守門

`index` 是開放路由，`_current_user()` 允許回傳 `None`（訪客），
帳號失效時 `session.clear()` 後同樣以訪客身分繼續，**不 redirect**。

其餘路由都是館員專用，共用 `_require_admin()`：

```python
user, response = _require_admin()
if response:
    return response
```

回傳 tuple 而不是拋例外或裝飾器，是為了讓「未登入 → 登入頁」與
「已登入但非館員 → 館藏頁 + flash」兩種處置在同一個地方看得見。

---

## 業務邏輯

### 館藏主頁的查詢參數

四個參數可自由組合：

| 參數        | 說明                                             |
| ----------- | ------------------------------------------------ |
| `?q=`       | 同時比對書名、作者、ISBN                         |
| `?category=`| 分類代碼；非法值回落為 `all`                     |
| `?page=`    | 分頁，`_PAGE_SIZE = 10`                          |
| `?id=`      | 右欄要顯示的書目；查無資料時右欄顯示 placeholder |

### 右欄依身分顯示不同內容

| 情境                   | 右欄動作區                     |
| ---------------------- | ------------------------------ |
| 訪客                   | 提示登入                       |
| 已借閱此書             | 連向該筆借閱明細               |
| 書目暫停借閱           | 提示暫停借閱                   |
| 有可借複本             | 「借閱這本書」按鈕             |
| 無可借複本、已預約     | 顯示預約狀態，連向我的預約     |
| 無可借複本、未預約     | 「預約候補」按鈕               |

館員另外看得到複本維護表格與「最近借閱紀錄」。

### ISBN 處理

`_clean_isbn()` 先移除連字號與空白並轉大寫，再以 `_ISBN_REGEX` 驗證
（10 碼可含末碼 X，或 13 碼純數字）。重複性檢查用 `db.find_book_by_isbn()`，
修改時要排除自己：

```python
existing = db.find_book_by_isbn(isbn)
if existing and existing['id'] != book_id:
    return '此 ISBN 已有相同書目'
```

### 新增與修改的表單差異

- **新增**：有 `copy_count`（1–50），沒有 `book_status`（一律 `available`）
- **修改**：有 `book_status`，沒有 `copy_count`（複本改在館藏主頁右欄維護）

`_validate_book_form(form, require_copy_count)` 以這個旗標區分兩種模式。

### 複本狀態

`_ASSIGNABLE_COPY_STATUS = ('available', 'maintenance', 'lost')`——
`borrowed` 不在其中，它由借還書流程維護，館員不能手動指定。
借出中的複本也不能改狀態或刪除，由 `db` 層回傳 `'on_loan'` 擋下。

---

## Templates

- `templates/books/index.html` — 兩欄式館藏主頁
- `templates/books/book_form.html` — 新增／修改共用，以 `mode` 區分

---

## CSS

`static/books.css`，前綴 `book-`。按鍵顏色一律引用 `var(--btn-*)`。

---

## 測試

`tests/test_books.py`（62 個），涵蓋：
- 訪客／讀者／館員三種身分看到的畫面差異
- 搜尋、分類篩選、分頁、書目選取
- 表單各驗證條件與錯誤時的表單值保留
- 權限被擋下的 POST 一律同時斷言資料庫未變動
- 複本新增／狀態調整／刪除，以及借出中複本的保護
- 條碼流水號不因刪除而重複
