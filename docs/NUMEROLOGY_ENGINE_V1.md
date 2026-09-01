# Numerology Engine V1 — 第一面鏡子唯一計算規格

版本：V1.0  
狀態：LOCKED FOR P0  
目的：避免 `innernumber` 內多套算法混用。P0 所有生命靈數計算必須只遵守本文件。

---

## 1. V1 範圍

P0 第一面鏡子只計算：

- `life_path`

結果集合：

- 1–9
- 11
- 22
- 33

P0 不計算：

- Birthday Number
- Talent Number
- Zodiac Number
- Missing Number
- Grid / Lines
- Personal Year
- Pyramid A–X

以上皆屬後續功能，不能偷偷加入 P0。

---

## 2. Life Path 計算規則

輸入：合法 Gregorian calendar date，格式 `YYYY-MM-DD`。

步驟：

1. 取出生年月日的 8 個數字。
2. 將所有數字相加。
3. 若結果為 11、22、33，立即停止 reduction。
4. 否則，只要結果 > 9，繼續把各位數相加。
5. 最終輸出 1–9、11、22、33。

### Example A

`1978-11-05`

```text
1+9+7+8+1+1+0+5 = 32
3+2 = 5
```

Result:

```text
5
```

### Example B — Master 11

`1950-03-29`

```text
1+9+5+0+0+3+2+9 = 29
2+9 = 11
```

Result:

```text
11
```

### Example C — Master 22

`1950-01-06`

```text
1+9+5+0+0+1+0+6 = 22
```

Result:

```text
22
```

### Example D — Master 33

`1950-07-29`

```text
1+9+5+0+0+7+2+9 = 33
```

Result:

```text
33
```

---

## 3. TypeScript Contract

Recommended API:

```ts
export type LifePath = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | 22 | 33;

export interface LifePathResult {
  value: LifePath;
  rawDigitSum: number;
  reductionSteps: number[];
}

export function calculateLifePath(birthDate: string): LifePathResult;
```

Example output:

```ts
calculateLifePath('1978-11-05')
// {
//   value: 5,
//   rawDigitSum: 32,
//   reductionSteps: [32, 5]
// }
```

Master example:

```ts
calculateLifePath('1950-01-06')
// {
//   value: 22,
//   rawDigitSum: 22,
//   reductionSteps: [22]
// }
```

`reductionSteps` 可供 UI 之後顯示「你的數字怎麼算出來」，但 P0 不一定要顯示。

---

## 4. Date Validation

不得依賴 JavaScript `Date` 的自動 rollover 當唯一驗證。

必須拒絕：

- `2026-02-30`
- `2026-13-01`
- `abcd-11-05`
- 空值
- 非完整 YYYY-MM-DD

必須接受合法 leap day，例如：

- `2000-02-29`
- `2024-02-29`

建議以 strict parser / schema validation 實作。

---

## 5. Life Path Labels

| Life Path | Public Label | Core Motivation |
|---|---|---|
| 1 | 開創者 | 創造與主導 |
| 2 | 連結者 | 關係與和諧 |
| 3 | 表達者 | 表達與被看見 |
| 4 | 建構者 | 穩定與完成 |
| 5 | 探索者 | 自由與體驗 |
| 6 | 守護者 | 付出與價值感 |
| 7 | 洞察者 | 理解與深度 |
| 8 | 成就者 | 成果與影響力 |
| 9 | 理想者 | 意義與貢獻 |
| 11 | 啟發者 | 啟發與連結 |
| 22 | 實踐者 | 把理想變成現實 |
| 33 | 賦能者 | 幫助人成長 |

---

## 6. Content Model

生命數文案不得 hard-code 散落在 React components。

建立 typed content data：

```ts
export interface LifePathContent {
  value: LifePath;
  label: string;
  coreMotivation: string;
  keywords: string[];
  strengths: string[];
  drains: string[];
  reflectionQuestion: string;
  resonanceOptions: string[];
}
```

內容放在：

```text
src/data/lifePathContent.ts
```

UI 只 consume data。

---

## 7. Content Tone Rules

Life Path 是「自我反思入口」，不是心理測量或命定診斷。

### 可以

- 「你可以觀察自己是否……」
- 「這個框架通常把 5 解讀為自由、變化與探索。」
- 「如果這段有感，值得留意……」
- 「你可能比較容易在……的環境產生能量。」

### 不可以

- 「你一定……」
- 「你天生就……」
- 「你的天命是……」
- 「因為你是 8，所以你適合當老闆。」
- 「因為你缺某數字，所以人格有缺陷。」
- 由生命數推論健康疾病、財富結果或必然職業。

UI 必須保留簡短 disclaimer：

> 生命靈數是一種自我反思工具，結果不代表命定的人格或人生。

---

## 8. Resonance Validation

生命數結果顯示後，必須讓本人驗證，而不是讓系統宣告「準」。

保存：

```text
life_path_resonance
```

Options:

- `high` — 很像
- `partial` — 有一點
- `low` — 不太像

再保存：

```text
life_path_top_resonance
```

用來記錄本人最有感的描述。

這兩個欄位後續給 AI 的權重應高於單純 Life Path 標籤。

---

## 9. Relationship to RIASEC

Life Path 與 RIASEC 不合併計分。

禁止：

```text
Life Path 50% + RIASEC 50% = Talent Accuracy
```

正確方式：

- Life Path = 象徵性反思鏡子
- RIASEC = 活動 / 職涯興趣偏好鏡子
- 本人現況 = 第三面鏡子
- LLM = 找重複線索與張力

核心原則：

> 整合解讀，不整合計分。

---

## 10. Required Unit Tests

至少包含：

```text
1978-11-05 -> 5
1950-03-29 -> 11
1950-01-06 -> 22
1950-07-29 -> 33
```

另外測：

- 每個一般數字 1–9 至少一例
- leap year valid / invalid
- invalid month
- invalid day
- malformed input
- reductionSteps

Master Numbers 不得被進一步 reduction：

```text
11 != 2
22 != 4
33 != 6
```

---

## 11. Legacy Compatibility Rule

新版不追求與 `innernumber` 所有輸出 100% 相容。

只要求：

- P0 Life Path 依本 spec deterministic
- 對相同生日永遠得到相同 Life Path
- Master Number 規則一致

若 `innernumber` 舊頁面顯示不同數字：

> 以本文件為準。

---

## 12. Future Extension Boundary

後續若加入：

- Birthday Number
- Personal Year
- Missing Number
- Pyramid

每一項都必須有自己的 spec，例如：

```text
docs/numerology/PERSONAL_YEAR_V1.md
docs/numerology/PYRAMID_V1.md
```

不得直接塞回 `lifePath.ts`。

這能避免舊版「一支 HTML 裡所有系統混成一團」的問題再次發生。
