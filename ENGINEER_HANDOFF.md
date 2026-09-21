# 樂彩 Matrix－工程交付與現行架構

更新日期：2026-09-22

本文件描述目前正式工程。完整服務拓樸、排程、資料流與已知限制以 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) 為現況總覽；UI 規格以 [DESIGN.md](DESIGN.md) 與 [UX-CONTRACT.md](UX-CONTRACT.md) 為準。過去的 ChatGPT Sites／Pixel 手機預覽僅屬歷史 QA，不再代表正式產品邊界。

## 正式產品

- PWA：Cloudflare Pages，https://matrixlottery.idv.tw/
- 管理後台：同一正式站的 `/admin/`
- 前端：React + TypeScript + Vite
- 會員、權限、通知、開獎資料與 Matrix 演算結果：Supabase
- 公開開獎相容 API、爬蟲、分析與補救服務：Railway Python 服務
- 正式原始碼：GitHub `spyuilin688-sudo/lottery-matrix` 的 `main`

## 原始碼責任邊界

| 區域 | 責任 |
| --- | --- |
| `src/` | PWA、功能頁、會員流程、通知、Matrix UI 與前端資料存取 |
| `apps/admin/` | 管理後台 UI 與共用後端邏輯 |
| `backend/` | 仍被前端／Supabase Edge 共用的 TypeScript domain／route helper；不是可整批刪除的舊目錄 |
| `supabase/functions/` | Supabase Edge Functions，例如 `admin-api`、`matrix-status`、通知派送 |
| `supabase/migrations/` | 正式資料庫 schema、RPC、cron、權限與資料流程 migration |
| `services/matrix-api/` | Railway Python API、爬蟲、分析 worker、recovery server |
| `worker/`、`.openai/hosting.json` | 既有 Sites 靜態封裝相容路徑；正式 PWA 仍以 Cloudflare Pages build 為主 |
| `tests/`、`src/__tests__/`、`apps/admin/**/*.test.*`、`services/matrix-api/tests/` | 依變更範圍執行的 Node／Vitest／Playwright／Python 驗證 |

## 目前資料流

### PWA 公開資料

```text
PWA
  -> Railway public API
  -> Supabase stored draw/card data
```

正式公開 API 目前由 Railway 的 `heartfelt-generosity` 服務提供；前端實際 API 基址以 `src/runtime-api-config.ts` 與相關資料層為準。

### Matrix 查詢

```text
PWA
  -> Supabase RPC / matrix-status Edge Function
  -> Matrix result tables / artifacts
```

Matrix 探索、天衡、天樞、天衍、天工與 Matrix 狀態的正式權限與資料來源須以現行 RPC、Edge Function 及 migration 為準，不得回接已退役的舊 AppDeploy Matrix route。

### 管理後台

```text
/admin/
  -> Supabase admin-api Edge Function
  -> admin backend shared modules
  -> Supabase / Railway service evidence
```

管理後台目前不是舊 preview-only AppDeploy UI。任何管理功能修改都要同步檢查 `apps/admin/`、`supabase/functions/admin-api/`、對應 RPC／migration 及 scoped tests。

### Railway 背景工作

```text
Supabase schedule / recovery trigger
  -> Railway worker / recovery endpoint
  -> crawler + analysis pipeline
  -> Supabase writes
  -> PWA / Admin reads
```

Railway 的 production 服務、cron、domain 與啟動命令需以平台實際設定和 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) 交叉確認；repository 內的 `railway*.json` 不能單獨視為 production truth。

## 開發與驗證

需求環境：

- Node.js >= 22.13.0
- Python worker 依 `services/matrix-api/pyproject.toml` / `uv.lock`
- npm lockfile 及 Python lockfile 均須保持鎖定

常用指令：

```bash
npm run install:ci
npm run check:runtime
npm run build:pages
npm run build
```

依 [AGENTS.md](AGENTS.md)：

- 每次修改只執行與變更直接相關、明確指定檔案的測試。
- 未獲當次明確授權，不執行全專案測試。
- Project CI 會依 changed paths 選擇對應 Node、Vitest、Edge、Admin、Python、Playwright 或 membership checks。

## 工程修改原則

1. `main` 是正式來源；任何修正先以當下最新 `main` 為基準。
2. 不以檔名含 `legacy`、`old`、`20260829_impl` 等字樣就直接刪除；先確認 production import、RPC、migration、recovery 與外部相容依賴。
3. 不因 Supabase Advisor 顯示 RLS 無 policy 就新增寬鬆 policy；目前多數表採 deny-by-default + RPC／server access。
4. 不因 `expires_at < now()` 就直接刪 Matrix 資料；active/recent retained versions 受 recovery contract 保護。
5. Railway、Supabase、Cloudflare 或 GitHub Actions 的實際 production 設定變更，必須在修改後讀回驗證。
6. UI 修改維持現有設計系統與 mobile-first 行為，不以一次性 workflow 或臨時 patch 取代 canonical source owner。

## 歷史預覽

舊的 `lottery-matrix-preview.spyuilin688.chatgpt.site`、Pixel 10 preview 說明與僅展示首頁的交付文字屬歷史資料，不應再作為正式功能範圍、API 邊界或驗收依據。需要追溯舊畫面時使用 Git 歷史與既有 QA 文件。
