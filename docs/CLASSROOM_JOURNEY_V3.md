# Classroom Journey V3

## 1. 目的

Classroom Journey V3 將原本一次完成的長流程，改成適合 40～50 分鐘現場帶領的分段體驗。

核心節奏：

> 做一點 → 看一點 → 聊一點

目標不是讓學員在手機上把所有分析讀完，而是讓手機負責計算與保存，老師負責停頓、解讀與互動；課後再回到完整報告與 LINE 深入探索。

視覺方向採柔和療癒、溫暖有希望感的簡報式體驗，不把正式版做成陽春表單。

## 2. 課堂流程

### 第一階段｜出生結構

- 輸入出生日期
- 桌機生日欄位採 `YYYY / MM / DD` 引導式格式，4 位年份輸入後會進入月份格式，不再讓年份無限制連續輸入
- 確認是本人或陪另一位探索
- 顯示生命靈數
- 顯示簡潔版核心特質、外在互動、內在需求、目前階段
- 本人選擇：很像／有一些像／目前不太像
- 畫面明確停在課堂互動節點

### 第二階段｜RIASEC 活動偏好

- 固定 18 題，六個維度各 3 題
- 四點量尺，不設中立選項
- 題目短、口語、以實際活動為主
- 結果顯示 Top 3
- 每一個維度同時顯示：字母 + 完整名稱 + 動詞 + 活動描述
- Top 3 之後再產生一段 deterministic 個人化組合敘述，依前三名順序與分數差距組成，不等待 AI
- 組合敘述最後一定留一個真實生活驗證問題，避免只像人格標籤

統一名稱：

- R 實作型｜做
- I 研究型｜想
- A 創意型｜創
- S 助人型｜幫
- E 推動型｜帶
- C 組織型｜整

### 第三階段｜現在的你

只保留三項現場必要資訊：

- 哪一種事情做了反而比較有精神
- 目前的工作／生活大約用了多少自己的天賦
- 現在最想改善什麼（最多 2 項）

課堂版不要求文字反思，也不詢問後續探索意願。

## 3. 完成後體驗

按下「整理我的天賦快照」後：

1. 只建立一筆 canonical Assessment
2. 立即顯示 deterministic 快照
3. 保留 RIASEC Top 3 的個人化組合敘述
4. 顯示「現在最值得留意的 3 個線索」
5. AI 深度報告在背景產生，不阻塞現場流程
6. 提供「課後查看我的完整報告」入口

AI 失敗不影響 Assessment 保存。

## 4. 完整報告

`/report/latest` 依序呈現：

1. 我的出生結構
2. 我的活動偏好
3. 我現在的狀況
4. AI 綜合整理

採折疊卡片，避免手機一次顯示過長內容。

完整報告不顯示完整出生日期，也不顯示 LINE user ID、participant ID 或 raw q01～q18 map。

## 5. LINE 課後體驗

LINE 是重新找到結果與進一步探索的入口，不承載長篇完整報告。

結果卡提供：

- 查看測驗日期與摘要
- 更了解自己
- 工作與第二曲線
- 7～14 天行動實驗
- 查看我的完整報告

課堂版沒有填文字反思時，LINE 產生的 AI 對話提示詞不得顯示「尚未填寫」，而應直接要求 AI 從最近一個真實生活／工作微時刻開始追問。

`explorationInterest = 未詢問` 只表示課堂沒有問這題，不得推論學員沒有意願。

## 6. 方法邊界

- RIASEC 是活動與環境偏好，不是能力測驗
- 出生日期內容是自我反思入口，不是科學診斷或命運預測
- 不使用「命中注定、你天生就是、你一定要、命定職業」等決定論語句
- 不把多種方法加權成單一總分

核心原則：

> 沒有任何一個測驗可以定義你；當不同的鏡子反覆照到同一個地方，那裡才值得再看一看。

## 7. 隱私與資料規則

LLM 可接收：

- 衍生後的 Birth Profile / Birth Signature facts
- Life Path 數值與非決定論描述
- RIASEC scores / Top 3 / item signals
- subjective energy
- talent usage
- priorities
- age band
- 使用者主動填寫的反思（如果有）

LLM 不得接收：

- 完整出生日期
- LINE user ID
- participant ID
- display name / picture URL
- raw q01～q18 answer map

## 8. Release Gate

合併前必須全部通過：

- [x] ESLint
- [x] 112 Unit tests
- [x] TypeScript / Vite production build
- [x] Browser mock E2E：桌機完整三階段
- [x] Browser mock E2E：生日欄位 `YYYY / MM / DD` 引導格式
- [x] Browser mock E2E：18 題完整作答
- [x] Browser mock E2E：Top 3 個人化組合敘述
- [x] Browser mock E2E：只建立一筆 Assessment
- [x] Browser mock E2E：課堂版不送 fabricated reflections
- [x] Browser mock E2E：`explorationInterest` 明確記錄 `未詢問`
- [x] Browser mock E2E：手機主要 CTA 字級至少 17px
- [x] LINE adapter tests：名稱統一、移除「尚未填寫」、完整報告 CTA
- [x] GitHub Actions CI #105
- [x] Vercel Preview build READY
- [ ] 人工 Preview UAT：實際桌機／手機走一次
- [ ] Merge to main
- [ ] Production smoke test

## 9. 人工 Preview UAT Checklist

實際只需要確認下列重點：

1. 首頁第一眼有柔和、有希望感，不像一份陽春表單。
2. 桌機輸入生日 4 位年份後，格式會自然進入月份，不會繼續把數字塞在年份裡。
3. 出生日期結果出現後，可以自然停下來聽老師說明。
4. 18 題在手機上連續點選不費力、不會誤觸。
5. Top 3 不只顯示英文字母，完整名稱、動詞、活動描述容易懂。
6. Top 3 下方的個人化段落讀起來像一個人的組合，而不是六型通用介紹。
7. 第三階段在 2 分鐘內可以完成。
8. 按下完成後立即看到快照，不需要等 AI。
9. 「課後查看我的完整報告」可以正常進入報告頁。
10. LINE 課後 AI 提示詞沒有「尚未填寫」或把「未詢問」誤解成沒有意願。
