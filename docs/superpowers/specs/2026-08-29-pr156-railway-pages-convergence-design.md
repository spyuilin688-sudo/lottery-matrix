# 樂彩 Matrix：PR #156、Railway 與 Cloudflare Pages 收斂設計

日期：2026-08-29

## 1. 目標

依序完成下列工作：

1. 收斂 PR #156 的 Railway 狀態串接與管理員後臺契約。
2. 修正 Railway 正式網址目前回傳 502 的部署問題。
3. 將 Cloudflare Pages 確立為正式前端主機，並建立專用建置流程。
4. 分開處理既有測試債務，再收尾 PR #153、#154、#156。

本設計不修改樂彩手機畫面、版面、響應式規則、演算法規則或使用者操作流程。

## 2. 固定平台分工

| 平台 | 固定職責 |
| --- | --- |
| GitHub | 保存程式與管理 PR |
| Cloudflare Pages | 樂彩 PWA 與管理畫面 |
| Railway | 自動抓取開獎資料、執行演算法、提供 Railway 查詢端點 |
| Supabase | 登入、權限、資料庫、運算進度與結果查詢 |
| AppDeploy | 管理員後臺的後端處理 |

資料流程：Railway 取得開獎資料並完成計算，結果寫入 Supabase；Cloudflare Pages 從 Supabase 或既有查詢端點取得資料。管理員後臺透過 AppDeploy 查詢 Railway 狀態，瀏覽器不直接持有 Railway 管理密鑰。

## 3. 已確認的現況

### 3.1 PR 關係

- PR #154 是舊版 Railway 狀態串接，由 PR #156 取代，不同時合併。
- PR #153 有 merge conflict，且部分內容已由 PR #155 取代。它不能原樣合併；最後只保留 main 尚未存在的必要內容。
- PR #156 的本地安全分支為 `work/pr156-safe`。它在遠端 PR #156 頂端之外另有兩個本地提交：
  - `601c7f2 fix: keep supabase job status updated_at current`
  - `9385a15 fix: isolate worker telemetry failures`

### 3.2 Railway

- 正式網址目前回傳 Railway 502，因此尚不能證明正式 API 正常。
- `services/matrix-api/railway.json` 是排程 Worker 設定：執行 `app.worker`、有 cron、執行完即退出。
- `services/matrix-api/railway.api.json` 才是常駐 API 設定：執行 `app.api_server`、healthcheck 為 `/health`。
- GitHub 上既有 Railway 狀態時間與 Worker 的五分鐘 cron 規則吻合。最可能情況是公開網域連到 Worker service；這仍須用 Railway Dashboard 的實際設定與 deploy log 確認。
- 從錯誤專案目錄啟動 API 會出現找不到 `app.api_server`；缺少 Supabase 變數會在監聽連接埠前停止。程式在正確目錄與變數存在時可監聽 `0.0.0.0:$PORT`。

### 3.3 AppDeploy API 契約

- PR #156 將 `/api/algorithm-status` 從既有 `{ ok, health, coverage, audit, cases }` 改成 `{ ok, health, jobs }`，會破壞原有管理功能。
- `/api/system-status` 已是管理員後臺顯示全部服務狀態的統一入口，適合加入 Railway 狀態。
- 現有 `worker-api.ts` 沒有管理密鑰、逾時、嚴格資料格式檢查或禁止轉址。

### 3.4 Supabase

- 最新開獎的正式排序是 `draw_date DESC, period DESC`。
- 現有索引已符合此排序，不需要新增 migration 或索引。
- `system_job_status.updated_at` 應由每次開始與結束事件明確寫入；本地提交 `601c7f2` 已處理 Python 寫入。
- 開獎資料與分析資料的 `updated_at` 目前不是可靠的最後更新時間，因此不能拿來判斷最新資料。
- 正式資料中存在舊 TypeScript tracker 留下的 `running` 狀態；本次不直接修改正式資料。

### 3.5 Cloudflare Pages

