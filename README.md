# talent-motivation

天賦原動力探索系統。

核心主題：

> 看見天賦、找到原動力、增加人生的選擇。

## Current experience

課堂版目前採「做一點、看一點、聊一點」的三階段流程：

1. 出生結構 — 生命靈數 + 出生結構線索，作為自我反思入口
2. RIASEC — 18 題活動偏好，顯示 Top 3 完整名稱、動詞與活動描述
3. 當下狀況 — 主觀能量、天賦使用感與目前最想改善的重點

課堂完成後立即產生 deterministic 快照；AI 深度整理在背景執行，不阻塞現場節奏。完整報告集中在 `/report/latest`，LINE 作為課後重新找到結果與開啟後續探索的入口。

## Methodology

系統目前採四面鏡子的整合解讀概念：

1. Birth Profile — 出生結構／生命靈數反思線索
2. RIASEC — 活動偏好
3. Self Validation — 本人共鳴驗證
4. Current Reality — 當下能量、使用感與現況需求

原則：

> 程式負責算；LLM 負責理解；本人負責驗證。

> 整合解讀，不整合計分。

RIASEC 描述的是活動與環境偏好，不等於能力高低，也不作為命定職業判斷。出生日期相關內容僅作文化性／自我反思入口，不作科學診斷或命運預測。

## Runtime architecture

- React + TypeScript + Vite
- LINE LIFF / LINE Login / Messaging API
- Lark Base + Lark OpenAPI
- Vercel
- Vertex AI primary provider
- MiniMax automatic fallback when configured

## Release workflow

重大課堂流程變更先經：

1. Unit / lint / build / browser E2E
2. Vercel Preview
3. Preview UAT
4. Merge to `main`
5. Production smoke test

Classroom Journey V3 的設計與 UAT 規格見 `docs/CLASSROOM_JOURNEY_V3.md`。
