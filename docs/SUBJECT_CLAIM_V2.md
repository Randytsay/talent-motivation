# Subject / Guest Claim Architecture V2

This document is the canonical product and persistence contract for multi-person exploration, repeat assessments, and LINE result claiming.

## Product intent

A LINE account identifies **who is using the system**, not automatically **who is being analysed**.

The system must support:

1. a participant exploring themself repeatedly over time;
2. a participant facilitating an exploration for another person who is physically present;
3. that guest seeing the full result before deciding whether to add the official LINE account / sign in;
4. that guest later claiming the result into their own LINE identity and history;
5. a safe public share card that never contains a claim credential;
6. preserving repeated assessments rather than overwriting history.

Core rule:

> Account = who logged in. Subject = who the assessment is about. Assessment = one point-in-time exploration.

## UX model

### First self exploration

Do not ask "who logged in"; LINE identity already answers that.

After birth date entry, ask once:

> 這是你本人的出生日期嗎？
>
> - 是，我自己
> - 不是，我在陪另一位一起探索

If `self`, create/reuse the participant's self Subject.

### Returning participant

Default home/history experience:

- 我的探索
- 再次探索
- 查看過去結果
- 陪另一位一起探索

A repeat self assessment must append a new Assessment to the same self Subject. Do not overwrite the previous assessment.

### Different birthday on a self journey

Never silently change the stored self birthday. Ask:

> 這個出生日期和你原本保存的不同。這次是：
>
> - 陪另一位一起探索
> - 更正我自己的出生日期

Birthday equality is never a unique person identifier.

### Facilitated guest journey

Use wording such as `陪另一位一起探索`, not `代填`.

The RIASEC and reflection questions should be answered by the person being analysed. The facilitator can hold the device, but copy must explicitly encourage the guest to answer for themself.

Guest result is shown in full before any LINE conversion CTA.

After the report:

> 喜歡這份探索結果嗎？
>
> 使用 LINE 登入把這份結果保存到自己的帳號。之後可以隨時查看、再次探索、比較不同時間的變化。

Primary CTA:

`用 LINE 保存我的結果`

Secondary CTAs:

- `傳給本人並保存` — private one-time claim link
- `分享精華結果` — public-safe share card, **no claim token**
- `先不用`

Do not make LINE follow/login a gate to seeing the report.

## Data model

### Participants

Existing account identity table. Canonical identity remains LINE `userId`.

A Participant represents the account holder, not the analysed person.

### Subjects — new table

One Subject represents one analysed person identity within this product.

Recommended fields:

| field | type | notes |
|---|---|---|
| subject_id | Text | UUID, unique |
| owner_participant_id | Text | blank while an unclaimed guest; claimant after claim |
| created_by_participant_id | Text | facilitator/account that initiated the subject |
| subject_kind | Text | `self`, `guest`, `claimed` |
| display_label | Text | `我自己`, `太太`, `朋友 A`, etc.; not a legal-name identity claim |
| birth_date | Text | private ISO date, never Presenter/LLM raw input |
| claim_status | Text | `not_applicable`, `unclaimed`, `claimed`, `expired`, `revoked` |
| claim_token_hash | Text | SHA-256 only; never store plaintext claim token |
| claim_expires_at | Text | ISO-8601; normally 7 days |
| claimed_at | Text | ISO-8601 |
| last_assessment_id | Text | convenience pointer only |
| created_at | Text | ISO-8601 |
| updated_at | Text | ISO-8601 |
| archived | Checkbox | default false |

No URL fields.

### Assessments — additive V2 fields

Add:

| field | type | notes |
|---|---|---|
| subject_id | Text | subject this assessment is about |
| created_by_participant_id | Text | account that initiated the assessment |
| assessment_mode | Text | `self` or `co_present` for persisted full assessments |

Existing `participant_id` remains for V1 compatibility during migration. For V2 writes it should represent the initiating/authenticated participant, while authorization and history should migrate toward Subject ownership semantics.

Do not mutate or delete historical V1 assessments.

### Birth-profile-only preview

A casual "只看看出生結構" mode may be calculated client/server-side without persisting a full Assessment. V2 does **not** need to force nullable RIASEC fields into the Assessment schema for this lightweight preview.

Only a completed full exploration becomes claimable.

## Subject access rules

A Participant may access a Subject when either:

1. `subject.owner_participant_id === participant.participant_id`; or
2. the Subject is `unclaimed` and `subject.created_by_participant_id === participant.participant_id`.

After a guest Subject is claimed, the original facilitator must no longer have normal access to the guest's private full history/report through authenticated APIs.

Presenter access remains event-consent based and uses the existing strict allowlist; claim ownership does not grant Presenter visibility.

## Claim security

### Token generation

- generate at least 32 random bytes using a cryptographically secure RNG;
- encode token base64url/URL-safe;
- store only `SHA-256(token)` in Lark;
- token is single-use;
- default expiry: 7 days;
- never log plaintext token;
- never place token inside public analytics events;
- never place full birthday or subject ID in the claim URL if avoidable.

Recommended URL:

`/claim?token=<opaque-token>`

### Claim creation

Only the authenticated facilitator who currently has access to the unclaimed guest Subject may create/regenerate a claim token.

Creating a new claim token invalidates any previous token for that Subject.

### Claim redemption

