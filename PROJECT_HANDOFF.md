# 樂彩 Matrix 專案交接

更新日期：2026-09-23（本次收斂 PWA 權限刷新與通知 Recovery 空轉；其餘章節保留原核對日期）。

## 專案與版本

- 產品：樂彩 Matrix，React／TypeScript／Vite 手機優先 PWA。
- GitHub：`spyuilin688-sudo/lottery-matrix`，正式分支 `main`。
- `package.json` 名稱：`lottery-switch-component`。
- React `19.2.7`、TypeScript `7.0.2`、Vite `8.1.3`；依賴版本以 `package.json` 與 `package-lock.json` 為準。
- 工作目錄使用 `git rev-parse --show-toplevel` 確認；開工前核對 remote main、`git status` 與 `AGENTS.md`，保留其他對話的修改。
- 舊 ZIP、暫存 Work 路徑及歷史預覽版本可由 Git 歷史查閱；目前建置使用本次核對的 GitHub 原始碼。

## 正式服務與資料流

| 項目 | 目前位置與用途 |
| --- | --- |
| PWA | Cloudflare Pages，https://matrixlottery.idv.tw/ |
| 管理後台 | Cloudflare Pages，https://matrixlottery.idv.tw/admin/；前端位於 `apps/admin/`，正式後端為 Supabase `admin-api` Edge Function |
| 公開資料 API | Railway project `lottery-matrix-production`、service `matrix-public-api`；網址維持 `https://heartfelt-generosity-production-9f2b.up.railway.app`；latest、history、cards、同星與號碼對照單相容 API |
| 爬蟲與背景分析 | Railway Python 服務，來源位於 `services/matrix-api/`；天天樂定時爬蟲為 Railway `fantasy5-crawler`；GitHub workflow 僅供手動備援；Railway 獨立服務執行補救與分析 |
| 會員、登入、通知、開獎及演算結果 | Supabase 專案 `wcimzbbapfrdotjsfyxa`；PWA 的探索、天衍、天工使用 Supabase RPC |

API 執行方式見 [services/matrix-api/README.md](services/matrix-api/README.md)。正式 Railway service settings 是目前部署設定的權威來源；Railway 已將舊 custom `railway.json`／`railway.toml` Config-as-Code 標為 deprecated，因此 production 服務不再綁定 custom config file path。Repository 既有 `railway*.json` 僅保留 legacy/manual 相容用途，後續若要版本化整個 Railway project，應另以 `.railway/railway.ts` IaC 經 pull/plan 驗證後遷移，不得同時雙重管理。正式 runtime start command 使用 `uv run --no-dev --no-sync`，依賴安裝與 bytecode 準備留在 Railpack build 階段。

管理後台的 UI 由 Cloudflare Pages 提供，API 由 Supabase `admin-api` Edge Function 執行；`apps/admin/backend/index.ts` 直接匯入 `supabase/functions/admin-api/runtime.ts`。部署平台以這些現行入口與設定為準，不要由歷史計畫、資料庫遷移名稱或過期測試推斷。Repository 根目錄 `backend/` 仍有被 PWA 與 Supabase Edge Function 直接引用的共用 TypeScript 模組，不能整批視為退役程式。PWA 的會員 bootstrap／profile／notification／online 由 `src/member-api.ts` 與 `src/member-online-api.ts` 呼叫 Supabase RPC。

以下為 2026-09-22 讀回的 Railway project `lottery-matrix-production` production 服務：

| 服務 | 實際啟動命令 | 正式設定 |
| --- | --- | --- |
| `lottery-matrix` | `uv run --no-dev --no-sync python -u -m app.primary_worker --group evening` | cron `10 22 * * *` UTC，僅作隔日 06:10 台北時間每日備援；動態主排程由 Supabase 保存下一時段並派送 |
| `fantasy5-analysis` | `uv run --no-dev --no-sync python -u -m app.analysis_worker --lottery 天天樂` | cron `10 10 * * *` UTC，僅作 18:10 台北時間每日備援；動態主排程由 Supabase 保存下一時段並派送 |
| `fantasy5-crawler` | `uv run --no-dev --no-sync python -u -m app.fantasy5_railway_job` | cron `33 1,2 * * *` UTC；DST gate 選擇一個有效開始時間 |
| `matrix-public-api` | `uv run --no-dev --no-sync python -u -m app.api_server` | 常駐公開查詢 API，沒有 cron，healthcheck 為 `/health`；不提供 `/jobs/*` 執行入口 |
| `matrix-recovery` | `uv run --no-dev --no-sync python -u -m app.recovery_server` | 常駐 job/recovery 唯一網路 owner，沒有 cron，healthcheck 為 `/health` |

