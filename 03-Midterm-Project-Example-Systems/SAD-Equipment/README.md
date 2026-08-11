# 器材借用系統（sad-equipment）

## 專案摘要

115-1 系統分析課程範例系統。主要提供元智大學工業工程與管理學系課程之用，這是一個範例的資訊系統，學生可進行系統分析工作的練習。

本系統聚焦在**器材借用的完整交易流程**：器材登錄、借用申請、審核、登記借出、登記歸還，並以一組完整的**會員帳號與管理**子系統作為身分基礎——「一個被停用的帳號能不能繼續借器材」「核准之後器材有沒有被保留下來」這類問題，只有在借用流程與帳號治理同時存在時才問得出來。

五個子系統、四張資料表、125 個自動化測試。

系統分成兩塊：會員帳號與管理（auth / hub / profile / admin），以及器材借用的業務流程（equipment）。

---

## 系統文件

各子系統的詳細功能說明請參閱以下文件，請同學好好參考：

| 子系統 | 文件連結 |
|--------|----------|
| Hub 首頁 | [document/hub.md](document/hub.md) |
| 登入與帳號 | [document/auth.md](document/auth.md) |
| 個人資料管理 | [document/profile.md](document/profile.md) |
| 器材借用 | [document/equipment.md](document/equipment.md) |
| 會員管理（管理員） | [document/admin.md](document/admin.md) |

另有兩份完整的設計文件：

| 文件 | 說明 |
|------|------|
| [document/system-spec.md](document/system-spec.md) | 系統規格書：功能需求、資料模型、狀態機、驗證規則、已知技術債 |
| [document/build-guide.md](document/build-guide.md) | 建置流程書：從空目錄到可執行的 12 個階段 |

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
| 主檔與明細 | 觀察一張單據如何拆成兩張表 | 一張借用單為什麼要拆成 `borrow_orders` 與 `borrow_order_items`？如果只用一張表會怎樣？ | 理解企業系統中最常見的資料結構 |
| 狀態機 | 追蹤一張借用單的狀態變化 | 一張單從送出到歸還經過哪些狀態？哪些轉移是被允許的？限制寫在哪裡？ | 理解 state 與狀態轉移的合法性檢查 |
| 資源一致性 | 注意數量什麼時候改變 | 送出申請時可借數量變了嗎？核准時呢？什麼時候才真的扣減？為什麼這樣設計？ | 理解共用資源的檢查時機與使用時機 |
| 資料狀態改變 | 注意操作前後資料如何變化 | 管理員停用一個帳號後，哪些資料被改變？該帳號還能做什麼、不能做什麼？ | 理解 state、資料更新與畫面同步的概念 |
| 錯誤處理 | 觀察系統對錯誤輸入的反應 | 欄位空白、格式錯誤、數量超過庫存時系統如何回應？錯誤訊息由誰產生？ | 理解驗證、例外處理與使用者回饋 |
| 前後端與資料庫分工 | 辨別三層架構各自的責任 | 前端、後端、資料庫分別負責什麼工作？隱藏一個按鈕等於禁止那個操作嗎？ | 建立系統架構的基本概念，不只看零散的程式碼 |
| 用自己的話說明 | 將觀察轉化為理解並表達出來 | 系統解決什麼問題？資料如何流動？要修改某功能需改哪些地方？ | 將觀察轉為理解，作為小組討論、作業報告與程式修改的基礎 |

---

## 技術棧

- **後端**：Python 3 / Flask / Blueprint
- **前端**：Jinja2 Template / 原生 HTML / CSS（無前端框架、無 CDN）
- **資料庫**：SQLite（WAL 模式，無 ORM）
- **驗證碼**：captcha（ImageCaptcha，伺服器端產生）
- **密碼加密**：bcrypt（註冊 cost=10；種子帳號 cost=4，見規格書 KI-21）
- **測試**：pytest + pytest-flask

---

## 需要的套件

