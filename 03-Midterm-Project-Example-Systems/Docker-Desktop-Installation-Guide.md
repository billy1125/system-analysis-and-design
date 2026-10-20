# Docker Desktop 安裝指南：Windows 與 macOS

> 更新日期：2026-10-20  
> 適用對象：第一次安裝 Docker Desktop 的 Windows、macOS 使用者。  
> 本文件以 Linux 容器為主要使用情境；實際支援的作業系統版本與安裝畫面可能隨 Docker Desktop 更新而變動。

## 1. Docker Desktop 是什麼？

Docker Desktop 是在個人電腦上建立、執行及管理容器（Container）的應用程式。它包含 Docker Engine、Docker CLI、Docker Compose 與圖形管理介面。容器可以封裝應用程式及其相依環境，減少不同電腦間的執行環境差異。

Docker 容器通常使用 Linux 核心功能。因此，在 Windows 與 macOS 上執行 Linux 容器時，需要額外的 Linux 執行環境，但兩個平台的處理方式不同：

| 項目 | Windows | macOS |
| --- | --- | --- |
| 主要方式 | WSL 2 後端（建議） | Docker Desktop 管理的 Linux 虛擬機 |
| 需要安裝 WSL 2 | 是，採用 WSL 2 後端時 | 不需要，WSL 是 Windows 的功能 |
| 必須自行安裝 Ubuntu | 不必 | 不必 |
| 適用處理器 | 依官方支援清單選擇 x86_64 或 Arm 版本 | Apple Silicon 或 Intel |
| 管理工具 | Docker Desktop、PowerShell | Docker Desktop、Terminal |

### 1.1 為什麼 Windows 通常要先安裝 WSL 2？

WSL（Windows Subsystem for Linux）是 Windows 提供的 Linux 執行環境。WSL 2 使用真正的 Linux 核心，Docker Desktop 可以透過 WSL 2 後端執行 Linux 容器，不必由使用者另行安裝完整的 Linux 作業系統。

須區分以下三件事：

- **WSL 2**：Windows 的 Linux 執行基礎，是本指南採用的 Docker Desktop 後端。
- **Ubuntu**：可選擇安裝在 WSL 內的 Linux 發行版；只有執行 Docker 容器，不一定需要 Ubuntu。
- **Docker Desktop**：安裝在 Windows 的容器管理工具；會管理它自己的 WSL 執行環境。

WSL 2 並非 Windows 上唯一的 Docker 後端。Docker Desktop 也提供其他虛擬化後端，但一般初學者使用 Linux 容器時，建議先使用預設的 WSL 2 後端。

## 2. Windows 安裝流程

### 2.1 安裝前檢查

建議先確認：

1. 使用 Docker 官方目前支援且仍在 Microsoft 支援期內的 Windows 版本。官方 WSL 2 x86_64 文件列出的最低版本包括 Windows 11 23H2（組建 22631）與 Windows 10 22H2（組建 19045）的指定版本；實際是否可安裝仍取決於版本、版本類型與支援期限。
2. 電腦至少具備 **8 GB RAM**，並使用符合 WSL 2 要求的處理器。
3. 已在 BIOS／UEFI 啟用硬體虛擬化（Intel VT-x 或 AMD-V 等）。
4. WSL 版本至少為 **2.1.5**。
5. 具備必要的 Windows 管理員權限，以便首次啟用 WSL 功能。

> Windows Home 亦可用於支援的 Linux 容器情境，但 Windows 容器與部分安裝後端有限制。不要將「可執行 Linux 容器」等同於「支援所有 Windows 容器功能」。

可在 PowerShell 執行 `winver`，查看目前 Windows 版本。也可開啟「工作管理員 → 效能 → CPU」，檢查「虛擬化」是否已啟用。

### 2.2 安裝 WSL 2

以**系統管理員身分**開啟 PowerShell，執行：

```powershell
wsl --install --no-distribution
```

這個指令安裝 WSL 所需元件，但**不額外安裝 Ubuntu**。依畫面提示重新啟動 Windows。

若同時需要 Ubuntu 終端機作為開發環境，可改用：

```powershell
wsl --install
```

這個指令通常會安裝 WSL 與預設的 Ubuntu 發行版。若 WSL 已經安裝，`wsl --install` 的行為可能不同，應先查詢目前狀態。

### 2.3 更新及檢查 WSL

重新開機後，以 PowerShell 執行：

```powershell
wsl --update
wsl --version
wsl --status
```

重點是確認 `wsl --version` 能顯示版本資訊，且 WSL 版本符合 Docker Desktop 的最低要求。

如果使用者另有安裝 Ubuntu，可以執行：

```powershell
wsl --list --verbose
```

顯示清單中的 `VERSION` 欄位是該 Linux 發行版使用的 WSL 架構版本（1 或 2），**不是** `wsl --version` 所顯示的 WSL 軟體版本。沒有自行安裝 Ubuntu 時，不必強求清單中出現 Ubuntu。

### 2.4 下載及安裝 Docker Desktop