此 production 環境未列出六合彩或大樂透的獨立 Worker；此處列出本次確認的五個主要服務。2026-09-22 平台讀回時，`impartial-wholeness` 與 `lucky-reflection` 均無服務；先前列出的舊驗證／空服務已不在目前 service list。獨立 `matrix-core-review-site` 維持審查站用途，不併入正式 PWA production 服務。2026-09-20 僅調整 repository：舊 `railway.marksix.json`、`railway.lotto649.json` 移除 cron，保留單次手動 Worker 命令；移除已退役的 `deploy/matrix-worker.timer`，保留 `matrix-worker.service` 手動入口，避免未來部署再建立重複排程。未修改正式 Railway 設定。若其他主機已安裝舊 timer，須另行確認後停用；刪除 repository 檔案不會停止既有主機 timer。

`.github/workflows/matrix-analysis.yml` 目前僅接受手動 `workflow_dispatch`，用於復原分析；沒有 `push` 或 GitHub 定時觸發。其 `--scheduled` 是 Worker 執行模式，與 GitHub `schedule` 事件不同。

正式主流程目前由 Supabase 的動態 primary scheduler 保存各組下一時段並派送；Railway 的 `lottery-matrix` 與 `fantasy5-analysis` 僅保留主時窗結束後的每日 fallback，不再全天輪詢。Recovery 使用獨立的動態時槽，而且實際 dispatch 已排除與 Primary 相同的 clock；同一時點不會同時送出 `/jobs/primary` 與 `/jobs/recover`。

獨立補救已使用 Supabase 原生每日開始與各組下一次時槽：晚間 20:30／天天樂 09:30 開始，前段每 10 分鐘、後段每 50 分鐘；晚間另有隔日 12:00／18:00，天天樂另有隔日 00:00／06:00。完成或確定不開獎即取消當期剩餘檢查。舊 `matrix-admin-watchdog-v1` 全天 poller 已由 `20260920233444_recovery_dynamic_slots.sql` 取代，不能套用主排程的 30 分鐘間隔。

PWA 的 Matrix 權限設定不再每 30 秒固定 RPC 輪詢：App 啟動立即讀取，回到前景、重新連線等事件在距離前次讀取至少 30 秒時觸發刷新，持續停留前景則每 5 分鐘保底一次；明確進入需要權限判定的 Matrix 查詢仍沿用即時權限讀取與既有 in-flight 合併。通知派送 Recovery 則由 queue 狀態、retry 時間與 lease 到期時間動態 replan `matrix-notification-recovery-next`；無待補救工作即移除動態 job，只保留每小時 `matrix-notification-recovery-fallback`。原 Web 1／2／5／15／30 分鐘 retry、Native／Admin backoff、事件觸發即時派送與 5 分鐘 stale 判定不變。

天工 artifact 由現行持有 lease 的分析 pipeline 產生；舊 `refresh-tiangong-sorted.py` 與自動寫入 job 已移除，保留天工 UI 檢查。工作狀態完成寫入以該次 `started_at` 作比對，防止舊執行蓋掉新執行；演算資料的 owner/run-start 寫入保護維持原契約。

## Optimizer 空轉判定

Railway 樣本中至少兩筆不同時間的不同執行均為 `already-acquired`、`already-analyzed`、`no-new-draw` 或 `not-due` 時，列為「重複空轉執行候選」。顯示實際樣本數、起迄與時間跨度、平均耗時、CPU／RAM 與截斷資訊；不使用任意長期時數或低用量門檻，也不把缺少日誌等同空轉。此候選僅供審查排程與待命成本，不代表服務永久無用途，不會自動停用。每小時報告僅包含前一小時的有界日誌樣本，不能宣稱涵蓋全部長期工作負載。

## 入口與共用介面

