# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

元智大學「系統分析與設計」（課號 IE226）的課程教材儲存庫，修課對象為工業工程與管理系學生，所有內容以 **繁體中文（台灣用語）** 撰寫。

專案只有 Markdown 文件，沒有 build／lint／test 指令可執行。驗證方式是人工檢視：正文在 GitHub 或 Markdown 預覽工具中看排版，投影片（`.slides.md`）用 VS Code 的 Marp for VS Code 擴充套件預覽。

**檔案常在對話之外被直接修改**，動手前先確認 `git status`，不要假設脈絡裡的檔案內容是最新的。

## 資料夾架構

| 資料夾 | 說明 |
|---|---|
| `00-Course-Introduction/` | 課程規範與參考文件，採描述性英文檔名 |
| `01-Course-Materials/` | 教材正文，檔名格式 `編號-主題.md`，兩位數編號即授課順序（規則見 `temp/TEXTBOOK-PLAN.md`〈一〉） |
| `02-Project-Topics/` | 期末設計題目說明書，一題一份，加一份 `README.md` 當索引。**是題目說明不是參考答案**：只給情境、名詞、角色、單據生命週期與設計難點，不給 ERD、資料表、模組清單與畫面線框 |
| `03-example-reports/` | 只放範例報告與各自的說明。分析階段示範用的範例系統 `sad-forum` **不在本專案內**，它是獨立儲存庫 <https://github.com/billy1125/sad-forum>；需要對照原始碼時自行 clone 到專案外，不要放進 `03-example-reports/` |
| `reference/` | 長期保留的範本與撰寫規範，是全專案的格式基準，會隨慣例調整而更新 |
| `.claude/skills/` | Claude Code 技能，一個技能一個資料夾 |
| `temp/` | **不進版控**（已列入 `.gitignore`）。只給作者與 Claude 用的規劃與暫存文件，學生看不到，因此不得被任何版控中的文件連結。目前放 `TEXTBOOK-PLAN.md`（教材施工藍圖）與 `PROJECT-TOPICS.md`（期末選題的來由與判準） |

圖片跟著引用它的文章走，放在該文章所屬資料夾的 `images/` 底下（路徑與檔名規則見 `reference/chapter-writing-guide.md`〈五〉）。根目錄只放 `README.md` 與 `CLAUDE.md`，規劃文件收進 `temp/`，其餘文件一律收進所屬的章節資料夾。

**動筆寫任何一章教材之前，先讀 `temp/TEXTBOOK-PLAN.md`**。那份是教材的施工藍圖：章節清單、每章的小節規劃與邊界、與報告產出項目的對應、撰寫順序，以及寫完一章要連帶更新哪些檔案。寫完一章要回頭更新它的狀態欄。本檔規定課程設定與跨檔一致性，`temp/TEXTBOOK-PLAN.md` 規定章節範圍，`reference/` 規定格式。

## 文件清單

`00-Course-Introduction/` 的課程文件是同一套規則的不同切面。每份文件在自己的範圍內是事實來源，**其他文件一律引用而不重述**。`README.md` 把它們分成三類：`Course-Introduction.md` 與 `Report-Rules.md` 是「基本規範」，接著的 `Grading-Rules.md`、`Group-Rules.md`、`Rubrics.md`、`Report-Contents.md`、`Bonus-Rules.md` 是「規範細節說明」，其餘是「參考文件」。

| 檔案 | 角色 | 密切關係 |
|---|---|---|
| `Course-Introduction.md` | **課程設定的事實來源**：基本資訊、18 週進度與日期、配分、產出清單 | 產出清單由 `Report-Contents.md` 展開、由 `Rubrics.md` 評分；日期與配分要同步到 `Course-Introduction.slides.md` 與 `README.md`〈⚡ 重點速覽〉 |
| `Report-Rules.md` | **繳交規則的事實來源** | 遇到分數一律指向 `Grading-Rules.md`；期限日期須與 `Course-Introduction.md` 一致 |
| `Grading-Rules.md` | **所有分數與扣分規定的事實來源** | **不要把分數散回其他文件** |
| `Group-Rules.md` | 組隊、分工紀錄與組員變動 | 扣分指向 `Grading-Rules.md`、繳交方式指向 `Report-Rules.md` |
| `Rubrics.md` | 四個評分項目的評量規準，只處理「內容分數」；每套 Rubric 的各面向配分加總必須為 100 | 評量面向必須對得上 `Course-Introduction.md` 的產出清單與 `Report-Contents.md` 的內容清單，不評課程沒教也沒要求的東西 |
| `Report-Contents.md` | 各項報告要交出什麼內容。**列出的項目都是必做**，章節名稱可自訂；本身不含任何扣分規定 | 產出清單本身以 `Course-Introduction.md` 為準，這份是把它展開；評分標準指向 `Rubrics.md`。**不要把內容清單複製回 `Rubrics.md` 或 `Report-Rules.md`** |
| `Bonus-Rules.md` | **唯一的加分機制**，上限 3 分加在學期成績上 | 加分額度與 `Grading-Rules.md` 公式中的 $B_i$ 一致；「清單以外」的判準以 `Report-Contents.md` 為準 |
| `Question-Bank.md` | 口頭報告與個人訪談的提問方向，**是方向不是考古題** | 題型分類須與 `Report-Contents.md` 的四類題型一致 |
| `Course-Rules-Quiz.md` | 自我檢核用的是非題，不計分不繳交 | 前面各份規範的衍生物，只複述不新增規則；解答須標明出處文件與章節 |
| `Course-Introduction.slides.md` | 第一週上課用的 Marp 投影片，只放會扣分或錯過補不回來的規則 | 完整條文一律以規範文件為準 |

