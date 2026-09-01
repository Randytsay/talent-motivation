# 天賦原動力 V1 — Technical Spec

版本：V1.1 Draft  
狀態：P0 準備開發  
目的：Codex 建置第一版 Web App / LINE LIFF / Lark Base / Presenter 的實作依據。

Codex 開工前必讀：

1. `docs/LEGACY_AUDIT_INNERNUMBER.md`
2. `docs/NUMEROLOGY_ENGINE_V1.md`
3. 本文件

若舊 `innernumber` 與新規格衝突，以新規格為準。

---

## 1. 產品目標

核心主題：

> 看見天賦、找到原動力、增加人生的選擇。

三面鏡子：

1. 第一面鏡子：Life Path — 象徵性自我反思入口，不宣稱心理診斷。
2. 第二面鏡子：RIASEC — 18 題短版職涯興趣 / 活動偏好探索。
3. 第三面鏡子：本人現況 — 天賦使用感、目前關注、探索意願。

最後由 LLM 做「交叉解析」，但不得修改程式已計算出的事實與分數。

核心原則：

> 程式負責算；LLM 負責理解；本人負責驗證。

> 整合解讀，不整合計分。

---

## 2. 使用規模與角色

預估總使用者：< 100 人。

角色只有：

### Participant
- LINE 身分登入
- 跨手機 / 平板 / 電腦取回同一份資料
- 完成測驗
- 查看自己的歷史結果與 AI 報告
- 不可讀取其他參加者資料

### Owner / Presenter
- 講師兼系統管理者
- 查看活動與參加者
- 選定現場解析對象
- Presenter 只顯示經同意公開的欄位

---

## 3. 技術架構

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Responsive Web Design
- LINE LIFF
- Desktop browser 支援 LINE Login

### Hosting
- GitHub：source control
- Vercel：deployment

### Data
- Lark Base：主要資料儲存與講師營運後台
- 開發期可用 Lark CLI / Agent Skills 管理 Base schema
- Production Runtime 不可 shell execute CLI
- Runtime 必須走 Lark OpenAPI

### Backend
Vercel Serverless Functions / Node API。

負責：
- LINE identity verification
- Lark OpenAPI
- authorization
- deterministic scoring
- AI report generation
- Presenter selection

### LLM
只負責：
- repeated signals
- motivator summary
- possible tensions
- exploration directions
- reflection question

不得負責：
- 計算 Life Path
- 計算 RIASEC
- 宣稱命定人格
- 判斷一定適合某職業
- 自動導向特定商業機會

---

## 4. Identity

唯一身份 Key：

`line_user_id`

不可用 display name、device ID、browser fingerprint 當主身份。

### LIFF

```text
LIFF → LINE identity → Backend verify → line_user_id → Participants
```

### Desktop

```text
Browser → LINE Login → Backend verify → line_user_id → Participants
```

同一 LINE 帳號換裝置必須對到同一 Participant。

---

## 5. Lark Base Schema

V1 四張表。

### Participants

- participant_id
- line_user_id
- display_name
- picture_url
- birth_date
- birth_year
- life_path
- privacy_consent_version
- privacy_consent_at
- latest_assessment_id
- created_at
- last_seen_at

Rules:
- `line_user_id` unique
- display name 可更新
- full birth date 不可出現在 Presenter

### Assessments

Identity:
- assessment_id
- participant_id
- event_id
- device_type
- entry_source
- started_at
- completed_at

First Mirror:
- life_path
- life_path_resonance
- life_path_top_resonance

RIASEC answers:
- q01 ... q18

RIASEC scores:
- r_score
- i_score
- a_score
- s_score
- e_score
- c_score

Result:
- top1
- top2
- top3
- top3_code
- self_energy_choice

Third Mirror:
- talent_usage_pct
- priority_1
- priority_2
- exploration_interest
- reflection_answer

Presenter:
- presenter_consent
- presenter_consent_at

Rules:
- 每次測驗新增 record
- 不覆蓋舊 assessment
- 完成後更新 Participants.latest_assessment_id

### AI_Reports

- report_id
- assessment_id
- repeated_signals
- motivator_summary
- possible_tensions
- exploration_directions
- reflection_question
- summary
- report_json
- prompt_version
- model_name
- user_rating
- user_highlight
- generated_at

LLM 必須回 structured JSON。

### Events

- event_id
- event_code
- event_name
- event_date
- status: draft / active / closed
- current_presenter_assessment
- created_at

P1 Presenter 可先每 1–2 秒 poll `current_presenter_assessment`，不用先做 WebSocket。

---

## 6. Numerology

唯一規格：`docs/NUMEROLOGY_ENGINE_V1.md`。

P0 只做 Life Path：

- 1–9
- 11
- 22
- 33

Life Path 不得由 LLM 計算。

Public labels：

- 1 開創者
- 2 連結者
- 3 表達者
- 4 建構者
- 5 探索者
- 6 守護者
- 7 洞察者
- 8 成就者
- 9 理想者
- 11 啟發者
- 22 實踐者
- 33 賦能者

