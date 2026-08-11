# Flask Blueprint 開發規範

本文件規範此專案中 Flask Blueprint 的撰寫方式，適用於新增路由或子系統時參考。

---

## Blueprint 建立

每個子系統對應一個 Blueprint，放在 `blueprints/<name>/` 目錄下：

```python
# blueprints/example/__init__.py
from flask import Blueprint

example_bp = Blueprint('example', __name__)
```

建立後在 `app.py` 中引入並 `register_blueprint`：

```python
from blueprints.example import example_bp
app.register_blueprint(example_bp)
```

---

## 路由命名

- 路由函式名稱以動作或頁面語意命名（`index`、`new_post`、`edit_event`）
- URL 使用小寫加連字號（`/my-orders`），路由函式名稱使用底線（`my_orders`）
- 刪除操作一律用 `POST`，不用 `GET`

---

## 登入與帳號狀態驗證

需要登入的路由套用 `@login_required`（來自 `utils.py`）：

```python
from utils import login_required, _is_usable
```

需要確認帳號有效（未停用、未刪除）時，使用 `_is_usable(user)`：

```python
user = db.find_user_by_id(session['user_id'])
if not _is_usable(user):
    session.clear()
    return redirect(url_for('auth.login_page'))
```

---

## 管理員權限

每個 Blueprint 各自定義局部 `_is_admin` helper，**不放入 `utils.py`**：

```python
def _is_admin(user):
    return user['role'] == 0
```

需要管理員權限的操作：

```python
if not _is_admin(user):
    return redirect(url_for('example.index'))
```

---

## 表單資料取得

使用 `request.form.get()` 搭配 `.strip()`，空字串轉為 `None`：

```python
title = request.form.get('title', '').strip()
note = request.form.get('note', '').strip() or None
```

---

## 錯誤回饋與 POST-Redirect-GET

表單驗證失敗用 `flash()` 回傳訊息，成功後一律 `redirect()`：

```python
from flask import flash, redirect, url_for, render_template

# 驗證失敗
flash('標題不可為空')
return render_template('example/form.html', ...)

# 成功
flash('建立成功')
return redirect(url_for('example.index'))
```

`flash()` 分類：訊息型省略分類，錯誤型加 `'error'`（視 `base.html` 的實作而定）。

---

## 分頁

分頁以 `?page=N` query parameter 控制，預設第 1 頁，每個 Blueprint 自行定義 `_PAGE_SIZE` 常數：

```python
_PAGE_SIZE = 10  # 依業務需求決定

page = request.args.get('page', 1, type=int)
items, total = db.list_something(page=page, page_size=_PAGE_SIZE)
```

---

## 項目選取

主頁左右兩欄配置的「選取項目」以 `?id=N` query parameter 傳遞，例如：

```python
selected_id = request.args.get('id', type=int)
```

---

## Template 路徑

Template 放在 `templates/<blueprint_name>/` 下，`render_template` 使用相對路徑：

```python
return render_template('example/index.html', items=items, user=user)
```

---

## Template 按鍵設計

### `<a>` vs `<button>` 語意規則

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、前往表單頁等） |
| `<button type="submit">` | POST 動作（送出表單、刪除、審核等有副作用的操作） |

禁止用 `<a href="#">` 搭配 `onclick` 來模擬按鈕行為，這會破壞鍵盤操作與無障礙語意。

### 共用設計 Token

按鍵顏色一律使用 `static/common.css` 中的 CSS 自訂屬性，**不在子系統 CSS 中寫死色碼**：

```css
/* 正確 */
.myapp-btn-primary { background-color: var(--btn-primary-bg); color: #fff; }
.myapp-btn-primary:hover { background-color: var(--btn-primary-hover); }

/* 錯誤 */
.myapp-btn-primary { background-color: #1a73e8; color: #fff; }
```

可用變數見 `static/common.css` 的 `:root` 區塊（`--btn-primary-*`、`--btn-secondary-*`、`--btn-danger-*`、`--btn-action-*`、`--btn-action-danger-*`）。

### 各子系統 CSS 按鍵命名

每個子系統的 CSS 使用獨立前綴，不跨系統共用類別：

```
<subsystem>-btn              # 大按鈕（表單操作）
<subsystem>-btn-primary      # 主要動作 → var(--btn-primary-bg)
<subsystem>-btn-secondary    # 次要動作 → var(--btn-secondary-bg)
<subsystem>-btn-danger       # 危險操作 → var(--btn-danger-bg)
<subsystem>-btn-sm           # 小尺寸變體
<subsystem>-btn-action       # 表格行內小按鈕 → var(--btn-action-*)
<subsystem>-btn-action-danger               → var(--btn-action-danger-*)
```

### login-form class 限制

`login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，只有 auth 登入/申請頁及 hub 內嵌登入表單的 `<form>` 需要加上此 class。其他子系統的 `<button>` 不受影響，由各自的 CSS 負責樣式。

---

## 新增子系統清單

新增 Blueprint 時需同步完成：
1. `blueprints/<name>/__init__.py`
2. `blueprints/<name>/CLAUDE.md`
3. `templates/<name>/` 目錄與 Template 檔案
4. `static/<name>.css`（按上方命名規則定義 `<name>-btn-*` 類別；顏色使用 `var(--btn-*)`）
5. `db/<name>.py` 並在 `db/__init__.py` 匯出
6. `tests/test_<name>.py`
7. `app.py` 引入並 `register_blueprint`


---

## 權限檢查的三層順序

需要管理員權限的路由，檢查分三層，**順序固定不可調換**：

```
1. @login_required        無 session      -> redirect auth.login_page
2. _is_usable(user)       帳號失效        -> session.clear() + redirect auth.login_page
3. _is_admin(user)        role != 0       -> flash 無操作權限 + redirect hub.home
```

第 2 層失敗代表**身分本身失效**，處置是登出；第 3 層失敗代表**身分有效但權限不足**，處置是導回首頁。
若把第 3 層放前面，已被停用的管理員會收到與事實不符的「權限不足」，且 session 不會被清除。

這三層在每個需要管理員權限的路由開頭**明碼重複寫出**，不抽象成裝飾器。這個重複是刻意的：
讀者從任一路由的第一行就能讀出完整的守門條件。

---

## 開放瀏覽的子系統

若子系統有開放給訪客的頁面（如 `GET /forum`），第 1、2 層可以收斂進 `_current_user()`，
讓它在未登入或帳號失效時一律回傳 `None`：

```python
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

但**寫入類路由仍須各自處理 `user is None`**（`session.clear()` + redirect），因為它們接下來會取用
`user['id']`；開放瀏覽的路由則把 `None` 當成合法的訪客狀態繼續渲染。

不要把 `session.clear()` 塞進 `_current_user()`——訪客與失效帳號在它眼中都是 `None`，
但只有後者需要清 session。要區分兩者，helper 就得回傳多種狀態，複雜度會失控。
