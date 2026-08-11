# admin Blueprint

## 職責

管理員專用的會員治理：檢視所有會員（含已刪除）、篩選與搜尋、啟用／停用、調整角色、軟刪除。

`url_prefix='/admin'`，`_PAGE_SIZE = 10`。

---

## 路由

| 方法   | 路徑                                    | 函式               | 說明                          |
| ------ | --------------------------------------- | ------------------ | ----------------------------- |
| `GET`  | `/admin/users`                          | `user_list`        | 會員清單；`?status=` `?q=` `?page=` 可組合 |
| `GET`  | `/admin/users/<int:user_id>`            | `user_detail`      | 會員明細                      |
| `POST` | `/admin/users/<int:user_id>/activate`   | `activate_user`    | 啟用帳號                      |
| `POST` | `/admin/users/<int:user_id>/deactivate` | `deactivate_user`  | 停用帳號（不可對自己）        |
| `POST` | `/admin/users/<int:user_id>/role`       | `update_role`      | 調整角色（不可對自己）        |
| `POST` | `/admin/users/<int:user_id>/delete`     | `delete_user`      | 軟刪除帳號（不可對自己）      |

四個 POST 動作成功後一律 `flash(...)` 並 `redirect(url_for('admin.user_list'))`，**不帶 query string**——篩選與頁碼會被重設，記錄為規格書的 KI-17。

`activate` 與 `deactivate` 刻意拆成兩條分立的動詞路由，不做 toggle。理由是分立路由天然冪等：重送 POST 的結果一致，不會反覆翻轉狀態，也不需要先查當前值。

---

## 權限檢查

三層，**順序不可調換**，在每個路由開頭明碼寫出：

```python
user = _current_user()
if not _is_usable(user):
    session.clear()
    return redirect(url_for('auth.login_page'))
if not _is_admin(user):
    flash('無操作權限', 'error')
    return redirect(url_for('hub.home'))
```

第 2 層失敗代表**身分本身失效**，處置是清 session 並要求重新登入；第 3 層失敗代表**身分有效但權限不足**，處置是導回首頁並說明原因。若把第 3 層放前面，已被停用的管理員會收到與事實不符的「權限不足」，且 session 不會被清除。

> **請勿重構掉這重複的四行。**
>
> 這個重複是刻意的教學設計：讀者從任一路由的第一行就能讀出完整的守門條件，不需要跳到別處查裝飾器的定義。抽成 `@require_admin` 裝飾器在工程上更「乾淨」，但會讓守門條件從程式碼中消失，正是本專案想避免的。
>
> 相對地，`events` 的第 1、2 層收斂進了 `_current_user()`——那是因為它有開放瀏覽的路由，必須把 `None` 當成合法狀態。admin 沒有這種路由，每一層的處置都不同，收斂反而會遮蔽差異。

`_is_admin(user)` 定義在本檔案內，**不放進 `utils.py`**（`rules/flask-blueprint.md` 明文規定）。

---

## 自我保護規則

管理員對**自己的帳號**受三條限制：

| 規則 | 適用路由 | 訊息 |
|------|---------|------|
| R1 | `deactivate_user` | `不可停用自己的帳號` |
| R2 | `delete_user` | `不可刪除自己的帳號` |
| R3 | `update_role` | `不可修改自己的角色` |

`activate_user` 對自己不設限——能執行到那裡的管理員必然已通過 `_is_usable`，也就是已經是啟用狀態，對自己啟用等同無操作。

### 「最後一個管理員」的可達性論證

> 令執行操作的管理員為 A。要進入任何一個 admin 路由，A 必須先通過 `_is_usable(A)` 與 `_is_admin(A)`。
>
> 由 R1、R2、R3，A 無法對自己執行停用、刪除或降級。因此任何一次管理動作完成之後，A 仍然是一個「啟用、未刪除、`role = 0`」的帳號。
>
> ∴ 系統中永遠至少存在一個可用的管理員。「所有管理員都被鎖死」這個狀態**不可達**。

