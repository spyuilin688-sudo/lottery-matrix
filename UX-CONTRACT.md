# UX Contract

## Product context

- Audience: 使用繁體中文、以手機查詢彩券開獎與 Matrix 分析資料的會員；管理頁使用者沿用相同產品安全規則。
- Primary jobs: 切換彩種與開獎資料、使用 Matrix 工具、設定通知、查看會員狀態並安全登出。
- Target market: 臺灣彩券資料使用情境；依彩種與產品文件判定，不以 `zh-TW` 單獨推論。
- Active locale: `zh-TW` 產品文案；文件標記沿用 `zh-Hant-TW`。
- Language and content register: 清楚、直接、資料導向的繁體中文；第三方與 OS 原生 popup 接受平台在地化。
- Timezone and calendar: 日期選擇採 Gregorian OS-native control；業務時區與開獎日期以資料 API 或既有 Taipei date helper 為準，不由 UI 猜測。
- Accessibility target: WCAG 2.2 AA。

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| LINE 登入、member bootstrap 與 logout/revoke | `docs/superpowers/specs/2026-08-24-line-login-api-design.md` | Auth/API design | 2026-08-24 |
| Direct actions、表單與 scrollbar 修正 | `docs/superpowers/plans/2026-08-24-quality-remediation.md` | Approved implementation plan | 2026-08-24 |
| 正式 PWA 元件與導覽組合 | `docs/COMPONENT_MAP.md` | Maintained component map | 2026-08-24 |
| 正式素材與使用限制 | `docs/ASSET_MANIFEST.md` | Maintained asset policy | 2026-08-24 |
| Runtime design tokens | `src/design-tokens.css` and `docs/DESIGN_TOKENS.md` | Runtime source and mapping | 2026-08-24 |

## Visual contract

- Project design context: `DESIGN.md`.
- Token ownership model: Model B, existing runtime canonical.
- Authoring and runtime token source: `src/design-tokens.css`.
- Mapping evidence: `docs/DESIGN_TOKENS.md`.
- Token drift gate: `tests/premium-contract.test.mjs`.
- Supported theme: current dark navy/gold product theme, with system-owned forced-colors behavior where applicable.
- Supporting evidence: `docs/COMPONENT_MAP.md`, `docs/ASSET_MANIFEST.md`, and `docs/DESIGN_TOKENS.md` remain maintained supporting documents.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | Existing admin `DataTable` with native row checkboxes | This contract and the approved activation-code management request (2026-09-05) | Selection is transient and limited to the currently loaded activation-code list; leaving the page clears it | Admin component test for multiple selection and newline-delimited clipboard output |
| Select/Listbox | Native HTML `select` on product forms | `premium-ui.json` and this contract | OS-owned native popup only; authored replacement requires a separate approved contract | Keyboard and open-popup checks on supported mobile PWA browsers |
| Date | Native HTML `input[type="date"]` | `premium-ui.json` and this contract | OS-owned Gregorian date popup; ISO date-only form value | Locale, keyboard, narrow-viewport and open-calendar checks |
| Form | The React screen that owns each product form | This contract and the owning component test | Sign-in, settings and data-entry forms with app-owned validation | Component tests for validation, busy, recovery and first-error focus |
| Scrollbar | Global application stylesheet `src/styles.css` | `DESIGN.md` and this contract | Scrolling remains enabled while native and app-owned scrollbar visuals stay hidden | Computed overflow plus Firefox and WebKit hidden-scrollbar source checks |
| PWA install/update | `PwaLifecycleProvider` | This contract and `src/pwa-lifecycle.tsx` | Browser-native install prompt; iOS add-to-home-screen instructions; app-owned update confirmation | Lifecycle component tests plus production build fingerprint test |
| Matrix status triggers | `MatrixStatusPage` and the Matrix status Edge response | Approved Matrix status design (2026-09-04) | Compact status-category cards, one card per trigger, Explore-style result rows, server-projected locked rows | Component tests at 320/360px plus route projection tests |
| Admin todos | Existing AppDeploy admin `AdminApp` | Approved admin todo design (2026-09-04) | All administrators create; owner edits/deletes; super administrator may delete any item | Service, route, component and narrow-viewport tests |

## Form behavior

Product forms set `noValidate` and own validation instead of invoking browser validation bubbles. Every field keeps a visible label association; invalid fields use `aria-invalid` and `aria-describedby` that points to existing help or error text. Submission focuses or scrolls to the first invalid field, preserves entered values, disables duplicate submission with a perceivable busy state, and keeps control geometry stable. A request failure remains inline and recoverable; editing clears only the stale error that no longer applies.

