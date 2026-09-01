# QA Acceptance V1 — P0 驗收矩陣

版本：V1.0 Draft  
用途：Codex 完成 PR 後，由 ChatGPT 做程式審查、由產品負責人做真人驗收。

---

## 1. P0 Gate

P0 只有在以下三層都通過時才算完成：

1. Automated：lint / unit tests / production build 全部通過
2. Functional：完整測驗流程可從 Landing 走到 Result
3. Human UX：手機與桌機實際操作沒有阻斷性問題

任何一層失敗，不 merge P0 PR。

---

## 2. Automated Gate

必要命令：

```bash
npm run lint
npm test
npm run build
```

若專案選擇不同 test script，可調整命令名稱，但 CI 必須有對應 gate。

### Life Path fixtures

至少驗證：

| DOB | Expected |
|---|---:|
| 1978-11-05 | 5 |
| 1950-03-29 | 11 |
| 1950-01-06 | 22 |
| 1950-07-29 | 33 |

Invalid：

- 2026-02-29
- 2025-13-01
- 2025-00-10
- 2025-04-31
- empty string
- malformed date

不得依賴 JavaScript Date 自動 rollover 接受非法日期。

### RIASEC fixtures

必測：

- 每題只對應一個 dimension
- 每 dimension 恰好 3 題
- 所有答案為 1 時 raw = 3，normalized = 0
- 所有答案為 4 時 raw = 12，normalized = 100
- normalization = `(raw - 3) / 9 * 100`
- Top3 deterministic
- tie deterministic，不得因 object iteration / random 造成刷新後順序不同

---

## 3. Flow Acceptance

### S01 Landing

PASS：
- 顯示主題「天賦原動力探索」
- 顯示「看見天賦・找到原動力・增加人生的選擇」
- CTA 清楚
- 手機第一屏不用橫向滑動

### Local Consent Placeholder

Phase 1 尚未串正式 LINE identity 時，可使用 local/mock consent shell。

PASS：
- 不宣稱資料已上雲
- 不要求不存在的 LINE/Lark 權限

### Birthday

PASS：
- 可以輸入合法日期
- 非法日期有明確錯誤
- 不因時區改變生日
- 使用 YYYY-MM-DD 作 canonical value

### Life Path Reveal

PASS：
- 計算結果與 deterministic engine 一致
- 1–9 / 11 / 22 / 33 都能 render
- 顯示 disclaimer
- 不出現健康、財富、命定職業、商機導向文字

### Resonance

PASS：
- 很像 / 有一點 / 不太像 可選
- 可保存本人最有感的內容或選擇
- 本人回饋不會修改 life_path 計算值

### RIASEC 18 Questions

PASS：
- 18 題完整
- 題序固定
- 4 級選項，沒有中立選項
- 每次選擇後可進下一題
- 可返回時，已選答案不遺失
- progress 正確，例如 7/18

### Subjective Energy

PASS：
- 在 RIASEC reveal 前詢問
- UI 不先顯示 R/I/A/S/E/C 字母
- selection 可保存

### RIASEC Result

PASS：
- 顯示六向度
- 顯示 normalized percentage
- 顯示 Top3
- Radar chart 數據與 score 相同
- 主觀選擇與 Top1 不同時，不判斷本人選錯

### Third Mirror

PASS：
- talent usage: 20 / 40 / 60 / 80 / 100
- priority 最多選 2
- exploration interest 三個選項
- 40% 不呈現成「60% 天賦浪費」

### Integrated Report Shell

PASS：
- 即使無 AI，也能顯示 deterministic results
- 顯示三面鏡子的基本資料
- 不需要 LLM 才能完成 assessment

---

## 4. Refresh / Recovery

Scenario A：做到第 8 題時刷新。

Expected：
- 可恢復生日
- 可恢復 Life Path
- 可恢復 q01–q08
- 回到合理位置

Scenario B：完成後刷新。

Expected：
- 結果仍可查看（Phase 1 可先 local persistence）
- 不重算成不同 Top3

重要：localStorage 只是 Phase 1 recovery，不得在 UI 宣稱它是永久雲端紀錄。

---

## 5. Responsive Human Test

至少人工測：

### Mobile narrow

參考 viewport：390 × 844

檢查：
- 按鈕可單手點
- 無橫向 overflow
- 題目不被 footer / fixed CTA 蓋住
- Radar chart 不切掉 labels
- 主要 CTA 不小於可合理點擊範圍

### Desktop

參考 viewport：1440 × 900

檢查：
- 內容不能被拉成過寬長行
- Result 可適度兩欄
- 不像單純手機版放大

### Tablet

參考 viewport：768 × 1024

至少確認 layout 不破版。

---

## 6. Accessibility Minimum

P0 至少要求：

- button 使用真正 button element
- keyboard 可操作主要流程
- focus visible
- form 有 label / accessible name
- 不只靠顏色表示 RIASEC score
- 文字與背景有足夠對比
- prefers-reduced-motion 不應阻止核心功能

---

## 7. Privacy / Copy Review

掃描 participant-facing copy，不得出現未被新版規格允許的 legacy wording，例如：

- 你擁有創業的靈魂
- 被動現金流是你的方向
- 財富密碼
- 金錢匱乏
- 健康注意事項（由數字推論）
- 命定職業
- 你一定適合...

如果舊 `innernumber` 文字被 wholesale copied，視為 BLOCKER。

---

## 8. Code Review Checklist

ChatGPT review PR 時確認：

- scoring 與 UI 分離
- question data 與 component 分離
- no giant one-file implementation
- no secrets
- no direct LINE/Lark code in Phase 1
- type definitions 清楚
- deterministic tie handling
- invalid date strict
- local persistence versioned or safely parseable
- corrupted localStorage 不造成白畫面
- report page can render without AI

---

## 9. Product Owner 真人驗收

產品負責人不用看程式碼，只需完成以下情境：

1. 手機打開網站
2. 從第一頁做到最後一頁
3. 中途第 5～10 題任選一題刷新一次
4. 確認答案有回來
5. 看 Life Path 是否符合預期
6. 看雷達圖是否容易理解
7. 看文字量是否過多
8. 桌機再開一次完整走完

記錄只有三種：

- PASS
- NEED POLISH
- BLOCKER

BLOCKER 才阻止 merge；純美術微調可排後續 commit。

---

## 10. P0 Merge Rule

允許 merge 的最低條件：

- lint PASS
- tests PASS
- build PASS
- deterministic calculators PASS
- 18 題 flow PASS
- refresh recovery PASS
- mobile no blocker
- desktop no blocker
- no legacy destiny/business/health claims

P0 merge 後，才開始 LINE identity 與 Lark Base integration。
