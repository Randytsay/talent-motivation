# 2026-09-05 AI 解析除錯與功能檢查

## 結論

已修復程式並依使用者後續「修復」指示部署正式站。真實 Vertex 模型的八欄 JSON 已驗證成功；正式站服務帳號及使用者報告保存的完整流程仍等待 LINE 登入後驗證。沒有提交、推送或合併 Git。下方初次調查紀錄保留原時點，最新進度見文末。

## 版本核對

- 原本本地：`feat/inner-number-fusion-v2`，`867410a`，工作目錄乾淨。
- `git fetch origin` 後，同名遠端為 `a32767e`，本地落後 11 個提交；相較 `origin/main` 落後 28 個提交。
- 最新 `origin/main`：`91ff0b18010627cdc893dcad6b99e5eb59f6e6af`。
- 正式網域 `talent-motivation.vercel.app` 對應部署 `dpl_6niNv5Zg4nyKALPegAmrxpBFqxFU`，READY，部署 API 的 githubCommitSha 等於上述 main SHA。
- 本次建立本地 `codex/debug-ai-analysis`，以 `origin/main` 為基底；原分支保留。HEAD 與 main 提交差異為 `0 0`，修復另存在未提交工作目錄。

## 已證實的線上失敗

2026-09-05 台北時間 18:09 與 18:15 的正式日誌：

1. `/api/reports/generate` 回傳 HTTP 502。
2. Vertex 上游回傳 HTTP 403 / `PERMISSION_DENIED`，指出 `aiplatform.endpoints.predict` 存取遭拒，目標為 `xenon-chain-506409-c3` 的 `global` / `gemini-3.7-flash`。Google 原訊息亦保留資源可能不存在的情況，因此尚不能僅凭此訊息斷言是哪一筆 IAM 綁定缺失。
3. 程式確實啟動 MiniMax-M3 fallback，但請求最後仍為 502。最新版本原先未記錄 JSON 解析與欄位驗證錯誤，因此目前日誌不足以分辨 MiniMax 最後失敗的精確原因。
4. 較早 18:00 的舊部署日誌顯示 MiniMax HTTP 200 / base status 0，但沒有 content。此為舊部署證據，不當成最新版本相同原因已獲證實。
5. 本機 gcloud 目前登入帳號對上述 project 的 `getIamPolicy` 也遭拒，無法進一步核對實際服務帳號角色。

## 已修復的程式缺陷

- `src/server/productionAI.ts`：MiniMax 原先只接收到「固定八欄 JSON」字樣，卻沒有欄位名称或型別。本次把完整 JSON Schema 加入 system prompt，補充繁體中文、非空清單與簡短輸出要求，維持現有內容驗證。
- MiniMax 輸出上限由 1600 調至 4096，降低八欄中文報告被截斷的風險；新增 `finish_reason=length` 專用錯誤。這是預防性修正，尚未以真實模型量測完成率與費用。
- JSON / schema 驗證失敗現在記錄 provider 與錯誤代碼，不記錄報告正文、生日、原始答案或金鑰。
- `src/App.tsx`：將 AI 重試納入 React 狀態，直接使用畫面上的 assessmentId；重試成功即更新畫面，失敗保留已保存結果。處理中停用重試與重新開始，未發送請求時不再宣稱正在生成。
- 移除 `public/report-retry.js` 及入口引用。原腳本依畫面文字判斷狀態、改抓 latest assessment 並重新整理，會造成目前畫面與重試對象不一致的風險。

## 本次驗證

完整執行 `npm run lint && npm test && npm run build && npm run test:e2e`，全部通過。

- 13 個測試檔，89 項測試。
- 既有計分、生日結構、草稿、登入驗證、伺服器重算及同意欄位測試。
- 新增真正使用 ProductionVertexAIProvider 的模擬 OAuth 請求測試，涵蓋正確 grant type、JWT 形狀、token 快取與 responseSchema；不是僅測 legacy adapter。
- 新增 MiniMax 請求含完整格式契約、格式錯誤、截斷、僅有 reasoning 及診斷不洩漏正文的測試。
- 新增報告失敗後重試、完成後快取、不新增歷史紀錄的 API 測試。
- 新增訪客两次測驗、認領後兩筆歷史保留、陪同者失去報告讀取與產生權限的 API 測試。
- 新增公開摘要字段 allowlist 測試。這只保證結構欄位，不代表對自由文字做過完整個資審核。
- 瀏覽器故障注入：502 → 重新整理 → 原測驗重試 → 報告完成；驗證處理中停用、成功後重試按鈕消失、測驗數量不增加。
- 瀏覽器驗證兩次測驗、Presenter 未同意不顯示／已同意顯示、刷新還原、1440×900 桌機與 390×844 手機無水平溢出。除了故障注入預期的 502/404，沒有非預期 console error。
- `git diff --check` 通過。
- 建置仍有既有 Vite CommonJS/未來 native config loader 警告；本次未變更工具鏈。