每個結果至少包含：
- keywords
- 容易發光
- 容易耗能
- 核心原動力
- reflection question
- resonance options

Disclaimer：

> 生命靈數是一種自我反思工具，結果不代表命定的人格或人生。

---

## 7. RIASEC

Labels：

- R 實作型 / Realistic / 做
- I 研究型 / Investigative / 想
- A 創意型 / Artistic / 創
- S 助人型 / Social / 幫
- E 推動型 / Enterprising / 帶
- C 組織型 / Conventional / 整

Scale：

1 完全不像我  
2 不太像我  
3 有點像我  
4 很像我

沒有中立選項。

18 題：

1. I — 遇到不熟悉的問題，我通常會想先查資料，把原因弄清楚。
2. R — 比起一直討論，我更喜歡直接操作、實作或把東西做出來。
3. S — 和人聊天時，我通常很快就能察覺對方的情緒或需要。
4. A — 我喜歡一件事情可以加入自己的想法，而不是完全照固定方式做。
5. E — 一群人遲遲沒有行動時，我常會想：「不然我們就先開始吧。」
6. C — 面對很多事情同時發生，我會自然地想把順序和步驟整理出來。
7. I — 我喜歡比較不同資訊，找出其中的規律、差異或原因。
8. R — 做完一件能看得見成果的工作，通常比只提出想法更讓我滿足。
9. S — 如果朋友碰到困難，我通常願意花時間聽他說，陪他想辦法。
10. A — 我容易對新的表達方式、創意或不同做法產生興趣。
11. E — 有目標、有挑戰，而且結果可以被看見時，我通常更有動力。
12. C — 我喜歡事先知道規則、流程和時間安排，這會讓我比較安心。
13. I — 別人只告訴我「答案」時，我常常還會想知道「為什麼」。
14. R — 遇到實際問題時，我傾向先試著動手處理，再慢慢調整。
15. S — 教人、分享經驗，或看到別人因為我的協助而進步，會讓我很有感覺。
16. A — 太長時間做一模一樣的事情，我容易開始想換個做法或找點變化。
17. E — 我喜歡發起事情、連結人或資源，把原本的想法真正推動起來。
18. C — 把資訊分類、整理清楚，或讓流程變得有秩序，會讓我感到舒服。

每型三題，raw score 3–12。

Normalized：

```text
(raw - 3) / 9 * 100
```

顯示取最近整數。

必須定義 tie-breaking 規則並測試，不得靠 object iteration 偶然順序。

---

## 8. Subjective Energy

Q18 完成後、揭曉 RIASEC 前詢問：

> 哪一件事情最容易讓你做了反而有精神？

- 把事情做出來 → R
- 把問題想明白 → I
- 創造不同做法 → A
- 幫助別人成長 → S
- 把事情推動起來 → E
- 把混亂整理清楚 → C

選擇前不顯示 R/I/A/S/E/C。

保存 `self_energy_choice`。

---

## 9. Third Mirror

### Talent Usage

> 目前的工作／生活，大約讓你用了多少自己的天賦？

- 20
- 40
- 60
- 80
- 100

這是本人主觀評估，不可把 40% 解讀成精確尚有 60% 未使用。

### Priority

> 如果未來一年，只能讓一件事情變得更好，你最希望是哪一個？

最多兩項：

- 收入更多元
- 工作更穩定
- 更多時間自主
- 更有成就感
- 更能發揮自己的能力
- 改善工作／人際環境
- 新的學習與發展方向
- 我現在還不確定

### Exploration Interest

> 如果不需要立刻離職，你會願意每週拿出一些時間，探索另一種可能嗎？

- 很想
- 可以了解看看
- 目前還沒有

這是自我探索資料，不等於 marketing consent。

---

## 10. UI Flow

01 Landing  
02 Consent  
03 Birthday  
04 Life Path Reveal  
05 Life Path Details + resonance  
06 第二面鏡子 transition  
07 18 RIASEC questions  
08 Subjective Energy  
09 RIASEC reveal + radar + two-mirror comparison  
10 Talent Usage  
11 Current Priorities + exploration interest  
12 Integrated Report

RIASEC 題目一次一題、自動前進、有 progress indicator。

Responsive：
- mobile stacked layout
- desktop 2-column where useful
- phone / tablet / desktop 共用同一 App

---

## 11. AI Cross Analysis

Input facts：
- life path
- life path resonance
- RIASEC six scores
- top3
- subjective driver
- talent_usage_pct
- priorities
- exploration_interest
- reflection answer

AI 可以使用：
- 「可能」
- 「值得留意」
- 「結果中反覆出現」
- 「可以探索」

AI 不可使用：
- 「你就是」
- 「你的天命」
- 「你一定適合」
- 「這證明你」
- 「你應該辭職」
- 「你適合加入某商業機會」

若 Life Path 與 RIASEC 不一致，要呈現差異與提問，不可硬說一致。

---

