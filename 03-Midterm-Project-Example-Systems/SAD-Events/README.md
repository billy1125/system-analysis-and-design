# 校園活動報名系統（sad-events）

## 專案摘要

115-1 系統分析課程範例系統。主要提供元智大學工業工程與管理學系課程之用，這是一個範例的資訊系統，學生可進行系統分析工作的練習。

本系統聚焦在**校園活動從建立到報名的完整流程**：建立活動、瀏覽活動、報名、取消與重新報名、查看報名名單，並以一組完整的**會員帳號與管理**子系統作為身分基礎——「建立活動的人能不能管理別人的活動」「被停用的帳號能不能繼續佔用名額」這類問題，只有在報名流程與帳號治理同時存在時才問得出來。

五個子系統、四張資料表、152 個自動化測試。

系統分成兩塊：會員帳號與管理（auth / hub / profile / admin），以及校園活動報名的業務流程（events）。

---

## 系統文件

各子系統的詳細功能說明請參閱以下文件，請同學好好參考：

| 子系統 | 文件連結 |
|--------|----------|
| Hub 首頁 | [document/hub.md](document/hub.md) |
| 登入與帳號 | [document/auth.md](document/auth.md) |
| 個人資料管理 | [document/profile.md](document/profile.md) |
| 校園活動報名 | [document/events.md](document/events.md) |
| 會員管理（管理員） | [document/admin.md](document/admin.md) |

另有兩份完整的設計文件：

| 文件 | 說明 |
|------|------|
| [document/system-spec.md](document/system-spec.md) | 系統規格書：功能需求、資料模型、兩個狀態機、驗證規則、已知技術債 |
| [document/build-guide.md](document/build-guide.md) | 建置流程書：從空目錄到可執行的 14 個階段 |

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
| 主表與副表 | 觀察一場活動如何拆成兩張表 | 一場活動為什麼要拆成 `events` 與 `event_details`？這種一對一的拆法，和「一張單據對多筆明細」的拆法理由有什麼不同？ | 理解依用途拆分欄位的資料結構 |
| 算出來的狀態 | 追蹤活動狀態的判斷方式 | 「名額已滿」「報名已截止」存在哪一個欄位？五種狀態的判斷順序如果調換，會出現什麼錯誤的畫面？ | 理解不存在資料表、每次查詢時現算的狀態 |
| 關係型權限 | 比較同一個帳號對不同活動的權限 | 同一個一般使用者，為什麼能修改這一場活動、卻不能修改另一場？系統是看角色還是看資料？ | 理解「你是誰」與「這筆資料是不是你的」是兩種權限 |
| 共用資源 | 注意名額什麼時候被佔用與釋出 | 名額怎麼算？取消報名之後名額什麼時候釋出？兩個人同時搶最後一個名額會怎樣？ | 理解共用資源的檢查時機與寫入時機 |
| 資料狀態改變 | 注意操作前後資料如何變化 | 取消報名之後再重新報名，資料表多了一列還是改了原本那一列？管理員停用一個帳號後，該帳號還能做什麼、不能做什麼？ | 理解 state、資料更新與畫面同步的概念 |
| 錯誤處理 | 觀察系統對錯誤輸入的反應 | 欄位空白、時間順序不合理、同一場活動報名兩次時系統如何回應？錯誤訊息由誰產生？ | 理解驗證、例外處理與使用者回饋 |
| 前後端與資料庫分工 | 辨別三層架構各自的責任 | 前端、後端、資料庫分別負責什麼工作？隱藏一個按鈕等於禁止那個操作嗎？ | 建立系統架構的基本概念，不只看零散的程式碼 |
| 用自己的話說明 | 將觀察轉化為理解並表達出來 | 系統解決什麼問題？資料如何流動？要修改某功能需改哪些地方？ | 將觀察轉為理解，作為小組討論、作業報告與程式修改的基礎 |

---

## 技術棧

