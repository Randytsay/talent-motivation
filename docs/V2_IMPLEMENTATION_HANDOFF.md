# V2 Implementation Handoff — Inner Number Fusion

Branch: `feat/inner-number-fusion-v2`
PR: #10

Read first:
- `docs/METHODOLOGY_V2.md`
- `src/lib/scoring/birthProfile.ts`
- `src/lib/scoring/birthProfile.test.ts`
- `src/lib/scoring/riasecSignals.ts`

## Non-negotiable product rules

1. Keep the 40–50 minute event flow concise. Do not turn the participant UI into the old long Inner Number report.
2. Birth Profile is a self-reflection framework, not a diagnostic/predictive system.
3. Program calculates all numerology and RIASEC facts. LLM only interprets validated facts.
4. Full birth date, LINE userId, profile URL, raw q01–q18 answer map and reflection raw text must never enter Presenter payload.
5. LLM may receive short reflection text, age band, calculated Birth Profile facts and derived RIASEC item signals.
6. Existing Preview/Production Lark data must remain readable. Prefer additive migration; never rename/drop existing fields in this PR.
7. Existing LINE identity, event-scoped Presenter consent, server restore and multi-provider AI runtime must continue to work.

## Participant flow target

Keep existing steps but upgrade them:

`landing → consent → birthday → birth-profile/life-path → resonance → RIASEC 18 → energy → RIASEC result → talent usage → priorities → reflection → presenter consent (event only) → report`

The Birth Profile screen should reveal information progressively:

- Hero: Life Path + label/core motivation (existing)
- Compact card: 金字塔核心數 O
- Two compact cards: 外顯綜合 M vs 內在綜合 N
- Current adult-stage card: only U/R/X relevant to current age
- Do not show A–X raw graph in the main event flow.
- Optional future detailed view can show the full pyramid, but not required in V2 event flow.

## Reflection UI

One screen, short textareas, mobile-first:

- `energizingExperience` — recommended/required: 最近哪件事做完雖然累，心裡卻很有成就感？
- `currentFriction` — optional: 現在最消耗你、最想改善的是什麼？
- `unconstrainedExploration` — optional: 如果暫時不考慮現實限制，你最想嘗試什麼？

Limits:
- trim
- max 300 chars each
- first answer min 3 chars

## Domain/contracts target

Add a V2 reflection value object:

```ts
interface ReflectionAnswers {
  energizingExperience: string;
  currentFriction?: string;
  unconstrainedExploration?: string;
}
```

AssessmentInput:
- keep `birthDate`
- optional `birthProfile` client echo; backend recalculates and rejects mismatch
- add `reflections`

AssessmentRecord:
- keep private `birthDate`
- add canonical `birthProfile`
- keep raw RIASEC answers at rest
- add `reflections`

Client assessment restore:
- still strip `birthDate` and raw `riasecAnswers`
- Birth Profile is safe to return to the same authenticated participant
- reflections may return to the same participant, but never Presenter

## Lark additive schema V2

### Assessments — add fields

All new fields are additive. Existing fields remain unchanged.

| field | type | source |
|---|---|---|
| birth_profile_json | Long text | canonical calculated BirthProfileResult JSON |
| birth_pyramid_main | Number | O |
| birth_outer_composite | Number | M |
| birth_inner_composite | Number | N |
| birth_current_stage | Text | stage key |
| birth_current_stage_number | Number | U/R/X for current adult stage; blank pre-adult |
| age_band | Text | privacy-safe age band |
| reflection_energizing | Long text | reflection 1 |
| reflection_friction | Long text | reflection 2 |
| reflection_exploration | Long text | reflection 3 |

### AI_Reports — add fields

| field | type |
|---|---|
| birth_profile_summary | Long text |
| unused_potential | Long text |

Do not delete or rename any V1 field.

## AI Report V2 schema

Exact top-level keys:

```json
{
  "repeated_signals": ["..."],
  "birth_profile_summary": "...",
  "motivator_summary": "...",
  "possible_tensions": ["..."],
  "unused_potential": "...",
  "exploration_directions": ["..."],
  "reflection_question": "...",
  "summary": "..."
}
```

All providers — Vertex, MiniMax, Gemini Developer API, Mock — must emit the same contract and then pass `validateAIReport`.

### LLM facts input

Send only:

- `birthProfileFacts(canonicalBirthProfile)`
- life-path resonance + selected resonance statement
- RIASEC six scores + Top3
- `extractRiasecItemSignals(rawAnswers)` output (high/low only)
- subjective energy
- talent usage
- priorities
- exploration interest
- reflection text

Explicitly do not send:
- birthDate
- participantId / lineUserId / displayName
- q01–q18 answer map
- pictureUrl

## AI interpretation policy

Prompt must ask for cross-source interpretation:

- identify repeated signals across Birth Profile / RIASEC / self-report / current reality
- surface inner-vs-outer or interest-vs-energy tensions as hypotheses
- use Talent Usage for `unused_potential`
- treat Birth Profile as symbolic language and RIASEC as interest preference
- reflection text is participant-owned evidence and should be weighted strongly

Allowed language:
- 可能
- 值得留意
- 結果中反覆出現
- 你可以觀察
- 可以探索

Prohibited/deterministic language includes existing guardrails plus:
- 命中注定
- 財運
- 疾病/健康預測
- 你天生就是
- 你一定要
- 命定職業

## Final report UX

Recommended order:

1. `你的三個高重複訊號`
2. `出生結構這面鏡子` — birth_profile_summary
3. `你的原動力` — motivator_summary
4. `值得留意的張力` — possible_tensions
5. `可能還沒被充分使用的部分` — unused_potential
6. `可以先試的小方向` — exploration_directions
7. `帶走的一個問題` — reflection_question
8. summary/disclaimer

Keep visual hierarchy premium and calm. Do not show raw pyramid graph on report V2 unless it is clearly secondary.

## Presenter V2

Presenter may additionally show a concise `birthProfileSignal` generated deterministically or from `birth_profile_summary` only if consented.

Still exclude:
- birthDate
- exact age
- reflection answers
- priorities
- exploration interest
- raw answers

## Consent copy update

Replace the V1 statement that AI only receives Life Path/RIASEC summaries. State accurately:

- birth date is used by the program to calculate the Birth Profile and age band
- AI receives calculated Birth Profile facts, RIASEC derived signals and the participant's reflection answers
- AI does not receive full birth date, LINE user ID or the q01–q18 raw answer map

## Migration/compatibility

Old V1 Assessments may not have `birth_profile_json` or reflections.

Read path must tolerate missing V2 fields:
- if birth profile missing but private birthDate is available, backend may calculate on read; otherwise return V1-compatible result
- AI report V1 records without new fields remain readable; UI should fall back gracefully
- do not rewrite historical records in this PR

## QA gates

Unit:
- legacy Inner Number fixtures
- master number separate from pyramid main
- invalid calendar date
- age bands/stage boundaries
- client-forged birth profile rejected
- LLM fact serialization contains no full DOB or q01 key names
- AI V2 schema/guardrails all providers
- Lark V1 record read compatibility

Browser E2E:
- full V2 mobile flow
- reflection limits
- assessment save → AI report → refresh restore
- presenter positive/no-consent
- no horizontal overflow 390×844
- no console errors

Preview live:
- after Lark fields are added to Preview Base, run persistent Vercel Preview end-to-end before merge.