- 現有 `npm run build` 是 OpenAI Sites 封裝流程，會把原始 Vite 輸出複製成 `dist/client`，並加入 `dist/server` 與 `dist/.openai`。
- Cloudflare Pages 應只發布乾淨的 Vite `dist`，不應發布 Sites 專用檔案。
- 本階段只完成 Cloudflare Pages 主機，不新增 manifest、Service Worker 或離線功能。

### 3.6 測試

- 目前 root suite 共 410 項：354 通過、56 失敗。
- 其中 48 項是互相衝突或過期的 UI/CSS 契約；PR #156 沒有修改這些畫面來源。
- 另外 8 項測試依賴已明確刪除的舊 AppDeploy 模組；不能為了讓測試通過而恢復舊模組。

## 4. 採用方案

採用分階段、分 PR 收斂：

1. PR #156 僅處理 Railway 狀態安全、Supabase 狀態投影及 AppDeploy 相容性。
2. Railway Dashboard 設定與 502 驗證獨立處理。
3. Cloudflare Pages 專用建置獨立處理。
4. 舊測試依責任分開整理。
5. 最後關閉 #154，並整理 #153 的剩餘差異。

未採用方案：

- 不把所有內容放進同一個大型 PR，避免 API、安全、部署與 UI 測試彼此影響。
- 不只修 Railway 502，因為這會留下 `/jobs/status` 未保護與 AppDeploy 契約被破壞的問題。
- 不直接使用 Sites 封裝後的 `dist/client` 當長期 Pages 輸出，避免重複檔案與平台耦合。

本文件是四個階段共用的總體設計。第一份實作計畫只涵蓋第 5 節的 PR #156；Railway Dashboard、Cloudflare Pages 與舊測試各自建立後續計畫，不把四個階段做成一個大型提交。

## 5. 第一階段：PR #156

### 5.1 Railway `/health`

- 保持公開，不要求管理密鑰。
- 保持 PR #156 的 Supabase 健康檢查行為：Supabase 可用回 200，不可用回 503。
- 繼續作為 `railway.api.json` 的 healthcheck。

### 5.2 Railway `/jobs/status`

此端點只供 AppDeploy 後端使用。

- Railway 與 AppDeploy 使用同一個 `MATRIX_ADMIN_STATUS_TOKEN`。
- AppDeploy 以 `X-Matrix-Admin-Token` header 呼叫。
- token 缺少、錯誤或 Railway 未設定 token 時，統一回：

```json
{"error":"FORBIDDEN"}
```

- 回應狀態為 403，且驗證失敗時不查詢 Supabase。
- token 使用 constant-time 比對。
- `/jobs/status` 成功與錯誤回應都加上 `Cache-Control: no-store`。
- 此端點不回傳瀏覽器 CORS header，也不在預檢回應中允許管理 header。
- Supabase 查詢失敗回 503：

```json
{"error":"STATUS_UNAVAILABLE"}
```

- 其他未預期錯誤只回固定錯誤，不回傳 Python 錯誤文字。

輸出只允許四彩的固定狀態欄位：

- 彩種與工作名稱。
- 單次 Worker 工作狀態、開始、結束及可靠的 `updatedAt`。
- 最新開獎期數與開獎日期。
- 最新分析的期數、狀態、階段、開始與完成時間。
- 原始工作錯誤只轉成固定 `WORKER_FAILED`。
- 原始分析錯誤只轉成固定 `ANALYSIS_FAILED`。
- 不輸出開獎資料與分析資料目前不可靠的 `updatedAt`。

### 5.3 Worker 狀態意思

`system_job_status` 只表示「這一次 Worker 程式是否正常執行結束」，不表示整個分析一定完成。

- `not-due`、`already-acquired`：不開始追蹤，也不覆寫既有工作列。
- `not-acquired`：這一次程式正常結束，工作列為 `success`。
- 分析回傳 `running` checkpoint：這一次程式正常結束，工作列為 `success`；真正進度由 `latestAnalysis` 顯示。
- 分析 `complete`：工作列為 `success`。
- 發生 exception：工作列為 `failed`，原始 exception 繼續向上傳遞；狀態寫入失敗不能取代原始錯誤。

