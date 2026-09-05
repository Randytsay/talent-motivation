# V2 Implementation Handoff — Inner Number Fusion

Branch: `feat/inner-number-fusion-v2`
PR: #10

Read first:
- `docs/METHODOLOGY_V2.md`
- `docs/BIRTH_PROFILE_V2.md`
- `docs/SUBJECT_CLAIM_V2.md`
- `src/lib/scoring/birthProfile.ts`
- `src/lib/scoring/birthProfile.test.ts`
- `src/lib/scoring/birthSignature.ts`
- `src/lib/scoring/birthSignature.test.ts`
- `src/lib/scoring/riasecSignals.ts`

## Non-negotiable product rules

1. Keep the 40–50 minute event flow concise. Do not turn the participant UI into the old long Inner Number report.
2. Birth Profile is a self-reflection framework, not a diagnostic/predictive system.
3. Program calculates all numerology and RIASEC facts. LLM only interprets validated facts.
4. Full birth date, LINE userId, profile URL, raw q01–q18 answer map and reflection raw text must never enter Presenter payload.
5. LLM may receive short reflection text, age band, calculated Birth Profile facts, legacy Birth Signature derived facts and derived RIASEC item signals.
6. Existing Preview/Production Lark data must remain readable. Prefer additive migration; never rename/drop existing fields in this PR.
7. Existing LINE identity, event-scoped Presenter consent, server restore and multi-provider AI runtime must continue to work.
8. Birth Signature is secondary evidence. It must never outweigh participant reflection or RIASEC by itself.
9. LINE account identity and analysed-person identity are separate concepts: Participant = account, Subject = person being explored.
10. Completed assessments are append-only. Repeat assessments create history; they never overwrite prior assessment results.
11. A guest must see the complete report before being asked to save/claim with LINE.
12. Public sharing must never expose a claim token or private assessment fields.

## Subject / account model

Canonical architecture is defined in `docs/SUBJECT_CLAIM_V2.md`.

Use:

`Participant (LINE account) → Subject (analysed person) → Assessment (point-in-time result) → AI Report`

Do not infer Subject identity from birthday alone.

### First run

After birth date entry, ask once:

> 這是你本人的出生日期嗎？
>
> - 是，我自己
> - 不是，我在陪另一位一起探索

If self, create/reuse the Participant's self Subject.

### Return / repeat

Returning self users should be able to:

- 查看我的探索
- 再次探索
- 查看過去結果
- 陪另一位一起探索

A repeat self exploration appends a new Assessment to the same Subject.

### Different birthday

If a user is in a self journey and enters a date different from the stored self Subject date, ask whether this is:

- another person; or
- a correction to the user's own date.

Never silently replace the self birth date and never auto-merge two Subjects because birthdays match.

## Guest / claim flow

A co-present guest should answer their own RIASEC and reflections even if the facilitator is holding the device.

The guest receives the complete report before conversion.

After the report, offer:

- `用 LINE 保存我的結果` — claim into the guest's own identity;
- `傳給本人並保存` — private one-time claim link;
- `分享精華結果` — public-safe card with no claim token;
- `先不用`.

Claim tokens:

- at least 32 cryptographically random bytes;
- URL-safe opaque token;
- store SHA-256 hash only;
- single-use;
- default 7-day expiry;
- plaintext token must never be logged or persisted in Lark.

After a successful claim, the original facilitator loses normal private API access to that Subject. Preserve existing Assessment / Report IDs.

If the claimant already owns a self Subject, do not silently merge by birthday. Claim the new Subject safely and leave explicit merging to a later user-confirmed flow.

## Participant flow target

Self flow target:

`landing → consent → birthday → self/other confirmation → birth-profile/life-path → resonance → RIASEC 18 → energy → RIASEC result → talent usage → priorities → reflection → presenter consent (event only) → report → history/share`

Co-present guest target:

`landing/host → 陪另一位一起探索 → birthday → guest disclosure → birth-profile/life-path → resonance → RIASEC 18 → energy → RIASEC result → talent usage → priorities → reflection → presenter consent (event only) → report → optional LINE claim/share`

The Birth Profile screen should reveal information progressively:

- Hero: Life Path + label/core motivation (existing)
- Compact card: 金字塔核心數 O
- Two compact cards: 外顯綜合 M vs 內在綜合 N
- Current adult-stage card: only U/R/X relevant to current age
- Birth Signature patterns stay hidden from the main event UI unless surfaced as a concise convergence note
- Do not show A–X raw graph in the main event flow
- Optional future detailed view can show the full pyramid, but not required in V2 event flow

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

Add Subject concepts consistent with `SUBJECT_CLAIM_V2.md`, including at minimum:

