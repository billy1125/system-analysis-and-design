# 會員管理系統（sad-user-management）

## 專案摘要

115-1 系統分析課程範例系統。主要提供元智大學工業工程與管理學系課程之用，這是一個範例的資訊系統，學生可進行系統分析工作的練習。

本系統聚焦在**會員帳號的完整生命週期**：申請、登入、個人資料維護、管理員治理，並附帶一個**論壇**子系統作為「使用者產生內容」的示範——帳號的狀態變化（停用、刪除、角色調整）需要有一個可以觀察後果的場域，「一個被停用的帳號能不能繼續發文」這個問題只有在有內容子系統時才問得出來。

五個子系統、三張資料表、112 個自動化測試。

---

## 系統文件

各子系統的詳細功能說明請參閱以下文件，請同學好好參考：

| 子系統 | 文件連結 |
|--------|----------|
| Hub 首頁 | [document/hub.md](document/hub.md) |
| 登入與帳號 | [document/auth.md](document/auth.md) |
| 個人資料管理 | [document/profile.md](document/profile.md) |
| 論壇系統 | [document/forum.md](document/forum.md) |
| 會員管理（管理員） | [document/admin.md](document/admin.md) |

另有兩份完整的設計文件：

| 文件 | 說明 |
|------|------|
| [document/system-spec.md](document/system-spec.md) | 系統規格書：功能需求、資料模型、驗證規則、已知技術債 |
| [document/build-guide.md](document/build-guide.md) | 建置流程書：從空目錄到可執行的 13 個階段 |

以及同一組需求的純前端平行實作：

| 文件 | 說明 |
|------|------|
| [document/web-system-spec.md](document/web-system-spec.md) | 純 HTML + CSS + JS 版規格書 |
| [document/web-build-guide.md](document/web-build-guide.md) | 純前端版建置流程書 |

---

## 同學請注意

除了以上的系統文件與兩份設計文件，請在觀察這個範例系統時，先不要把重點放在程式語法或細節錯誤上，而是要理解「**系統如何運作**」。

當你能說明「**資料從哪裡來、經過哪些處理、最後到哪裡去**」，就代表你已經掌握這個系統最基本的運作方式。

建議你依照以下內容進行觀察與分析：

|  | 觀察重點 | 具體問題 | 學習目標 |
|------|----------|----------|----------|
| 實際操作系統 | 從使用者角度理解功能 | 系統有哪些頁面、按鈕、輸入框？使用者輸入後畫面有何變化？ | 理解「使用者做了什麼」與「系統回應了什麼」 |
| 輸入→處理→輸出 | 用資料流架構整理每個功能 | 資料從哪裡來？程式對資料做了什麼？結果顯示或儲存在哪裡？ | 掌握資料流，避免一開始就陷入程式細節 |
| UI 與程式連動 | 觀察畫面與程式的對應關係 | 輸入框、按鈕如何對應資料？按下後程式執行了哪些動作？ | 理解「畫面操作」如何觸發「程式中的處理」 |
| 函式的角色 | 理解每個函式負責的工作 | 函式名稱代表什麼？接收什麼輸入？回傳什麼輸出？ | 把函式視為系統中負責單一任務的小單元 |
| 函式關係與資料儲存 | 追蹤函式呼叫鏈與資料流向 | 函式在哪裡被呼叫？資料接著流向哪裡？何時、在哪裡儲存？Schema 有哪些欄位？ | 理解資料流、函式分工、UI 互動與儲存邏輯 |
| 功能完整流程 | 觀察一個功能從頭到尾的串聯 | 發表一篇論壇文章時，使用者如何輸入？程式如何檢查？資料如何寫進 forum 與 forum_details 兩張表？ | 理解功能是 UI、事件、函式、資料處理的完整組合 |
| 資料狀態改變 | 注意操作前後資料如何變化 | 管理員停用一個帳號後，哪些資料被改變？該帳號還能做什麼、不能做什麼？ | 理解 state、資料更新與畫面同步的概念 |
| 錯誤處理 | 觀察系統對錯誤輸入的反應 | 欄位空白、格式錯誤、重複輸入時系統如何回應？錯誤訊息由誰產生？ | 理解驗證、例外處理與使用者回饋 |
| 前後端與資料庫分工 | 辨別三層架構各自的責任 | 前端、後端、資料庫分別負責什麼工作？ | 建立系統架構的基本概念，不只看零散的程式碼 |
| 用自己的話說明 | 將觀察轉化為理解並表達出來 | 系統解決什麼問題？資料如何流動？要修改某功能需改哪些地方？ | 將觀察轉為理解，作為小組討論、作業報告與程式修改的基礎 |

---

## 技術棧

