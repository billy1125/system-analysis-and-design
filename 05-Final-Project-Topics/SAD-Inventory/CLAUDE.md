# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案說明

倉庫盤點管理系統（現行版），課程「系統分析與設計」期末題目的既有系統，抽到這一題的組別要分析它，並依 [`../Change-Proposals/Inventory-System-Change-Proposal.md`](../Change-Proposals/Inventory-System-Change-Proposal.md) 提出修改建議。功能、資料表、驗證順序與訊息字串的事實來源是 [`../System-Specs/SAD-Inventory-system-spec.md`](../System-Specs/SAD-Inventory-system-spec.md)（不進版控），改動行為前先讀它。

這一版**沒有刻意保留的錯誤**。期末報告處理的是提案書的新需求，不是修錯誤；發現與規格書不符的行為就是 bug，要修。

## 技術棧

- Node.js 22.13 以上，只用內建模組：`node:http`、`node:sqlite`、`node:crypto`。**沒有 `package.json`，不要引入 npm 套件**
- 畫面：純 HTML + CSS + JavaScript，沒有框架、沒有打包工具
- 資料庫：SQLite 單一檔案 `database.db`，rollback journal 模式（不開 WAL，資料庫維持單一檔案好進版控）

## 常用指令

```bash
node server.js                    # 啟動，http://localhost:4000（只聽 127.0.0.1）
HOST=0.0.0.0 node server.js       # 開放其他電腦連線（NFR-02 的情境）
PORT=4001 node server.js          # 換連接埠
node scripts/create-db.js         # 產生種子資料庫；database.db 已存在時拒絕執行
```

沒有自動化測試。驗證方式是啟動後用瀏覽器操作，或用 `fetch` 打 API。**測試前先把整個資料夾複製到別處再跑**，不要在原地操作，否則會改到進版控的 `database.db`。

## 架構

```text
瀏覽器 public/*.html + public/js/*.js
   │  fetch('/api/...')，JSON
   ▼
server.js ── 路由表、登入與角色檢查、錯誤處理
   │
routes/*.js ── 每檔對應規格書一組 FR，匯出 [{ method, path, access, handler }]
   │
lib/rules.js ── 盤點單號、帳面數量與盤差的推導、寫入異動並更新帳面
lib/db.js ── getDb()、transaction()、now()、today()
   ▼
database.db
```

| 慣例 | 內容 |
|---|---|
| 角色 | `users.role`：`0` 主管、`1` 倉管人員。以 `emp_no` 登入 |
| 路由 | `access` 為 `public`、`login`、`manager` 三種，`server.js` 在呼叫 handler 前檢查。權限一律在伺服器端判斷，畫面隱藏按鈕只是方便。建立盤點單、結案、料號的新增修改與停用、帳號的路由是 `manager`；輸入實盤數量是 `login`，在 handler 裡檢查登入者是這張單的盤點人員或主管 |
| handler | 收到 `{ req, user, params, query, body, setHeader }`，回傳物件即 200 JSON |
| 錯誤 | 要顯示給使用者的錯誤丟 `UserError`（`lib/http.js`），或用 `lib/validate.js` 的 `fail()`；回應為 `{ error: 訊息 }`。其他例外回 500 |
| 驗證順序 | 建立盤點單照規格書〈7.1〉，輸入實盤數量照〈7.2〉，結案照〈7.3〉，入庫出庫照〈7.4〉。調整時不要打亂順序 |
| 狀態 | 盤點單只有 `盤點中` → 結案 → `已結案`，`已結案` 是終點。盤點項目以 `counted_qty` 是否為 NULL 區分未盤與已盤，重新輸入直接覆蓋數量、說明、盤點人與盤點時間，不留歷程 |
| 帳面數量 | `items.book_qty` 只能經由 `lib/rules.js` 的 `addMove()` 改變，同一個交易裡寫 `stock_moves` 並加減帳面。料號表單沒有帳面欄位 |
| 推導值 | 進度、盤差、盤盈與盤虧項數不存欄位，見規格書〈5.4〉，算法在 `lib/rules.js` 的 `countLines()`。盤點中的單讀料號**當下**的帳面；已結案的單取這張單產生的盤點調整 |
| 盤點單號 | `IC-YYMM-NN`，YYMM 取建立當天，`lib/rules.js` 的 `nextCountNo()` 在建立的交易裡產生 |
| 正負號 | 盤差與數量變化的正數加 `+`，負數用減號 `−`（U+2212），伺服器訊息與畫面都用同一個寫法（`signed()`） |
| 今天 | 一律用 `lib/db.js` 的 `today()` 與 `now()`，本機時間；不要用 SQLite 的 `CURRENT_TIMESTAMP`（那是 UTC） |
| 前端 | 每頁一支 JS，開頭呼叫 `common.js` 的 `initPage()`（主管頁傳 `{ managerOnly: true }`）；插入 HTML 的資料一律經過 `esc()`；盤點單狀態用 `badge()` 顯示 |
| 配色 | 版面與 `../SAD-Visitor/` 相同，只換配色（深青色系），並以 `.badge` 區分狀態顏色 |
| 登入狀態 | session 存在記憶體的 `Map`，重啟即清空，這是刻意的 |

## 這一版不做的事

規格書〈9〉列的範圍（帳面快照、盤點期間凍結或另列異動、覆盤紀錄、差異容許範圍、逐項審核與退回、多人分區盤點、臨時加入料號、盲盤、條碼與手持裝置、匯入匯出等）是提案書 CR-01、CR-02 要學生設計的內容，或刻意排除的範圍。**除非使用者明確要求，否則不要在這一版實作它們。**

## 改動時要同步的地方

改了功能行為、訊息字串或資料表，要同步 `../System-Specs/SAD-Inventory-system-spec.md`；改了啟動方式或資料夾結構，要同步 `README.md`；改了種子資料，要同步規格書〈5.5〉並重新產生 `database.db`。