分析超過 100 cycles 後無法在下一次排程續跑，是另一個已確認缺陷，另開高優先 PR。本次不新增資料欄位或改變三態工作狀態。

### 5.4 Supabase 投影

- 狀態、公開 API 與 Worker 的最新開獎查詢，都先把有日期的資料排在前面，再依 `draw_date` 由新到舊、`period` 由大到小；空日期不得成為最新一期。
- job 開始時 `updated_at = started_at`。
- job 成功或失敗結束時 `updated_at = finished_at`。
- 不新增 migration、trigger 或索引。

### 5.5 AppDeploy

- 恢復 `/api/algorithm-status` 原本的 `{ ok, health, coverage, audit, cases }` 契約與權限，不改為 Railway jobs 格式。
- Railway 狀態只加入 `/api/system-status`。
- `/api/system-status` 維持原有登入與「系統設定－查看」權限。
- 既有排程卡的安全投影保留畫面使用的 `finished_at` 相容欄位，但不得回傳原始 Supabase row 或錯誤本文。
- 新增一個 Railway 狀態項目；使用既有通用狀態卡顯示，不修改前端 TSX、CSS 或版面。
- AppDeploy 後端同時載入 `RAILWAY_WORKER_URL` 與 `MATRIX_ADMIN_STATUS_TOKEN`；缺少任一項時不發出外部請求。
- `/health` 不帶管理 header；`/jobs/status` 才帶管理 header。
- 全部 Railway 狀態查詢共用五秒期限，禁止轉址，不使用快取，不自動重試。
- 任一回應失敗、逾時或格式錯誤時，回傳現有不可用格式 `{ ok: false, health: null, jobs: null }`。
- AppDeploy 只回傳經過固定格式檢查的資料，不轉送 Railway 原始錯誤內容。

## 6. 第二階段：Railway 502

Railway 必須分成兩個不同 service：

| Service | Root Directory | Config File | 行為 | 公開網域 |
| --- | --- | --- | --- | --- |
| API | `/services/matrix-api` | `/services/matrix-api/railway.api.json` | 常駐執行 `app.api_server` | 有 |
| Worker | `/services/matrix-api` | `/services/matrix-api/railway.json` | 依 cron 執行 `app.worker` 後結束 | 無 |

Railway Dashboard 驗證順序：

