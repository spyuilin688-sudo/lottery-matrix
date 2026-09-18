# 樂彩 Matrix 專案交接

更新日期：2026-09-08。內容依目前原始碼、套件與已核對的正式部署整理。

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
| 管理後台 | AppDeploy `matrix-sanqwn`，https://matrix-sanqwn.v2.appdeploy.ai/；程式鏡像位於 `apps/admin/` |
| 公開資料 API | Railway，`https://heartfelt-generosity-production-9f2b.up.railway.app`；latest、history、cards、同星與號碼對照單相容 API |
| 爬蟲與背景分析 | Railway Python 服務，來源位於 `services/matrix-api/`；天天樂爬蟲由 `.github/workflows/fantasy5-crawler.yml` 執行，Railway 分析其已存資料 |
| 會員、登入、通知、開獎及演算結果 | Supabase 專案 `wcimzbbapfrdotjsfyxa`；PWA 的探索、天衍、天工使用 Supabase RPC |

API 執行方式見 [services/matrix-api/README.md](services/matrix-api/README.md)。Repository 中的 `railway*.json` 是否生效，須比對正式服務綁定。

2026-09-08 核對 Railway `divine-simplicity` 的 production 環境，畫面列出三個服務：

| 服務 | 實際啟動命令 | 正式設定 |
| --- | --- | --- |
| `lottery-matrix` | `uv run python -u -m app.worker_all` | 綁定 `/services/matrix-api/railway.json`，cron 為 `3/5 * * * *` |
| `fantasy5-analysis` | `uv run python -u -m app.analysis_worker --lottery 天天樂` | 已設定定時執行，最近執行成功 |
| `heartfelt-generosity` | `uv run python -u -m app.api_server` | 常駐 API，沒有 cron，healthcheck 為 `/health` |

此 production 環境未列出六合彩或大樂透的獨立 Worker；另一已核對專案 `lucky-reflection` 僅顯示一個 offline 服務。因此本次沒有依據停用或合併正式排程，也未改寫 `railway*.json`。

`.github/workflows/matrix-analysis.yml` 僅接受手動 `workflow_dispatch` 與既有路徑篩選的 `push`，用於復原分析；沒有 GitHub 定時觸發。其 `--scheduled` 是 Worker 執行模式，與 GitHub `schedule` 事件不同。

## 入口與共用介面

- `src/main.tsx` → `src/App.tsx` → `src/Prototype.tsx`；Mobile Runtime 位於 `src/mobile/`。
- 功能頁由 `src/FeaturePages.tsx` 及 `src/features/` 組成。
- 共用底部導覽為 `src/BottomNavigation.tsx`：首頁、快捷、通知、我的。
- 快捷設定入口為首頁左下角設定按鈕連續點擊兩下，判定間隔為 `800ms`；點擊底部「快捷」開啟已設定功能。
- 共用 Logo 為 `public/assets/lottery/brand-logo-transparent.png`；樣式與行為依 `DESIGN.md`、`UX-CONTRACT.md` 及對應原始碼核對。
- 首次首頁引導位於 `src/onboarding/FirstVisitGuide.tsx`，說明免費 LINE 註冊與 Matrix Core 探索入口。
- 新建且具有已驗證 LINE 身分的會員，依伺服器註冊時間取得天衍 48 小時、天工 24 小時；重複登入不重新計時，既有會員不回填。

## PWA

- Manifest：`public/manifest.webmanifest`，由 `index.html` 引用；包含圖示、`start_url`、`scope`、`display: fullscreen` 與既有啟動設定。
- Service Worker：`public/push-service-worker.js`；`src/pwa-lifecycle.tsx` 與 `src/push-subscription.ts` 使用同一路徑註冊。
- `scripts/pwa-build-version.mjs` 將建置指紋寫入 Service Worker；安裝及更新互動由既有 PWA lifecycle 管理。
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
