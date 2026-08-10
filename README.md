# 樂彩 Matrix React Prototype

現行可執行架構為 React＋TypeScript＋Vite。`src/` 是主要應用程式來源；`worker/` 與 `.openai/hosting.json` 提供既有 Sites 靜態前端封裝。`app/`、`db/`、`drizzle/` 與 `examples/` 是相容／示例檔案，不是目前 Vite 建置入口。

## Prerequisites

- Node.js `>=22.13.0`
- Linux CI 輔助腳本需有 `flock`、`sha256sum` 與 GNU `timeout`

## Sites Lifecycle

依 `package-lock.json` 安裝依賴後，由 `npm run build` 執行 TypeScript 檢查、Vite build 與 Sites 封裝準備。

This starter does not use `wrangler.jsonc`.

`install:ci` 是單次、不重試且有逾時限制的 `npm ci`。它會拒絕同專案的重疊安裝，驗證 lockfile 內 Vite、TypeScript、Playwright 均有完整性鎖定，並在可用時使用吻合 lockfile 的預載快取；快取缺件時保留 registry fallback。`build:verified` 執行既有 Vite build 後驗證 Sites 產物。這些輔助腳本以 Linux／GNU `timeout` 為目標。

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- 主要應用程式入口：`src/main.tsx`、`src/App.tsx`、`src/Prototype.tsx`、`src/FeaturePages.tsx`
- Vite 設定：`vite.config.ts`
- Sites 靜態資產 Worker：`worker/index.js`
- `src/mobile/` 由 `mobile-runtime.lock.json` 保護
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` 定義本機開發與 `dist/client` 輸出
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

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

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run check:runtime`: 驗證受保護 Mobile Runtime
- `npm run dev`: 啟動 Vite 開發伺服器
- `npm run build`: TypeScript 檢查、Vite build 與 Sites 封裝準備
- `npm run build:verified`: 有界 build 並驗證 Sites 產物
- `npm run test:sites`: 執行 Sites Worker／封裝測試
- `npm run install:test-browser`: 將 Chromium 安裝至專案可寫的 `.sites-runtime/playwright`
- `npm run test:runtime`: 執行 Playwright Runtime 測試
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## 版本標示

- `v47`：既有 source 目錄與線上預覽識別碼。
- `v50`：Design QA 中的受保護版面基準。
- `v52`：Design QA 驗收紀錄進度。

三者不是不同工程架構；唯一執行基準仍是本目錄的 React＋TypeScript＋Vite 專案。