1. 在目前 active deployment 核對實際 Config File、Start Command 與 cron。
2. API deployment log 必須出現 `Railway Matrix API listening on 0.0.0.0:<PORT>`。
3. API service 必須有已解析的 `SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`MATRIX_ADMIN_STATUS_TOKEN`。
4. 公開網域必須連到 API service，target port 必須與實際 `$PORT` 相同。
5. Worker service 不設定公開網域。

不得以 GitHub 顯示的 Railway success 直接判定 API 正常，因為目前成功狀態可能只是 cron Worker 正常執行完畢。

## 7. 第三階段：Cloudflare Pages

### 7.1 程式建置契約

新增：

```json
"build:pages": "npm run check:runtime && tsc && vite build"
```

Cloudflare Pages 使用：

- Production branch：`main`
- Root directory：repository root
- Build command：`npm run build:pages`
- Output directory：`dist`
- Node：`22.16.0`

Pages 輸出必須包含 `dist/index.html`，且不得包含：

- `dist/client`
- `dist/server`
- `dist/.openai`
- `dist/_worker.js`

### 7.2 Pages 設定範圍

- 不使用 Pages Functions。
- 不新增 `_redirects`；採用 Pages 的靜態 SPA fallback。
- 首次切換不新增 `_headers` 或 CSP。
- 不新增 `wrangler.jsonc`；既有 Pages 專案不需要靠手寫 slug 才能完成 Git 部署。若後續需要 Wrangler，先從實際 Pages 專案下載設定。
- 正式與預覽環境只設定：
  - `VITE_RAILWAY_API_BASE`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Supabase service-role key 與 Railway 管理 token 不得放入 Vite 或瀏覽器。

### 7.3 切換方式

1. CI 完成乾淨 Pages build。
2. 先用 Cloudflare Pages 預覽版本驗證首頁、深層頁面、登入、開獎查詢、Supabase session、Railway 公開查詢及 AppDeploy 既有功能。
3. 預覽驗證通過後才更新正式分支與正式網址。
4. 正式 Pages 驗證完成後，另開 PR 移除 Sites 專用程式、測試與文件；第一次切換時不提前刪除。

## 8. 第四階段：測試與 PR 收尾

### 8.1 PR #156 必須新增或補齊的測試

- Railway `/health` 無 token 仍可使用。
- `/jobs/status` 缺少、錯誤、未設定 token 時都回相同 403，且不查 Supabase。
- 正確 token 可查狀態。
- 原始資料庫錯誤、儲存錯誤與額外欄位不會出現在回應。
- `/jobs/status` 沒有瀏覽器 CORS，公開 API 的 CORS 不受影響。
- Supabase 真實 PostgREST 查詢順序為 `draw_date.desc.nullslast,period.desc` 並限制一筆。
- Worker 的 `not-acquired`、analysis `running`、`complete`、exception、`not-due`、`already-acquired` 狀態語意。
- AppDeploy 只在 `/jobs/status` 傳管理 header，五秒逾時，缺 secret 時不 fetch，錯誤時不洩漏上游內容。
- `/api/algorithm-status` 原契約完整回歸測試。
- `/api/system-status` 將 `{ ok: false }` 的 Railway 結果判定為失敗，而不是把「正常回傳失敗物件」誤判為成功。

### 8.2 舊測試拆分

1. Backend test ownership PR：移除依賴四個已刪除 AppDeploy 模組的 8 項測試，將仍有價值的規則移到 Railway Python 測試。
2. Shared safe-area/navigation PR：處理 16 項 UI 契約。
3. Homepage contract PR：處理 21 項 UI 契約。
4. Feature behavior/styles PR：處理其餘 11 項。

後三項涉及畫面值與互動差異，必須另行確認權威畫面規格；本設計不替使用者選擇任何像素值或互動規則。

### 8.3 PR 收尾順序

1. #156 完成程式、指定測試與部署驗證。
2. #154 標記由 #156 取代並關閉，不合併。
3. 將 #153 與最新 main 比對，只移植尚未存在且仍必要的內容；不把 #155 已取代的舊修改帶回。

## 9. 驗收條件

- Railway 正式 API 網域不再回 502，`/health` 正常回應。
- `/jobs/status` 從瀏覽器或無 token 呼叫必須回 403；AppDeploy 透過正確 secret 可取得固定格式資料。
- 管理員後臺的系統狀態頁可顯示 Railway 成功或失敗，且不顯示 secret 或原始錯誤。
- `/api/algorithm-status` 舊功能與回傳格式保持不變。
- 最新開獎狀態以日期與期數決定，不以不可靠的資料列更新時間決定。
- Cloudflare Pages 預覽與正式建置只包含乾淨 `dist`，登入、開獎、結果查詢與既有 AppDeploy 功能可使用。
- 本次沒有手機畫面、版面、CSS、演算法規則或使用流程變更。

## 10. 後續獨立工作

下列內容已確認需要處理，但不屬於本設計第一個實作計畫：

- 分析超過 100 cycles 後的跨 invocation 續跑。
- 永久 `running` 的 heartbeat、lease 或修復機制。
- 更細的 Worker outcome/stage 資料模型。
- 正式資料中舊 tracker 狀態的清理。
- Cloudflare Pages 正式驗證後的 Sites 檔案移除。
- manifest、Service Worker、離線安裝功能。
- 48 項舊 UI 契約的畫面確認與修正。
