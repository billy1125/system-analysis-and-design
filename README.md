# 系統分析與設計（System Analysis and Design, SAD）

元智大學工業工程與管理學系「系統分析與設計」（課號 IE226，115-1）的課程規範與教材，以繁體中文撰寫、以 Markdown 維護。課程採專題導向，不考試，用兩份小組報告、一次個人訪談與一份個人報告檢核學習成果。授課老師、上課時間與聯絡方式見[SAD 課程介紹](00-Course-Introduction/Course-Introduction.md)。

> **建議在第二週上課前，把〈基本規範〉與〈期中期末報告說明〉讀過一遍。**

---

## 📚 這裡有哪些文件

### 基本規範

| 文件 | 內容 |
|---|---|
| [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md) | 課程設定：配分、報告概要、出席與扣考、AI 工具使用揭露 |
| [課程介紹投影片](00-Course-Introduction/Course-Introduction.slides.md) | 第一週上課用的投影片 |
| [課程進度表](00-Course-Introduction/Course-Schedule.md) | 18 週的主題、報告日期與繳交期限 |
| [分組規範](00-Course-Introduction/Group-Rules.md) | 組隊、分工紀錄與組員變動 |

### 期中期末報告說明

| 文件 | 內容 |
|---|---|
| [報告內容](00-Course-Introduction/Report-Contents.md) | 各項報告要交出哪些內容 |
| [報告內容投影片](00-Course-Introduction/Report-Contents.slides.md) | 報告內容的期末部分，投影片版 |
| [報告規範](00-Course-Introduction/Report-Rules.md) | 怎麼交、什麼時候交 |
| [報告評量 Rubrics](00-Course-Introduction/Rubrics.md) | 怎麼評分 |
| [成績計算規範](00-Course-Introduction/Grading-Rules.md) | 學期成績與扣分怎麼算 |
| [額外投入加分](00-Course-Introduction/Bonus-Rules.md) | 唯一的加分機制，不看不影響成績 |

### 參考文件

| 文件 | 內容 |
|---|---|
| [參考題庫](00-Course-Introduction/Question-Bank.md) | 口頭報告與個人訪談的提問方向 |
| [課程規範理解測驗](00-Course-Introduction/Course-Rules-Quiz.md) | 自我檢核用的是非題，不計分、不繳交 |

### 期中與期末報告

| 階段 | 從這裡開始 | 內容 |
|---|---|---|
| 期中（系統分析） | [期中分析範例系統](03-Midterm-Project-Example-Systems/README.md) | 要分析的系統、範例報告與說明 |
| 期末（系統分析與修改建議） | [期末題目](05-Final-Project-Topics/README.md) | 五題的既有系統與修改需求提案書；要交什麼與範例報告見[報告內容](00-Course-Introduction/Report-Contents.md)〈二〉 |

### 教材正文

上課講的課文，依編號順序授課，投影片是課文的濃縮版。哪一週講哪一章，見[課程進度表](00-Course-Introduction/Course-Schedule.md)。

| # | 文件 | 投影片 | 內容 |
|---|---|---|---|
| 1 | [系統分析與設計導論](01-Course-Materials/01-Systems-and-Analysis.md) | [投影片](01-Course-Materials/01-Systems-and-Analysis.slides.md) | 共同語彙、系統開發生命週期與方法論 |
| 2 | [問題定義與現況分析](01-Course-Materials/02-Problem-Definition.md) | [投影片](01-Course-Materials/02-Problem-Definition.slides.md) | 問題定義、目標與成功指標 |
| 3 | [使用者分析](01-Course-Materials/03-User-Analysis.md) | [投影片](01-Course-Materials/03-User-Analysis.slides.md) | 利害關係人、需求收集、使用案例圖 |
| 4 | [系統需求分析](01-Course-Materials/04-System-Requirements-Analysis.md) | [投影片](01-Course-Materials/04-System-Requirements-Analysis.slides.md) | 功能需求與非功能需求的寫法 |
| 5 | [功能分析](01-Course-Materials/05-Functional-Analysis.md) | [投影片](01-Course-Materials/05-Functional-Analysis.slides.md) | 系統邊界、功能分解與模組劃分 |
| 6 | [行為建模](01-Course-Materials/06-Behavioral-Modeling.md) | [投影片](01-Course-Materials/06-Behavioral-Modeling.slides.md) | 活動圖、循序圖、狀態機圖 |
| 7 | [資料建模與資料庫設計](01-Course-Materials/07-Data-Modeling.md) | [投影片](01-Course-Materials/07-Data-Modeling.slides.md) | ERD、正規化、資料字典 |
| 8 | [系統環境與架構](01-Course-Materials/08-System-Architecture.md) | — | 系統放在哪裡、和誰連 |
| 9 | [可行性、限制與風險分析](01-Course-Materials/09-Feasibility-and-Risk.md) | — | 效益評估、作業衝擊、資料轉換與上線切換 |
| 10 | [物件建模](01-Course-Materials/10-Object-Modeling.md) | — | 概念類別圖，以及它和 ERD 的差別 |
| 11 | [系統介面與資料交換設計](01-Course-Materials/11-System-Interface-and-Data-Exchange.md) | — | 系統之間的資料交換 |
| 12 | [使用者介面設計](01-Course-Materials/12-UI-Design.md) | — | 從需求與流程推出畫面 |
| 13 | [系統設計規格與追溯](01-Course-Materials/13-Design-Specification.md) | — | 修改建議書的結構、追溯鏈與測試案例 |