| 套件 | 用途 |
|------|------|
| `flask` | Web 框架 |
| `bcrypt` | 密碼雜湊加密 |
| `captcha` | 伺服器端產生圖形驗證碼 |
| `pytest`、`pytest-flask` | 自動化測試（僅執行測試時需要） |

---

## 基本安裝與執行方式

### 1. 取得專案

這套系統收在課程教材儲存庫裡，路徑是 `03-Midterm-Project-Example-Systems/SAD-Equipment/`，不是獨立的儲存庫。

#### 方法 A：使用 Git

**前置需求**：已安裝 [Git](https://git-scm.com/)，Windows、macOS、Linux 均支援。

1. 決定你的專案放在電腦的位置（例如桌面或 Documents）
2. 開啟終端機，切換到該資料夾後執行：

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/03-Midterm-Project-Example-Systems/SAD-Equipment
```

#### 方法 B：下載 ZIP（如果你不會用 Git 的話）

1. 開啟課程教材儲存庫的 GitHub 頁面，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 將下載的壓縮檔解壓縮到你想放的位置（例如桌面或 Documents），解壓縮之後資料夾名稱應該是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `03-Midterm-Project-Example-Systems/SAD-Equipment`

**如何找到完整路徑？**

- **Windows**：在檔案總管中開啟該資料夾，點選上方網址列，即可看到並複製完整路徑。
- **macOS**：在 Finder 中找到該資料夾，按住 `Option` 鍵並右鍵點選，選擇「複製路徑名稱」。

取得路徑後，開啟終端機輸入：

```bash
# Windows（PowerShell / 命令提示字元）
cd C:\Users\billy\Downloads\system-analysis-and-design-main\03-Midterm-Project-Example-Systems\SAD-Equipment

# macOS / Linux
cd /Users/billy/Downloads/system-analysis-and-design-main/03-Midterm-Project-Example-Systems/SAD-Equipment
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

> 系統的資料（帳號、器材、借用單）儲存在 Docker 的 named volume 中，`stop` 或 `down` 都不會刪除資料；只有加上 `-v` 才會完全清除並回復為只有三個種子帳號與八筆種子器材的初始狀態。加上 `--rmi all` 才會同時刪除本機的 Docker 映像。

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

資料庫第一次建立時會自動植入**三個種子帳號**（見上表）與**八筆種子器材**。這些都是模擬資料，並非真實器材或真實帳號，請勿對內容過度解讀。

三個帳號的密碼公開於原始碼中，僅供教學操作使用（見規格書 KI-21）。

八筆種子器材各自對應一個值得觀察的系統狀態：

| 器材 | 狀態 | 可借／總數 | 為什麼放它 |
|------|------|-----------:|-----------|
| 單槍投影機、無線麥克風組、三腳架 | 可借用 | 足量 | 一般情形 |
| 筆記型電腦 | 可借用 | 6 / 8 | 已有部分借出的樣子 |
| 數位單眼相機 | 可借用 | 1 / 2 | 剩最後一台，適合觀察數量檢查 |
| **行動電源** | **可借用** | **0 / 3** | 狀態是「可借用」但數量為 0——**「狀態」與「數量」是兩個獨立條件** |
| 攝影機 | 維修中 | 0 / 1 | 非可借狀態 |
| 會議用喇叭 | 暫停借用 | 2 / 2 | 有庫存但狀態不允許借出 |

**借用單則刻意不放模擬資料。** 借用流程會改變器材的可借數量，硬塞一批借用單會讓資料從一開始就對不上帳。想看到借用單，請自己在畫面上跑一次完整流程——這也正是最值得做的第一個練習。

要回到初始狀態，刪掉資料庫檔重新啟動即可：

```bash
rm database.db && python app.py
```

---

## 建議的第一個練習：走完一次借用流程

1. 以 `user@example.com` 登入，進入「器材借用」，點選「單槍投影機」
2. 送出借用申請（數量填 2），觀察借用單狀態為「待審核」
3. **回到器材清單，確認「可借數量」還是 5** — 送出申請不會扣減庫存
4. 登出，以 `admin@example.com` 登入，進入「借用單管理」
5. 按「核准」→ 狀態變「已核准」。**再回器材清單確認可借數量仍是 5** — 核准也不扣減
6. 按「登記借出」→ 狀態變「已借出」。**可借數量變成 3**
7. 按「登記歸還」→ 狀態變「已歸還」。**可借數量回到 5**

第 3 與第 5 步是最容易被誤解的兩步。多數人會直覺認為「核准」就等於「器材被保留下來了」，
但這個系統不是這樣設計的——它的後果是兩張申請可以同時被核准、但只有一張能真的借出。
這個取捨的完整討論見規格書 §11.2 的 KI-10。

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

**如果你真的看到 `-wal` 或 `-shm`，代表有程式正抓著這個資料庫不放**——最常見的是你把 `database.db` 開在 DB Browser 裡忘了關，或是有個 Python 程式當掉了沒關連線。這時候：

- 要複製或備份，**三個檔案要一起複製**，只拿 `database.db` 會缺少還留在 `-wal` 裡的變更
- 或者先把佔用的程式關掉，附屬檔案消失後再複製主檔即可

### 從 Docker 取出資料庫檔

用 Docker 執行時，資料庫在容器裡，本機看不到。先複製出來：

```bash
docker compose cp web:/app/data/database.db ./database.db
```

**容器必須是啟動狀態**（先 `docker compose up -d`），否則會找不到來源。複製出來的檔案就在專案根目錄，之後用下面任何一種工具打開它即可。

### 可以用哪些軟體打開

| 工具 | 平台 | 費用 | 說明 |
|------|------|------|------|
| **DB Browser for SQLite** | Windows / macOS / Linux | 免費開源 | **最推薦**。圖形介面，可以直接瀏覽資料表、看欄位定義、執行 SQL。安裝後把 `database.db` 拖進去就能看 |
| **VS Code + SQLite Viewer 擴充套件** | 全平台 | 免費 | 已經在用 VS Code 的話最方便。在擴充套件市集搜尋「SQLite Viewer」或「SQLite」安裝，之後在檔案總管直接點 `database.db` 即可 |
| **`sqlite3` 命令列** | macOS 內建；Windows 需另外下載 | 免費 | 不想安裝軟體時最快 |
| **Python 的 `sqlite3` 模組** | 全平台 | 免費 | 已經隨 Python 安裝，不需要任何額外套件 |
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
.schema borrow_orders            -- 看借用單主檔的完整 CREATE TABLE 語句
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

for row in conn.execute('SELECT id, equipment_name, total_quantity, available_quantity FROM equipment'):
    print(dict(row))

conn.close()
```

### 四張資料表

系統只有四張表，全部看完不會花太多時間：

| 資料表 | 存什麼 |
|--------|--------|
| `users` | 所有會員帳號 |
| `equipment` | 器材主檔：名稱、編號、總數量、可借數量、狀態 |
| `borrow_orders` | 借用單的**表頭**：誰借、什麼時候借、用途、目前狀態、審核紀錄 |
| `borrow_order_items` | 借用單的**明細**：這張單借了哪些器材、各借幾個 |

一張借用單拆成表頭與明細兩張表，這是「主檔／明細」的設計，也是企業資訊系統中最常見的資料結構之一。詳細理由見 [document/system-spec.md](document/system-spec.md) §6.1。

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

**看器材的兩個數量欄位**

```sql
SELECT id, equipment_name, equipment_status, total_quantity, available_quantity FROM equipment;
```

`total_quantity` 是實體總數，不會因為借出而改變；`available_quantity` 才是目前可借的數量。
注意「行動電源」的狀態是 `available` 但可借數量是 `0`——去畫面上點它看看，
系統會讓你進入借用表單，但送出時會被數量檢查擋下。這正是「狀態」與「數量」兩個獨立條件的示範。

**看一張借用單怎麼跨兩張表**

先在畫面上送出一張借用申請，然後執行：

```sql
SELECT id, borrower_id, order_status, borrow_start_at, borrow_end_at, borrow_reason
FROM borrow_orders;

SELECT id, borrow_order_id, equipment_id, quantity, item_status
FROM borrow_order_items
WHERE borrow_order_id = 1;
```

第二個查詢的每一列，就是畫面上「借用單詳細」中明細表格的一行。
注意 `item_status` 和 `order_status` 永遠是一樣的——它們是同步更新的。

**把三張表接起來，重現借用單管理頁**

```sql
SELECT o.id,
       COALESCE(u.name, u.email) AS 借用者,
       e.equipment_name          AS 器材,
       i.quantity                AS 數量,
       o.order_status            AS 狀態
FROM borrow_orders o
JOIN users              u ON u.id = o.borrower_id
JOIN borrow_order_items i ON i.borrow_order_id = o.id AND i.is_deleted = 0
JOIN equipment          e ON e.id = i.equipment_id
WHERE o.is_deleted = 0
ORDER BY o.created_at DESC;
```

這段 SQL 把 `list_all_orders()` 與 `list_order_items()` 兩個函式做的事合在一起。
系統實際上分成兩次查詢：先撈表頭，再依 id 撈明細——想想看為什麼不像上面這樣一次撈完。

**觀察數量什麼時候改變**

執行一次以下步驟，每一步都回來跑這個查詢：

```sql
SELECT equipment_name, available_quantity FROM equipment WHERE id = 1;
```

| 步驟 | 預期的 `available_quantity` |
|------|---------------------------|
| 初始 | 5 |
| 使用者送出借用 2 台的申請 | 5（不變） |
| 管理員核准 | 5（不變） |
| 管理員登記借出 | 3 |
| 管理員登記歸還 | 5 |

**驗證軟刪除**

先在系統畫面上用管理員身分刪除一項器材，然後回來執行：

```sql
SELECT id, equipment_name, is_deleted FROM equipment;
```

會發現那筆資料**還在**，只是 `is_deleted` 變成 `1`。系統從來不真的執行 `DELETE`。

### 觀察就好，不要直接改

**建議只讀不寫。** 資料庫可以隨意查詢，但要改資料請透過系統的畫面操作。

原因是很多規則寫在程式裡而不是資料庫裡。舉例來說，「借用單只能從已核准變成已借出」「可借數量不可大於總數量」「管理員不能停用自己的帳號」這些規則都是 Python 程式在檢查的，資料庫本身完全不知道有這回事——這個系統的四張表甚至連外鍵約束都沒有（見規格書 KI-06）。直接下 SQL 可以輕易做出系統本身永遠不會產生的狀態，之後就很難判斷你看到的行為是系統的設計，還是自己改壞的。

另外兩點：

- **伺服器執行中不要改資料庫**，容易與正在進行的寫入衝突
- 改壞了不用緊張，`rm database.db` 之後重新啟動就會回到乾淨的初始狀態

如果你的目的是「想知道改了某個欄位系統會怎麼反應」，那正是值得做的實驗——但請在改之前先想好預期會發生什麼，改完再回頭驗證，這樣才有分析的價值。

---

## 執行測試

```bash
pytest                                  # 執行全部 125 個測試
pytest tests/test_equipment.py -v       # 只執行器材借用的測試
pytest -k "test_borrow"                 # 執行名稱含 test_borrow 的測試
```

測試不會動到 `database.db`——每個測試函式都會建立自己的暫存資料庫。

---

## 給開發者

專案的模組職責、開發規範、已知技術債清單見：

- [CLAUDE.md](CLAUDE.md) — 專案速查、路由總表、權限模型、CSS 規範
- [rules/flask-blueprint.md](rules/flask-blueprint.md) — Blueprint 路由與表單的實作規範
- [rules/database.md](rules/database.md) — `db/` 套件、transaction、軟刪除的實作規範
- [document/system-spec.md](document/system-spec.md) 第 11 章 — 已知技術債，含每一條的接受理由與修補方向