因此系統**不實作** `count_active_admins()` 這類計數檢查，符合「避免過度抽象」的開發原則。

> ⚠️ 此保證完全依賴 R1–R3 **同時成立**。若未來放寬任何一條（例如允許管理員自行降級），必須立即補上「操作後啟用中的管理員數 ≥ 1」的計數檢查，否則系統可被鎖死，且沒有從介面復原的途徑。

---

## 驗證順序

八段，見規格書 §9.4：

1. 未登入 → redirect `/login`
2. `_is_usable` 為假 → `session.clear()` + redirect `/login`
3. `_is_admin` 為假 → flash `無操作權限` + redirect `/`
4. 目標不存在 → flash `找不到該使用者` + redirect 清單
5. 目標是自己（僅 deactivate / delete / role）→ flash 對應的自我保護訊息
6. 目標 `is_deleted` 為真 → flash `該帳號已刪除，無法操作`
7. `role` 值非 `'0'` / `'1'`（僅 role 路由）→ flash `角色值不正確`
8. 通過 → 執行 `db.*` → flash 成功訊息 → redirect 清單

第 4 步排在第 3 步之後，是為了不讓非管理員探測出哪些使用者 id 存在。

> 這與 `events` 的順序**相反**（那裡先查活動存在、再查權限）。理由是活動本來就公開可讀，隱藏 id 沒有意義；而且先確認活動存在才能決定 redirect 要回哪一場。

---

## Templates

- `templates/admin/user_list.html` — 清單頁：topbar → flash → 篩選列 → 表格 → 分頁列
- `templates/admin/user_detail.html` — 明細頁：資訊卡（九個欄位）→ 操作區 → 返回連結

明細頁中被檢視的會員命名為 **`target`**，當前登入的管理員是 `user`。**刻意不同名**——兩者若都叫 `user`，topbar 會顯示被檢視者的名字，而且極難察覺。

清單頁「操作」欄的三種情況：

| 該列 | 顯示 |
|------|------|
| 自己 | 「（目前登入帳號）」+「詳細」 |
| 已刪除 | 只有「詳細」 |
| 其餘 | 「啟用」或「停用」（依 `is_active`）+「刪除」+「詳細」 |

前端隱藏只是提示，**後端的 R1／R2／R3 才是權威**。`tests/test_admin.py` 直接對後端 POST 驗證這一點。

---

## CSS

- `static/admin.css` — 前綴 `admin-`，按鍵顏色一律 `var(--btn-*)`

狀態 badge（啟用中／已停用／已刪除／角色）的底色硬編碼於此，因為 `common.css` 未定義狀態語意色。與範本各子系統的做法一致，記錄為 KI-19。

admin 的表單**不加** `class="login-form"`，否則會誤套登入頁的按鈕樣式。

欄寬工具類 `.col-*` 與 `events.css` 重複定義，這是唯一允許跨子系統共用的類別族——它們只管欄寬、不管顏色。

---

## 使用到的資料層函式

- `db.find_user_by_id(user_id)`
- `db.list_users(page, page_size, status, keyword)`
- `db.set_user_active(user_id, is_active)`
- `db.set_user_role(user_id, role)`
- `db.soft_delete_user(user_id)`

三個新增的函式放在 `db/users.py`，**不另建 `db/admin.py`**——新模組的依據是新資料表，而會員管理操作的仍是 `users` 表。

---

## 測試

`tests/test_admin.py`，30 個案例，涵蓋：

- 權限守門 10 條（匿名／一般使用者／管理員 × 各路由；含「停用中的管理員」專屬案例）
- 清單、篩選、搜尋、分頁 7 條
- 啟用與停用 6 條、角色 4 條、刪除 3 條（各含自我保護與邊界情況）

被權限擋下的 POST **必須同時斷言資料庫沒有改變**——只驗 302 無法區分「被擋下」與「執行成功後 redirect」。
