# 天賦原動力 Methodology V2 — Four Mirrors

狀態：Design contract / implementation target

## 核心定位

「天賦原動力」不是命定式人格測驗，也不是把生命靈數與 RIASEC 並排展示。V2 以四面鏡子交叉驗證同一個人的重複訊號、張力與未使用能力：

1. **出生結構 Birth Profile**：沿用 Inner Number 金字塔的 deterministic 計算，作為文化性、自我反思入口。
2. **活動偏好 RIASEC**：使用固定 18 題自訂量表，描述偏好活動與環境，不宣稱能力或人格診斷。
3. **本人驗證 Self Validation**：主觀能量來源、Life Path 共鳴、天賦使用感。
4. **當下現況 Current Reality**：目前優先事項、探索意願、2–3 題短反思。

> 程式負責算；LLM 負責理解；本人負責驗證。

## Birth Profile：保留舊 Inner Number 的深度，但改變語氣

V2 不只取單一 Life Path。生日會在 deterministic engine 計算出以下結構：

- `lifePath`：核心主題，保留 11/22/33 master number 邏輯。
- `pyramid.main`：舊金字塔 O，主要性格/核心結構。
- `pyramid.outerPair`：I + J，外顯性格底層組合。
- `pyramid.innerPair`：K + L，內在性格底層組合。
- `pyramid.outerComposite`：M，外顯綜合數。
- `pyramid.innerComposite`：N，內在綜合數。
- `stage.general`：U，成年早期 18–40 歲「通用力」象徵主題。
- `stage.leadership`：R，成年中期 40–65 歲「領導力」象徵主題。
- `stage.professional`：X，成年晚期 65+「專業力」象徵主題。
- `currentStage`：依目前年齡只選取當下階段的數值與標籤，避免一次向使用者展示太多。

### 舊版中不直接帶回的內容

以下內容不得由數字直接推導為事實：

- 健康/疾病風險
- 財富或財運預測
- 命定職業
- 命定關係/伴侶
- 流年吉凶
- 必然人生使命

若未來保留流年，只能作為「年度反思主題」，並與本人現況分開呈現。

## Birthday data boundary

完整生日是個人資料，保留於後端資料層，用來 deterministic 計算 Birth Profile 與 age band。LLM 不接收完整生日。

LLM 可接收：

- `age_band`，例如 `45–54`
- `life_stage`，例如 `mid-career`
- 完整 Birth Profile 的**已計算數值與象徵標籤**

這可保留多重交叉解析能力，同時避免模型自行創造未定義的 numerology 算法。

## RIASEC item signals

LLM 不直接接收 q01–q18 raw answer map。程式先產生 `itemSignals`：

- 每題 id、dimension、題意 label、answer
- `highItems`：answer = 4
- `lowItems`：answer = 1
- 如有需要再加入 dimension 內的反差訊號

這讓 AI 能讀到細部差異，但不能把 18 題自行重算成另一套人格模型。

## Reflection questions

V2 在報告前新增最多 3 個短反思欄位：

1. `energizingExperience`：最近哪件事做完雖然累，心裡卻很有成就感？
2. `currentFriction`：現在最消耗你、最想改善的是什麼？
3. `unconstrainedExploration`：如果暫時不考慮現實限制，你最想嘗試什麼？

每題可跳過；避免把 40–50 分鐘活動拖長。至少第一題建議必答。

## Cross-signal engine

程式只做 deterministic signal extraction，不做命定判斷。LLM 的工作固定為：

1. 找一致（convergence）
2. 找反差（tension）
3. 找落差（unused potential）
4. 找重複（repeated signal）
5. 提出一個可由本人驗證的問題
6. 提出小型探索方向

### 典型 convergence

- Birth outer composite = 8（成果/影響）
- RIASEC E 高
- subjectiveDriver = E

→ 可以描述為「多個來源反覆出現推動/影響的線索」，不可描述為「你天生就是領導者」。

### 典型 tension

- Birth outerComposite 指向推動/結果
- Birth innerComposite 指向深度/觀察

→ 可以描述為「外在展現與內在需求可能不同」，並交由本人驗證。

## Final Report V2 固定區塊

1. `repeated_signals`：3 個跨來源高重複訊號
2. `birth_profile_summary`：出生結構摘要，不超過 120 字
3. `motivator_summary`：原動力摘要
4. `possible_tensions`：1–3 個張力
5. `unused_potential`：依 talent usage + convergence 描述未充分使用的能力/環境需求
6. `exploration_directions`：2–3 個低風險探索方向
7. `reflection_question`：1 題
8. `summary`：非命定式整體摘要

## Presenter privacy

Presenter 可顯示：

- display name
- Life Path
- Birth Profile 只顯示「核心/內外張力摘要」，不顯示生日
- RIASEC 雷達與 Top3
- 主觀能量來源
- Talent Usage
- 經同意的 repeated signals

Presenter 不顯示：

- 完整生日
- LINE userId
- q01–q18 raw answers
- priorities / exploration interest
- reflection 原文

## Product principle

V2 的差異化不是「算更多數字」，而是：

> **Birth Profile 提供象徵性的深層結構，RIASEC 提供當下偏好，本人回饋提供現實驗證，再由 AI 尋找跨來源重複訊號。**
