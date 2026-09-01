# innernumber Legacy Audit — 天賦原動力取用規則

版本：V1.0  
來源倉庫：`Randytsay/innernumber`  
目的：判斷舊生命靈數專案哪些內容可直接保留、哪些需重寫、哪些不應帶入新版 `talent-motivation`。

---

## 1. 結論

`innernumber` 不適合直接作為新版系統底座，但有大量可再利用資產。

新版策略：

> 重建架構，不重寫一切。

`innernumber` 定位為：

- 演算法素材庫
- 文案素材庫
- SVG / 報告視覺參考
- 後續進階「生命金字塔」功能來源

`talent-motivation` 則重新建立：

- React / TypeScript 模組化架構
- LINE LIFF / LINE Login
- Lark Base 持久化
- RIASEC
- 三面鏡子
- AI 交叉解析
- 歷史紀錄
- Presenter Mode

禁止直接將整份 `index.html` 搬入新系統。

---

## 2. 現況盤點

舊 repo 主要包含：

- `index.html`：約 98KB，包含 UI、CSS、內容資料、數字演算法、SVG、截圖及 localStorage
- `pyramid-report.html`：獨立完整生命金字塔報告頁
- `金字塔生命靈數分析報告架構.md`：完整報告內容框架
- `img/`

功能已包含：

- Life Path / 生命數
- 生日數
- 天賦數
- 星座數
- 先天數
- 空缺數
- 九宮格與連線
- 流年數
- 生命金字塔 A–X 計算
- 內在 / 外顯性格
- 領導力 / 通用力 / 專業力
- 金字塔 SVG
- PNG 複製 / 下載
- localStorage 狀態恢復
- 完整報告頁

因此舊系統「內容量」足夠，但部分演算法、命名與文案定位不符合新版產品原則。

---

## 3. 已確認的技術債 / 衝突

### 3.1 Life Path 與金字塔 O 的 Master Number 規則不一致

主 Life Path 使用 `reduceToSingleOrMaster()`，保留：

- 11
- 22
- 33

但金字塔 O 使用 `reduceToSingle()`，只保留 1–9。

因此同一生日可能出現：

- 主畫面 Life Path = 11
- 金字塔 O = 2

如果報告把兩者都稱為「生命數」，會造成概念衝突。

**新版決策：**

- V1 唯一「生命數 / Life Path」採 Master Number 保留規則。
- 金字塔 O 若未來加入，必須改名為「金字塔主要性格 O」或其他專屬名稱，不得與 Life Path 混稱。

---

### 3.2 流年年份有 hard-code 漂移

UI 已顯示 2026 流年，但既有程式計算區仍曾出現：

```js
const currentYear = 2025;
```

**新版決策：**

- 不允許 hard-code current year。
- 一律以指定 `targetYear` 或系統年份傳入純函式。
- V1 不納入流年；列入後續功能。

---

### 3.3 多套數字系統混在同一頁，來源層級不清楚

舊版同時存在：

- Life Path
- Birthday Number
- Talent Number
- Zodiac Number
- Innate Number
- Missing Number
- Grid Lines
- Personal Year
- Pyramid A–X

而且部分衍生數字又會回填九宮格圈數，容易讓使用者誤以為所有數字都來自同一個標準化理論。

**新版決策：**

V1 第一面鏡子只保留：

- DOB
- Life Path
- 1–9 / 11 / 22 / 33 的反思內容

其他系統不進 P0。

---

### 3.4 localStorage 只適合舊單機體驗

舊版用 localStorage 保存：

- birthday
- pyramid data
- 頁面返回狀態

這無法支援：

- LINE 身分
- 跨裝置
- 歷史測驗
- 多活動
- 講師 Presenter

**新版決策：**

- localStorage 僅可作「未完成作答暫存」與斷線恢復。
- 正式資料以 Lark Base 為 Source of Truth。

---

## 4. KEEP / REWRITE / DROP

