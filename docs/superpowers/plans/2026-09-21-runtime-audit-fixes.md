# Runtime audit repairs

Baseline: `c770858f716c120afe272ffe3c23680d778b9bdd`.

The user requested repairs to the defects identified in the architecture audit.
Keep draw schedules, analysis algorithms, retention, payment flows, response
contracts and visual design unchanged.

## Tasks

- Reconcile stale degraded watchdog status against fresh read-only evidence;
  preserve the historical incident and failures that remain unresolved.
- Pass the runtime-verified client IP to the security monitor, preserving the
  existing trusted platform context fallback and rejecting unsigned headers.
- Bound notification preference retries, suspend while offline or hidden, and
  preserve the latest draft, account isolation and explicit retry path.
- Navigate notification clicks to the safe target before focusing a PWA window;
  exclude admin windows and open a new window if navigation cannot complete.
- Coalesce and cache legacy full-history reads using the current draw revision,
  without truncation or changes to pagination and response formats.

## Verification

For each defect, first demonstrate failure with a focused behavioral regression,
then implement the smallest repair and rerun named related test files only.
Run the production Pages build for frontend integration. Review the final diff
independently before committing and opening a draft pull request. Never run the
entire test suite (repository AGENTS.md).

## Delivery boundary

Deliver a tested, reviewable branch and draft PR. Merging and production rollout
are separate actions; this repair request does not change operational schedules.

## Completed evidence

- Admin regression: eight named Vitest files, 178 passing tests covering
  connection status, snapshot wiring, status sanitization, and real signed proxy
  transport into the security monitor.
- Frontend regression: five named Vitest files, 75 passing tests covering the
  notification page, load/session boundaries, service worker and watchdog panel.
- Worker regression: three named Node test files, 23 passing tests covering push
  click navigation and existing LINE/admin notification behavior.
- API regression: nine named pytest files, 105 passing tests covering legacy
  cache, revisions, compatibility, aliases, capped reads and card APIs.
- Independent review identified mixing historical Railway diagnostics into the
  current database observation. Added a failing regression, separated the
  sources, and reran watchdog status, recovery and panel files: 30 tests passed.
- `npm run build:pages` passed after the final fix, including runtime integrity,
  TypeScript, PWA build, admin Pages build and worker version stamping.
- `git diff --check` passed. No production migration or deployment was performed.

Operational limits: legacy cache hits still revalidate the database revision;
oversized results remain complete and are not retained in the bounded cache.
Sequential stale-heartbeat reads perform fresh database checks, subject to the
existing deadline. Notification drafts retain their existing component lifetime;
no new persistence or forced cancellation of an already sent write was added.