## 尚未驗證或仍需改善

- 正式 LINE 登入、真實 AI 生成及 Lark 保存的完整真人流程未在本次重新操作。
- 需要具有該 Google Cloud project 權限的管理者，核對 Vercel 所用服務帳號在正確 project 的 `aiplatform.endpoints.predict` 權限與模型存取；不可直接替全部帳號授予 Owner。官方預定義角色 `roles/aiplatform.user` 包含此權限，但仍須依現有組織政策決定角色或自訂最小權限。
- 修復上線後，先重試既有測驗，確認報告成功並可重新整理還原，再分別確認 Vertex 主路徑與 MiniMax 備援。不得以健康 API 的 READY/configured 狀態取代 AI 驗證。
- 架構檢查發現 Lark 查詢多次掃描整張表且 token 每次重取；大量資料時延遲會增加。報告產生與 claim 更新也沒有跨實例交易／唯一性鎖，跨分頁或同時請求仍可能重複生成或競爭。本次 UI 防重複點擊不解決這些伺服器併發問題。
- AI fetch 尚未配置明確 timeout；主服務一直不返回時，備援可能無法在平台期限內啟動。
- LINE webhook 明確為未實作的 501，不列為可用功能。

## 官方文件

- Google 模型存取權限：https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/access-control
- MiniMax Chat Completions（M3 thinking、reasoning_split、max_completion_tokens）：https://platform.minimaxi.com/docs/api-reference/text-chat-openai


## Google Cloud 登入後的追加調查

- 使用者登入具備此專案 Owner 權限的帳號後，已能讀取 IAM。`talent-motivation-runtime` 及 `hermes-agent` 均已有 `roles/aiplatform.user`，Vertex API 已啟用，兩個帳號未停用。沒有新增 IAM 角色或金鑰。
- 使用該管理帳號呼叫同專案、同位置的 `gemini-3.7-flash`，簡短測試 HTTP 200。這證明模型可用，但不代表 Vercel 的不可回讀敏感憑證已核對成功。
- 使用正式 ProductionVertexAIProvider 的完整報告請求，以合成測驗及管理者 OAuth token 進行本地真實模型測試：原設定 HTTP 200，但 `finishReason=MAX_TOKENS`，thoughtsTokenCount=1343、candidatesTokenCount=42，八欄 JSON 被截斷而解析失敗。
- 將 Vertex maxOutputTokens 由 1400 改為 4096，Gemini 3 系列明確設定 thinkingLevel=LOW。同一合成測驗重新測試 HTTP 200 / STOP，八欄全部通過 validateAIReport。
- 新增 Vertex MAX_TOKENS 明確錯誤與 thought 片段過濾。測試涵蓋額度設定、思考片段不混入 JSON、截斷回應即使含完整 JSON 仍拒絕使用。
- 服務帳號驗證失敗日誌新增 client_email（不含 private key），讓下一次正式請求能確認實際 principal。
- 最終本地 lint、89 項測試、build 通過；包含上述實作的 browser E2E 亦通過。最新測試擴充僅調整測試斷言，沒有再改瀏覽器實作。
- Vercel 的 sensitive 變數無法由 env pull/API 回讀，本次未試圖繞過；下載的暫存環境檔與測試脚本已刪除。正式站金鑰與既有 IAM 綁定保持原值。
- 正式站真人驗證停在已開啟的 Yandex LINE Login 分頁，等待使用者登入。需重試既有測驗、確認 Lark 保存及刷新還原，並檢查 403 是否仍發生。

- 最終正式部署：`dpl_HXQAp3qU5BwUjSdywTN4RHsmETJL`，READY，別名 `https://talent-motivation.vercel.app/`；健康端點 200，首頁已移除舊 report-retry.js。此部署包含本地未提交修復，GitHub main 尚未同步修復。
