# 個人資料系統（profile）

> 開發規範見 [`blueprints/profile/CLAUDE.md`](../blueprints/profile/CLAUDE.md)；完整規格見 [`system-spec.md`](system-spec.md) §5.3。

---

## 功能

| 路由 | 功能 |
|------|------|
| `GET /profile` | 檢視；`?edit=1` 進入編輯模式 |
| `POST /profile/update` | 更新五個欄位 |

---

## 畫面

單欄卡片，唯讀與編輯兩種模式共用同一個樣板。

| 欄位 | 可編輯 | 說明 |
|------|:---:|------|
| 電子郵件 | ❌ | 卡片頂端，藍色粗體 |
| 姓名 | ✅ | — |
| 顯示名稱 | ✅ | — |
| 宿舍棟別 | ✅ | **本系統新增** |
| 房號 | ✅ | **本系統新增** |
| 聯絡電話 | ✅ | **本系統新增** |
| 身份 | ❌ | 管理員／住宿生 |
| 建立日期 | ❌ | — |
| 最後登入 | ❌ | 未曾登入時顯示 `—` |

編輯模式下多一行說明：

> 棟別、房號與聯絡電話會作為報修單的預設值，並提供維修人員聯繫使用。

底部三個連結：我的報修單、返回首頁、登出。

---

## 資料流

```
GET /profile
  → @login_required            無 session → /login
  → _is_usable(user)           帳號失效   → session.clear() + /login
  → edit_mode = (?edit == '1')
  → 渲染

POST /profile/update
  → @login_required            無 session → /login
  → _is_usable(user)           帳號失效   → session.clear() + /login   ← 見下
  → 五個欄位 .strip()，空字串轉 None
  → db.update_user_profile()
  → redirect /profile
```

更新沒有任何欄位驗證——五個欄位都是選填，空值即為 `None`。

---

## ⚠️ `POST /profile/update` 的 `_is_usable` 檢查

只有 `@login_required` 是不夠的，這條路由必須再檢查帳號是否可用。

### 為什麼這一層不能省

判準只有一條：

> 缺陷的影響是否會外溢到當事人以外的人？

| 個人資料頁能改的東西 | 影響範圍 | 結論 |
|------------------|---------|------|
| 姓名、顯示名稱 | 只有自己。姓名不會出現在任何公開頁面 | 影響有限 |
| **房號、聯絡電話** | 會帶進報修單、印在管理清單上、成為維修人員上門的依據 | **必須擋** |

具體的攻擊情境：一個已經退宿、帳號被管理員停用的人，只要瀏覽器的 session cookie 還沒失效，就可以把房號改成別人的房間，然後維修人員照著新的資料跑一趟。

**這是整個專案最值得在課堂上講的一件事：技術債的嚴重性不是程式碼的屬性，是脈絡的屬性。** 同一行程式碼、同一條判準、不同的領域，得到相反的答案。

### 迴歸防線

`tests/test_profile.py` 中的兩個測試專門防守這一點：

- `test_profile_update_rejects_disabled_user` — 停用帳號的 POST 被擋，且房號沒有改變
- `test_profile_update_rejects_deleted_user_and_clears_session` — 軟刪除帳號同上，且 session 被清除

**不要移除它們。** 從別的系統逐檔搬 `profile` 過來時，這三行極容易漏掉。

---

## 一個實作細節

`db.update_user_profile()` 的簽章**沒有預設值**：

```python
def update_user_profile(user_id, name, display_name, dorm_building, room_no, phone):
```

五個欄位一律一起送出。若給了預設值，某天有人只更新其中兩個欄位時，另外三個會被靜默寫成 `None`——使用者的房號就這樣不見了，而且沒有任何錯誤訊息。

現在的寫法會直接 `TypeError`，在開發階段就炸出來。

同理，樣板的**唯讀與編輯兩個模式都要列出全部八個欄位**。新增欄位時容易只改一邊，畫面上會出現「編輯時看得到、儲存後看不到」的怪現象。

---

## 已知限制

| 項目 | 說明 |
|------|------|
| 無法變更密碼 | 系統完全沒有變更密碼或忘記密碼的功能（KI-06） |
| 無法變更 email | email 是帳號識別，設計上不可變 |
| 無欄位長度限制 | 房號可以填入任意長度的字串（KI-26） |
| 無電話格式驗證 | 任何字串都接受 |
| 時間顯示為 UTC | 建立日期與最後登入都慢 8 小時（KI-25） |
