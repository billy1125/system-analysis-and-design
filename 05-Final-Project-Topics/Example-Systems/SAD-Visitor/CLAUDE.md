# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案說明

工廠訪客進出登記系統（現行版），課程「系統分析與設計」期末示範用的既有系統，是範例報告的分析對象，不列入期末抽籤。功能、資料表、驗證順序與訊息字串的事實來源是 [`../System-Specs/SAD-Visitor-system-spec.md`](../System-Specs/SAD-Visitor-system-spec.md)（不進版控），改動行為前先讀它。

## 技術棧

- Node.js 22.13 以上，只用內建模組：`node:http`、`node:sqlite`、`node:crypto`。**沒有 `package.json`，不要引入 npm 套件**
- 畫面：純 HTML + CSS + JavaScript，沒有框架、沒有打包工具
- 資料庫：SQLite 單一檔案 `database.db`，rollback journal 模式（不開 WAL，資料庫維持單一檔案好進版控）

## 常用指令

```bash
node server.js                    # 啟動，http://localhost:4000（只聽 127.0.0.1）
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
lib/db.js ── getDb()、transaction()、now()
   ▼
database.db
```

| 慣例 | 內容 |
|---|---|
| 路由 | `access` 為 `public`、`login`、`admin` 三種，`server.js` 在呼叫 handler 前檢查。權限一律在伺服器端判斷，畫面隱藏選單只是方便 |
| handler | 收到 `{ req, user, params, query, body, setHeader }`，回傳物件即 200 JSON |
| 錯誤 | 要顯示給使用者的錯誤丟 `UserError`（`lib/http.js`），或用 `lib/validate.js` 的 `fail()`；回應為 `{ error: 訊息 }`。其他例外回 500 |
| 驗證順序 | 來訪登記的檢查順序照規格書〈7.1〉，`routes/register.js` 的註解標了步驟編號，調整時不要打亂 |
| 推導值 | 「在廠」與「訪客證使用中」不存欄位，一律由 `visits.check_out_at IS NULL` 推導 |
| 時間 | 一律用 `lib/db.js` 的 `now()`，本機時間 `YYYY-MM-DD HH:MM:SS`，不要用 SQLite 的 `CURRENT_TIMESTAMP`（那是 UTC） |
| 前端 | 每頁一支 JS，開頭呼叫 `common.js` 的 `initPage()`；插入 HTML 的資料一律經過 `esc()` |
| 登入狀態 | session 存在記憶體的 `Map`，重啟即清空，這是刻意的 |

## 刻意保留的問題，不要順手修

這是給學生分析的「現行版」，下列行為是刻意的，分析報告會找出它們。除非使用者明確要求修改，否則**不要修正**：

- 沒有登記離廠的訪客會一直留在在廠清單，清單不區分報到日期
- 訪客以手機查詢；`phone` 與 `id_number` 都不唯一，同一人可能有兩筆訪客資料
- 存完整身分證字號，並顯示在來訪紀錄查詢結果
- 修改來訪紀錄直接覆蓋原值，只寫 `updated_at`
- 身分證字號只接受「1 個英文字母加 9 個數字」，持護照的訪客無法建檔
- 部門是自由文字
- 隨行人員只記人數
- `visits` 不存公司名稱，改訪客公司會連帶改變歷史紀錄的顯示
- 管理員可以停用使用中的訪客證，系統不提示
- 來訪紀錄不能刪除；沒有報表匯出

## 改動時要同步的地方

改了功能行為、訊息字串或資料表，要同步 `../System-Specs/SAD-Visitor-system-spec.md`；改了啟動方式或資料夾結構，要同步 `README.md`。
