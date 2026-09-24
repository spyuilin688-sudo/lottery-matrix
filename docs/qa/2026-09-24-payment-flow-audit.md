# Payment flow audit — 2026-09-24

Baseline: `86a5df938a86d3308d2d396e4a2bd66715cc26a7`.

## Findings and fixes

| Finding | Observable failure | Correction |
| --- | --- | --- |
| Merchant backoff race | A reconciliation claim could replace a concurrent 30-minute provider backoff with its 2-minute lease. | Forward migration makes backoff acquire the same per-merchant transaction advisory lock as claim and retains the later retry time. |
| Unowned transfer selection | Switching accounts in one tab reused the previous member's saved fallback plan. | Store the plan with the authenticated user ID and wait for session initialization before reading it. |
| Checkout after navigation | Leaving and reopening plans could start another checkout; the old request could still post a payment form or navigate. | Observe one shared in-flight state across remounts and verify route lifetime and session identity before consuming the response. |
| Uncertain transfer submission | Failed pending reads or lost submission responses allowed repeated submission and misleading failure feedback. | Disable submission while status is unresolved, reconcile uncertain writes, and provide an explicit status reload. Only a matching acknowledged request or a specific definitive no-row rejection releases its saved UUID. |
| Review completes before recovery | A committed transfer request could already be reviewed before the recovery lookup, so a pending-only lookup returned nothing and allowed a second report. | Persist one owner-bound request UUID and captured input until acknowledged; the three-argument RPC returns the original request, including terminal status, on exact replay. The old two-argument API delegates to the same implementation. |

## Preserved contract

- Only the approved 樂彩 merchant and rolling 30 Taiwan calendar dates / NT$200,000 limit are used.
- Verified insufficient quota selects the existing bank-transfer route. Failed or unresolved reconciliation remains unavailable; local unpaid orders are not evidence that the quota is full.
- Paid credit and verified offline number issuance retain their existing quota accounting. An unsigned or unknown “not found” response never releases a reservation.
- Signed provider `TradeStatus=10200095` is the documented failed transaction state, distinct from a generic missing-order response. This audit does not introduce expiry based only on local elapsed time.
- Callback signature checks, independent provider verification, amount/order matching and database idempotency remain in place. Repeated valid callbacks can repeat verification but cannot grant the same payment twice.
- Same-member bank-transfer forms remain usable after quota recovers. Legacy plain plan strings without an owner are ignored; new selections include the owner. Selection storage is UI continuity, not server authorization.
- Lifetime, plan downgrade, purchase visibility, pending-transfer uniqueness and refund-required safeguards remain unchanged.
- Replaying an existing request checks the active member and exact original inputs; it returns the saved result without granting anything or applying new-purchase eligibility to the old request. Every new request still enforces all eligibility guards.

Primary protocol references: [ECPay query verification/status](https://developers.ecpay.com.tw/2890/), [ECPay unique merchant trade numbers](https://developers.ecpay.com.tw/2862/), and [Supabase named RPC overload errors](https://supabase.com/docs/guides/api/rest/postgrest-error-codes).

## Fresh production inspection

- Both deployed payment Edge Functions were version 8 and all five files in each matched the baseline.
- The five payment/quota SQL function bodies matched repository migrations; execution remained service-role only. Both quota tables had RLS enabled.
- No duplicate local merchant trade-number groups were found. Existing orders had not yet acquired provider quota evidence; their local status was not treated as verified quota usage.
- No payment/membership cron entry was found in Supabase. All five Railway production service commands point to the existing data/API workers; no alternate payment executor was found.
- Last-24-hour payment logs contained checkout 200/401 and notify 200/400 responses, including prior smoke requests. This is limited traffic evidence, not a live payment or load test.

## Verification

- Focused Edge tests: 44 passed across checkout, quota reconciliation, notification, provider query and signature helpers.
- Focused SQL integration tests: 27 passed, including terminal request replay, original amount/time preservation, active-owner/input checks, observed advisory-lock key, preserved backoff and RPC access restrictions.
- After rebasing onto main `baea587ed5e5860ab6d2ec288b9b50a827e86078`, all 147 tests in the six directly related frontend files and all 37 tests in the two payment SQL files plus the current payment-reversal file passed.
- TypeScript check and Vite production build passed. Existing bundle-size warning remains.
- Independent source review found no remaining production-code blocker. Browser recovery checks remain a merge gate and are recorded in the associated PR checks.
- Premium static audit reported only two pre-existing actionless button fixtures in `src/__tests__/AppPermissionSettings.test.tsx` and `src/permission-settings.test.tsx`; neither is a production payment control.

## Limits

- PGlite verifies SQL transitions and the matching held transaction locks but does not provide a multi-session PostgreSQL contention test.
- Browser dependencies could not be downloaded in the local environment (invalid archive); the scoped browser tests must pass in CI before merge.
- No real charge, live bank reconciliation, or provider high-traffic test was performed. Existing unresolved reservations intentionally remain reserved until trustworthy provider evidence is available.

## Compatible database rollout

- Applied `20260924014322_serialize_ecpay_quota_backoff.sql` and `20260924014336_idempotent_member_transfer_submit.sql` before the client release.
- Production function-body hashes matched all three resulting local definitions. Both manual RPC signatures have distinct argument lists and no default arguments; PostgREST schema reload was requested.
- The legacy two-argument manual RPC remains available to authenticated clients. The new three-argument client never retries an uncertain write through the legacy interface.
- Cached legacy clients retain their previous pending-only retry behavior until they load the new frontend.

## Concurrent main changes

- Main advanced during this audit through PR #842 (superadmin payment reversals) and PR #843 (mobile intro layout). Their source paths do not overlap this audit's changes.
- The separate `20260924090000_superadmin_reversal_entitlements.sql` migration from PR #842 was absent from the live migration history when inspected. This checkout audit does not deploy that independent admin feature or claim it is live.
