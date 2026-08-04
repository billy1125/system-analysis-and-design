# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

本專案為元智大學「系統分析與設計」課程的教材儲存庫，修課對象為工業工程與管理系學生。所有內容以 **繁體中文（台灣用語）** 撰寫。

本專案無建置系統、測試套件或 CI/CD 流程，目前僅包含 Markdown 文件（未來可能加入 Jupyter 筆記本），因此沒有 build／lint／test 指令可執行。驗證方式是直接在 GitHub 或 Markdown 預覽工具中檢視排版是否正確；投影片則以 VS Code 的 Marp for VS Code 擴充套件預覽。

## 目前專案狀態

本專案 **剛起步**，正式章節內容尚未開始撰寫。目前儲存庫內只有：

| 檔案 | 說明 |
|------|------|
| `00-Course-Introduction.md` | 課程介紹與課程規範，**已改寫完成**：含重點速覽、18 週進度表、配分、分組規定、兩份小組報告的產出項目、AI 工具揭露、課堂規範與申訴管道。它是課程設定的事實依據，但 **不是教材章節的寫作範本**（章節格式一律以 `reference/` 為準）。 |
| `Report-Rules.md` | 報告規範，由 `00-Course-Introduction.md` 抽出獨立。四個評分項目共通的繳交與計分規則：小組報告作為個人項目的前提（含「不計分／該部分 0 分／停止後續評分」三個詞的定義）、繳交項目與期限、遲交與檔案問題的扣分、個人報告的學術誠信（雷同一律 55 分，覆蓋 `rubrics.md` 的加總結果），以及口頭報告的規範（含組員中途退出、不可抗力補救）。**改動任一條規則時，務必同步檢查另外三份文件的交叉引用與數字**。 |
| `rubrics.md` | 四個評分項目的評量規準（Rubrics）、4 級制與百分制的換算、學期成績計算公式。**各面向的評量對象必須與 `00-Course-Introduction.md` 的期中／期末產出清單一致**——不評課程沒教也沒要求的東西。 |
| `Course-Rules-Acknowledgement.md` | 第二週課堂簽署之「課程規範確認單」的 **內容揭露**（同學實際簽的是排版後紙本）。逐條列出要確認的規則，內容須與上述規範文件保持一致。 |
| `00-Course-Introduction.slides.md` | 第一週課程介紹的 Marp 投影片，以總覽為主，只放會扣分或錯過補不回來的規則；完整條文一律指回上述兩份文件。 |
| `reference/chapter-writing-guide.md` | 教材撰寫規範全文（語言、Markdown 格式、圖片與授權、章節結構、參考文獻、學習重點總結、跨章連結）。 |
| `reference/chapter-template.md` | 章節正文骨架範本，撰寫新章節時複製本檔為 `0X-XXX.md` 開始寫。 |
| `reference/slides-design-template.md` | 投影片設計規範全文。 |
| `reference/slides-template.slides.md` | Marp 投影片骨架範本。 |
| `reference/notebook-guide.md` | 練習筆記本（`.ipynb`）撰寫規範。**本課程是否會用到練習筆記本尚未決定**，此檔先保留備用；`notebooks/` 資料夾也尚未建立，實際要出練習時再依此規範撰寫。 |
| `images/` | 目前僅含 `course-attendance-rule.png`，為 `00-Course-Introduction.md` 引用的學則截圖；尚未依文章分子資料夾。 |

課程規範類文件（如 `Report-Rules.md`、`Course-Rules-Acknowledgement.md`）採描述性英文檔名放在根目錄，不使用 `0X-` 編號——編號保留給教材章節正文。

下列項目 **尚未建立**，需要時才新增，不要假設它們已經存在：`README.md`、各章正文 `0X-XXX.md` 與投影片 `0X-XXX.slides.md`、`notebooks/`、`temp-reference/`、`.claude/skills/`。各章的格式基準以 `reference/` 下的兩份骨架範本為準；第一份實際產出的章節完成後，應回頭校正範本與實際產出之間的落差，並更新本檔案的檔案清單。

### 預期的資料夾架構

新增內容時依下列慣例建立資料夾：

| 資料夾 | 說明 |
|------|------|
| `reference/` | 長期保留的範本與規範文件（章節正文與投影片的骨架範本、撰寫規範），是全專案的格式基準，會隨慣例調整而更新 |
| `temp-reference/` | 用於生成教材的參考資料，屬一次性素材，與 `reference/` 的長期規範不同 |
| `images/` | Markdown 文件引用的圖片，依所屬文章分子資料夾 |
| `notebooks/` | 所有課程練習用的 Jupyter 筆記本，集中放置於此資料夾 |
| `.claude/skills/` | Claude Code 技能（skill），每個技能自成一個資料夾，資料夾內含 `SKILL.md` 與其相依檔案 |

## 撰寫規範與本課程設定

格式規範已全部收在 `reference/`。**動筆前先讀完對應的規範文件，再複製骨架檔開始寫**：

- 正文看 `reference/chapter-writing-guide.md` 與 `reference/chapter-template.md`
- 投影片看 `reference/slides-design-template.md` 與 `reference/slides-template.slides.md`

兩邊若有衝突，**格式規則以 `reference/` 為準，課程設定以本檔為準**。

規範文件中以 `{}` 標示、指定由 `CLAUDE.md` 決定的項目，本課程的設定如下：

| 設定項 | 本課程的值 |
|---|---|
| 課程名稱 | 元智大學「系統分析與設計」（課號 IE226），修課對象為工業工程與管理系學生 |
| 章節標題副標 | `# {章節標題}` |
| 讀者程度 | 工業工程與管理系大學部學生，**無程式設計背景**；資訊技術名詞一律視為需要解釋 |
| 範例取材領域 | 製造業與工業工程場域（生產排程、品管、物料與訂單流程、工廠資訊系統等），情境優先取材自學生實習或未來職場會遇到的系統 |
| 學習重點總結的固定引言 | 「讀完本章後，你應該能夠理解以下核心概念，並將其應用於工業場域的思考與決策：」 |
| 參考文獻取材 | 系統分析與設計領域的經典教科書（如 Dennis、Kendall、Pressman、Sommerville、Yourdon）與原典或里程碑論文（如 Royce 1970、Chen 1976、UML 與敏捷方法的原始文獻），各章約 20 筆以上 |
| 權威章節清單 | **尚未建立**。第一份章節產出後開始在本檔維護「主題 → 權威章節」對照，新增章節時一併更新 |
| 終點章與銜接順序 | **尚未決定**。章節規劃定案後在本檔寫明哪一章是終點章（不需 `> **銜接提示**`），以及各章前指哪一章 |

其餘兩條專案慣例：

- **參考資料**：要生成新內容時，優先找 `temp-reference/` 中的素材，再透過網路找尋適合的資料。
- **專案架構**：本專案資料夾架構，不要增加與更新於 `README.md` 之中。

## Claude Code 技能（`.claude/skills/`）

- **一個技能一個資料夾**：每個 skill 都自成一個獨立資料夾，該技能所有相依檔案（`references/`、`evals/` 等）一律收在此資料夾內，不散落於專案根目錄；`SKILL.md` 內的相對連結也必須指向資料夾內部，確保技能可獨立搬移。
- **技能授權例外**：移植自外部專案的技能，依其原始授權條款使用，不適用本專案 `README.md` 所宣告的 CC BY-NC-SA 授權。移植時須在技能資料夾內保留原始 `LICENSE`，`SKILL.md` frontmatter 保留原作者標示，並在 `README.md`〈📄 授權與使用聲明〉的例外項目中列明來源與授權。