- `src/main.tsx` → `src/App.tsx` → `src/Prototype.tsx`；Mobile Runtime 位於 `src/mobile/`。
- 功能頁由 `src/FeaturePages.tsx` 及 `src/features/` 組成。
- 共用底部導覽為 `src/BottomNavigation.tsx`：首頁、快捷、通知、我的。
- 快捷設定入口為首頁左下角設定按鈕連續點擊兩下，判定間隔為 `800ms`；點擊底部「快捷」開啟已設定功能。
- 共用 Logo 為 `public/assets/lottery/brand-logo-transparent.png`；樣式與行為依 `DESIGN.md`、`UX-CONTRACT.md` 及對應原始碼核對。
- 首次首頁引導位於 `src/onboarding/FirstVisitGuide.tsx`，說明免費 LINE 註冊與 Matrix Core 探索入口。
- 新建且具有已驗證 LINE 身分的會員，依伺服器註冊時間取得 Matrix 探索、天衡、天樞十三期與完整範圍 48 小時；不開放天衍／天工註冊試用，重複登入不重新計時，既有會員不回填。

## PWA

- Manifest：`public/manifest.webmanifest`，由 `index.html` 引用；包含圖示、`start_url`、`scope`、`display: fullscreen` 與既有啟動設定。
- Service Worker：`public/push-service-worker.js`；`src/pwa-lifecycle.tsx` 與 `src/push-subscription.ts` 使用同一路徑註冊。
- `scripts/pwa-build-version.mjs` 將建置指紋寫入 Service Worker；安裝及更新互動由既有 PWA lifecycle 管理。
- Classic Service Worker 的頂層函式與 `self` 共用全域範圍，輔助函式不得與原生 `skipWaiting` 同名。完成整組資源預快取後才呼叫原生啟用方法；更新回歸須在舊版頁面仍開啟時確認新版接管，並確認會員儲存及離線頁面保留。
- `public/_headers` 是 Cloudflare Pages 的 PWA 入口快取政策 owner：`/`、`/index.html`、`/push-service-worker.js` 使用 HTTP／CDN `no-store`，避免保留舊版入口或更新程式。離線支援仍由既有版本化 Service Worker Cache Storage 管理；不清除會員儲存，不變更 hashed assets、API 或管理後台的快取政策。部署後須讀回正式站 response headers，不能只以 repository 設定判定生效。
- LINE OAuth 與實體手機返回 PWA 的限制見 `docs/LINE_LOGIN_SETUP.md` 與 `UX-CONTRACT.md`；桌面或程式測試不代表 Android／iOS 實機驗證。

## 安裝、執行與建置

在專案根目錄執行：

```sh
npm run install:ci
npm run dev
```

| 指令 | 用途 |
| --- | --- |
| `npm run check:runtime` | 驗證受保護的 Mobile Runtime 檔案 |
| `npm run build:pages` | Runtime／TypeScript 檢查、Vite 建置與 PWA 版本標記；Cloudflare Pages 使用 `dist/` |
| `npm run build` | 以上建置加上既有 Sites 封裝，產生 `dist/client`、`dist/server` 等內容 |
| `npm run build:verified` | 有界執行 build 並檢查 Sites 產物 |
| `npm run validate:artifact` | 檢查已存在的 Sites 產物 |

`worker/index.js`、`.openai/hosting.json` 與相關 scripts 保留既有 Sites 靜態封裝。未被正式入口引用的 Next／D1 範本已移除；需要查閱舊稿時使用 Git 歷史。Supabase migrations 與 Railway 服務來源保持原位置。

## 測試與產物

- 遵循 `AGENTS.md`，僅執行明確指定、與修改直接相關的測試檔案；未獲當次明確授權不執行全量測試。
- Workflow 的限定檢查：`node --test tests/matrix-analysis-workflow.test.mjs`。
- `test-results/`、`node_modules/`、`dist/` 與既有暫存目錄不納入 Git；取消追蹤不要求刪除本機測試資料。
- API／後台查核與尚存缺口見 [docs/project-audit-2026-09-08.md](docs/project-audit-2026-09-08.md)，須以新一次檢查更新判定。

## 既有六合彩歷史日期補入規則

- 歷史 NFD 資料的正式期數與號碼保留。
- sc888 只補日期；只有期數、6 個一般號碼及特別號與 NFD 完全一致時，才補入缺少的 `drawDate`。
- 任一號碼或期數不一致，日期維持空白；不得修改 NFD 的期數、`sortedNumbers` 或 `drawOrderNumbers`。
- 目前前端資料來源以 `src/runtime-api-config.ts`、`src/lottery-api.ts` 為準；過去 `app-snsxet` 的版本與同步筆數是歷史紀錄。
