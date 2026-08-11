# Flask Blueprint 開發規範

本文件規範此專案中 Flask Blueprint 的撰寫方式，適用於新增路由或子系統時參考。

---

## Blueprint 建立

每個子系統對應一個 Blueprint，放在 `blueprints/<name>/` 目錄下：

```python
# blueprints/example/__init__.py
from flask import Blueprint

example_bp = Blueprint('example', __name__, url_prefix='/example')
```

建立後在 `app.py` 中引入並 `register_blueprint`。

**Blueprint 之間不互相 import。** 只透過 `url_for()` 建立關聯。若某個 Blueprint 需要另一個 Blueprint 的常數（例如狀態標籤），先問這個功能是不是真的需要那個資訊——多數時候不需要。

> 本系統的實例：`admin` 的會員明細頁列出該會員的報修單，但**不顯示狀態欄**。狀態的中文標籤定義在 `repair` 內，跨 Blueprint 取用或複製一份都會弄髒邊界，而那個區塊真正要回答的問題是「有沒有紀錄」，單號與標題就夠了。

---

## 路由命名

- 路由函式名稱以動作或頁面語意命名（`index`、`new_request`、`assign`）
- URL 使用小寫加連字號，路由函式名稱使用底線
- **有副作用的動作一律用 `POST`**，不用 GET
- **資源在前、動作在後**：`/repair/<id>/assign`，不是 `/repair/assign/<id>`
- 路徑參數一律指定型別：`<int:request_id>`，不要寫 `<request_id>`

最後一條有實際後果。`/repair/manage` 與 `/repair/<int:request_id>` 不會衝突，因為 `<int:...>` 不匹配 `manage`；若寫成 `<request_id>`，兩者就會撞在一起，而錯誤訊息不會告訴你原因。

---

## 四層權限檢查

本系統的權限分四層，**前三層順序固定不可調換**：

```
1. @login_required        無 session          -> redirect auth.login_page
2. _is_usable(user)       帳號失效            -> session.clear() + redirect auth.login_page
3. _is_admin(user)        role != 0           -> flash 無操作權限 + redirect
4. _can_view(user, obj)   非擁有者且非管理員  -> flash 無權限檢視 + redirect
```

第 2 層失敗代表**身分本身失效**，處置是登出；第 3 層失敗代表**身分有效但權限不足**，處置是導回。若把第 3 層放前面，已被停用的管理員會收到與事實不符的「權限不足」，且 session 不會被清除。

**這四層在每個路由開頭明碼重複寫出，不抽象成裝飾器。** 這個重複是刻意的：讀者從任一路由的前幾行就能讀出完整的守門條件。

```python
@repair_bp.route('/<int:request_id>/assign', methods=['POST'])
@login_required
def assign(request_id):
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))
    ...
```

### 第 4 層：資料範圍權限（row-level）

**第 4 層與前三層的性質不同。** 前三層問的是「你是誰」，只看 session 與 `users` 表；第 4 層問的是「這筆資料是不是你的」，**必須把資料先讀出來才能判斷**。

因此它的位置固定在資料讀取**之後**：

```python
    req = db.get_request(request_id)            # ← 資料在這裡才被讀出來
    if not req or req['is_deleted']:
        flash('報修單不存在或已刪除', 'error')
        return redirect(url_for('repair.index'))
    if not _can_view(user, req):                # 層 4
        flash('無權限檢視此報修單', 'error')
        return redirect(url_for('repair.index'))
```

`_can_view()` 的定義：

```python
def _can_view(user, req):
    return user is not None and req is not None and (
        req['requester_id'] == user['id'] or _is_admin(user)
    )
```

**不可把第 4 層與前三層合併成一個 helper**，因為它們的失敗處置不同：第 2 層要 `session.clear()`，第 4 層只是 flash + redirect。

### 比第 4 層更嚴的情況

某些操作**只限擁有者本人，管理員也不行**。這時直接比對，不用 `_can_view()`：

```python
    if req['requester_id'] != user['id']:
        flash('無權限修改此報修單', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))
```

本系統有兩處：`edit`（申報內容是住戶的原始證言，管理員改了歷程就失真）與 `cancel`（取消是申報人的權利，管理員該用的是退件）。

### `_is_admin` 的位置

每個 Blueprint 各自定義局部 `_is_admin` helper，**不放入 `utils.py`**：

