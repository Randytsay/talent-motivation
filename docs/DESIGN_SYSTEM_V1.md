# 天賦原動力 Design System V1

## 1. 品牌氣質

目標不是「線上性格測驗」，而是成熟、可信、溫暖、有質感的自我探索工具。

核心感受：
- 成熟
- 溫暖
- 智慧
- 安靜
- 清楚
- 值得保存

避免：
- 神秘命盤感
- 身心靈網站感
- 高飽和彩虹色
- 典型 AI SaaS 紫色漸層
- 玻璃擬態濫用
- 過度陰影
- 過度圓角
- 大量 emoji
- 過度科技感

## 2. 色彩

Primary Ink: `#243247` — 標題、主要文字、主 CTA

Ivory Canvas: `#F7F4EE` — 全站背景

Paper: `#FFFDF9` — 卡片與主要內容區

Champagne Gold: `#B59A66` — 品牌高光、進度、重點線條

Warm Clay: `#B46C55` — 次要強調、提醒、互動焦點

Soft Gray: `#66707D` — 內文與次要文字

Border: `#DED7CA` — 細框與分隔

RIASEC 六向度可保留各自 semantic color，但只出現在該向度卡片/圖表，不讓整個頁面變成彩虹。

## 3. 字體

- Hero / Result headline: Noto Serif TC
- UI / body / controls: Noto Sans TC

原則：
- 大標題有留白，不壓滿畫面。
- 行距比一般工具站略寬，讓閱讀更像報告。
- 手機上正文不得小於 14px；主要操作 15–17px。

## 4. Layout

使用 8px spacing system。

桌面：
- max content width 約 1040px
- 結果頁可以使用雙欄
- 不可只是把手機版放大

手機：
- 390px 為主要驗收寬度
- 左右安全距離至少 16px
- 主要 touch target >= 44px
- 優先維持閱讀節奏，不追求一屏塞滿

## 5. Cards

- radius 16–24px
- 1px subtle border
- shadow 要柔和且低對比
- 避免每張卡都使用不同底色
- 結果頁重點卡可使用輕微暖色層次

## 6. Buttons

Primary CTA：深墨藍底、白字、輕微香檳金 focus / shadow accent。

Secondary：透明/紙白底 + 深墨藍細框。

禁止：
- 方正像後台按鈕
- 高飽和綠色
- 粗重 drop-shadow

## 7. 三面鏡子視覺語言

第一面鏡子：Champagne Gold / Warm Ivory
第二面鏡子：Ink + 少量 RIASEC semantic color
第三面鏡子：Warm Clay / neutral

三面鏡子彼此有區別，但仍屬同一品牌系統。

## 8. Radar Chart

Radar 是第二面鏡子的核心視覺，不應像工程圖。

- grid 使用低對比 border color
- result polygon 使用 Champagne Gold 半透明填色
- outline 使用 Ink
- label 清晰
- 六向度詳細色彩放在 Top3 cards，而不是雷達圖本體全部彩色

## 9. Final Report

全產品最高視覺優先級。

資訊層級：
1. 報告標題
2. 第一面鏡子核心
3. 第二面鏡子 Top3 + Radar
4. 本人能量線索
5. 第三面鏡子 / talent usage
6. 重複或不同線索
7. 留給自己的問題

目標：讓使用者產生「這份結果值得保存」的感受。

## 10. Motion

只使用短暫、安靜的 enter / hover feedback。

必須支援 `prefers-reduced-motion`。

## 11. Visual QA Gate

每次視覺修改完成前至少檢查：
- 390 × 844
- 768 × 1024
- 1440 × 900

確認：
- no horizontal overflow
- Radar labels 完整
- CTA 容易操作
- 字體沒有截切
- 不同頁面品牌一致
- Desktop 有合理資訊利用率
- Final Report 是整套產品視覺完成度最高的畫面
