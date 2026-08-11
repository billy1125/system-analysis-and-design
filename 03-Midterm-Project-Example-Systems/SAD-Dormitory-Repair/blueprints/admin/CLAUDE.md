# admin 子系統

會員帳號治理。`url_prefix='/admin'`，共 6 條路由。

本子系統幾乎不受領域影響——三層檢查、R1–R3 自我保護規則、六條路由的訊息字串，換成任何一個領域都長一樣。

---

## 路由

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/users` | 清單；`?status=` `?q=` `?page=` 可組合 |
| `GET` | `/admin/users/<int:user_id>` | 明細（含其報修單） |
| `POST` | `/admin/users/<int:user_id>/activate` | 啟用 |
| `POST` | `/admin/users/<int:user_id>/deactivate` | 停用（R1） |
| `POST` | `/admin/users/<int:user_id>/role` | 調整角色（R3） |
| `POST` | `/admin/users/<int:user_id>/delete` | 軟刪除（R2） |

---

## 三層檢查（順序不可調換）

每條路由開頭都是同一段，**明碼重複寫出，不抽象成裝飾器**：

```python
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('hub.home'))
```

第 2 層失敗代表**身分失效**（處置是登出），第 3 層代表**權限不足**（處置是導回首頁）。順序調換會讓停用中的管理員收到與事實不符的回饋，且 session 不會被清除。

`tests/test_admin.py` 的 `test_user_list_disabled_admin_redirects_to_login` 專門驗證這個順序。

---

## 自我保護規則

| 規則 | 內容 | 訊息 |
|------|------|------|
| R1 | 不可停用自己 | `不可停用自己的帳號` |
| R2 | 不可刪除自己 | `不可刪除自己的帳號` |
| R3 | 不可修改自己的角色 | `不可修改自己的角色` |

**啟用（activate）不設自我限制**——對自己啟用是無害且冪等的。

由 R1–R3 可推得：任何管理動作完成後，執行者仍是一個啟用、未刪除、`role=0` 的帳號，因此系統中永遠至少有一個可用的管理員。「最後一個管理員被鎖死」的狀態不可達，系統因此**不實作管理員計數檢查**。

⚠️ 放寬任何一條時，必須立即補上「操作後啟用中管理員數 ≥ 1」的檢查，否則系統可被鎖死且無法從介面復原。

**限制只針對自己，不針對所有管理員。** 管理員之間可以互相停用、刪除、調整角色。種子帳號 4（`staff@example.com`）存在的理由之一就是讓這件事測得出來。

---

## 每個動作的四道檢查

三層守門之後，四個 POST 動作各自再檢查：

1. 目標存在 → `找不到該使用者`
2. 目標非自己（activate 除外）→ R1/R2/R3 的訊息
3. 目標未被軟刪除 → `該帳號已刪除，無法操作`
4. （僅 role）值為 `'0'` 或 `'1'` → `角色值不正確`

順序固定。第 2 步放在第 3 步之前，因此對自己執行時得到的是「不可停用自己」而不是別的訊息。

---

## 兩處與領域相關的設計

**清單新增「住宿位置」與「聯絡電話」兩欄**，搜尋也新增比對房號（`db.list_users()` 內）。管理員找人時，「A 棟 301 是誰住的」跟「陳小明的 email 是什麼」一樣常見。

新增兩欄時記得把空資料列的 `colspan` 由 9 改為 10。

**明細頁新增一個區塊，列出該會員最近 5 筆報修單：**

```python
    requests, request_total = db.list_my_requests(user_id, 1, 5, 'all')
```

理由是管理員在停用或刪除帳號之前，應該先看到會受影響的紀錄。而本系統的行為是**不連動刪除**，這個決定必須在管理員動手的那個畫面上說清楚：

> 停用或刪除帳號**不會**連動刪除這些報修單——設施的維護歷程屬於宿舍，不屬於個人。

**這個區塊刻意不顯示狀態欄。** 報修狀態的中文標籤定義在 `repair` Blueprint 內，`admin` 若要顯示就得跨 Blueprint 取用或自行複製一份標籤表——兩者都會弄髒模組邊界。而這個區塊真正要回答的問題是「有沒有紀錄」，單號與標題就夠了。

這是一個很小的取捨，但它示範了模組邊界如何實際影響功能設計：**當一個功能需要跨越邊界時，先問這個功能是不是真的需要那個資訊。**

---

## 標籤與常數

```python
ROLE_LABELS = {0: '管理員', 1: '住宿生'}
_VALID_STATUS = ('all', 'active', 'disabled', 'deleted')
_PAGE_SIZE = 10
```

---

## 樣板與 CSS

| 樣板 | 說明 |
|------|------|
| `admin/user_list.html` | 篩選連結 + 搜尋表單 + 表格 + 分頁 |
| `admin/user_detail.html` | 資料卡 + 報修單區塊 + 操作卡（角色、狀態） |

明細頁中被檢視者命名為 `target`，**刻意不叫 `user`**，避免與 topbar 的當前登入者混淆。

`static/admin.css`（前綴 `admin-btn-*`、`admin-btn-action-*`），追加 `.col-room` 與 `.col-title` 兩個欄寬。狀態與角色 badge 的底色硬編碼於此（KI-19）。

刪除按鈕加 `onclick="return confirm(...)"`，寫在 `<button>` 上而非 `<form>` 的 `onsubmit` 上。