Native Select/Listbox and Date are intentional for the supported mobile PWA. The browser or operating system owns the opened popup language, geometry, option/calendar interaction and collision behavior. Closed fields still use product labels, focus treatment and error association. If product-owned popup geometry or calendar copy becomes a requirement, replace the owner through a separately approved accessible primitive instead of hand-building ARIA behavior.

## Scrollbar behavior

Every reachable product overflow surface keeps its existing overflow and touch behavior while scrollbar visuals are hidden globally in `src/styles.css`. Firefox uses `scrollbar-width: none`; WebKit uses a hidden zero-size `::-webkit-scrollbar`; app-owned mobile and carousel scrollbar layers are also hidden. Keyboard, pointer and touch scrolling remain enabled.

## Direct action ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Download Matrix ticket | `下載牌單` on the current rendered ticket → `確認下載牌單？` | After confirmation, button disabled with `aria-busy`; duplicate click ignored | Stay on Matrix ticket | Browser downloads the current ticket | Inline alert `下載失敗，請稍後再試`; button re-enables and retry performs a fresh export | Focus returns to the download button after cancellation; otherwise remains on the download button | Quality remediation Task 7; current request (2026-09-01) |
| Re-enable device push | Existing notification enable action by the signed-in member | Existing permission and busy handling; read the current endpoint's server status | Stay on notification settings | An active endpoint is reused; a disabled endpoint is unsubscribed and replaced before saving the new subscription | A status-read failure leaves the existing browser subscription intact; failed unsubscribe or resubscribe cannot report enabled | Existing notification action retains focus | User-approved recovery of disabled push endpoints (2026-09-05) |
| Open invite page | `邀請好友` in the referral summary | Immediate local screen-state update through `Prototype.navigate` | Existing `invite-friends` route | Invite page becomes the active routed view | Existing route remains navigable back; no fake network action | Route-focus restoration is absent and unverified. | Quality remediation Task 7 |
| Submit referral code | `確認` next to referral code → `member_referral_submit` | Button is disabled while pending; duplicate submit is blocked | Stay on the current referral view | Inline status `推薦碼已儲存` after the server accepts the code | Inline API error remains visible; the user may edit and retry when allowed by `canSubmitReferralCode` | Focus remains on the referral form and its status/error feedback | Current member referral API and `member_referral_submit` |
| Member logout and LINE revoke | `登出` on the profile card | Button disabled with `aria-busy`; duplicate click ignored; revoke, presence cleanup and push cleanup run as bounded best effort | Confirmed local Supabase signed-out state; LINE revoke is claimed only when the canonical Edge Function succeeds | Current member session clears after local sign-out is confirmed | Explicit failed or uncertain local sign-out remains recoverable; a missing or failed LINE provider token never claims revoke and does not trap the local session | Focus stays on the logout action or its recovery message | Current LINE auth runtime and `docs/LINE_LOGIN_SETUP.md` |
| Install PWA | `安裝 樂彩 Matrix` under `我的` → `系統相關` | Browser owns the native install prompt; iOS uses the shared app dialog for instructions | Stay on `我的`; the entry disappears after installation | Browser completes installation, or iOS displays the add-to-home-screen steps | Unsupported or consumed prompts make the entry unavailable without claiming installation | Focus remains on the install action or moves into the shared instruction dialog | Current request (2026-09-02) |
| Apply PWA update | Existing Service Worker controller changes after a fingerprinted build | Shared confirmation dialog offers `立即更新` or `稍後` | Confirm reloads the current route; cancel stays on the current route | Reload runs the newest application assets | First Service Worker activation does not show an update; registration failures do not interrupt the current session | Dialog follows the shared focus and dismissal contract | Current request (2026-09-02) |
| Reset admin revenue totals | Super administrator selects `重設收入` in `收入報表` | Danger confirmation explains that five totals reset while payment records remain; action is disabled while pending | Stay on `收入報表` and reload the five totals | Totals reflect only confirmed payments at or after the stored reset timestamp | Inline error remains visible and the action becomes retryable; non-super roles are rejected by the server | Existing admin confirmation dialog owns the decision; focus restoration remains unchanged | Current request (2026-09-02) |
| Expand Matrix status category | Tap the compact `•狀態` category row | Immediate local toggle; chevron and `aria-expanded` stay synchronized | Stay on Matrix status | Every trigger in that category remains visible as its own card | Empty categories show `尚無成立觸發`; closing does not alter server data | Focus remains on the category button | Approved Matrix status design (2026-09-04) |
| Expand Matrix status road | Tap an entitled Explore-style road row | Row expands immediately; validation is fetched once per analysis version and item; duplicate requests are blocked | Stay on the trigger card | Existing Explore validation presentation appears below that row | Inline recoverable validation error; locked rows are not actionable and expose only prediction plus `🔒 Matrix Pro` | Focus remains on the road button | Approved Matrix status design (2026-09-04) |
| Create or edit admin todo | Submit a trimmed 1–100 character todo form | Submit controls are disabled while pending; draft is retained on failure | Stay on `代辦事項` | List refreshes and timestamp remains the creation time | Inline error; edit remains restricted to the owner | Focus remains within the todo form/action group | Approved admin todo design (2026-09-04) |
| Delete admin todo | Select delete on an owned todo, or any todo as super administrator, then confirm | Existing admin confirmation dialog owns the pending decision; duplicate mutation is blocked | Stay on `代辦事項` | Deleted item is removed after server confirmation | Inline error and retry; server rejects unauthorized deletion | Dialog restores focus to the initiating control when retained | Approved admin todo design (2026-09-04) |
| Copy selected activation codes | `選取` reveals row checkboxes; `複製` copies every checked code | Local clipboard write; selection remains visible while copying | Stay on `啟動碼管理` | Inline status reports the copied count; codes are separated by newlines | Empty selection and clipboard failure remain inline and retryable | Focus remains on the copy action | Approved activation-code management request (2026-09-05) |
| Delete activation code | Delete action on an unused code, then the existing danger confirmation | Mutation waits for server confirmation; duplicate work is blocked by the existing busy state | Stay on `啟動碼管理` and reload the list | Existing list reload reflects deletion | Redeemed codes are disabled for non-super administrators and rejected by both backend and database; super administrators retain deletion | Existing confirmation flow owns focus behavior | Approved activation-code management request (2026-09-05) |

