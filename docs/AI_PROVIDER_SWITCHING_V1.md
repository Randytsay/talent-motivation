# 天賦原動力 — AI Provider Switching V1

狀態：Production integration runbook

## 目標

正式環境可透過 Vercel server-only environment variables，在 Google Vertex AI 與 MiniMax 之間切換，不修改前端、不暴露金鑰、不改測驗計分邏輯。

切換方式：修改 `LLM_PROVIDER` / `LLM_MODEL` 後重新部署 Production。

---

## Provider A — Google Vertex AI

建議作為 Production 主力。

### Vercel Production variables

```text
LLM_PROVIDER=vertex
LLM_MODEL=gemini-3.5-flash
VERTEX_PROJECT_ID=<Google Cloud project id>
VERTEX_LOCATION=global
VERTEX_SERVICE_ACCOUNT_JSON=<full service-account JSON>
```

`VERTEX_SERVICE_ACCOUNT_JSON` 必須是 Vercel Secret，只存在 Server runtime。

### Google Cloud prerequisites

1. 專案已綁定包含 $300 Welcome credit 的 Billing account（若帳戶仍符合新客戶 Free Trial）。
2. 啟用 Vertex AI API：`aiplatform.googleapis.com`。
3. 建立專用 service account，例如 `talent-motivation-runtime`。
4. Service account 最小權限：`Vertex AI User` (`roles/aiplatform.user`)。
5. 建立 service-account JSON key，僅保存到 Vercel Secret，不 commit GitHub。

### Model

預設：`gemini-3.5-flash`。

理由：GA、Flash-tier latency/cost，且足以完成本專案固定六欄 structured JSON 自我探索摘要。

### Billing note

Google Cloud $300 Welcome credit 可用於 Vertex AI / Google Cloud 產品；這與 Google AI Studio 的 Gemini Developer API 計費路徑不同。要使用 Cloud credit，Production 應走 Vertex AI project endpoint，而不是 AI Studio API key endpoint。

---

## Provider B — MiniMax Token Plan (CN)

支援中國站 Token Plan `sk-cp` key。

### Vercel Production variables

```text
LLM_PROVIDER=minimax
LLM_MODEL=MiniMax-M2.7
MINIMAX_API_KEY=<Token Plan key>
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
```

Global MiniMax account 改用：

```text
MINIMAX_BASE_URL=https://api.minimax.io/v1
```

`MINIMAX_API_KEY` 必須是 Vercel Secret。

MiniMax M2.7 的 OpenAI-compatible endpoint 不保證 JSON Schema 強制輸出，因此 runtime 會：

1. 要求只輸出 JSON；
2. 分離 / 移除 `<think>...</think>`；
3. 擷取 JSON object；
4. 再由同一個 `validateAIReport()` 契約與內容 guardrail 驗證；
5. 不合格就 fail closed，不把不合規內容存入 Lark。

### Production note

MiniMax 官方把 Token Plan 定位為個人 / interactive developer usage，並建議正式 production workload 使用 pay-as-you-go。V1 可用 Token Plan 作測試、備援或低量活動，但正式長期服務應評估 API Pay-as-you-go。

---

## 切換操作

### Vertex → MiniMax

Production Vercel：

```text
LLM_PROVIDER=minimax
LLM_MODEL=MiniMax-M2.7
```

確認 `MINIMAX_API_KEY` 與 `MINIMAX_BASE_URL` 已存在於 Production，然後 Redeploy。

### MiniMax → Vertex

Production Vercel：

```text
LLM_PROVIDER=vertex
LLM_MODEL=gemini-3.5-flash
```

確認 `VERTEX_PROJECT_ID`、`VERTEX_LOCATION`、`VERTEX_SERVICE_ACCOUNT_JSON` 已存在於 Production，然後 Redeploy。

不需刪除另一組 Provider secrets；只要全部保持 Production-only 即可。未選中的 provider credentials 不會被 runtime 使用。

---

## 隱私與資料邊界

不論使用 Vertex 或 MiniMax，送給模型的資料只有已驗證的 deterministic facts：

- Life Path result / resonance
- RIASEC six scores / Top3
- subjective energy
- talent usage
- priorities
- exploration interest

不送：

- full birth date
- q01–q18 raw answers
- LINE user id
- display name
- Lark record ids
- secrets

所有 provider response 都必須通過相同六欄 schema 與禁止定論用語 guardrail 後才可寫入 `AI_Reports`。
