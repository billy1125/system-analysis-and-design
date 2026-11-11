# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案說明

員工教育訓練紀錄系統（現行版），課程「系統分析與設計」期末題目的既有系統，抽到這一題的組別要分析它，並依 [`../Change-Proposals/Training-System-Change-Proposal.md`](../Change-Proposals/Training-System-Change-Proposal.md) 提出修改建議。功能、資料表、驗證順序與訊息字串的事實來源是 [`../System-Specs/SAD-Training-system-spec.md`](../System-Specs/SAD-Training-system-spec.md)（不進版控），改動行為前先讀它。

這一版**沒有刻意保留的錯誤**。期末報告處理的是提案書的新需求，不是修錯誤；發現與規格書不符的行為就是 bug，要修。

## 技術棧

- Node.js 22.13 以上，只用內建模組：`node:http`、`node:sqlite`、`node:crypto`。**沒有 `package.json`，不要引入 npm 套件**
- 畫面：純 HTML + CSS + JavaScript，沒有框架、沒有打包工具
- 資料庫：SQLite 單一檔案 `database.db`，rollback journal 模式（不開 WAL，資料庫維持單一檔案好進版控）

## 常用指令

```bash
node server.js                    # 啟動，http://localhost:8080（只聽 127.0.0.1）
HOST=0.0.0.0 node server.js       # 開放其他電腦連線（NFR-02 的情境）
PORT=8081 node server.js          # 換連接埠
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
lib/rules.js ── 梯次顯示狀態、可否報名、報名檢查、個人訓練紀錄
lib/db.js ── getDb()、transaction()、now()、today()
   ▼
database.db
```

| 慣例 | 內容 |
|---|---|
| 角色 | `employees.role`：`0` 人資、`1` 員工。員工主檔就是登入帳號，以 `emp_no` 登入 |
| 路由 | `access` 為 `public`、`login`、`hr` 三種，`server.js` 在呼叫 handler 前檢查。權限一律在伺服器端判斷，畫面隱藏選單只是方便 |
| handler | 收到 `{ req, user, params, query, body, setHeader }`，回傳物件即 200 JSON；`user.id` 就是 `employees.id` |
| 錯誤 | 要顯示給使用者的錯誤丟 `UserError`（`lib/http.js`），或用 `lib/validate.js` 的 `fail()`；回應為 `{ error: 訊息 }`。其他例外回 500 |
| 驗證順序 | 報名照規格書〈7.1〉（`lib/rules.js` 的 `enroll()`，第 1–2 步在 `routes/sessions.js` 的代報），梯次照〈7.2〉，結訓照〈7.3〉。註解標了步驟編號，調整時不要打亂 |
| 推導值 | 「已結束」「今日上課」「可報名」「已報名人數」「累計完成時數」都不存欄位，見規格書〈5.4〉。`sessions.status` 只存 `開放報名`、`截止報名`、`已取消` |
| 今天 | 一律用 `lib/db.js` 的 `today()` 與 `now()`，本機時間；不要用 SQLite 的 `CURRENT_TIMESTAMP`（那是 UTC） |
| 前端 | 每頁一支 JS，開頭呼叫 `common.js` 的 `initPage()`（人資頁傳 `{ hrOnly: true }`）；插入 HTML 的資料一律經過 `esc()`；狀態與結果用 `badge()` 顯示 |
| 配色 | 版面與 `../SAD-Visitor/` 相同，只換配色（深綠色系），並以 `.badge` 區分狀態顏色 |
| 登入狀態 | session 存在記憶體的 `Map`，重啟即清空，這是刻意的 |

## 這一版不做的事

規格書〈9〉列的範圍（簽到與出席時數、有效期限與複訓、應受訓資料、主管功能、上線前的紀錄、匯入匯出）是提案書 CR-01 要學生設計的內容，或刻意排除的範圍。**除非使用者明確要求，否則不要在這一版實作它們。**

## 改動時要同步的地方

改了功能行為、訊息字串或資料表，要同步 `../System-Specs/SAD-Training-system-spec.md`；改了啟動方式或資料夾結構，要同步 `README.md`；改了種子資料，要同步規格書〈5.5〉並重新產生 `database.db`。
