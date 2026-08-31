# 首頁、爬蟲與 Matrix API 修正設計

## 目標

恢復四個彩種的最新開獎資料、首頁日期與下次開獎時間，並讓最新演算法重新產生 Explore、天衍、天工與 Matrix 狀態資料。

## 既有架構

- Cloudflare Pages 顯示 PWA。
- Railway API 提供最新開獎與歷史資料。
- Railway Worker 每五分鐘啟動一次，由既有開獎排程決定是否抓取與計算。
- Supabase 儲存開獎、演算法執行進度、產物與 Explore RPC 結果。
- Matrix 狀態 Edge Function 讀取同一期、同一版本的 Explore 與天衍來源。

## 修正範圍

1. Railway 最新開獎 API 在原有開獎資料中加入 `nextDrawAt`；日期仍使用既有 `drawDate`／`date`，不改首頁版面、字級、間距或流程。
2. 下次開獎時間直接使用 `app.schedule` 既有彩種開獎日與時間，避免前後端各自維護。
3. Worker 演算法版本由 `matrix-python-v6` 提升為 `matrix-python-v7`，使最新演算法不會被舊的完成紀錄跳過。
4. Supabase Explore RPC 改為只讀取 `matrix-python-v7` 的完整結果；其他 RPC 仍使用既有完整產物讀取方式。
5. 正式部署後，以四彩並行工作重新抓取最新資料並產生 v7 產物；Matrix 狀態在 Explore 與天衍同一期完成後恢復。

## 正式切換閘門

- 先合併並部署 Railway；之後對今彩539、天天樂、六合彩與大樂透各執行一次 unscheduled `run_worker`／等效強制刷新，逐彩將資料庫的 `drawDate`／期別與正式來源回應及預期開獎日比對。
- scheduled cron 在排程窗外只會重算既有期別，不能證明已向正式來源取得最新期，因此不得作為 freshness 證明。
- 每一彩均須在同一已驗證最新期具備 v7 complete、Explore／天衍／天工／status 四類產物，且 status sources 的 Explore 與天衍來源同一期，才可套用全域 v7 Explore RPC migration。
- 任一彩為 `not-acquired`、not-ready 或 stale 時，禁止 cutover，保留 live v6 RPC；v7 migration 套用後才檢查 live function definition，並對四彩逐一呼叫 Explore list／validation RPC。

## 失敗處理

- 原始來源尚未發布當期資料時，Worker 保留 `not-acquired`，不得以舊資料冒充最新期。
- 歷史資料缺期時停止所有演算法，先依既有近一個月檢查與補期流程修復。
- RPC 在 v7 尚未完成時回傳既有 `ANALYSIS_NOT_READY`，不得回退到錯誤版本。

## 驗證

- Python：排程、公開 API、Worker、完整 Matrix API 測試。
- TypeScript：首頁日期／倒數、Explore RPC、狀態 API 與完整 Vitest。
- Supabase：套用 migration 後檢查函式版本條件並實際呼叫 Explore RPC。
- 正式環境：Railway `/health`、四彩 latest API、Supabase 執行紀錄與四彩狀態來源。