```ts
type SubjectKind = 'self' | 'guest' | 'claimed';
type ClaimStatus = 'not_applicable' | 'unclaimed' | 'claimed' | 'expired' | 'revoked';
type AssessmentMode = 'self' | 'co_present';
```

AssessmentInput:
- keep `birthDate`
- add/require `subjectId` for persisted V2 assessments after Subject creation
- optional `birthProfile` client echo; backend recalculates and rejects mismatch
- optional `birthSignature` client echo; backend recalculates and rejects mismatch if accepted from client
- add `reflections`
- client must never supply authoritative owner/creator IDs

AssessmentRecord:
- keep private `birthDate`
- add `subjectId`
- add `createdByParticipantId`
- add `assessmentMode`
- add canonical `birthProfile`
- add canonical `birthSignature`
- keep raw RIASEC answers at rest
- add `reflections`

Client assessment restore:
- still strip `birthDate` and raw `riasecAnswers`
- Birth Profile / Birth Signature are safe to return to the same authorized Subject owner/facilitator while unclaimed
- reflections may return to the authorized owner, but never Presenter or claim-preview endpoints

## Lark additive schema V2

### Subjects — new table

Create a new Preview table exactly per `docs/SUBJECT_CLAIM_V2.md` with these fields:

| field | type |
|---|---|
| subject_id | Text |
| owner_participant_id | Text |
| created_by_participant_id | Text |
| subject_kind | Text |
| display_label | Text |
| birth_date | Text |
| claim_status | Text |
| claim_token_hash | Text |
| claim_expires_at | Text |
| claimed_at | Text |
| last_assessment_id | Text |
| created_at | Text |
| updated_at | Text |
| archived | Checkbox |

No URL fields. Claim token hash is server-only; never return it to browser clients.

Preview env must add:

`LARK_SUBJECTS_TABLE_ID`

Do not add Production table/env until persistent Preview claim UAT passes.

### Assessments — add fields

All new fields are additive. Existing fields remain unchanged.

| field | type | source |
|---|---|---|
| subject_id | Text | analysed Subject |
| created_by_participant_id | Text | authenticated initiating Participant |
| assessment_mode | Text | `self` or `co_present` |
| birth_profile_json | Long text | canonical calculated BirthProfileResult JSON |
| birth_signature_json | Long text | canonical calculated BirthSignatureResult JSON |
| birth_pyramid_main | Number | O |
| birth_outer_composite | Number | M |
| birth_inner_composite | Number | N |
| birth_current_stage | Text | stage key |
| birth_current_stage_number | Number | U/R/X for current adult stage; blank pre-adult |
| age_band | Text | privacy-safe age band |
| reflection_energizing | Long text | reflection 1 |
| reflection_friction | Long text | reflection 2 |
| reflection_exploration | Long text | reflection 3 |

Existing `participant_id` stays for V1 compatibility and may continue to record the initiating participant during V2 migration.

### AI_Reports — add fields

| field | type |
|---|---|
| birth_profile_summary | Long text |
| unused_potential | Long text |

Do not delete or rename any V1 field.

## Subject access / history target

Add repository/API support equivalent to:

- list Subjects available to current Participant;
- create/reuse self Subject;
- create guest Subject;
- append Assessment to Subject;
- list Assessment history by Subject;
- update Subject `last_assessment_id`;
- create/redeem claim token.

Authorization:

A Participant may access a Subject if:

1. they own it; or
2. it is still `unclaimed` and they created it.

After claim, the facilitator loses normal access.

V1 `findLatestForParticipant` must continue to work for old records while V2 UI migrates to Subject history.

## Claim API target

Implement equivalent routes:

- `GET /api/subjects`
- `POST /api/subjects`
- `GET /api/subjects/:subjectId/assessments`
- `POST /api/claims`
- `GET /api/claims/preview?token=...`
- `POST /api/claims/redeem`

Claim preview is intentionally minimal and unauthenticated; it must not include birth date, reflections, priorities, exploration interest, raw answers, exact age, LINE identity, or raw Birth Signature details.

Claim redemption must require authenticated LINE identity in live mode and mock authenticated identity in deterministic test mode.

## LINE conversion / return target

Preserve a pending claim across LINE OAuth / LIFF authentication so the claimant returns to the intended claim flow instead of losing the token.

Do not expose the token in logs.

The LINE Login channel is linked to the official account. Existing `bot_prompt=normal` may be retained so LINE can offer adding the OA.

Do not state that OA follow is mandatory unless friendship is actually checked/enforced.

Preferred claim copy:

