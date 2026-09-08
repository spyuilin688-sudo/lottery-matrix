# 樂彩 Matrix

現行可執行架構為 React＋TypeScript＋Vite。`src/` 是主要應用程式來源；`worker/` 與 `.openai/hosting.json` 提供既有 Sites 靜態前端封裝。`app/`、`db/`、`drizzle/` 與 `examples/` 是相容／示例檔案，不是目前 Vite 建置入口。

正式 PWA：https://matrixlottery.idv.tw/，由 Cloudflare Pages 部署。套件名稱為 `lottery-switch-component`；目前版本為 React `19.2.7`、TypeScript `7.0.2`、Vite `8.1.3`，以 `package.json` 與 lockfile 為準。完整交接資訊見 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)。

## Prerequisites

- Node.js `>=22.13.0`
- Linux CI 輔助腳本需有 `flock`、`sha256sum` 與 GNU `timeout`

## Sites Lifecycle

依 `package-lock.json` 安裝依賴後，由 `npm run build` 執行 TypeScript 檢查、Vite build 與 Sites 封裝準備。

This starter does not use `wrangler.jsonc`.

`install:ci` 是單次、不重試且有逾時限制的 `npm ci`。它會拒絕同專案的重疊安裝，驗證 lockfile 內 Vite、TypeScript、Playwright 均有完整性鎖定，並在可用時使用吻合 lockfile 的預載快取；快取缺件時保留 registry fallback。`build:verified` 執行既有 Vite build 後驗證 Sites 產物。這些輔助腳本以 Linux／GNU `timeout` 為目標。

Sites 輔助腳本透過 `scripts/sites-env.sh` 設定專案內可寫的 npm、XDG 與暫存目錄；`dev` 直接執行 Vite。產生的 `.sites-runtime/` 為可重建暫存資料，已由 Git 忽略。

## Included Shape

- 主要應用程式入口：`src/main.tsx`、`src/App.tsx`、`src/Prototype.tsx`、`src/FeaturePages.tsx`
- Vite 設定：`vite.config.ts`
- Sites 靜態資產 Worker：`worker/index.js`
- `src/mobile/` 由 `mobile-runtime.lock.json` 保護
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` 定義本機開發與 `dist/` 輸出；`build` 再由 `scripts/prepare-sites-build.mjs` 加入 `dist/client` 與 Sites Worker 封裝，`build:pages` 保留 Cloudflare Pages 使用的 `dist/`
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

本節說明既有 Sites 相容 helper；目前 PWA 會員登入使用下方 LINE Login 設定。

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## LINE Login operator setup

See [the LINE Login operator setup guide](docs/LINE_LOGIN_SETUP.md) for the
required Supabase, LINE Console, return-URL, and server-secret boundaries.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run check:runtime`: 驗證受保護 Mobile Runtime
- `npm run dev`: 啟動 Vite 開發伺服器
- `npm run build`: TypeScript 檢查、Vite build 與 Sites 封裝準備
- `npm run build:pages`: Runtime 檢查、TypeScript 檢查、Vite build 與 PWA 版本標記，供 Cloudflare Pages 使用
- `npm run build:verified`: 有界 build 並驗證 Sites 產物
- `npm run test:sites`: 執行 Sites Worker／封裝測試
- `npm run install:test-browser`: 將 Chromium 安裝至專案可寫的 `.sites-runtime/playwright`
- `npm run test:runtime -- tests/mobile-runtime.spec.ts`: 執行指定 Playwright Runtime 測試；只在變更直接涉及 Mobile Runtime 時執行
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export

依 `AGENTS.md`，僅執行本次修改直接相關、明確指定檔案的測試。測試產物 `test-results/` 不納入版本控制。

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## 版本標示

原文件中的 `v47`、`v50`、`v52` 是歷史預覽／QA 標記。現行來源依 Git commit 核對，PWA 建置版本由 `scripts/pwa-build-version.mjs` 產生；套件版本依 `package.json` 與 lockfile 核對。
