# 天賦原動力 — AI Provider Runtime V2

狀態：Production integration runbook

## 目標

正式環境以 Google Agent Platform / Vertex runtime 為主力，使用 `gemini-3.7-flash`；當主模型發生可重試的 provider/server/network 錯誤時，自動改由 MiniMax 中國站 `MiniMax-M3` 產生同一格式的報告。

前端不接觸任何金鑰，測驗計分與 deterministic facts 不因 provider 改變。

---

## Primary — Google Agent Platform / Vertex runtime

### Vercel Production variables

```text
LLM_PROVIDER=vertex
LLM_MODEL=gemini-3.7-flash
VERTEX_PROJECT_ID=xenon-chain-506409-c3
VERTEX_LOCATION=global
VERTEX_SERVICE_ACCOUNT_JSON=<full service-account JSON>
```

`VERTEX_SERVICE_ACCOUNT_JSON` 必須是 Vercel Secret，只存在 Server runtime。

### Google Cloud prerequisites

1. Project 已綁定有效 Billing account。
2. 啟用 **Agent Platform API**，服務 ID：`aiplatform.googleapis.com`。
3. 使用專用 service account：`talent-motivation-runtime`。
4. 最小角色：**Agent Platform 使用者** (`roles/aiplatform.user`)。
5. service-account JSON key 僅保存到 Vercel Secret，不 commit GitHub。

### Model

Production primary model：`gemini-3.7-flash`。

Vertex request 使用 Google service-account OAuth，呼叫 `aiplatform.googleapis.com` 的 publisher model `generateContent` endpoint，並要求固定 structured JSON schema。

---

## Automatic fallback — MiniMax CN

### Vercel Production variables

```text
LLM_FALLBACK_PROVIDER=minimax
LLM_FALLBACK_MODEL=MiniMax-M3
MINIMAX_API_KEY=<Token Plan / API key>
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
```

使用目前 OpenAI-compatible endpoint：

```text
POST https://api.minimaxi.com/v1/chat/completions
```

`MINIMAX_API_KEY` 必須是 Vercel Secret。

MiniMax 回覆會經過：

1. 要求只輸出 JSON；
2. 移除 `<think>...</think>` / code fence；
3. 擷取 JSON object；
4. 通過相同 `validateAIReport()` schema；
5. 通過相同內容 guardrail；
6. 合格後才保存到 `AI_Reports`。

---

## Fallback 規則

會觸發 fallback：

- provider 5xx 類錯誤
- Vertex OAuth / provider 暫時失敗
- rate limit / upstream unavailable 等 server-side provider failure
- provider 回傳空內容或不符合報告 schema
- fetch / network / runtime provider error

不應觸發 fallback：

- 使用者 payload 不合法
- Assessment / Subject 權限錯誤
- business validation / conflict 類 4xx

也就是只有「模型或上游服務無法完成」才切換，不使用 MiniMax 掩蓋應用程式資料問題。

---

## Production configuration

正常正式設定：

```text
LLM_PROVIDER=vertex
LLM_MODEL=gemini-3.7-flash

LLM_FALLBACK_PROVIDER=minimax
LLM_FALLBACK_MODEL=MiniMax-M3

VERTEX_PROJECT_ID=xenon-chain-506409-c3
VERTEX_LOCATION=global
VERTEX_SERVICE_ACCOUNT_JSON=<secret>

MINIMAX_API_KEY=<secret>
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
```

不要把 `LLM_PROVIDER` 改成 `minimax` 才能取得 fallback；自動 fallback 的前提就是 primary 保持 `vertex`。

---

## 隱私與資料邊界

不論使用 Vertex 或 MiniMax，送給模型的內容只包含已驗證與必要的衍生資料：

- Birth Profile / Birth Signature derived facts
- Life Path result / resonance
- RIASEC scores / Top3 / derived item signals
- subjective energy
- talent usage
- priorities
- exploration interest
- reflection text
- age band

不送：

- full birth date
- q01–q18 raw answer map
- LINE user id
- display name
- picture URL
- Lark record ids
- claim token / hash
- secrets

所有 provider response 都必須通過相同八欄 V2 schema 與禁止定論用語 guardrail 後才可寫入 `AI_Reports`。