## Authentication and sensitive-value handling

Supabase access token, refresh token and user data may persist through the sanitized Supabase auth storage so the member session can survive a reload. LINE `provider_token` and `provider_refresh_token` are stripped before persistence; the provider access token exists only in the current browser page-process memory and the canonical Supabase `line-logout` Edge Function handles it only in request memory. The AppDeploy backend neither exposes a LINE logout route nor loads LINE Channel credentials. Neither provider credential is logged, returned from the revoke endpoint, bundled as configuration or stored in browser persistence.

A reload discards the page-process provider token. When logout cannot obtain that token, no LINE revoke is claimed, but bounded presence/push cleanup and Supabase local sign-out remain available. LINE revoke is best effort: the client first performs a bounded session read, then runs revoke and the two cleanup operations concurrently before local sign-out. A local sign-out timeout is reconciled against the current session; a confirmed remaining session is failure, an unreadable result is uncertain, and neither state is reported as signed out.

The Supabase Edge Function is the only client-facing LINE revoke owner. It accepts only the two documented production CORS origins (or a server invocation with no `Origin`), applies an independent 5,000 ms deadline to auth, verify, userinfo, and revoke, and supplies an abort signal to every network request. Every response includes one UUID-shaped `X-Request-ID`; safe error payloads include the same request id. Structured logs are restricted to `version`, `requestId`, `stage`, `outcome`, `durationMs`, and fixed `code` values and never include tokens, bearer values, identities, secrets, request bodies, or upstream messages.

Live LINE callback and revoke behavior remain **NOT EXECUTED** without an authorized real LINE account and live credentials. Unit and mock coverage must not be represented as live-provider verification.

## Shared application dialog

`src/dialog/AppDialog.tsx` is the single reachable owner for confirmation and alert dialogs. `AppDialogProvider` wraps both member and admin roots, while `useAppDialog()` exposes Promise-based `confirm` and `alert` actions. Reachable product code must not call `window.confirm()` or `window.alert()`.

The dialog preserves the existing navy, gold, danger-red and success-green visual language. It supplies a labelled title, optional description, explicit primary and secondary actions, a minimum 44px touch target, viewport-safe sizing, queued requests and reduced-motion behavior. Escape and overlay dismissal resolve as cancellation. When the queue is empty, focus returns to the control that opened the dialog; destructive actions use the danger tone and explicit destructive copy.

## Navigation, async and recovery

2026-09-05：營運概覽新增本日瀏覽人數、本月瀏覽人數、總瀏覽人數，沿用既有 Cards 與手機排列。匿名識別雜湊保留 90 天，清除後再次造訪重新累加總瀏覽人數；彙總人數保留。日期沿用 Asia/Taipei。