**改動任一條規則、扣分數字或日期後，逐一比對其餘文件的交叉引用是否同步。** 專案沒有任何自動化流程能攔截這類不一致，只能靠人工檢查。

### 其他會牽動多個檔案的動作

| 你做了什麼 | 還要一併更新 |
|---|---|
| 新增或更名課程規範文件 | `README.md`〈📚 這裡有哪些文件〉底下的〈基本規範〉〈規範細節說明〉〈參考文件〉三張表格之一，以及本檔〈文件連結慣例〉的連結標題對照表 |
| 新增或更名範例報告 | `README.md`〈📚 這裡有哪些文件〉底下的〈範例報告〉表格 |
| 改動配分、關鍵日期、繳交方式或扣分數字 | `README.md`〈⚡ 重點速覽〉——那張表是基本規範與規範細節說明的摘要，條文改了它不會自己跟著改 |
| 收錄外部來源圖片 | `README.md`〈📄 授權與使用聲明〉的授權例外表，註明來源、作者與授權條款（依 `reference/chapter-writing-guide.md`〈六〉） |
| 移植外部技能到 `.claude/skills/` | 同上授權例外表，並將原始 `LICENSE` 保留在技能資料夾內 |
| 完成一份章節正文 | 六項連動逐項見 `temp/TEXTBOOK-PLAN.md`〈六〉，其中終點章設定在本檔 |
| 新增、刪除或重排教材章節 | `temp/TEXTBOOK-PLAN.md`〈一、1.1〉權威章節清單、〈三〉章節總表與〈四〉內容概要 |
| 撰寫任何一章介紹 UML 圖的教材 | 先看 `temp/TEXTBOOK-PLAN.md`〈二〉的四張核心圖與各自的權威章節，該章要點出自己那張圖在四張裡的位置 |
| 改動 `03-example-reports/` 的範例報告說明或範例報告 | 回頭核對 `01-Course-Materials/` 對應階段的必讀標記（分析階段對 `🔴 期中必讀`，設計階段對 `🔵 期末必讀`）是否仍然成立——標記的判準就是那兩份文件，它們改了標記不會自己跟著改 |

## 撰寫規範

格式規範全部收在 `reference/`。**動筆前先讀完對應的規範文件，再複製骨架檔開始寫**：正文看 `chapter-writing-guide.md` 與 `chapter-template.md`，投影片看 `slides-design-template.md` 與 `slides-template.slides.md`。`personal-voice.md` 是語氣與筆法的蒸餾，不必每次動筆前讀，收尾潤稿或收到指示時再用。

兩邊若有衝突，**格式規則以 `reference/` 為準，課程設定以本檔為準**。

規範文件中以 `{}` 標示、指定由 `CLAUDE.md` 決定的項目，本課程的設定如下：

| 設定項 | 本課程的值 |
|---|---|
| 章節標題副標 | 不加副標，直接寫 `# {章節標題}` |
| 讀者程度 | 工業工程與管理系大學部學生，大一修過基本程式設計，具語法層次的撰寫能力，**但未修過資料結構、資料庫系統與軟體工程，尚未建立完整的系統開發概念**（需求怎麼形成、規格怎麼寫、模組怎麼切、系統怎麼交付與驗收）；資訊技術名詞一律視為需要解釋 |
| 範例取材領域 | 製造業與工業工程場域（生產排程、品管、物料與訂單流程、工廠資訊系統等），情境優先取材自學生實習或未來職場會遇到的系統 |
| 學習重點總結的固定引言 | 「讀完本章後，你應該能夠理解以下核心概念，並將其應用於工業場域的思考與決策：」 |
| 參考文獻取材 | 系統分析與設計領域的經典教科書（如 Dennis、Kendall、Pressman、Sommerville、Yourdon）與原典或里程碑論文（如 Royce 1970、Chen 1976、UML 與敏捷方法的原始文獻），各章約 20 筆以上 |
| 必讀標記 | 兩組：`🔴 期中必讀` 與 `🔵 期末必讀`，接在小節標題之後（格式見 `reference/chapter-writing-guide.md`〈七、7.1〉），同一行並列時期中在前、期末在後。**判準是該小節的產出或方法，在該階段的兩份文件中被明確要求或實際示範**——期中看 `03-example-reports/Analysis-Phase-Deliverables.md` 與 `Analysis-Phase-Sample-Report.md`，期末看 `Design-Phase-Deliverables.md` 與 `Design-Phase-Sample-Report.md`；概念相關但那兩份文件沒有真的用到的一律不標，列為可選項目的（設計類別圖、REST API 規格、部署圖等）也不標 |
| 必讀標記的章首說明 | 放在章首導言最後一則 blockquote 之後，依該章帶哪幾組標記三擇一。**三種措辭全專案一致，已寫進 `reference/chapter-template.md` 的骨架，直接貼上，不要自己重寫。** |
| 權威章節清單 | 見 `temp/TEXTBOOK-PLAN.md`〈一、1.1〉，新增章節時一併維護 |
| 終點章與銜接順序 | 授課順序即檔名編號順序，見 `temp/TEXTBOOK-PLAN.md`〈三〉章節總表。**`13-Design-Specification.md` 是全書終點章**，不加 `> **銜接提示**`；其餘各章末尾都要有銜接提示指向下一號章節 |

