# Payment flow recheck — 2026-09-24

Initial baseline: `16759bb33d2b2fae92f2b409c188233d9d40ada5` (main). At the initial comparison, changes since the preceding payment audit were limited to the intro page. During this recheck, main advanced to `4cf9800` with the separate admin audit (#846); its changes are preserved when integrating this correction.

The subsequent intro-page change in `8b237d9` (#847) is also preserved. Neither integration changes the reviewed payment source or SQL body.

## Reproduced findings

| Finding | Evidence | Correction |
| --- | --- | --- |
| Rejected duplicate attempt remained replayable | Submit B receives exact `23505 / PENDING_TRANSFER_EXISTS` because A is pending. After A is reviewed, reopening the page offers B as a retry; replaying B creates a new pending request. This was reproduced through the real frontend storage/page and current SQL. | Clear only the definitively rejected submitted UUID, then reconcile the existing pending request. Unknown errors retain their UUID. |
| Selected plan obscured the actual request | A year selection with an existing month request showed the selected year amount instead of the saved request amount. | A displayed request supplies its own plan name and recorded amount, including historical amounts and terminal replay results. |
| Payment time was used as entitlement time | A normal manual submit followed by later review fails reversal with `PAYMENT_ENTITLEMENT_CONFLICT`. In a card-then-manual renewal, reversing the card can instead remove the review delay from the retained manual entitlement. | Preserve `paid_at`; record actual grant time and the member's serialized entitlement revision. Reversal uses the recorded grant evidence. |
| Repository migration order differed from deployed history | The already-deployed reversal file used a future `090000` filename, while live history recorded `020932`. A new chronologically generated correction would be overwritten on a fresh replay. | The identical rename to the actual deployed version landed upstream in #846 during this recheck. Preserve that alignment and the unchanged historical SQL body. |

## Preserved behavior and evidence boundaries

- The approved merchant, rolling 30 Taiwan calendar dates, NT$200,000 cap, verified-insufficient fallback and unavailable-on-uncertainty behavior are unchanged.
- New transfer requests still require the existing eligibility checks and admin review. Owner changes, uncertain responses and malformed acknowledgements retain their existing protections.
- New grant metadata records the existing grant operation; it does not change payment dates, prices, purchased durations or receipt history.
- Legacy ECPay grant time is usable only when its payment and original order match. Legacy manual grants without evidence remain conflicts rather than guessed timestamps. The inspected production aggregate contained two ECPay payments and no manual/other payment rows.
- First payment notifications still require independent provider verification. Repeated completed notifications can re-query the provider; this is bounded extra I/O and does not repeat membership grants. No new polling, schedule or callback suppression was introduced.

## Fresh environment comparison

- All five source files in each deployed payment Edge Function matched the baseline; both functions were version 8 with their intended JWT settings.
- The twelve inspected payment-related SQL definitions and privileges matched their latest repository definitions, including the now-deployed superadmin reversal.
- Payment/order/quota/member tables had RLS enabled. No payment-related Supabase cron job was found.
- All five Railway production services reported successful deployments; the existing service and schedule set was unchanged.

## Verification

- Frontend regressions: four new cases failed before correction; all 46 tests in `ManualBankTransferPage.test.tsx` passed afterward. Independent frontend review found no material blocker.
- Root integrated frontend run: 84 tests across four explicit payment-related files passed; TypeScript and Vite production build passed.
- Unchanged Edge verification: 44 tests across six explicit files passed.
- SQL: the three grant-time/order regressions were red before correction. The final named run of `tests/ecpay-quota-pglite.test.mjs`, `tests/ecpay-one-time-pglite.test.mjs`, and `tests/payment-reversal-pglite.test.mjs` passed 44/44; the root integration run repeated that result after rebasing onto #846.
- Independent SQL review approved the frozen migration. Production migration `20260924030920_payment_entitlement_grant_evidence` is applied; all three function hashes and service-only execution grants match. Existing payment data and the affected member's entitlement-state fingerprints are unchanged, and RLS remains enabled.
- Post-DDL advisors were reviewed. Backend-only payment tables intentionally retain RLS without public policies, and guarded member-facing RPCs retain their intended execution rights. The existing `ecpay_orders.plan_id` foreign-key index advisory is informational, with no demonstrated slow payment query in this check; see [Supabase's index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). No unrelated permissions or indexes were changed.
- Nine manual-transfer browser cases are selected for CI, including actual recorded plan/amount and retirement of a rejected duplicate attempt.

## Limits

- No actual charge or bank transfer was performed.
- SQL tests use PGlite; deterministic ordering checks do not constitute a multi-session PostgreSQL stress test.
- Local Chromium installation previously failed because the downloaded archive was invalid. Browser execution is a required scoped CI gate.
