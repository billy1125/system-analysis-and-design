# reservations Blueprint

## 職責

書目無可借複本時的候補排隊：建立預約、取消預約、查詢順位，以及館員端的預約佇列管理。

---

## 路由

| 方法   | 路徑                                     | 函式                  | 權限       | 說明             |
| ------ | ---------------------------------------- | --------------------- | ---------- | ---------------- |
| `POST` | `/reservations/new/<book_id>`            | `reserve`             | 登入       | 建立預約         |
| `GET`  | `/reservations/my-reservations`          | `my_reservations`     | 登入       | 自己的預約紀錄   |
| `POST` | `/reservations/<reservation_id>/cancel`  | `cancel`              | 本人或館員 | 取消預約         |
| `GET`  | `/reservations/admin/reservations`       | `admin_reservations`  | 館員       | 全館預約佇列     |

---

## 預約的語意：候補，不是保留

**預約不會替讀者保留書本。** 狀態轉為 `ready` 只代表「輪到你了，可以來借」，
其他讀者仍然借得走同一本書——取書順序是先到先得。

這是刻意的簡化，記錄為規格書的 KI-21。真正的保留機制需要「保留架 + 保留期限 +
到期自動釋出」三件事，超出小型系統的範圍。畫面上以一行說明文字告知讀者這個限制。

---

## 狀態機

```
                    ┌──── 讀者取消 ────┐
                    ↓                  │
  waiting ──有人還書──→ ready ──────借閱成功──→ fulfilled
     │                   │
     └──── 讀者取消 ─────┴──→ cancelled
                              ↑
                     書目下架時一併取消
```

四個狀態的轉換觸發點：

| 轉換                    | 由誰觸發                                   |
| ----------------------- | ------------------------------------------ |
| → `waiting`             | `db.create_reservation()`                  |
| `waiting` → `ready`     | `db.return_loan()` 或 上一位 `ready` 被取消 |
| `waiting`/`ready` → `fulfilled` | `db.borrow_book()` 借到同一書目時    |
| `waiting`/`ready` → `cancelled` | 讀者或館員取消、書目被下架          |

`ready` 的預約被取消時會自動遞補下一位（`_promote_next_reservation()`），
否則佇列會卡在原地。

---

## 建立預約的規則順序

由 `db.create_reservation()` 判定，依序：

1. 書目存在且未下架 → `missing`
2. 書目狀態為可借閱 → `book_unavailable`
3. **目前沒有可借複本** → `available`（有書就直接借，不需要預約）
4. 自己沒有借著同一本書 → `already_borrowed`
5. 自己沒有進行中的預約 → `duplicate`

`RESERVE_MESSAGES` 與 `CANCEL_MESSAGES` 是狀態碼與訊息的對照表，
與 `loans` 的作法一致。

---

## 取消權限

`db.cancel_reservation(reservation_id, user_id, is_admin)` 第三個參數決定是否跳過本人檢查。
Blueprint 負責判斷身分：

```python
is_admin = _is_admin(user)
result   = db.cancel_reservation(reservation_id, user['id'], is_admin)
```

館員從管理頁取消時帶 `?from=admin` 導回管理頁，與 `loans` 的還書登記同一套作法。

---

## 順位計算

`queue_position` 由 SQL 子查詢即時算出——排在自己前面、狀態仍為 `waiting` 的筆數加一：

```sql
(SELECT COUNT(*) FROM reservations q
  WHERE q.book_id = r.book_id AND q.is_deleted = 0
    AND q.reservation_status = 'waiting'
    AND (q.reserved_at < r.reserved_at
         OR (q.reserved_at = r.reserved_at AND q.id < r.id))
) + 1 AS queue_position
```

不存欄位，因此前面的人取消時順位自動往前，不需要額外維護。
`reserved_at` 相同時以 `id` 決勝負——SQLite 的 `datetime('now')` 只到秒，
同一秒內建立的兩筆預約需要一個穩定的排序依據。

---

## Templates

- `templates/reservations/my_reservations.html` — 讀者的預約清單（順位、狀態、立即借閱／取消）
- `templates/reservations/admin_reservations.html` — 全館佇列（狀態篩選、分頁、代為取消）

---

## CSS

`static/reservations.css`，前綴 `res-`。四個徽章對應四個狀態。

---

## 測試

`tests/test_reservations.py`（29 個），涵蓋：
- 建立預約的五種失敗情境
- 順位計算與遞補（還書遞補、`ready` 被取消時遞補下一位）
- 借到書時預約自動轉為 `fulfilled`
- 取消權限：本人可、他人不可、館員可
- 館員佇列的狀態篩選與分頁
