# 天賦原動力 — Lark Base Schema V1

狀態：P1 Preview / Production 共用資料契約

> 這份文件定義 Lark Base 欄位型別。Runtime 目前直接以這些 JSON primitive 寫入 Lark OpenAPI，因此 Base 欄位型別必須與此契約一致。

## 重要規則

1. **目前沒有任何欄位需要使用 Lark 的 URL 欄位型別。**
2. `picture_url` 必須是 **Text**，不是 URL。程式以純字串保存 LINE 頭像網址。
3. 所有 `*_at` / `event_date` 在 V1 先用 **Text** 保存 ISO-8601 字串，不使用 Lark Date/DateTime 欄位。
4. ID、code、Top3、選項與 JSON 均使用 Text。
5. 題目答案、分數、Life Path、Talent Usage 使用 Number。
6. `presenter_consent` 使用 Checkbox / Boolean。
7. 建 Preview Base 時，欄位名稱必須與下表完全一致；不要依欄位名稱自行推測成 URL、Date 或 Person 類型。

---

## Participants

| Field | Lark type | Notes |
|---|---|---|
| participant_id | Text | internal UUID |
| line_user_id | Text | unique canonical identity |
| display_name | Text | mutable |
| picture_url | **Text** | **NOT URL field** |
| birth_date | Text | reserved; ISO date when used |
| birth_year | Number | reserved |
| life_path | Number | reserved |
| privacy_consent_version | Text | reserved |
| privacy_consent_at | Text | reserved; ISO-8601 |
| latest_assessment_id | Text | latest pointer |
| created_at | Text | ISO-8601 |
| last_seen_at | Text | ISO-8601 |

## Assessments

| Field | Lark type |
|---|---|
| assessment_id | Text |
| participant_id | Text |
| event_id | Text |
| device_type | Text |
| entry_source | Text |
| started_at | Text |
| completed_at | Text |
| life_path | Number |
| life_path_resonance | Text |
| life_path_top_resonance | Text |
| q01 ... q18 | Number |
| r_score | Number |
| i_score | Number |
| a_score | Number |
| s_score | Number |
| e_score | Number |
| c_score | Number |
| top1 | Text |
| top2 | Text |
| top3 | Text |
| top3_code | Text |
| self_energy_choice | Text |
| talent_usage_pct | Number |
| priority_1 | Text |
| priority_2 | Text |
| exploration_interest | Text |
| reflection_answer | Text |
| presenter_consent | Checkbox / Boolean |
| presenter_consent_at | Text |

## AI_Reports

| Field | Lark type |
|---|---|
| report_id | Text |
| assessment_id | Text |
| repeated_signals | Text / Long text |
| motivator_summary | Text / Long text |
| possible_tensions | Text / Long text |
| exploration_directions | Text / Long text |
| reflection_question | Text / Long text |
| summary | Text / Long text |
| report_json | Text / Long text |
| prompt_version | Text |
| model_name | Text |
| user_rating | Number |
| user_highlight | Text / Long text |
| generated_at | Text |

## Events

| Field | Lark type |
|---|---|
| event_id | Text |
| event_code | Text |
| event_name | Text |
| event_date | Text |
| status | Text |
| current_presenter_assessment | Text |
| created_at | Text |

---

## Preview QA note

If Lark returns application error `1254068 / URLFieldConvFail` while listing records, first inspect the Base schema for any URL-type field. For this V1 schema, change that field to Text (especially `Participants.picture_url`) or recreate the field as Text if Lark cannot convert it in place. After correcting the schema, no code change should be required.