Claim redemption requires a real authenticated LINE Participant in live mode.

On success:

- verify token hash, status, and expiry;
- set `owner_participant_id` to claimant;
- set `subject_kind=claimed` (or `self` if the claimant has no existing self Subject and implementation chooses to promote it);
- set `claim_status=claimed`;
- set `claimed_at`;
- clear `claim_token_hash` and `claim_expires_at`;
- preserve existing Assessment IDs and AI Report IDs;
- original facilitator loses ordinary private access.

Claim is idempotent only for the same already-claimed owner; a second unrelated claimant must receive 409/410 and never take ownership.

### Existing self Subject conflict

Do not silently merge two Subject records based only on birthday or label.

For V2:

- claim ownership safely first;
- if claimant already has a self Subject, keep the newly claimed Subject as an owned `claimed` Subject;
- a future explicit merge flow may consolidate histories after user confirmation.

This avoids mutating append-only historical assessments during claim redemption.

## API target

Add server routes / wrappers with equivalent semantics:

- `GET /api/subjects` — owned Subjects plus unclaimed guest Subjects created by current participant
- `POST /api/subjects` — create self/guest Subject under validated rules
- `GET /api/subjects/:subjectId/assessments` — authorized history
- `POST /api/claims` — create/regenerate a claim token for an unclaimed guest Subject / completed assessment
- `GET /api/claims/preview?token=...` — minimal non-sensitive preview before auth; no birth date/reflections/raw answers
- `POST /api/claims/redeem` — authenticated claim redemption

Assessment creation must accept a `subjectId`; backend validates subject access and that submitted birth date matches the Subject private birth date. Never trust a client-supplied owner/creator ID.

## Claim preview payload

Unauthenticated claim preview may include only enough context to reassure the user they are claiming the intended result, for example:

- report display label if explicitly set by facilitator;
- Life Path number/label;
- RIASEC Top3 code;
- assessment completion date;
- claim expiry.

Do not include:

- full birth date;
- exact age;
- LINE identity;
- reflection text;
- priorities;
- exploration interest;
- raw q01–q18 answers;
- raw Birth Signature grid/counts.

## Official LINE conversion

The LINE Login channel and official account are linked. Login flow may use the existing `bot_prompt=normal` behavior so LINE can offer adding the official account.

Do not falsely claim that saving requires following the OA unless friendship is actually checked and enforced.

Preferred copy:

> 用 LINE 登入保存這份結果；加入官方 LINE 後，也可以更方便從聊天室回來查看。

If LIFF friendship status is available, the UI may show a separate `加入官方 LINE` CTA when the user has not followed the OA.

## Sharing

### Private claim share

`傳給本人並保存` may share the one-time claim URL directly to the intended guest.

Warn that the link is private and should not be posted publicly.

### Public share card

Public share output contains no claim token and no private fields.

Recommended content:

- Life Path label/number;
- RIASEC Top3;
- up to three safe repeated-signal summaries;
- generic product line / landing URL;
- optional non-identifying referral code later.

Public share must never permit ownership transfer.

## Repeat assessments and longitudinal value

All completed Assessments are append-only.

History is grouped by Subject, not merely Participant.

For a self/claimed Subject, future comparison may show:

- stable RIASEC signals;
- changed RIASEC ordering;
- Talent Usage change;
- priority change;
- exploration-interest change;
- reflection themes over time.

Birth Profile / Birth Signature remain deterministic for the same birth date and should be treated as stable context, not repeated-changing evidence.

## Unclaimed guest privacy

Recommended policy:

- claim token expiry: 7 days;
- unclaimed guest retention target: 30 days;
- show retention disclosure before guest completes full assessment;
- a later cleanup job may delete or anonymize expired unclaimed guest private data.

V2 must at least persist `claim_expires_at` and make expired tokens unusable. Automatic 30-day cleanup can be implemented before public launch or in a follow-up PR if time-constrained, but it must not be silently represented as already active.

## QA gates

Unit/API tests must cover:

- self Subject create/reuse;
- repeat self assessment appends history;
- guest Subject is distinct from facilitator self Subject;
- same birthday does not auto-merge Subjects;
- facilitator can access unclaimed guest result;
- claim token is opaque, hashed at rest, expires, and is single-use;
- claim preview leaks no private fields;
- claim redemption transfers ownership;
- facilitator loses private access after claim;
- second claimant cannot steal already claimed Subject;
- existing self Subject conflict does not silently merge;
- public share payload contains no claim token;
- Presenter payload remains unchanged/private-safe;
- V1 participant-only records remain readable during migration.

Browser E2E must cover:

1. self first run;
2. self repeat run / history;
3. co-present guest full run;
4. report visible before claim;
5. claim CTA;
6. claim login/LIFF return;
7. claim success under claimant account;
8. facilitator access removed after claim;
9. public share has no claim token;
10. 390x844 mobile with zero horizontal overflow / console errors.

## Migration order

1. implement code/contracts/repositories with memory tests;
2. add `Subjects` table in Preview Lark only;
3. add additive Assessment fields;
4. add Preview env `LARK_SUBJECTS_TABLE_ID`;
5. persistent Preview E2E;
6. only after PASS, add the same table/fields to Production;
7. never merge PR #10 before Preview persistence and claim-flow UAT pass.
