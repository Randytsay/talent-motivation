# Agent Handoff — P1 Runtime Integration

Use this only after reading:

- `docs/TECHNICAL_SPEC.md`
- `docs/CONTENT_SYSTEM_V1.md`
- `docs/QA_ACCEPTANCE_V1.md`
- `docs/DESIGN_SYSTEM_V1.md`
- `docs/P1_INTEGRATION_PLAN.md`

## Mission

Advance the project from P0.5 to a local/mock end-to-end integration-ready state without using or committing real secrets.

## Branching

Create a new branch from the latest `feat/p0-visual-polish` head:

`feat/p1-runtime-integration`

Do not modify `feat/p0-visual-polish` directly.

## Required deliverables

1. Vercel Functions runtime skeleton and `GET /api/health`.
2. Server-only env loader and validation.
3. LINE identity abstraction plus mocked development mode.
4. LINE Login start/callback implementation with OAuth state verification and secure session cookie abstraction.
5. LIFF client adapter that can run in mock mode when no `VITE_LIFF_ID` exists.
6. Repository interfaces and mock repository for Participants, Assessments, AI Reports, Events.
7. Lark OpenAPI client/server adapter with mocked fetch tests; no real credentials required.
8. Assessment persistence API that re-validates deterministic Life Path and RIASEC facts server-side.
9. AI report provider interface, strict structured-output schema and mock provider.
10. Presenter route/API using field allowlists and presenter consent.
11. Tests covering auth state, env validation, repository behavior, AI schema and presenter privacy.
12. Documentation for the live configuration steps that remain after mock E2E passes.

## Guardrails

- Do not alter scoring algorithms or locked question content.
- Do not redesign the UI.
- Do not add n8n, VPS, Cloudflare, Supabase or another database.
- Do not put secrets in frontend code.
- Do not persist full birth date to logs.
- Do not let the LLM calculate Life Path or RIASEC.
- Do not let Presenter expose birth date, privacy fields, or unrelated participant data.
- Do not merge any PR.

## Validation

Before opening a PR:

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run build`
- local/mock end-to-end smoke test
- no console errors

Open a stacked PR with base `feat/p0-visual-polish` and head `feat/p1-runtime-integration`.

Final report must state:

- commit SHA
- PR number
- tests passed count
- mock E2E result
- exact items blocked only by live LINE / Lark / Vercel / LLM credentials or URLs