```python
def _is_admin(user):
    return user is not None and user['role'] == 0
```

`utils.py` 只放三個東西：`_gen_captcha`、`_is_usable`、`login_required`。

---

## 開放瀏覽的子系統

若子系統有開放給訪客的頁面，第 1、2 層可以收斂進 `_current_user()`，讓它在未登入或帳號失效時一律回傳 `None`：

```python
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

但**寫入類路由仍須各自處理 `user is None`**（`session.clear()` + redirect），因為它們接下來會取用 `user['id']`。

不要把 `session.clear()` 塞進 `_current_user()`——訪客與失效帳號在它眼中都是 `None`，但只有後者需要清 session。

> 本系統只有 `hub` 適用這個模式。`repair` 沒有任何開放給訪客的路由——報修單含房號與電話。

---

## 表單資料取得

使用 `request.form.get()` 搭配 `.strip()`，空字串轉為 `None`：

```python
title = request.form.get('title', '').strip()
note  = request.form.get('note', '').strip() or None
```

多欄位表單用 dict comprehension 一次取出：

```python
_FORM_FIELDS = ('title', 'description', 'dorm_building', 'room_no',
                'contact_phone', 'category', 'priority')

form = {k: request.form.get(k, '').strip() for k in _FORM_FIELDS}
```

### 驗證 helper

表單驗證抽成一個函式，**回傳第一個錯誤訊息或 `None`**，不累積多則：

```python
def _validate_request_form(form):
    if not form.get('title'):
        return '請輸入報修標題'
    if not form.get('description'):
        return '請描述故障情形'
    ...
    if form.get('category') not in db.CATEGORIES:
        return '維修類別不正確'
    return None
```

列舉型欄位（類別、優先等級、角色）一律比對白名單，**不信任表單送來的值**。

---

## 錯誤回饋與 POST-Redirect-GET

| 情境 | 作法 |
|------|------|
| POST 成功 | `flash(訊息, 'success')` + `redirect()` |
| POST 失敗（權限、狀態、找不到） | `flash(訊息, 'error')` + `redirect()` |
| **表單驗證失敗** | **不用 flash**，以 `error` 變數重新渲染表單並回填 `form` |

第三條是刻意的：表單驗證失敗時使用者需要看到自己剛剛填的內容，redirect 會把它們沖掉。

```python
    if request.method == 'POST':
        form  = {k: request.form.get(k, '').strip() for k in _FORM_FIELDS}
        error = _validate_request_form(form)
        if not error:
            ...
            flash('報修單已送出', 'success')
            return redirect(url_for('repair.detail', request_id=request_id))

    return render_template('repair/request_form.html', form=form, error=error, ...)
```

---

## 狀態轉移路由

**狀態合法性完全交給 db 層**，Blueprint 不重複判斷：

```python
    note = request.form.get('note', '').strip() or None
    if db.start_request(request_id, user['id'], note):
        flash('已開始處理', 'success')
    else:
        flash('無法開始處理（報修單狀態不符）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))
```

**一條轉移一條路由，不合併成 `/transition` 加 `action` 參數。** 三個理由：各條轉移的必填參數不同；URL 本身就是文件（伺服器 log 與瀏覽器歷史都因此可讀）；權限若未來要分化，分開的路由才有掛載點。

**必填參數在 Blueprint 先擋一次**（db 層也會擋），因為要給出比「狀態不符」更精確的訊息：

```python
    reason = request.form.get('note', '').strip()
    if not reason:
        flash('請填寫退件原因', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))
```

---

## 分頁與篩選

分頁以 `?page=N` 控制，每個 Blueprint 自行定義 `_PAGE_SIZE` 常數：

```python
_PAGE_SIZE = 10