## 12. Presenter

Route：`/presenter`

不得顯示：
- full birth date
- privacy fields
- private AI conversation
- unrelated participant data

可顯示：
- display_name
- life path
- RIASEC scores
- radar chart
- top3
- subjective driver
- talent usage
- 經同意的 AI repeated signals / speaker prompt

Presenter consent 與初始 privacy consent 分開。

---

## 13. Security

Secrets 不得 commit GitHub。

Environment variables：
- LINE channel secret
- LINE channel access token
- Lark app ID
- Lark app secret
- LLM credentials

Browser 不得收到 server secrets。

重要資料寫入一律經 Backend。

Logs 避免記錄完整生日、token 或不必要個資。

---

## 14. Data Retention

V1 保存：
- identity
- assessment
- report
- reflection

V1 不需要永久保存每一句 LINE / LLM 對話。

未來 AI Memory 優先：
- conversation_summary
- important_memory
- last_topic
- updated_at

---

## 15. Scope

### P0 — 預演可完整跑

- project skeleton
- responsive app
- Life Path deterministic engine
- Life Path content
- 18 RIASEC
- scoring
- subjective driver
- Third Mirror
- radar chart
- personal report
- local session restore
- LINE LIFF / desktop LINE Login
- cross-device identity
- Lark Base 4 tables
- save / retrieve historical assessment
- lint / unit tests / build

### P1 — 正式活動

- structured AI report
- presenter consent
- owner selection page
- `/presenter`
- AI speaker prompt
- event dashboard polish

### P2 — 活動後

- free-form LINE AI
- summary memory
- history trends
- PNG result card
- PDF
- richer analytics
- participant merge utility
- optional custom admin
- optional deep Numerology / Pyramid

---

## 16. Automated Tests

### Numerology
依 `NUMEROLOGY_ENGINE_V1.md`。

### RIASEC
- item → dimension mapping
- min / max
- normalization
- Top3 ordering
- ties

### Identity
- same LINE ID = same participant
- new LINE ID = new participant
- display name change does not duplicate

### Assessment
- new assessment never overwrites previous
- latest_assessment_id updates

### Permission
- participant cannot fetch another participant
- Presenter payload excludes private fields

### UI
- mobile layout
- desktop layout
- all 18 questions complete
- report works when AI unavailable

---

## 17. Failure Handling

LLM fail：
- deterministic result still displays
- assessment still completes
- fallback：`AI 綜合解析稍後即可查看，你的測驗結果已保存。`

Lark API fail：
- 不可 silently lose answers
- 保留 local session
- 顯示 retry

Refresh during assessment：
- restore current answers where possible

---

## 18. Repository Separation

必須分開：

```text
src/
├─ components/
├─ data/
├─ lib/
│  ├─ scoring/
│  ├─ line/
│  ├─ lark/
│  └─ ai/
└─ types/
```

禁止把：
- scoring
- content
- API
- React component

全部混在同一檔案。

這是新版刻意與 legacy `innernumber/index.html` 分離的核心要求。

---

## 19. Codex Rules

1. 先讀三份 docs。
2. 不可自行增加其他人格測驗。
3. 不可修改 RIASEC 題目。
4. 不可讓 LLM 算分。
5. 不可直接 copy legacy `index.html`。
6. 不可搬 legacy `bizMessages`、健康、財富或命定式文案。
7. 不可將 secrets 放前端。
8. 不覆蓋歷史 assessments。
9. 每階段必跑 lint / test / build。
10. commit 要小且有邏輯。
11. 外部 API 不確定時查官方文件，不猜。
12. P0 先穩定，不追求一次把 P1/P2 全做完。

---

## 20. P0 Acceptance Test

真人必須能：

1. 手機開 App
2. LINE Login
3. Consent
4. 輸入生日
5. 得到正確 Life Path
6. 完成 18 題
7. 選 Subjective Energy
8. 得到 6 維 scores + Top3
9. 看到 radar chart
10. 完成 Third Mirror
11. 成功保存 Lark
12. 關閉 App
13. 桌機重新登入同一 LINE
14. 看到之前結果
15. 新建第二次 assessment
16. 第一筆 assessment 仍存在

16 項全部通過才算 P0 完成。

---

## 21. Codex Kickoff Prompt

> Read `docs/LEGACY_AUDIT_INNERNUMBER.md`, `docs/NUMEROLOGY_ENGINE_V1.md`, and `docs/TECHNICAL_SPEC.md` completely before changing code. Build only P0 first. Do not copy the legacy `innernumber/index.html`; use it only as a reference where the audit explicitly allows. Start with the project skeleton, typed domain models, deterministic Life Path engine, deterministic RIASEC scoring engine, and automated tests. Then build the full local assessment flow using mocked repository data. Do not connect LINE or Lark until the deterministic logic and complete local user journey pass lint, tests, and production build. After local flow is stable, implement LINE identity and the Lark repository adapter behind interfaces so storage remains replaceable. Do not invent secrets or product requirements.
