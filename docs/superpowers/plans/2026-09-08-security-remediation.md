# Security remediation: 2026-09-08

Scope: close the four findings from the authorized database, member-access,
algorithm and API audit. Preserve normal member transactions, browser account
switching and current UI. The audit did not establish an algorithm-access bypass.

## Execution

- [x] Reproduce the relevant failures with synthetic fixtures.
- [x] Apply the existing member/admin revocation migration and deploy the current
  admin credential-version checks to AppDeploy.
- [x] Restrict member push registration and delivery to existing browser providers;
  make cross-account endpoint reassignment require both existing browser keys.
- [x] Run focused regressions, verify deployed source and perform read-only live
  checks. Synchronize migration filenames with the actual deployment ledger.

## Applied changes

| Finding | Result |
| --- | --- |
| Old administrator cookies survive password changes | Password/salt updates atomically increment credential version and delete that account's sessions. Login and session validation check the version, including concurrent password changes. |
| Legacy Supabase admin identity has broad table access | Legacy admin policies and RPC grants are removed. The identity retains its own member reads. |
| Disabled members can redeem or submit transfers | Public financial RPCs lock and check the active member before invoking private implementations; direct private execution is revoked. |
| Arbitrary push destinations and endpoint takeover | Registration and send-time guards allow HTTPS browser-provider hosts only. An atomic conflict-update condition requires the same owner or both currently stored keys. Invalid stored destinations are disabled without sending. |

The endpoint policy permits FCM, Mozilla Push, Apple Push and Windows notification
hosts already supported by admin push. Credentials, ports, fragments, whitespace,
backslashes, encoded hosts and oversized URLs are rejected. Same-owner key rotation
and browser account switching with both existing keys remain supported.

## Production evidence

- Applied migrations: `20260908153522_member_admin_revocation` and
  `20260908154542_member_push_endpoint_security`. The first source file is renamed
  from its previously unapplied timestamp; its SQL is unchanged. No migration-ledger
  edits were made.
- AppDeploy `matrix-sanqwn`: applied snapshot `1788881968050`, status ready,
  no reported backend, frontend or QA network errors. Applied credential source
  matches the tested payload, which compiles identically to current GitHub source.
- `notification-dispatch`: ACTIVE version 5; `send-test-push`: ACTIVE version 14.
  Both contain the exact tested shared sender. Other files and authentication
  settings match the pre-deployment snapshots.
- Read-only authenticated-role simulation using the existing legacy identity:
  own member rows 1, other members 0, activation codes 0, payments 0;
  legacy `is_admin` execution denied.
- Five invalid push registration attempts on the live RPC returned
  `INVALID_PUSH_SUBSCRIPTION` before any write, inside a read-only transaction.

## Focused verification

53 related tests passed: 11 database tests, 32 push delivery/handler tests and
10 administrator credential tests. The unsafe endpoint and ownership tests failed
before the fix. Independent review compared 26 SQL/JavaScript URL cases with no
mismatches and reviewed the atomic ownership check.

Reproduction commands with project dependencies installed:

```sh
node --test tests/member-admin-revocation.test.mjs tests/member-push-security.test.mjs
npx vitest run --config vitest.edge-functions.config.ts supabase/functions/_shared/web-push-delivery.test.ts supabase/functions/send-test-push/handler.test.ts supabase/functions/notification-dispatch/handler.test.ts
```

This execution used PGlite 0.3.14 and an isolated Vitest 3.2.4 runtime with the
repository's edge-test configuration. Administrator tests imported the exact
deployment payload. No production passwords, member purchases, activation-code
balances or actual push deliveries were changed for verification. Live role
simulation is not an externally forged JWT test, and no load test was performed.

The repository requires only directly related tests. Its automatic Project CI
currently invokes full suites, so source commits use the established
`skip-checks: true` trailer; focused results above are the verification evidence.
No workflow or branch-protection settings are changed.