page = request.args.get('page', 1, type=int) or 1
items, total = db.list_something(page, _PAGE_SIZE, status, keyword or None)
total_pages  = max(1, (total + _PAGE_SIZE - 1) // _PAGE_SIZE)
```

`or 1` 是必要的：`type=int` 遇到 `?page=abc` 會回傳 `None`，而 `None` 會讓 `(page - 1) * page_size` 拋 `TypeError`。

篩選參數要比對白名單並提供退回值：

```python
status = request.args.get('status', 'all')
if status != 'all' and status not in db.REQUEST_STATUSES:
    status = 'all'
```

---

## Template 路徑與資料傳遞

Template 放在 `templates/<blueprint_name>/` 下：

```python
return render_template('repair/index.html', user=user, requests=requests, ...)
```

**標籤字典由 Blueprint 傳入模板**，不在模板中硬編碼中文：

```python
return render_template(
    'repair/index.html',
    status_labels=STATUS_LABELS,
    category_labels=CATEGORY_LABELS,
    priority_labels=PRIORITY_LABELS,
    ...
)
```

模板中 `{{ status_labels[r['request_status']] }}`。這讓「新增一個狀態」只要改一處。

被檢視的對象與當前登入者要用不同的變數名（`target` / `user`、`req` / `user`），避免在模板中混淆。

---

## Template 按鍵設計

### `<a>` vs `<button>`

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、篩選、分頁） |
| `<button type="submit">` | POST 動作（送出、派工、刪除等有副作用的操作） |

禁止用 `<a href="#">` 搭配 `onclick` 模擬按鈕，這會破壞鍵盤操作與無障礙語意。

inline event handler 僅允許兩種用途：驗證碼刷新，以及 `onclick="return confirm(...)"` 的破壞性操作確認。確認一律寫在 `<button>` 上，不寫在 `<form>` 的 `onsubmit` 上。

### 共用設計 Token

按鍵顏色一律使用 `static/common.css` 中的 CSS 自訂屬性，**不在子系統 CSS 中寫死色碼**：

```css
/* 正確 */
.myapp-btn-primary { background-color: var(--btn-primary-bg); color: #fff; }

/* 錯誤 */
.myapp-btn-primary { background-color: #1a73e8; color: #fff; }
```

可用變數：`--btn-primary-*`、`--btn-secondary-*`、`--btn-danger-*`、`--btn-action-*`、`--btn-action-danger-*`。

**狀態語意色是例外**：`common.css` 只管按鍵，狀態 badge 的底色硬編碼在子系統 CSS 中（KI-19）。新增子系統時**不要**把狀態色塞進 `--btn-*` 區塊。

### 命名前綴

每個子系統的 CSS 使用獨立前綴：

```
<subsystem>-btn              # 大按鈕
<subsystem>-btn-primary      # 主要動作 → var(--btn-primary-bg)
<subsystem>-btn-secondary    # 次要動作
<subsystem>-btn-danger       # 危險操作
<subsystem>-btn-sm           # 小尺寸變體
<subsystem>-btn-action       # 表格行內小按鈕 → var(--btn-action-*)
<subsystem>-btn-action-danger
```

### 兩個必踩的坑

**`.login-form` class。** `login.css` 的 `button[type="submit"]` 樣式限定在此選擇器內。使用登入樣式的表單必須加，其他子系統的表單**不加**，否則會誤套。

**`body { display: block; }`。** 各子系統 CSS 開頭都要覆蓋它，否則 `login.css` 的 flex 置中會把整頁塞到畫面中央。

---

## 畫面即規則

**依狀態渲染不同的操作，而不是全部顯示再擋下來。**

```jinja
{% if req['request_status'] == 'pending' %}
  ...派工與退件表單...
{% elif req['request_status'] == 'assigned' %}
  ...開始處理表單...
{% endif %}
```

已結案時，回覆表單替換成一句說明而不是留著讓人按了才知道不行。畫面本身就把狀態機的規則表達出來。

注意用 `{% elif %}` 而不是平行的多個 `{% if %}`——後者會讓所有分支同時出現。

**伺服器端的檢查不可因此省略。** 畫面只是讓正常使用者不會誤觸，繞過畫面直接 POST 仍然必須被擋下，而且測試必須驗證這一點。

---

## 新增子系統清單

新增 Blueprint 時需同步完成：

1. `blueprints/<name>/__init__.py`
2. `blueprints/<name>/CLAUDE.md`
3. `templates/<name>/` 目錄與樣板檔案
4. `static/<name>.css`（前綴命名；顏色用 `var(--btn-*)`；覆蓋 `body`）
5. `db/<name>.py` 並在 `db/__init__.py` 匯出（若有新資料表）
6. `tests/test_<name>.py`
7. `tests/data/users.py` 補上新的訊息字串
8. `app.py` 引入並 `register_blueprint`
9. `document/<name>.md` 與 `document/system-spec.md` 的對應章節