1. 開啟 [Docker Desktop 官方 Windows 安裝文件](https://docs.docker.com/desktop/setup/install/windows-install/)。
2. 選擇符合處理器架構的 Windows 安裝程式。
3. 執行下載的 `Docker Desktop Installer.exe`。
4. 一般使用者選擇預設的 **Per-user installation**。它使用 WSL 2 後端，通常不需要管理員權限來安裝或更新 Docker Desktop；但第一次啟用 WSL 仍可能需要管理員權限。
5. 若安裝程式顯示後端選項，選擇 **Use WSL 2 instead of Hyper-V**。若只有一種可用後端，安裝程式可能自動選擇。
6. 完成安裝並依提示重新啟動或登入。

> 若必須執行 **Windows containers**，要另外檢查 Windows 版本、權限與 Docker Desktop 安裝模式。此需求與一般 Linux 容器不同，不適用直接照抄本指南的預設選項。

### 2.5 首次啟動與確認設定

1. 從開始功能表開啟 **Docker Desktop**。
2. 閱讀並接受適用的授權條款。
3. 等待 Docker Engine 啟動完成。
4. 若設定頁面提供此選項，進入 **Settings → General**，確認使用 WSL 2 後端。設定名稱或是否顯示，可能因版本與安裝模式不同。
5. 若已安裝 Ubuntu 且希望在 Ubuntu 終端機使用 Docker，才需要額外檢查 **Settings → Resources → WSL Integration**。沒有 Ubuntu 時，這一步可略過。

## 3. macOS 安裝流程

### 3.1 macOS 為什麼不需要 WSL？

WSL 是 Windows 專用的功能，macOS 不會使用 WSL 2。macOS 雖然屬於 Unix 系統，但沒有 Linux 核心。因此 Docker Desktop 會在背景管理 Linux 虛擬機，讓使用者能夠執行 Linux 容器。一般使用者不需要自行建立或安裝 Ubuntu 虛擬機。

### 3.2 安裝前檢查

1. 使用 Docker 官方支援的 macOS 版本。原則上支援**目前及前兩個主要 macOS 版本**，確切版本應以安裝當下的官方頁面為準。
2. 至少 **4 GB RAM**。
3. 確認處理器為 **Apple Silicon**（M 系列）或 **Intel**，並下載正確的安裝版本。
4. 安裝或更新前先關閉可能在背景使用 Docker 的工具，例如 VS Code 或正在操作 Docker 的終端機。

可從左上角 **Apple 選單 → 關於這台 Mac**，查看晶片或處理器資訊。

#### Apple Silicon 是否必須安裝 Rosetta 2？

**不是必要條件。** Docker 官方表示 Rosetta 2 已不再是 Docker Desktop 的必備元件，但部分使用 Darwin/AMD64 的選用命令列工具仍可能需要。若實際使用情境需要，可在 Terminal 執行：

```bash
softwareupdate --install-rosetta
```

Intel Mac 不需要安裝 Rosetta 2。

### 3.3 下載 Docker Desktop

1. 開啟 [Docker Desktop 官方 macOS 安裝文件](https://docs.docker.com/desktop/setup/install/mac-install/)。
2. 依電腦晶片，選擇 **Mac with Apple silicon** 或 **Mac with Intel chip**。
3. 下載 `Docker.dmg`。

### 3.4 安裝並啟動

1. 雙擊 `Docker.dmg`，開啟磁碟映像檔。
2. 將 Docker 圖示拖曳到 **Applications（應用程式）** 資料夾。
3. 開啟 `/Applications/Docker.app`。
4. 閱讀並接受 Docker Desktop 授權條款。
5. 等待 Docker Desktop 啟動完成。

目前的 Docker 官方文件指出，預設安裝組態可在沒有額外特權設定的情況下執行。較舊版本可能會顯示 **Use recommended settings** 或 **Use advanced settings** 的選擇畫面；以實際安裝版本為準。

### 3.5 命令列環境檢查

開啟 **Terminal（終端機）**：

```bash
docker --version
docker compose version
```

如果顯示 `command not found: docker`，先確認 Docker Desktop 已完成首次啟動，再檢查 Docker Desktop 的 **Settings → Advanced** 內命令列工具與 `PATH` 相關設定。不要在未確認安裝位置前任意修改系統路徑。

## 4. Windows 與 macOS 共用的安裝驗證

以下測試在 **Windows PowerShell** 或 **macOS Terminal** 都可執行；執行前請先啟動 Docker Desktop。

### 4.1 確認 CLI 版本

```bash
docker --version
```

此指令只能證明 Docker CLI 已可執行，**不能**單獨證明 Docker Engine 正常運作。

### 4.2 確認 Docker Engine

```bash
docker info
```

若能正常顯示 Server 相關資訊，代表 CLI 已可與 Docker Engine 通訊。若出現無法連線至 daemon 的訊息，先檢查 Docker Desktop 是否已啟動。

### 4.3 執行第一個容器

```bash
docker run --rm hello-world
```

Docker 會在本機沒有映像檔時嘗試下載 `hello-world` 映像檔，建立並執行容器。出現下列訊息即表示這項基本測試成功：

```text
Hello from Docker!
```

完成後，`--rm` 會移除已結束的測試容器。

### 4.4 確認 Docker Compose

```bash
docker compose version
```

Docker Compose 用來透過設定檔管理多個容器，例如同時啟動網頁伺服器與資料庫。請使用目前的 `docker compose` 語法，不必另外安裝舊式的 `docker-compose` 工具。

## 5. 常見問題與處理方式

### 5.1 Windows：WSL 版本過舊

先執行：

```powershell
wsl --update
wsl --version
```

如果無法更新，參考 [Microsoft WSL 安裝文件](https://learn.microsoft.com/zh-tw/windows/wsl/install)；受組織政策限制時，可能需要 IT 管理員協助。

### 5.2 Windows：虛擬化未啟用

若 Docker Desktop 顯示 virtualization 相關錯誤，先檢查工作管理員是否顯示虛擬化已啟用。若未啟用，通常須進入 BIOS／UEFI 設定。各品牌操作位置不同，應以該電腦官方文件為準。

### 5.3 Windows：已安裝 Ubuntu，還需要重新安裝嗎？

不用。可保留現有 Ubuntu，並用以下指令確認它是否使用 WSL 2：

```powershell
wsl --list --verbose
```

若某個發行版仍使用 WSL 1，且需要將該發行版改為 WSL 2，可依 Microsoft 官方指引使用 `wsl --set-version`；不要在未確認相容性與資料備份前隨意轉換既有開發環境。

### 5.4 macOS：下載了不正確的版本

Apple Silicon 與 Intel 的安裝檔不同。先查看「關於這台 Mac」，再至官方下載頁面取得符合晶片的版本。

### 5.5 macOS：提示 Docker.app is damaged

不要直接關閉 macOS 安全機制。改依 [Docker 官方 macOS 安裝文件](https://docs.docker.com/desktop/setup/install/mac-install/) 的故障處理連結進行檢查，並確認安裝檔來自官方來源。

### 5.6 `docker run hello-world` 無法下載映像檔

可能是網路、代理伺服器、DNS 或 Docker Hub 存取限制。應先確認 Docker Engine 正常啟動，再針對錯誤訊息檢查網路連線；不要把映像檔下載失敗直接判定為 WSL 或 Docker 安裝失敗。

### 5.7 CLI 存在，但無法連到 Docker Engine

`docker --version` 正常但 `docker info` 失敗時，優先確認 Docker Desktop 是否已啟動、引擎是否完成初始化，以及目前的 Docker context 是否正確。

```bash
docker context ls
```

若曾經設定其他遠端 Docker 主機或開發環境，可能正在使用非預期的 context。

## 6. 授權與使用限制

Docker Desktop 的授權條款與 Docker Engine 的開放原始碼授權不同。依 Docker 官方安裝文件，個人使用、教育用途、非商業開源專案，以及同時符合**員工少於 250 人且年營收低於 1,000 萬美元**的小型企業，通常可免費使用 Docker Desktop。較大型企業的商業用途及政府機構等情境，可能需要付費訂閱。實際適用資格應以最新 [Docker Subscription Service Agreement](https://www.docker.com/legal/docker-subscription-service-agreement/) 為準。

## 7. 安裝完成檢查表

### Windows

- [ ] Windows 版本與硬體符合 Docker 官方要求。
- [ ] CPU 虛擬化已啟用。
- [ ] WSL 2 安裝完成，且 WSL 軟體版本符合要求。
- [ ] Docker Desktop 已安裝並啟動。
- [ ] `docker info` 可取得 Server 資訊。
- [ ] `docker run --rm hello-world` 成功執行。
- [ ] `docker compose version` 正常顯示版本。

### macOS

- [ ] macOS 版本符合官方支援範圍。
- [ ] 已選擇與 Apple Silicon／Intel 相符的 Docker Desktop 安裝檔。
- [ ] Docker Desktop 已安裝並啟動。
- [ ] Terminal 可執行 `docker` 指令。
- [ ] `docker info` 可取得 Server 資訊。
- [ ] `docker run --rm hello-world` 成功執行。
- [ ] `docker compose version` 正常顯示版本。

## 8. 官方參考資料

1. Docker. [Install Docker Desktop on Windows](https://docs.docker.com/desktop/setup/install/windows-install/).
2. Docker. [Install Docker Desktop on Mac](https://docs.docker.com/desktop/setup/install/mac-install/).
3. Microsoft. [安裝 WSL](https://learn.microsoft.com/zh-tw/windows/wsl/install).
4. Microsoft. [WSL 的基本命令](https://learn.microsoft.com/zh-tw/windows/wsl/basic-commands).
5. Docker. [Docker Desktop documentation](https://docs.docker.com/desktop/).
6. Docker. [Docker Subscription Service Agreement](https://www.docker.com/legal/docker-subscription-service-agreement/).