`03-example-reports/` 的兩份 `*-Phase-Deliverables.md` 是範例報告說明，不是教材正文：說明講「要交什麼」，教材講「怎麼做」。同一主題在兩邊都出現時，概念說明留在教材，繳交欄位與最低標準留在說明，彼此以連結互指。每份說明各配一份 `*-Phase-Sample-Report.md`，是照該說明寫完的成品，只放內容不放解說。

**兩個階段刻意用不同的示範系統，改動時不要把它們統一：** 分析階段（`Analysis-Phase-*.md`）用課堂範例系統 `sad-forum`，因為分析要對照既有系統的原始碼才驗證得出有沒有看懂；設計階段（`Design-Phase-*.md`）用**工廠訪客進出登記系統**，因為期末題目全在工廠，校園系統示範不出外部系統介接、法規對資料的限制與現場環境條件。**設計階段的文件不得再出現論壇系統的內容。**

**設計階段的示範題目刻意不在 `02-Project-Topics/` 的五題之中**，學生才抄得到結構、抄不到答案。這條界線在改題目或改範例時都要維持：五題換了要確認訪客系統仍然不重疊，範例換了要確認新題目也不在五題裡。

## 本專案自訂慣例

- **文字撰寫風格**：簡潔清晰易理解，能用 1 句話說明就不要用 5 句話，條列的內容如果敘述太多，可改用表格呈現。作者的語氣與筆法蒸餾在 `reference/personal-voice.md`，**收到「用 `reference/personal-voice.md` 調整文章」這類指示時**再讀它的〈速查〉。
- **不重複說明別的文件已有的內容**：一句話帶過，然後用連結指過去。連結怎麼寫見 `reference/chapter-writing-guide.md`〈十一〉，權威章節的取捨見〈十二〉，兩節都適用於全專案的 Markdown 文件而不只教材。
- **資料夾架構慣例**：資料夾狀況不寫進 `README.md`。

**文件連結預設以被連文件的大標題當連結文字**，只有下列文件另行指定，以本表為準：

| 檔案 | 連結標題 | 為什麼不用大標題 |
|---|---|---|
| `Course-Introduction.md` | SAD 課程介紹 | 大標題含課程全名，太長 |
| `Course-Introduction.slides.md` | 課程介紹投影片 | Marp 投影片沒有 `#` 大標 |
| `Rubrics.md` | 報告評量 Rubrics | 大標題的「規準（Rubrics）」重複 |
| `Course-Rules-Quiz.md` | 課程規範理解測驗 | 省略大標題的「（自我檢核）」 |
| `Analysis-Phase-Sample-Report.md` | 系統分析範例報告 | 大標題含範例系統名稱，會看起來像是在講那套系統而非示範文件 |
| `Design-Phase-Sample-Report.md` | 系統設計範例報告 | 同上 |
| `README.md` | SAD 課程教材 | 大標題只有課程名，看不出是什麼文件 |

新增文件時，只有在大標題不適合直接當連結文字時才登記到上表。

## Claude Code 技能（`.claude/skills/`）

- **一個技能一個資料夾**：技能的所有相依檔案（`references/`、`evals/` 等）一律收在自己的資料夾內，`SKILL.md` 的相對連結也必須指向資料夾內部，確保技能可獨立搬移。
- **授權例外**：移植自外部的技能依其原始授權使用，不適用專案 `README.md` 宣告的 CC BY-NC-SA，也不套用本檔的檔名與連結慣例。移植時保留原始 `LICENSE` 於技能資料夾內，`SKILL.md` frontmatter 保留原作者標示。
- **已安裝**：`speak-human-tw`（Raymond Hou，MIT），繁體中文去 AI 味審查與改寫，使用者說「去 AI 味」「說人話」或要求潤稿時觸發。**它強制走兩輪流程**：第一輪只列編號建議清單並停下來等回覆，收到勾選後才動筆或寫檔，不要在確認前直接輸出改寫版或覆蓋檔案。