- **後端**：Python 3 / Flask / Blueprint
- **前端**：Jinja2 Template / 原生 HTML / CSS（無前端框架）
- **資料庫**：SQLite（WAL 模式，無 ORM，手寫參數化 SQL）
- **驗證碼**：captcha（ImageCaptcha，伺服器端產生）
- **密碼加密**：bcrypt（註冊 cost=10；種子帳號 cost=4，見規格書 §6.9）
- **測試**：pytest + pytest-flask

刻意不用 ORM、不用前端框架、不用 Flask-Login，也不用資料庫的 UNIQUE 約束保證報名唯一，理由見規格書 §2.2。

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

安裝分成三步：開啟終端機、取得專案檔案、選一種方式把系統跑起來。系統跑起來之後，用瀏覽器開啟 <http://localhost:4000> 就能操作。

### 0. 開啟終端機

後面所有指令都在「終端機」裡輸入，每輸入一行就按一次 Enter 執行。

| 作業系統 | 開啟方式 |
|----------|----------|
| Windows | 開始功能表搜尋「PowerShell」或「終端機」，點選開啟 |
| macOS | 按 `Command + 空白鍵` 開啟 Spotlight，輸入「終端機」（Terminal）後按 Enter |

> 指令區塊中以 `#` 開頭的行是說明文字，不用輸入。

### 1. 取得專案

這套系統收在課程教材儲存庫裡，路徑是 `03-Midterm-Project-Example-Systems/SAD-Events/`，不是獨立的儲存庫。下面兩種方法擇一。

#### 方法 A：使用 Git