- **後端**：Python 3 / Flask / Blueprint
- **前端**：Jinja2 Template / 原生 HTML / CSS
- **資料庫**：SQLite（WAL 模式）
- **驗證碼**：captcha（ImageCaptcha，伺服器端產生）
- **密碼加密**：bcrypt（註冊 cost=10；種子帳號 cost=4，見規格書 KI-21）
---

## 需要的套件

| 套件 | 用途 |
|------|------|
| `flask` | Web 框架 |
| `bcrypt` | 密碼雜湊加密 |
| `captcha` | 伺服器端產生圖形驗證碼 |

---

## 基本安裝與執行方式

### 1. 取得專案

這套系統收在課程教材儲存庫裡，路徑是 `03-Midterm-Project-Example-Systems/SAD-Forum/`，不是獨立的儲存庫。

#### 方法 A：使用 Git

**前置需求**：已安裝 [Git](https://git-scm.com/)，Windows、macOS、Linux 均支援。

1. 決定你的專案放在電腦的位置（例如桌面或 Documents）
2. 開啟終端機，切換到該資料夾後執行：

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/03-Midterm-Project-Example-Systems/SAD-Forum
```

#### 方法 B：下載 ZIP（如果你不會用 Git 的話）

1. 開啟課程教材儲存庫的 GitHub 頁面，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 將下載的壓縮檔解壓縮到你想放的位置（例如桌面或 Documents），解壓縮之後資料夾名稱應該是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `03-Midterm-Project-Example-Systems/SAD-Forum`

**如何找到完整路徑？**

- **Windows**：在檔案總管中開啟該資料夾，點選上方網址列，即可看到並複製完整路徑。
- **macOS**：在 Finder 中找到該資料夾，按住 `Option` 鍵並右鍵點選，選擇「複製路徑名稱」。

取得路徑後，開啟終端機輸入：

```bash
# Windows（PowerShell / 命令提示字元）
cd C:\Users\billy\Downloads\system-analysis-and-design-main\03-Midterm-Project-Example-Systems\SAD-Forum

# macOS / Linux
cd /Users/billy/Downloads/system-analysis-and-design-main/03-Midterm-Project-Example-Systems/SAD-Forum
```

> 將上方範例路徑替換為你自己複製的完整路徑。

### 2. 建置專案

> 這個範例系統提供兩種方式安裝，建議同學使用第一種

#### 方法 A：以 Docker 建置（需要 clone 此 repository）

**前置需求**：已安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，Windows、macOS、Linux 均支援。

##### 安裝（第一次使用）

第一次啟動需要先建置 Docker 映像：

```bash
docker compose up -d --build
```

建置完成後，開啟瀏覽器前往「[http://localhost:4000](http://localhost:4000)」

##### 日常執行

之後每次要啟動系統，不需要重新建置，直接執行：

```bash
docker compose up -d
```

開啟後，使用任何一種瀏覽器連到「[http://localhost:4000](http://localhost:4000)」

##### 停止與清除

| 指令 | 說明 |
|------|------|
| `docker compose stop` | 暫停服務（資料保留，下次可繼續） |
| `docker compose down` | 停止並移除容器（資料保留） |
| `docker compose down -v` | 停止並**刪除所有資料**（資料庫重置為初始狀態） |
| `docker compose down --rmi all` | 停止、移除容器，並**刪除映像**（釋放磁碟空間） |
| `docker compose down -v --rmi all` | 停止、移除容器、**刪除映像**及**所有資料**（完全清除） |

> 系統的資料（帳號、論壇文章）儲存在 Docker 的 named volume 中，`stop` 或 `down` 都不會刪除資料；只有加上 `-v` 才會完全清除並回復為只有三個種子帳號的初始狀態。加上 `--rmi all` 才會同時刪除本機的 Docker 映像。

---

#### 方法 B：手動本機安裝（需要 Python 3 環境）

**前置需求**：已安裝 Python 3 與 conda（或其他虛擬環境工具）。

```bash
# 啟用虛擬環境（以 conda 為例）
conda activate flask

# 安裝相依套件
pip install -r requirements.txt

# 啟動伺服器
python app.py
# 伺服器啟動於 http://localhost:4000

# 重置資料庫
rm database.db && python app.py
```

---

## 預設帳號與資料庫說明

系統啟動時會自動建立以下範例帳號，可直接用來登入操作：

| email | 密碼 | 身份 |
|-------|------|------|
| user@example.com | password123 | 一般使用者 |
| admin@example.com | admin1234 | 管理者 |
| disabled@example.com | disabled123 | 停用帳號 |

**資料庫內容注意事項**

資料庫第一次建立時會自動植入**三個種子帳號**（見上表）與**五篇論壇文章**。這些都是模擬資料，並非真實使用者或真實討論，請勿對內容過度解讀。

三個帳號的密碼公開於原始碼中，僅供教學操作使用（見規格書 KI-21）。

五篇種子文章各自對應一個值得觀察的系統行為——例如其中一篇是用「已停用」的帳號發表的，可以直接看到帳號被停用之後，既有內容並不會跟著消失，而且作者欄會因為該帳號沒有填姓名而顯示 email。設計用意見 [document/system-spec.md](document/system-spec.md) §6.4.1。

要回到初始狀態，刪掉資料庫檔重新啟動即可：

```bash
rm database.db && python app.py
```

---

## 直接檢視資料庫

系統分析很重要的一環，是能夠對照「畫面上看到的東西」與「資料庫裡實際存的東西」。這一節說明資料庫檔在哪裡、用什麼工具打開，以及幾個值得先跑跑看的查詢。

### 檔案在哪裡

| 執行方式 | 位置 |
|---------|------|
| 本機（`python app.py`） | 專案根目錄的 **`database.db`** |
| Docker | 容器內的 `/app/data/database.db`，實體存放在 Docker 的 named volume `db_data` |

這個檔案**不在版本控制中**——它由系統在第一次啟動時自動建立，每個人的資料庫都是自己的。你在上面做的任何操作都不會影響別人。

### 如果看到 `-wal` 和 `-shm` 兩個檔案

系統使用 SQLite 的 **WAL 模式**（Write-Ahead Logging），運作時會額外產生兩個附屬檔案：

| 檔案 | 用途 |
|------|------|
| `database.db` | 資料庫主檔 |
| `database.db-wal` | 尚未合併回主檔的變更紀錄 |
| `database.db-shm` | 共享記憶體索引，供多個連線協調用 |

不過**平常你只會看到 `database.db` 一個檔案**，即使伺服器正在執行也一樣。

原因是本系統的資料存取函式每次都自己開一條連線、用完立刻關閉（見 `db/connection.py`）。SQLite 在**最後一條連線關閉時**會自動把 WAL 的內容合併回主檔，並刪掉那兩個附屬檔案。因為每條連線只存活幾毫秒，那兩個檔案幾乎不可能被你剛好看到。

可以自己驗證這件事：

```python
import sqlite3, os

conn = sqlite3.connect('database.db')
conn.execute('PRAGMA journal_mode=WAL')
conn.execute('SELECT 1')
print('連線開啟中:', sorted(f for f in os.listdir('.') if f.startswith('database.db')))
conn.close()
print('連線關閉後:', sorted(f for f in os.listdir('.') if f.startswith('database.db')))
```

**如果你真的看到 `-wal` 或 `-shm`，代表有程式正抓著這個資料庫不放**——最常見的是你把 `database.db` 開在 DB Browser 裡忘了關，或是有個 Python 程式當掉了沒關連線。這時候：

- 要複製或備份，**三個檔案要一起複製**，只拿 `database.db` 會缺少還留在 `-wal` 裡的變更
- 或者先把佔用的程式關掉，附屬檔案消失後再複製主檔即可

### 從 Docker 取出資料庫檔

用 Docker 執行時，資料庫在容器裡，本機看不到。先複製出來：

```bash
docker compose cp web:/app/data/database.db ./database.db
```

**容器必須是啟動狀態**（先 `docker compose up -d`），否則會找不到來源。複製出來的檔案就在專案根目錄，之後用下面任何一種工具打開它即可。

改回容器裡的用法相反：

```bash
docker compose cp ./database.db web:/app/data/database.db
```

但如同本節最後的提醒，**不建議這樣改資料**。

### 可以用哪些軟體打開

| 工具 | 平台 | 費用 | 說明 |
|------|------|------|------|
| **DB Browser for SQLite** | Windows / macOS / Linux | 免費開源 | **最推薦**。圖形介面，可以直接瀏覽資料表、看欄位定義、執行 SQL。安裝後把 `database.db` 拖進去就能看 |
| **VS Code + SQLite Viewer 擴充套件** | 全平台 | 免費 | 已經在用 VS Code 的話最方便。在擴充套件市集搜尋「SQLite Viewer」或「SQLite」安裝，之後在檔案總管直接點 `database.db` 即可 |
| **`sqlite3` 命令列** | macOS 內建；Windows 需另外下載 | 免費 | 不想安裝軟體時最快。macOS 打開終端機就能用 |
| **Python 的 `sqlite3` 模組** | 全平台 | 免費 | 已經隨 Python 安裝，不需要任何額外套件。適合想用程式讀資料的人 |
| TablePlus | Windows / macOS | 有免費版 | 介面精美，免費版有開啟數量限制 |
| JetBrains DataGrip / PyCharm Professional | 全平台 | 商業軟體 | 學生可申請免費授權 |

官方下載頁面：

- DB Browser for SQLite — <https://sqlitebrowser.org/>
- SQLite 命令列工具（Windows 用 `sqlite-tools-win-x64`）— <https://www.sqlite.org/download.html>

> ⚠️ 網路上有「線上 SQLite 檢視器」這類服務，需要把檔案上傳到別人的伺服器。本專案裡都是模擬資料，上傳不會有什麼損失，但**請養成習慣**：真實系統的資料庫檔絕對不要上傳到來路不明的網站。

### 用命令列看

```bash
sqlite3 database.db
```

進去之後可以用這些指令（開頭有點號的是 `sqlite3` 自己的指令，不是 SQL）：

```sql
.tables                          -- 列出所有資料表
.schema users                    -- 看 users 表的完整 CREATE TABLE 語句
.headers on                      -- 查詢結果顯示欄位名稱
.mode column                     -- 以對齊的欄位顯示，比較好讀
.quit                            -- 離開
```

### 用 Python 看

不需要安裝任何東西：

```python
import sqlite3

conn = sqlite3.connect('database.db')
conn.row_factory = sqlite3.Row          # 讓結果可以用欄位名稱存取

for row in conn.execute('SELECT id, email, role, is_active FROM users'):
    print(dict(row))

conn.close()
```

### 三張資料表

系統只有三張表，全部看完不會花太多時間：

| 資料表 | 存什麼 |
|--------|--------|
| `users` | 所有會員帳號 |
| `forum` | 論壇文章的**標題**與發表者 |
| `forum_details` | 論壇文章的**內容**與所有回覆 |

一篇文章的標題和內容分開存在兩張表裡，這是「主檔／明細」的設計。詳細理由見 [document/system-spec.md](document/system-spec.md) §6.1.1。

### 幾個值得先跑跑看的查詢

**看所有帳號的狀態**

```sql
SELECT id, email, role, is_active, is_deleted FROM users;
```

對照畫面上的「會員管理」頁面。注意 `role` 是 `0`（管理員）或 `1`（一般使用者），`is_active` 與 `is_deleted` 是 `0`／`1` 而不是 true／false。

**確認密碼真的沒有明文儲存**

```sql
SELECT email, hash FROM users;
```

`hash` 欄位是 bcrypt 雜湊，長得像 `$2b$04$...`。就算拿到資料庫也還原不出原始密碼。

**看一篇文章怎麼跨兩張表**

```sql
SELECT id, title, user_id, updated_at FROM forum;

SELECT id, master_id, user_id, is_original_post, substr(content, 1, 30)
FROM forum_details
WHERE master_id = 4;
```

第二個查詢會看到三列：`is_original_post = 1` 的那一列是文章內文，另外兩列是回覆。這正是畫面上第 4 篇文章右欄顯示的內容。

**把兩張表接起來，重現畫面上的文章列表**

```sql
SELECT m.id, m.title, COALESCE(u.name, u.email) AS 作者, m.updated_at
FROM forum m
LEFT JOIN users u ON u.id = m.user_id
WHERE m.is_deleted = 0
ORDER BY m.updated_at DESC;
```

這段 SQL 幾乎就是 `db/forum.py` 的 `list_forum_masters()` 在做的事。`COALESCE(u.name, u.email)` 的意思是「有姓名就顯示姓名，沒有就顯示 email」——第 3 篇文章的作者顯示 email，就是因為那個帳號沒有填姓名。

**驗證軟刪除**

先在系統畫面上用管理員身分刪除一篇文章，然後回來執行：

```sql
SELECT id, title, is_deleted FROM forum;
```

會發現那筆資料**還在**，只是 `is_deleted` 變成 `1`。系統從來不真的執行 `DELETE`。

### 觀察就好，不要直接改

**建議只讀不寫。** 資料庫可以隨意查詢，但要改資料請透過系統的畫面操作。

原因是很多規則寫在程式裡而不是資料庫裡。舉例來說，「管理員不能停用自己的帳號」這條規則是 `blueprints/admin/__init__.py` 在檢查的，資料庫本身不知道有這回事——直接下 SQL 可以輕易做出系統本身永遠不會產生的狀態，之後就很難判斷你看到的行為是系統的設計，還是自己改壞的。

另外兩點：

- **伺服器執行中不要改資料庫**，容易與正在進行的寫入衝突
- 改壞了不用緊張，`rm database.db` 之後重新啟動就會回到乾淨的初始狀態

如果你的目的是「想知道改了某個欄位系統會怎麼反應」，那正是值得做的實驗——但請在改之前先想好預期會發生什麼，改完再回頭驗證，這樣才有分析的價值。