> 用 LINE 登入保存這份結果；加入官方 LINE 後，也可以更方便從聊天室回來查看。

## Public sharing

Public share card must contain no claim token.

Allowed share content:

- Life Path label/number;
- RIASEC Top3;
- up to 3 safe repeated-signal summaries;
- generic product/landing URL.

Private `傳給本人並保存` uses the claim URL and should tell the facilitator not to post it publicly.

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
- `birthSignatureFacts(canonicalBirthSignature)`
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
- claim token / claim token hash
- subject owner/creator identifiers

## Interpretation weighting

Use this evidence priority:

1. participant reflection / self validation
2. RIASEC result + item signals
3. pyramid primary structure
4. legacy Birth Signature secondary patterns

A Birth Signature-only pattern must be described as a weak symbolic clue, not a conclusion.

## AI interpretation policy

Prompt must ask for cross-source interpretation:

- identify repeated signals across Birth Profile / Birth Signature / RIASEC / self-report / current reality
- surface inner-vs-outer or interest-vs-energy tensions as hypotheses
- use Talent Usage for `unused_potential`
- treat Birth Profile and Birth Signature as symbolic language and RIASEC as interest preference
- reflection text is participant-owned evidence and should be weighted strongly
- low-presence/missing birth numbers are not deficiencies

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
- 天生不足

## Final report UX

Recommended order:

1. `反覆出現的線索`
2. `出生結構這面鏡子` — birth_profile_summary
3. `你的原動力` — motivator_summary
4. `同時在乎的兩件事` — possible_tensions
5. `可以再發揮的空間` — unused_potential
6. `可以先試的小方向` — exploration_directions
7. `帶走的一個問題` — reflection_question
8. summary/disclaimer

For an unclaimed co-present guest, append a clearly separate save/share section only after the complete report.

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
- raw Birth Signature grid/counts
- claim state/token
- Subject ownership details

## Consent copy update

Replace the V1 statement that AI only receives Life Path/RIASEC summaries. State accurately:

- birth date is used by the program to calculate the Birth Profile, derived Birth Signature and age band
- AI receives calculated symbolic Birth Profile/Signature facts, RIASEC derived signals and the participant's reflection answers
- AI does not receive full birth date, LINE user ID or the q01–q18 raw answer map

Guest disclosure must additionally state:

- the facilitator can view this guest result while it is unclaimed;
- the guest may claim it into their own LINE account after seeing the report;
- after claim, the facilitator no longer has normal private access;
- claim link is private and time-limited.

Do not claim automatic unclaimed-data deletion is active until a cleanup mechanism is actually deployed.

## Migration/compatibility

Old V1 Assessments may not have Subject IDs, V2 birth JSON fields or reflections.

Read path must tolerate missing V2 fields:
- if Birth Profile/Signature missing but private birthDate is available, backend may calculate on read
- otherwise return a V1-compatible result
- AI report V1 records without new fields remain readable; UI should fall back gracefully
- V1 participant-linked records must continue to be accessible to their original Participant
- do not rewrite historical records in this PR

For new V2 self writes, create/reuse a self Subject and attach the new Assessment to it.

## QA gates

Unit/API:
- legacy Inner Number pyramid fixtures
- legacy grid/signature fixture
- master number separate from pyramid main
- invalid calendar date
- age bands/stage boundaries
- client-forged birth profile/signature rejected
- LLM fact serialization contains no full DOB or q01 key names
- AI V2 schema/guardrails all providers
- Lark V1 record read compatibility
- self Subject create/reuse
- repeat self assessment appends history
- guest Subject remains distinct from facilitator self Subject
- same birthday does not auto-merge Subjects
- facilitator can access unclaimed guest
- secure claim token: opaque, hashed, expiry, single use
- claim preview leaks no private fields
- claim transfers ownership
- facilitator access removed after claim
- second claimant cannot steal claim
- existing self Subject conflict does not silently merge
- public share payload contains no claim token
- Presenter allowlist remains private-safe

Browser E2E:
- full V2 mobile self flow
- reflection limits
- assessment save → AI report → refresh restore
- repeat self assessment/history
- co-present guest full flow
- report visible before LINE claim CTA
- private claim link generation
- claim login/LIFF return and success
- facilitator loses private access after successful claim
- public share output contains no claim token
- presenter positive/no-consent
- no horizontal overflow 390×844
- desktop 1440×900
- no console errors

Preview live:
- add all V2 additive fields plus `Subjects` table to Preview Lark only
- configure `LARK_SUBJECTS_TABLE_ID` for Preview
- run persistent Vercel Preview self + repeat + guest + claim + Presenter end-to-end
- do not merge PR #10 until all persistent Preview gates pass.
