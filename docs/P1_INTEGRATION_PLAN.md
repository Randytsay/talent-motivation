# 天賦原動力 P1 Integration Plan

狀態：Ready after P0.5 visual QA

## Goal

把目前本機 deterministic assessment 推進到可部署、可登入、可持久化、可產生 AI 報告、可做 Presenter 的接近完成版本。

## Non-negotiable architecture

- Frontend: React + TypeScript + Vite
- Hosting/runtime: Vercel
- Identity: LINE Login / LIFF，同一 Provider，下游主鍵使用 `line_user_id`
- Database/admin: Lark Base via OpenAPI
- Scoring: deterministic TypeScript only
- AI: interpretation only, never score calculation
- No n8n / VPS / Cloudflare in core transaction path

## Execution lanes

### P1A Runtime skeleton
- Add Vercel Functions under `api/`
- `/api/health` returns stable JSON
- Central server-only env loader; fail closed for missing production secrets
- `.env.example` contains names only, never values
- Common JSON error envelope and request validation

### P1B Identity adapters
- Define `IdentityProvider` interface
- Development mock identity behind explicit local-only flag
- LINE Login start/callback endpoints with state validation and secure cookie/session abstraction
- LIFF bridge/adaptor for mobile entry
- Browser must never receive LINE channel secret/access token
- `line_user_id` is canonical identity; display name is mutable metadata

### P1C Persistence
- Define repository interfaces for Participants, Assessments, AI Reports, Events
- Implement Lark OpenAPI client server-side
- Keep a mock/in-memory repository for tests and local development
- Save each assessment as a new record; never overwrite history
- Update participant latest assessment pointer only after completion
- Validate all scoring facts server-side before persistence

### P1D AI report contract
- Structured JSON schema with exactly:
  1. repeated_signals
  2. motivator_summary
  3. possible_tensions
  4. exploration_directions
  5. reflection_question
  6. summary
- Prompt guardrails follow `docs/CONTENT_SYSTEM_V1.md`
- AI cannot calculate or alter Life Path / RIASEC
- Provider abstraction + deterministic mock provider for tests

### P1E Presenter
- Route `/presenter`
- Reads only event-scoped, presenter-consented assessment data
- Never displays full birth date, privacy fields, private conversation, or exploration interest without explicit design approval
- Polling is acceptable for V1; no WebSocket required

## Required routes / contracts

Minimum target contracts (exact implementation may vary, but semantics must remain):

- `GET /api/health`
- `GET /api/auth/session`
- `GET /api/auth/line/start`
- `GET /api/auth/line/callback`
- `POST /api/assessments`
- `GET /api/assessments/latest`
- `POST /api/reports/generate`
- `GET /api/reports/:assessmentId`
- `GET /api/presenter/current?eventId=...`

Messaging webhook can be implemented in the same phase or immediately after first Vercel deploy:

- `POST /api/line/webhook`

## Environment variable names

Names only; values are configured in Vercel or local `.env.local` and must never be committed.

- `APP_BASE_URL`
- `SESSION_SECRET`
- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`
- `LINE_MESSAGING_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `VITE_LIFF_ID`
- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_BASE_APP_TOKEN`
- `LARK_PARTICIPANTS_TABLE_ID`
- `LARK_ASSESSMENTS_TABLE_ID`
- `LARK_AI_REPORTS_TABLE_ID`
- `LARK_EVENTS_TABLE_ID`
- `LLM_PROVIDER`
- `LLM_API_KEY`
- `LLM_MODEL`

## Security gates

- No secret in frontend bundle, logs, screenshots, PR text, or Git history
- OAuth `state` required and verified
- Session cookie HttpOnly, Secure in production, SameSite appropriate for callback flow
- Backend re-validates assessment payloads and deterministic scores
- Do not log full birth date or tokens
- Presenter endpoint enforces consent and field allowlist

## Test gates

- Existing P0 tests must remain green
- Unit tests for env loader and request validators
- Identity callback tests with mocked LINE HTTP responses
- Lark client contract tests with mocked fetch
- Assessment persistence tests for history / latest pointer
- AI structured-output validation tests
- Presenter privacy allowlist tests
- `npm run lint`, `npm test`, `npm run build` all PASS

## Live-secret-dependent final steps

These cannot be fully completed in CI without the user's authorized account settings:

1. Create Vercel project / production deployment
2. Configure Vercel environment secrets
3. Register actual LINE Login callback URL
4. Register Messaging API webhook URL and enable webhook
5. Create/register LIFF endpoint and set `VITE_LIFF_ID`
6. Create Lark Base tables / provide table IDs and app credentials
7. Configure real LLM API credential
8. Publish LINE Login channel when UAT is ready

## Definition of "near complete"

Before live secrets are entered, the codebase should already support a full local/mock end-to-end path and have all external integrations behind tested adapters. After secrets and URLs are supplied, finishing should mostly be configuration + live UAT rather than new architecture work.
