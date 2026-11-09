# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案說明

工廠訪客進出登記系統（修改版）。課程「系統分析與設計」期末範例報告第二部分的實作示範：以現行版 `../SAD-Visitor/` 為基礎，依 CR-01（事前來訪預約與受訪員工確認）、CR-02（未離廠追蹤）與 CR-03（當日訪客總覽與匯出）修改。

事實來源有三份，改動行為前先讀：

| 文件 | 內容 |
|---|---|
| [`../System-Specs/SAD-Visitor-Revised-system-spec.md`](../System-Specs/SAD-Visitor-Revised-system-spec.md) | 修改版與現行版的差異、實作細節、新增訊息 |
| [`../System-Specs/SAD-Visitor-system-spec.md`](../System-Specs/SAD-Visitor-system-spec.md) | 沒有改動的部分，以現行版為準 |
| [`../../04-Final-Project-Example-Reports/Final-Phase-Sample-Report.md`](../../04-Final-Project-Example-Reports/Final-Phase-Sample-Report.md) 第二部分 | 需求編號（FR-19～FR-26、BR-01～BR-08、NFR-07、NFR-08）、欄位字典、畫面設計圖、測試案例 TC-01～TC-17 |

**修改版不可以改動現行版 `../SAD-Visitor/` 的任何檔案。** 兩者是給學生對照用的兩個版本。

## 技術棧

- Node.js 22.13 以上，只用內建模組：`node:http`、`node:sqlite`、`node:crypto`。**沒有 `package.json`，不要引入 npm 套件**
- 畫面：純 HTML + CSS + JavaScript，沒有框架、沒有打包工具
- 資料庫：SQLite 單一檔案 `database.db`，rollback journal 模式（不開 WAL，資料庫維持單一檔案好進版控）

## 常用指令

```bash
node server.js                    # 啟動，http://localhost:4000（只聽 127.0.0.1）
HOST=0.0.0.0 node server.js       # 開放廠內其他電腦連線（NFR-02）
PORT=4001 node server.js          # 換連接埠
node scripts/create-db.js         # 產生種子資料庫；database.db 已存在時拒絕執行
```

沒有自動化測試。驗證方式是啟動後用瀏覽器操作，或用 `fetch` 打 API，以範例報告〈12〉的 TC-01～TC-17 為準。**測試前先把整個資料夾複製到別處再跑**，不要在原地操作，否則會改到進版控的 `database.db`。

## 架構

```text
瀏覽器 public/*.html + public/js/*.js
   │  fetch('/api/...')，JSON；CSV 匯出是檔案下載
   ▼
server.js ── 路由表、登入與角色檢查、錯誤處理
   │
routes/*.js ── 每檔對應一組需求，匯出 [{ method, path, access, handler }]
   │
lib/db.js ── getDb()、transaction()、now()、today()
   ▼
database.db
```

| 慣例 | 內容 |
|---|---|
| 角色 | `users.role`：`0` 管理員、`1` 接待員、`2` 受訪員工。常數在 `lib/validate.js` 與 `public/js/common.js` 各有一份，兩邊要一致 |
| 路由 | `access` 為 `public`、`login`、`staff`（0、1）、`admin`（0）、`employee`（2），對照表在 `server.js` 的 `ACCESS`。權限一律在伺服器端判斷 |
| handler | 收到 `{ req, user, params, query, body, setHeader }`；回傳物件即 200 JSON，回傳 `FileResponse`（`lib/http.js`）即檔案下載 |
| 錯誤 | 要顯示給使用者的錯誤丟 `UserError`，或用 `lib/validate.js` 的 `fail()`；回應為 `{ error: 訊息 }` |
| 驗證順序 | 來訪登記：第 0 步檢查預約，第 1～10 步照現行版規格書〈7.1〉，`routes/register.js` 的註解標了步驟編號 |
| 推導值 | 「在廠」「訪客證使用中」「今日報到」「未到」「可報到」，以及當日總覽的狀態（BR-08）都不存欄位，見修改版規格書〈5.1〉 |
| 受訪員工的資料範圍 | `routes/appointments.js` 的 `/api/my/...` 一律以 `user.employee_id` 過濾；別人的預約回 404，不回 403 |
| 隨行人數 | `visits.companions` 寫入 `visit_companions` 的筆數；舊紀錄只有人數沒有姓名，修改時不填姓名就保留原人數 |
| 時間 | 一律用 `lib/db.js` 的 `now()`、`today()`，本機時間；不要用 SQLite 的 `CURRENT_TIMESTAMP`（那是 UTC） |
| 前端 | 每頁一支 JS，開頭呼叫 `common.js` 的 `initPage({ roles })`；插入 HTML 的資料一律經過 `esc()` |
| 登入狀態 | session 存在記憶體的 `Map`，重啟即清空，這是刻意的 |

## 刻意保留的問題，不要順手修

CR-01、CR-02、CR-03 以外的問題，這一版刻意不處理（修改版規格書〈8〉）。除非使用者明確要求，否則**不要修正**：

- 訪客以手機查詢；`phone` 與 `id_number` 都不唯一，同一人可能有兩筆訪客資料
- 存完整身分證字號，並顯示在來訪紀錄查詢結果
- 修改來訪紀錄直接覆蓋原值，只寫 `updated_at`
- 身分證字號只接受「1 個英文字母加 9 個數字」，持護照的訪客無法建檔
- 部門是自由文字
- `visits` 不存公司名稱，改訪客公司會連帶改變歷史紀錄的顯示
- 管理員可以停用使用中的訪客證，系統不提示
- 來訪紀錄不能刪除；除了當日訪客總覽 CSV，沒有其他報表匯出

## 改動時要同步的地方

改了功能行為、訊息字串或資料表，要同步 `../System-Specs/SAD-Visitor-Revised-system-spec.md`；需求本身變了，要同步範例報告第二部分；改了啟動方式或資料夾結構，要同步 `README.md`。
