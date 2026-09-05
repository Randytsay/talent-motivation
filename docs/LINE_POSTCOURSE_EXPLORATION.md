# LINE 課後探索｜「我的原動力」

## 目的

45 分鐘課程現場只讓參與者看懂主要結果；進階探索延後到 LINE 官方帳號，避免學員在課堂中開始閱讀長篇 AI 內容而分心。

課後輸入觸發詞：

```text
我的原動力
```

系統會以 Messaging API webhook 事件中的 LINE `userId` 查詢既有 Participant，讀取目前由本人擁有的最新 Assessment，再回覆 Flex Message。

## 使用者流程

```text
課堂完成測驗
→ 結果已保存到 Lark
→ 課程結束時加入／開啟官方 LINE
→ 輸入「我的原動力」
→ LINE userId 找 Participant
→ 找本人擁有的最新結果
→ 回覆天賦探索摘要 Flex Message
→ 選擇：
   🌱 更了解自己
   💼 工作與第二曲線
   🧭 7～14 天行動
→ 系統直接用固定模板組出個人化 Prompt
→ 貼到 ChatGPT / Gemini / 其他 AI 繼續探索
```

Prompt 不會再呼叫 Vertex 或 MiniMax，因此不會因 LLM API 延遲而卡住，也不需要額外產生費用。

## 身分與隱私規則

1. Messaging API Channel 必須與 LINE Login Channel 建立在 **同一個 LINE Developers Provider** 下。LINE userId 是 Provider scoped；若放在不同 Provider，官方帳號取得的 userId 無法對上登入網站時保存的 userId。
2. 「我的原動力」只會顯示：
   - `self` Subject；或
   - 已正式 claim、`ownerParticipantId` 為該 Participant 的 Subject。
3. 未認領 guest / facilitator 代填結果不會被當成「我的結果」回覆。
4. Claim 後，原 facilitator 不再能透過此 LINE 流程取得朋友的私人結果。
5. Prompt 只使用衍生後的探索資料：生命靈數／出生結構摘要、RIASEC Top 3、subjective driver、talent usage、priorities、reflection，以及已存在 AI Report 的少量 repeated signals。
6. Prompt 明確排除完整生日、LINE userId、participantId、assessmentId、18 題 raw answers。

## Vercel Production 需要的 Secret

```text
LINE_MESSAGING_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
```

`.env.example` 已保留這兩個欄位。

> `LINE_CHANNEL_ACCESS_TOKEN` 是 Messaging API 的 Channel Access Token，和 LINE Login Channel Secret 不同。

正式 Webhook URL：

```text
https://talent-motivation.vercel.app/api/line/webhook
```

LINE Developers / Official Account Manager 設定完成後：

1. 將 Webhook URL 填入 Messaging API。
2. 開啟 `Use webhook`。
3. 按 Verify。LINE 會送一個正常簽章、通常 `events: []` 的 POST；服務應回 HTTP 200。
4. 建議關閉或調整官方帳號的預設自動回覆，避免與 Bot 回覆重複。

## 觸發詞

目前支援：

```text
我的原動力
原動力
```

其他文字訊息不回覆，避免干擾官方帳號的其他用途。

## 三種 Prompt

### 🌱 更了解自己

從重複線索、能量來源、消耗情境、一致與落差開始；AI 必須一次只問一個真實經驗問題，至少理解 5 個案例後才能整理方向。

### 💼 工作與第二曲線

不直接輸出「適合職業」，改用「活動＋角色＋環境＋任務」描述方向，並區分已有證據與仍需驗證的假設。

### 🧭 7～14 天行動

將探索結果轉成 3 個低成本、不需離職、不需重大投資的小實驗，並要求明確完成條件與觀察方式。

## 錯誤／邊界情境

- LINE userId 尚未在 Participants：回覆「先用同一個 LINE 帳號登入天賦原動力」。
- 有 Participant 但沒有完成結果：引導回網站完成探索。
- 有多個本人擁有的 Subject：先顯示選擇卡。
- 非本人擁有的 assessmentId：拒絕存取並要求重新輸入觸發詞。
- LINE signature 無效：HTTP 401。
- Messaging Secret / Access Token 缺漏：HTTP 503。
- LINE Reply API upstream 失敗：HTTP 502，log 只記 status，不記 Token 或私人 payload。
