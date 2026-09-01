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
| Select/Listbox | Native HTML `select` on product forms | `premium-ui.json` and this contract | OS-owned native popup only; authored replacement requires a separate approved contract | Keyboard and open-popup checks on supported mobile PWA browsers |
| Date | Native HTML `input[type="date"]` | `premium-ui.json` and this contract | OS-owned Gregorian date popup; ISO date-only form value | Locale, keyboard, narrow-viewport and open-calendar checks |
| Form | The React screen that owns each product form | This contract and the owning component test | Sign-in, settings and data-entry forms with app-owned validation | Component tests for validation, busy, recovery and first-error focus |
| Scrollbar | Global application stylesheet `src/styles.css` | `DESIGN.md` and this contract | Scrolling remains enabled while native and app-owned scrollbar visuals stay hidden | Computed overflow plus Firefox and WebKit hidden-scrollbar source checks |

## Form behavior

Product forms set `noValidate` and own validation instead of invoking browser validation bubbles. Every field keeps a visible label association; invalid fields use `aria-invalid` and `aria-describedby` that points to existing help or error text. Submission focuses or scrolls to the first invalid field, preserves entered values, disables duplicate submission with a perceivable busy state, and keeps control geometry stable. A request failure remains inline and recoverable; editing clears only the stale error that no longer applies.

Native Select/Listbox and Date are intentional for the supported mobile PWA. The browser or operating system owns the opened popup language, geometry, option/calendar interaction and collision behavior. Closed fields still use product labels, focus treatment and error association. If product-owned popup geometry or calendar copy becomes a requirement, replace the owner through a separately approved accessible primitive instead of hand-building ARIA behavior.

## Scrollbar behavior

Every reachable product overflow surface keeps its existing overflow and touch behavior while scrollbar visuals are hidden globally in `src/styles.css`. Firefox uses `scrollbar-width: none`; WebKit uses a hidden zero-size `::-webkit-scrollbar`; app-owned mobile and carousel scrollbar layers are also hidden. Keyboard, pointer and touch scrolling remain enabled.

## Direct action ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Download Matrix ticket | `下載牌單` on the current rendered ticket → `確認下載牌單？` | After confirmation, button disabled with `aria-busy`; duplicate click ignored | Stay on Matrix ticket | Browser downloads the current ticket | Inline alert `下載失敗，請稍後再試`; button re-enables and retry performs a fresh export | Focus returns to the download button after cancellation; otherwise remains on the download button | Quality remediation Task 7; current request (2026-09-01) |
| Open invite page | `邀請好友` in the referral summary | Immediate local screen-state update through `Prototype.navigate` | Existing `invite-friends` route | Invite page becomes the active routed view | Existing route remains navigable back; no fake network action | Route-focus restoration is absent and unverified. | Quality remediation Task 7 |
| Submit referral code | `確認` next to referral code | Disabled because no mutation API is specified | No transition | No success is claimed | Disabled until a separately approved referral API and recovery contract exist | Control remains unavailable and is not presented as actionable | Quality remediation Task 7 |
| Member logout and LINE revoke | `登出` on the profile card | Button disabled with `aria-busy`; duplicate click ignored | Supabase signed-out state only after verified LINE revoke succeeds | Current member session clears | Inline alert `登出失敗，請稍後再試`; failed or missing-token logout remains signed in and may be retried | Focus stays on the logout action or its recovery message | LINE login API design and completion plan |

## Authentication and sensitive-value handling

Supabase access token, refresh token and user data may persist through the sanitized Supabase auth storage so the member session can survive a reload. LINE `provider_token` and `provider_refresh_token` are stripped before persistence; the provider access token exists only in the current browser page-process memory and the server endpoint handles it only in request memory. Neither provider credential is logged, returned from the revoke endpoint, bundled as configuration or stored in browser persistence.

A reload discards the page-process provider token. When logout cannot obtain that token, it fails closed with `LINE_PROVIDER_TOKEN_REQUIRED`: no LINE revoke is claimed and Supabase `signOut()` is not called, so the current session remains intact. Re-authentication or an explicitly approved operator recovery is required; the UI must not bypass revoke ordering. Logout order is bearer session lookup, LINE token verification, LINE user/Channel match, LINE revoke, then Supabase sign-out.

## Shared application dialog

`src/dialog/AppDialog.tsx` is the single reachable owner for confirmation and alert dialogs. `AppDialogProvider` wraps both member and admin roots, while `useAppDialog()` exposes Promise-based `confirm` and `alert` actions. Reachable product code must not call `window.confirm()` or `window.alert()`.

The dialog preserves the existing navy, gold, danger-red and success-green visual language. It supplies a labelled title, optional description, explicit primary and secondary actions, a minimum 44px touch target, viewport-safe sizing, queued requests and reduced-motion behavior. Escape and overlay dismissal resolve as cancellation. When the queue is empty, focus returns to the control that opened the dialog; destructive actions use the danger tone and explicit destructive copy.

## Navigation, async and recovery

Bottom navigation, feature back actions and existing routes remain the navigation owners. Async actions prevent duplicates, expose busy state, preserve user-entered data on recoverable failure and ignore stale completions after unmount where their existing request owner supports cancellation or revision tracking. No direct action may use an empty handler, empty link, dummy request or success copy without a completed operation.

## Verification

- Static ownership and token drift: `node --test tests/premium-contract.test.mjs`.
- DESIGN structure: `npx -p @google/design.md designmd lint DESIGN.md`.
- Premium audit: strict audit over `src` only; Tasks 7–9 own the currently planned action, form, textarea and scrollbar corrections.
- Runtime verification: project unit, Node, typecheck and build commands plus real-browser checks for native popup/calendar, failure, keyboard, narrow viewport and forced-colors behavior when the owning task changes those surfaces.
- Canonical sibling comparison: existing feature pages inside `FeatureShell`, profile direct logout, native select fields and native date fields.