---

## 🔄 文件版本

文件有異動時會在課程 **LINE 群組** 公告，以儲存庫中的最新版本為準，修訂內容見 [commit 紀錄](../../commits/main)。

---

## 🖥️ 請用電腦的瀏覽器閱讀

> **用手機看，很容易漏掉會影響你成績的規則。**

- 期限、扣分與曠課規定多半寫在表格裡，手機要橫向滑動才看得到右邊幾欄。
- 流程圖（Mermaid）在手機上可能顯示不出來。
- 投影片檔（`.slides.md`）是 [Marp](https://marp.app/) 格式，用 VS Code 的 **Marp for VS Code** 擴充套件開啟，或到 Portal 下載 PDF 版本。

---

## 🤖 這份教材是怎麼做出來的

| 項目 | 說明 |
|---|---|
| 使用工具 | Anthropic 的 Claude（透過 Claude Code 使用，Opus 系列模型） |
| 使用目的 | 章節草稿撰寫、文字整理與潤稿、跨文件的一致性檢查與交叉引用比對 |
| 使用範圍 | 各章教材正文與投影片、兩組範例報告、課程規範文件與本檔的文字，以及以 PlantUML 繪製的 UML 圖原始碼；其餘圖表與截圖不在此列 |
| 人工查核與修改 | 課程設定、規則、日期、配分、評分標準與所有教學上的取捨，一律由老師決定；AI 產出的每一段都經老師閱讀、修改或重寫後才提交，未經審閱的內容不會出現在這裡 |

**發現錯誤請告訴老師。** 錯字、前後矛盾、連結點不開、日期或分數對不上，都算。修課同學直接在課堂上、Office Hour 或 LINE 群組講；校外讀者可以在本儲存庫開 Issue。文件很長，交叉引用又多，一定有漏掉的地方，收到就會更正。

---

## 📄 授權與使用聲明

本儲存庫的教材與文件採 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hant)**（姓名標示—非商業性—相同方式分享）授權：

- **姓名標示**：使用時請標明出處與作者。
- **非商業性**：不得用於商業用途。
- **相同方式分享**：若改作或加以轉換，須以相同授權條款散布。

### 授權例外

以下項目不適用上述 CC BY-NC-SA 授權，改依表中各自的授權條款：

| 項目 | 作者 | 授權 | 位置 |
|---|---|---|---|
| 期中範例系統的程式碼與系統文件 | Cho-Hsun Lu | MIT | [`03-Midterm-Project-Example-Systems/`](03-Midterm-Project-Example-Systems/)（LICENSE 置於該資料夾內，涵蓋底下六套系統） |
| 期末題目系統的程式碼與系統文件 | Cho-Hsun Lu | MIT | [`05-Final-Project-Topics/Example-Systems/`](05-Final-Project-Topics/Example-Systems/)（LICENSE 置於該資料夾內，涵蓋底下七套系統） |
| `speak-human-tw` skill | Raymond Hou | MIT | [`.claude/skills/speak-human-tw/`](.claude/skills/speak-human-tw/)（原始 LICENSE 保留於該資料夾內） |