**前置需求**：已安裝 [Git](https://git-scm.com/)，Windows、macOS、Linux 均支援。

1. 決定你的專案放在電腦的位置（例如桌面或 Documents）
2. 開啟終端機，切換到該資料夾後執行：

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/03-Midterm-Project-Example-Systems/SAD-Events
```

#### 方法 B：下載 ZIP（如果你不會用 Git 的話）

1. 開啟課程教材儲存庫的 GitHub 頁面 <https://github.com/billy1125/system-analysis-and-design>，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 將下載的壓縮檔解壓縮到你想放的位置（例如桌面或 Documents），解壓縮之後資料夾名稱應該是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `03-Midterm-Project-Example-Systems/SAD-Events`

**如何找到完整路徑？**

- **Windows**：在檔案總管中開啟該資料夾，點選上方網址列，即可看到並複製完整路徑。
- **macOS**：在 Finder 中找到該資料夾，按住 `Option` 鍵並右鍵點選，選擇「複製路徑名稱」。

取得路徑後，在終端機輸入 `cd`、一個空格，再貼上路徑：

```bash
# Windows（PowerShell）
cd "C:\Users\billy\Downloads\system-analysis-and-design-main\03-Midterm-Project-Example-Systems\SAD-Events"

# macOS / Linux
cd "/Users/billy/Downloads/system-analysis-and-design-main/03-Midterm-Project-Example-Systems/SAD-Events"
```

> 將上方範例路徑替換為你自己複製的完整路徑。路徑前後的雙引號要保留，路徑裡有空格（例如 `My Documents`）時才不會出錯。

#### 確認目前的位置

切換之後，先確認終端機真的在系統資料夾裡：

```bash
# Windows（PowerShell）
dir

# macOS / Linux
ls
```

列出的檔案中要看得到 `app.py`、`requirements.txt` 與 `docker-compose.yml`。看不到的話，代表位置不對，後面的指令都會失敗。

**之後每次開新的終端機，都要先 `cd` 回這個資料夾**，再執行下一節的指令。

### 2. 建置與啟動系統

這個範例系統提供兩種方式，擇一即可，建議使用方法 A。

| | 方法 A：Docker | 方法 B：本機 Python |
|---|---|---|
| 要先安裝 | Docker Desktop | Python 3.11 |
| 優點 | 不用處理 Python 版本與套件，每個人的執行環境都一樣 | 不必安裝 Docker |
| 資料庫檔的位置 | 容器裡（要先複製出來才看得到，見〈直接檢視資料庫〉） | 系統資料夾裡的 `database.db` |

#### 方法 A：以 Docker 建置

**前置需求**：已安裝 Docker Desktop。還沒安裝的話，先照 [Docker Desktop 安裝指南：Windows 與 macOS](../Docker-Desktop-Installation-Guide.md) 完成安裝，並做完該文件〈4. Windows 與 macOS 共用的安裝驗證〉。

**每次使用前，都要先開啟 Docker Desktop 應用程式**，等它顯示引擎已啟動再輸入指令。沒開的話，指令會出現無法連線到 Docker daemon 的錯誤。

##### 安裝（第一次使用）

確認終端機位在系統資料夾裡（見〈確認目前的位置〉），執行：

```bash
docker compose up -d --build
```

第一次執行要下載 Python 映像並安裝套件，需要網路連線，大約要等幾分鐘。完成後確認系統有在執行：

```bash
docker compose ps
```

`STATUS` 欄顯示 `Up` 就代表啟動成功。開啟瀏覽器前往「[http://localhost:4000](http://localhost:4000)」。

##### 日常執行

之後每次要啟動系統，先開啟 Docker Desktop，在系統資料夾裡執行（不需要重新建置）：

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

> 系統的資料（帳號、活動、報名紀錄）儲存在 Docker 的 named volume 中，`stop` 或 `down` 都不會刪除資料；只有加上 `-v` 才會完全清除，下次啟動時回復為三個種子帳號、五筆種子活動與六筆種子報名紀錄的初始狀態。加上 `--rmi all` 才會同時刪除本機的 Docker 映像。

> 六套範例系統都使用 4000 這個連接埠，**同一時間只能啟動一套**。要換另一套之前，先到原本那套的資料夾執行 `docker compose stop`。各套的資料存在各自的 volume，不會互相影響。

---

#### 方法 B：手動本機安裝（需要 Python 3 環境）

**前置需求**：已安裝 Python 3.11。Docker 映像用的是 3.11，本機也以 3.11 測試過；其他版本沒有測試過。

##### 步驟 1：確認 Python 已安裝

```bash
# Windows（PowerShell）
python --version

# macOS / Linux
python3 --version
```

應顯示 `Python 3.11.x`。如果顯示找不到指令，或 Windows 跳出 Microsoft Store，代表還沒安裝 Python：到 <https://www.python.org/downloads/> 下載 3.11 版安裝。Windows 安裝程式的第一個畫面**要勾選「Add python.exe to PATH」**，裝完把終端機關掉重開，再檢查一次。

##### 步驟 2：建立並啟用虛擬環境

虛擬環境（virtual environment）是專屬這個專案的 Python 套件空間，裝進去的套件不會影響電腦上的其他程式。下面兩種工具擇一。

**用 Python 內建的 venv**（不用另外安裝東西）：

```bash
# Windows（PowerShell）
python -m venv .venv
.venv\Scripts\Activate.ps1

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

**已經裝了 Anaconda 或 Miniconda 的話，也可以用 conda**：

```bash
conda create -n flask python=3.11    # 只有第一次需要
conda activate flask
```

啟用成功後，終端機每一行的最前面會出現 `(.venv)` 或 `(flask)`。之後的步驟在這個狀態下執行，macOS 也直接打 `python` 即可。

> Windows 執行 `Activate.ps1` 時，若出現「因為這個系統上已停用指令碼執行」，先執行下面這行，再重新啟用一次：
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

##### 步驟 3：安裝相依套件

```bash
pip install -r requirements.txt
```

最後出現 `Successfully installed ...` 就代表安裝完成。已經裝過的套件會顯示 `Requirement already satisfied`，也是正常的。

##### 步驟 4：啟動伺服器

> **第一次在本機啟動前，先刪掉資料夾裡的 `database.db`**（指令見下方〈重置資料庫〉，只要執行刪除那一行）。種子活動的日期是依「建立資料庫的那一刻」往前或往後換算的，儲存庫附的 `database.db` 建立於 2026-08-12，直接拿來用的話，五筆活動都會顯示「活動已結束」，看不到五種狀態。刪掉之後再啟動，系統會依當天的日期重新植入。Docker 不受影響，它的資料庫是容器第一次啟動時才建立的。

```bash
python app.py
```

畫面出現 `Running on http://127.0.0.1:4000` 就代表啟動成功，開啟瀏覽器前往「[http://localhost:4000](http://localhost:4000)」。同一個畫面上的 `WARNING: This is a development server` 是 Flask 的固定提醒，不影響使用。

伺服器執行期間，這個終端機視窗要保持開著。要停止系統，在終端機按 `Ctrl + C`。

##### 之後每次啟動

套件不用重裝，只要做三件事：`cd` 到系統資料夾、啟用虛擬環境（步驟 2 的第二行，或 `conda activate flask`）、執行 `python app.py`。

##### 重置資料庫

先按 `Ctrl + C` 停止伺服器，刪掉資料庫檔後重新啟動。系統找不到資料庫檔時，會重新建立資料表並植入種子資料：

```bash
# Windows（PowerShell）
Remove-Item database.db
python app.py

# macOS / Linux
rm database.db
python app.py
```

### 3. 安裝時常見的問題

| 狀況 | 原因與處理 |
|------|------------|
| `docker` 不是可辨識的指令，或 `command not found: docker` | Docker Desktop 沒有安裝，或安裝後還沒啟動過。見 [Docker Desktop 安裝指南：Windows 與 macOS](../Docker-Desktop-Installation-Guide.md)〈5〉 |
| 出現 `Cannot connect to the Docker daemon` 或 `error during connect` | Docker Desktop 沒有開。開啟應用程式，等引擎啟動後再執行一次 |
| 出現 `no configuration file provided: not found` | 終端機不在系統資料夾裡，回〈確認目前的位置〉 |
| Windows 輸入 `python` 後跳出 Microsoft Store | 還沒安裝 Python，見方法 B 步驟 1 |
| `No module named 'flask'`（或 `bcrypt`、`captcha`） | 虛擬環境沒有啟用，或套件還沒安裝。啟用虛擬環境後重新執行 `pip install -r requirements.txt` |
| 出現 `port is already allocated`、`Address already in use` 等連接埠被佔用的訊息 | 4000 連接埠已被佔用，通常是另一套範例系統還開著。先停掉它：Docker 用 `docker compose stop`，本機在原本的終端機按 `Ctrl + C` |
| 瀏覽器顯示「無法連上這個網站」 | 系統沒有在執行。Docker 用 `docker compose ps` 確認；本機確認執行 `python app.py` 的終端機還開著 |

---

## 預設帳號與資料庫說明

系統啟動時會自動建立以下範例帳號，可直接用來登入操作：

| email | 密碼 | 身份 |
|-------|------|------|
| user@example.com | password123 | 一般使用者 |
| admin@example.com | admin1234 | 管理者 |
| disabled@example.com | disabled123 | 停用帳號（無法登入，用於觀察停用行為） |

**資料庫內容注意事項**

資料庫第一次建立時會自動植入**三個種子帳號**（見上表）、**五筆種子活動**與**六筆種子報名紀錄**。這些都是模擬資料，並非真實活動或真實帳號，請勿對內容過度解讀。

三個帳號的密碼公開於原始碼中，僅供教學操作使用（見規格書 §6.9）。

五筆種子活動刻意各自對應一種活動狀態，第一次開啟活動列表就能同時看到五種狀態標籤：

| 活動 | 發起者 | 活動時間 | 報名期間 | 名額 | 有效報名 | 狀態 | 為什麼放它 |
|------|--------|----------|----------|-----:|---------:|------|-----------|
| 新生入學說明會 | 管理員 | 30 天前 | 未設 | 200 | 1 | 活動已結束 | 名額還有空位也不能報名 |
| 春季校園路跑 | 管理員 | 3 天後 | 30 天前～1 天前 | 300 | 1 | 報名已截止 | 活動還沒開始，報名卻已截止——**兩個時間點是獨立的** |
| 系學會迎新茶會 | 一般使用者 | 7 天後 | 未設 | 2 | 2 | 名額已滿 | 名額只算 `registered` 的報名 |
| 生成式 AI 實作工作坊 | 管理員 | 30 天後 | 7 天後～28 天後 | 40 | 0 | 尚未開放 | 唯一會隨時間自動變成可報名的狀態 |
| 期末專題成果發表會 | 一般使用者 | 14 天後 | 未設 | 40 | 1 | 可報名 | 未設報名期間；另含一筆 `user@example.com` 已取消的報名 |

六筆報名紀錄的分佈：`user@example.com` 報名了前三場，另有一筆期末專題成果發表會的已取消紀錄；`admin@example.com` 報名了系學會迎新茶會與期末專題成果發表會；`disabled@example.com` 沒有任何報名。

**表中的「30 天前」「3 天後」都是相對於資料庫建立的那一刻。** 種子資料的時間是建立資料庫時用 `datetime('now', '±N days')` 換算出來的，不是寫死的日期。資料庫用得越久，五筆活動就會陸續變成「活動已結束」；重置資料庫之後就會回來。

要回到初始狀態：本機執行的話，照〈重置資料庫〉刪掉資料庫檔後重新啟動；Docker 執行的話，用 `docker compose down -v` 清除資料後再 `docker compose up -d`。

---

## 活動狀態與權限

### 活動狀態

活動狀態**沒有存在資料表裡**，是每次顯示時依「時間」與「名額」現算出來的。五種狀態互斥，判斷順序即優先序：

| 順序 | 狀態 | 條件 | 畫面標籤 |
|:--:|------|------|---------|
| 1 | `ended` | 活動時間已過 | 活動已結束 |
| 2 | `closed` | 報名截止時間已過 | 報名已截止 |
| 3 | `not_open` | 報名開始時間未到 | 尚未開放 |
| 4 | `full` | 有效報名數 ≥ 名額 | 名額已滿 |
| 5 | `available` | 以上皆不符合 | 可報名 |

**只有「可報名」的活動接受報名。** 判斷寫在 `blueprints/events/__init__.py` 的 `_event_status()`，狀態轉移圖見規格書 §6.5。

### 身分與關係

本系統有兩種**身分**與一種**關係**：

| 概念 | 判定 | 取得方式 |
|------|------|---------|
| 管理員 | `role == 0` | 由既有管理員指定 |
| 一般使用者 | `role == 1` | 新申請帳號的預設值 |
| 活動發起者 | `user.id == event.user_id` | **建立一場活動就成為那場活動的發起者** |

「活動發起者」不是角色而是關係——同一個人對 A 活動是發起者，對 B 活動就不是。權限不只看「你是誰」，也看「這筆資料是不是你的」。

| 動作 | 訪客 | 一般使用者 | 活動發起者 | 管理員 |
|------|:--:|:--:|:--:|:--:|
| 瀏覽活動、檢視公開報名名單 | ✅ | ✅ | ✅ | ✅ |
| 新增活動 | ❌ | ✅ | ✅ | ✅ |
| 報名／取消／修改自己的報名 | ❌ | ✅ | ✅ | ✅ |
| 修改／刪除活動 | ❌ | ❌ | ✅（限自己的） | ✅（任何一場） |
| 檢視完整報名名單 | ❌ | ❌ | ✅（限自己的） | ✅（任何一場） |
| 會員管理 | ❌ | ❌ | ❌ | ✅ |

公開報名名單只顯示報名者與報名時間；發起者與管理員看到的完整名單另外包含聯絡資訊與已取消的紀錄。

### 報名規則

- 一人一場活動只能有一筆有效報名，報名時要選用餐選項（不用餐、葷食、素食），聯絡資訊選填
- 取消報名之後可以重新報名，系統會**恢復原本那一列**，而不是新增第二筆
- 活動被刪除後，報名紀錄仍保留在報名者的「我的報名」中，並標示活動已撤銷
- 修改活動時，名額不可低於目前的有效報名人數

---

## 建議的第一個練習：取消與重新報名

1. 以 `user@example.com` 登入，進入「校園活動報名」，確認列表上看得到五種狀態標籤（看不到的話，先重置資料庫）
2. 點選「系學會迎新茶會」，狀態是「名額已滿」（名額 2 人，已有 2 人報名）。這場活動的發起者就是你，所以看得到「修改活動」按鈕與完整報名名單
3. 取消自己的報名。**回到列表，狀態變成「可報名」**——沒有任何人去改狀態，名額一釋出，狀態就自己變了
4. 再報名一次，狀態回到「名額已滿」
5. 點選「新生入學說明會」，它的發起者是管理員。**同一個帳號，這一場就看不到「修改活動」按鈕**
6. 點選「期末專題成果發表會」，你之前取消過這一場的報名。重新報名後，用下一節的查詢看 `registrations` 表：**報名紀錄還是六筆**，原本那一列的狀態從 `cancelled` 改回 `registered`

第 3 步與第 6 步最值得想清楚。第 3 步說明活動狀態不存在資料表裡；第 6 步說明為什麼資料庫刻意不加 `UNIQUE(event_id, user_id)`——這個取捨與它的代價（KI-11，兩個人同時搶最後一個名額可能超收）見規格書 §2.2 與 §11.2。

---

## 直接檢視資料庫

系統分析很重要的一環，是能夠對照「畫面上看到的東西」與「資料庫裡實際存的東西」。這一節說明資料庫檔在哪裡、用什麼工具打開，以及幾個值得先跑跑看的查詢。

### 檔案在哪裡

| 執行方式 | 位置 |
|---------|------|
| 本機（`python app.py`） | 專案根目錄的 **`database.db`** |
| Docker | 容器內的 `/app/data/database.db`，實體存放在 Docker 的 named volume `db_data` |

本機的 `database.db` 隨儲存庫一起提供，內容是種子資料；刪掉之後，系統下次啟動會重新建立。Docker 的資料庫則是容器第一次啟動時另外建立的，和資料夾裡的 `database.db` 是兩個獨立的檔案，在其中一邊做的操作不會出現在另一邊。

每個人的資料庫都是自己電腦上的一份，你在上面做的任何操作都不會影響別人。

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

**容器必須是啟動狀態**（先 `docker compose up -d`），否則會找不到來源。複製出來的檔案會蓋掉專案根目錄原本的 `database.db`，之後用下面任何一種工具打開它即可。

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
.schema registrations            -- 看報名紀錄表的完整 CREATE TABLE 語句
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

for row in conn.execute('SELECT id, event_title, event_datetime, capacity, user_id FROM events'):
    print(dict(row))

conn.close()
```

### 四張資料表

系統只有四張表，全部看完不會花太多時間：

| 資料表 | 存什麼 |
|--------|--------|
| `users` | 所有會員帳號、角色、啟用與刪除狀態 |
| `events` | 活動**主表**：標題、時間、地點、名額、報名期間、發起者 |
| `event_details` | 活動**副表**：活動內容、對象、聯絡資訊、注意事項 |
| `registrations` | 報名紀錄：報名者、報名狀態、用餐選項、聯絡資訊、取消時間 |

`events` 與 `event_details` 是一對一。拆成兩張表的理由是：活動列表一次要撈 5 筆並算出報名人數，只需要主表的欄位；四段長文字只有進到詳情頁才用得到，放在同一張表會被一併讀出卻用不到。詳細理由見 [document/system-spec.md](document/system-spec.md) §6.1.1。

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

**找找看活動狀態存在哪裡**

```sql
SELECT id, event_title, event_datetime, registration_start_at, registration_end_at, capacity
FROM events;
```

找不到任何「狀態」欄位——畫面上的五種狀態，都是程式拿這幾個時間欄位和現在的時間比較、再加上報名人數算出來的。報名期間沒設的活動，`registration_start_at` 與 `registration_end_at` 是 `NULL`。

注意這裡的時間是 UTC（比台灣時間慢 8 小時），程式判斷狀態時用的卻是電腦的本機時間。這個不一致記錄在規格書 KI-13。

**看一場活動怎麼跨兩張表**

```sql
SELECT e.id, e.event_title, e.capacity, d.event_target, d.event_contact
FROM events e
JOIN event_details d ON d.event_id = e.id;
```

每一場活動在兩張表裡各有一列，用 `event_id` 對起來。

**看報名紀錄的狀態**

```sql
SELECT id, event_id, user_id, registration_status, meal_type, cancelled_at
FROM registrations;
```

`meal_type` 是 `0`（不用餐）、`1`（葷食）、`2`（素食）。有一列是 `cancelled`，而且 `cancelled_at` 有填時間——取消報名不會刪掉資料，只是改狀態。

**重現活動列表上的報名人數**

```sql
SELECT e.id, e.event_title, e.capacity, COUNT(r.id) AS 有效報名數
FROM events e
LEFT JOIN registrations r
       ON r.event_id = e.id AND r.registration_status = 'registered' AND r.is_deleted = 0
WHERE e.is_deleted = 0
GROUP BY e.id
ORDER BY e.event_datetime ASC;
```

這段 SQL 幾乎就是 `db/events.py` 的 `list_events()` 在做的事，一次就算出每一場活動的報名人數。試著把 `r.registration_status = 'registered' AND r.is_deleted = 0` 從 `ON` 搬到 `WHERE`，再跑一次：還沒有人報名的「生成式 AI 實作工作坊」會整列消失。這兩種寫法的差別見規格書 §6.7。

**驗證重新報名不會新增一列**

做完〈建議的第一個練習〉第 6 步後執行：

```sql
SELECT id, event_id, user_id, registration_status, cancelled_at
FROM registrations
WHERE event_id = 5 AND user_id = 1;
```

還是同一個 `id`，`registration_status` 從 `cancelled` 變回 `registered`，`cancelled_at` 清回 `NULL`。

**驗證軟刪除**

先在系統畫面上用發起者或管理員身分刪除一場活動，然後回來執行：

```sql
SELECT id, event_title, is_deleted FROM events;
SELECT event_id, is_deleted FROM event_details;
SELECT id, event_id, registration_status, is_deleted FROM registrations;
```

會發現活動與副表的那筆資料**還在**，只是 `is_deleted` 變成 `1`；那場活動的報名紀錄則完全沒變。系統從來不真的執行 `DELETE`，而且刻意不動報名紀錄（見規格書 KI-12）。

### 觀察就好，不要直接改

**建議只讀不寫。** 資料庫可以隨意查詢，但要改資料請透過系統的畫面操作。

原因是很多規則寫在程式裡而不是資料庫裡。舉例來說，「一人一場活動只能有一筆有效報名」「只有可報名的活動接受報名」「只有發起者或管理員能修改活動」「管理員不能停用自己的帳號」這些規則都是 Python 程式在檢查的，資料庫本身完全不知道有這回事——這個系統的四張表連外鍵約束都沒有（見規格書 KI-20），報名表也刻意不加 UNIQUE 約束。直接下 SQL 可以輕易做出系統本身永遠不會產生的狀態，之後就很難判斷你看到的行為是系統的設計，還是自己改壞的。

另外兩點：

- **伺服器執行中不要改資料庫**，容易與正在進行的寫入衝突
- 改壞了不用緊張，照〈重置資料庫〉刪掉資料庫檔後重新啟動，就會回到乾淨的初始狀態

如果你的目的是「想知道改了某個欄位系統會怎麼反應」，那正是值得做的實驗——但請在改之前先想好預期會發生什麼，改完再回頭驗證，這樣才有分析的價值。

---

## 執行測試

```bash
pytest                                  # 執行全部 152 個測試
pytest tests/test_events.py -v          # 只執行活動報名的測試
pytest -k "register"                    # 執行名稱含 register 的測試
```

測試不會動到 `database.db`——每個測試函式都會建立自己的暫存資料庫。

---

## 給開發者

專案的模組職責、開發規範、已知技術債清單見：

- [CLAUDE.md](CLAUDE.md) — 專案速查、路由總表、權限模型、CSS 規範
- [rules/flask-blueprint.md](rules/flask-blueprint.md) — Blueprint 路由與表單的實作規範
- [rules/database.md](rules/database.md) — `db/` 套件、transaction、軟刪除的實作規範
- [tests/CLAUDE.md](tests/CLAUDE.md) — 測試撰寫指引
- [document/system-spec.md](document/system-spec.md) 第 11 章 — 已知技術債，含每一條的接受理由與修補方向；§11.5 是三項刻意做強的地方

程式碼刻意保留多項技術債作為教材，**不適合直接用於正式環境**。
