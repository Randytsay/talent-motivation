# Birth Profile V2 — Inner Number Fusion

## Why V2 keeps more than one number

Legacy `Randytsay/innernumber` felt more personal because it did not rely on one Life Path value. It combined several deterministic views of the same birth date. V2 preserves that *structural richness* while removing health, wealth, destiny and career-deterministic claims.

Birth Profile V2 has two layers.

## Layer A — Pyramid structure (primary)

Source: legacy A–X pyramid math.

Primary participant-facing signals:

- Life Path — existing master-number aware core reflection
- Pyramid main O — second core symbolic lens
- Outer composite M — outward style hypothesis
- Inner composite N — inward need hypothesis
- Current adult-stage number — U (18–39), R (40–64), or X (65+)

Secondary stored values:

- outer pair I/J
- inner pair K/L
- all A–X nodes for deterministic audit/debug only

The event UI does not show all A–X nodes.

## Layer B — Legacy signature (secondary / hidden by default)

Source: legacy `calculate()` grid logic.

Calculated signals:

- birthday number
- raw-sum support digits (legacy talent digits)
- legacy zodiac number mapping
- innate non-zero birth-date digits
- 1–9 grid counts
- low-presence/missing numbers
- repeated numbers
- active 3-number and 2-number patterns

This layer is **not** a second personality test. It is supporting symbolic evidence. AI should use it only when it converges with Pyramid, RIASEC or self-report.

### Neutralized pattern labels

| Legacy pattern | V2 label |
|---|---|
| 1-2-3 美感藝術線 | 美感與行動 |
| 4-5-6 完美組織線 | 組織與完成 |
| 7-8-9 權勢靈性線 | 影響與整合 |
| 1-4-7 務實物質線 | 務實與執行 |
| 2-5-8 熱情公關線 | 人際與推動 |
| 3-6-9 創意智慧線 | 創意與理解 |
| 1-5-9 事業成效線 | 目標與成效 |
| 3-5-7 最佳人緣線 | 溝通與連結 |
| 2-4 靈巧變通線 | 靈活與變通 |
| 4-8 工作策略線 | 策略與執行 |
| 2-6 公平正義線 | 公平與協調 |
| 6-8 親切誠懇線 | 可靠與承擔 |

## Interpretation hierarchy

AI must weight evidence in this order:

1. Participant reflection text / self validation
2. RIASEC result and item signals
3. Pyramid primary structure
4. Legacy signature secondary patterns

A signature-only pattern must never become a strong conclusion.

Example:

- Birth signature has `人際與推動`
- RIASEC E is high
- subjective energy = E
- reflection says the participant enjoys bringing people/resources together

→ strong repeated signal: **推動與連結**

But if only the Birth signature shows `人際與推動` and the other three sources do not, report wording should be:

> 出生結構中有一個「人際與推動」的象徵線索，但目前其他結果沒有明顯重複出現，可以先保留觀察，不必急著把它當成定論。

## Missing numbers are not deficiencies

Legacy UI called them `空缺課題`. V2 must not frame them as deficits.

Use:

- `low_presence_numbers`
- `較少出現的象徵線索`
- `可留意但不代表缺陷`

Do not use:

- 缺陷
- 天生不足
- 必須補足
- 因為缺 X 所以會發生 Y

## Privacy projection

LLM receives derived facts only:

```json
{
  "birthday_number": 5,
  "support_digits": [3, 2],
  "innate_digits": [1, 5, 7, 8, 9],
  "repeated_numbers": [{"number":1,"count":3}],
  "low_presence_numbers": [4, 6],
  "active_patterns": [{"key":"258","label":"人際與推動"}]
}
```

It does not receive the full birth date from this layer.

## Not included in V2 event flow

- personal year / annual fortune
- wealth belief predictions
- business destiny
- relationship destiny
- health/recovery prediction
- mission/karma claims

These may remain legacy-reference material but are not part of the new production methodology.