| 舊內容 | 分類 | 新版處理 |
|---|---|---|
| 日期輸入與有效性檢查概念 | KEEP | 改寫成 TypeScript utility + tests |
| `reduceToSingleOrMaster()` 概念 | KEEP | 寫成純函式並完整測試 |
| 基本 Life Path 算法 | KEEP | 成為 Numerology Engine V1 核心 |
| 1–9 關鍵字素材 | KEEP / REWRITE | 保留概念，重寫成較中性、自我探索語氣 |
| 11 / 22 / 33 | KEEP / REWRITE | 保留 Master Number，但文案需重新校準 |
| 金字塔 A–X 算法 | KEEP LATER | 不進 P0，先保存並另外版本化 |
| 金字塔 SVG 幾何 | KEEP LATER | 未來可搬成 React/SVG component |
| 報告卡片資訊架構 | KEEP | 值得參考新版個人報告 UX |
| PNG / 圖片輸出概念 | KEEP LATER | P2 重新實作 |
| localStorage 中斷恢復概念 | KEEP | 只存暫存 session，不作正式資料庫 |
| 九宮格 | REWRITE LATER | 需先釐清理論與資料來源 |
| 九宮格連線 | REWRITE LATER | 可作趣味延伸，不作核心判斷 |
| 空缺數 | REWRITE | 不得用「缺少某數 = 人格缺陷」的語氣 |
| 個人流年 | REWRITE LATER | 去 hard-code，演算法獨立版本化 |
| Birthday Number | REVIEW LATER | 不進 V1；日後決定 Master Number 規則 |
| Talent Number | REVIEW LATER | 屬舊版自有衍生定義，需先確認理論來源 |
| Zodiac Number | REVIEW / DROP | 不屬目前三面鏡子核心，暫不納入 |
| 財富能量斷言 | DROP | 不以生日推論財富能力 |
| 健康注意事項 | DROP | 不以生命靈數推論健康 |
| 明確職業適性斷言 | DROP / REWRITE | 職涯部分改由 RIASEC 主導 |
| `bizMessages` 直接導向創業/被動收入 | DROP | 不進生命靈數結果 |
| 「靈魂使命」「命定」式強斷言 | REWRITE | 改為可能、傾向、值得探索 |

---

## 5. 文案安全與可信度規則

新版第一面鏡子禁止：

- 「你天生就是……」
- 「你的天命是……」
- 「你一定適合……」
- 「你缺 X，所以你……」
- 「這個數字代表你會有財富 / 健康問題」
- 「因為你是 X 號，所以最適合創業」

新版推薦：

- 「這個框架通常把 X 解讀為……」
- 「你可以觀察自己是否容易……」
- 「如果這段描述有感，值得留意……」
- 「這是一面反思鏡子，不是人格診斷。」

職涯探索以 RIASEC 與本人現況回答為主，不由生命數直接決定。

---

## 6. 值得保留的舊報告設計

舊 `pyramid-report.html` 的資訊架構有價值：

1. 執行摘要
2. 大型主圖
3. 核心數字
4. 優勢
5. 挑戰
6. 行動建議

新版可借用這種層級，但視覺與措辭改為「成熟、溫暖、職涯探索」，避免過度神秘化。

---

## 7. 未來生命金字塔定位

生命金字塔不放入活動第一輪 P0。

未來可作：

```text
我的天賦原動力
├─ 基礎探索
│  ├─ Life Path
│  ├─ RIASEC
│  └─ 三面鏡子
└─ 深度探索
   └─ 生命金字塔
```

這樣可以讓舊資產成為活動後的延伸內容，而不是一開始塞給參加者。

---

## 8. Codex 取用舊 repo 規則

Codex 可以閱讀 `Randytsay/innernumber` 作參考，但：

1. 不可 copy 整份 `index.html`。
2. 不可直接搬 `bizMessages`。
3. 不可直接搬 health / wealth / destiny 強斷言。
4. 所有演算法必須重新寫成 TypeScript pure functions。
5. 所有演算法必須有 tests。
6. 新版 Life Path 以 `NUMEROLOGY_ENGINE_V1.md` 為唯一規格。
7. 舊 repo 與新 spec 衝突時，以新 spec 為準。

---

## 9. Audit Outcome

### V1 可取用

- 日期解析概念
- Life Path reduction 概念
- 1–9 / 11 / 22 / 33 內容素材
- 報告卡片與視覺層級

### 延後

- 金字塔 A–X
- SVG 金字塔
- 九宮格
- 流年
- 圖片 / PDF 匯出

### 不帶入

- 健康推論
- 財富推論
- 直接商業導向文案
- 命定式職涯判斷

完成本 Audit 後，Codex 應先依 `NUMEROLOGY_ENGINE_V1.md` 建立乾淨的 Numerology Engine，再進入完整 P0 UI。