使用者於 2026-09-05 確認：快捷設定與自訂觸發條件一樣，皆為雙擊開啟。兩個設定入口沿用共用的 `useDoubleClickAction`；對應行為驗證位於 `BottomNavigation.test.tsx` 與 `MatrixStatusPage.test.tsx`。快捷設定的雙擊測試屬於正式規格驗證。

Bottom navigation, feature back actions and existing routes remain the navigation owners. Async actions prevent duplicates, expose busy state, preserve user-entered data on recoverable failure and ignore stale completions after unmount where their existing request owner supports cancellation or revision tracking. No direct action may use an empty handler, empty link, dummy request or success copy without a completed operation.

## PWA install and update lifecycle

`PwaLifecycleProvider` is mounted inside `AppDialogProvider` and owns the browser PWA lifecycle. It captures `beforeinstallprompt`, detects standalone mode and `appinstalled`, registers the existing combined Push/PWA Service Worker, and listens for an existing controller change. The install entry appears only when a browser install prompt is available or the current device requires iOS add-to-home-screen instructions; it is hidden after installation.

The production build stamps `push-service-worker.js` with a fingerprint derived from the built application files. A controller change is therefore tied to a changed production build. Only clients that already had a Service Worker controller receive the update confirmation; initial installation is not reported as an update.

## Verification

- Static ownership and token drift: `node --test tests/premium-contract.test.mjs`.
- DESIGN structure: `npx -p @google/design.md designmd lint DESIGN.md`.
- Premium audit: strict audit over `src` only; Tasks 7–9 own the currently planned action, form, textarea and scrollbar corrections.
- Runtime verification: project unit, Node, typecheck and build commands plus real-browser checks for native popup/calendar, failure, keyboard, narrow viewport and forced-colors behavior when the owning task changes those surfaces.
- Canonical sibling comparison: existing feature pages inside `FeatureShell`, profile direct logout, native select fields and native date fields.


## LINE login return — 2026-09-06

- User request: opening LINE login from the installed PWA must return to the PWA.
- Installed PWAs, including mobile, keep the original app open and attempt the
  managed authorization window. The callback stays at the approved origin root;
  an internally generated `matrix_line_return` UUID binds it to the waiting
  attempt. Public redirect arguments still reject arbitrary paths or queries.
  Allow native LINE auto login. Do not force
  `disable_auto_login=true`: this prevents single-phone users without web SSO
  from using the installed LINE app. Supabase detects and persists the callback
  session through the existing provider-token-safe storage.
- When native LINE opens a callback without its opener, a same-origin
  BroadcastChannel matched to the callback's own UUID can import the session
  into the waiting PWA. Never choose a pending attempt from shared storage.
  Check for a listening PWA before consuming a detached callback. Successful
  import acknowledges the callback, closes the temporary authorization windows
  and requests focus of the original PWA, which uses its existing success UI.
- Fullscreen (the current manifest setting), standalone, minimal-ui and iOS
  home-screen mode share detection with the install UI.
- Ordinary browser login keeps the existing origin-root redirect. Unsupported
  popup or unreachable return channels retain normal browser initialization.
  Separate browser/PWA partitions (including iOS Home Screen/Safari) cannot use
  this channel. Window focus is controlled by the OS; unit or desktop-browser
  checks do not verify physical Android/iOS foreground return.
- No page geometry, shortcuts, provider scopes or Supabase allowlist changes.

## Notification settings login state — 2026-09-06

- Check the member session before reading notification settings. Signed-out
  visitors retain the existing `請先使用 LINE 登入` message and cannot edit or
  save member settings; being signed out is not a settings load failure.
- Discard pending edits when the session check confirms no login. After login,
  entering the notification page loads the member's saved settings.
- Authenticated request failures retain the existing failure message, retry
  control and protection against overwriting unknown remote settings.

## Pre-generated Matrix cards — 2026-09-05

The existing four-lottery, sorted/draw tabs and download confirmation remain the card-page flow. New clients request the PNG manifest explicitly. Its period and both URLs describe the latest complete published generation; an ungenerated newer draw never relabels the older image. Preview and confirmed download use the same immutable PNG bytes, with no browser rasterization or document-wide observer. Download failure remains inline and retryable. The prior SVG manifest/routes remain available to installed older PWA clients during rollout.

Print geometry remains 2276 × 3438 under the existing backend renderer. Bundled CJK and Arial-compatible font subsets make generated PNG text deterministic across worker hosts. Publication waits ten minutes after the publisher first observes a complete snapshot, then runs on the next available worker tick; this does not promise an exact ten-minute completion time. A missing period, invalid numbers, failed upload, or lost lease retains the previous complete card. Card-ready notifications require the matching published period.
