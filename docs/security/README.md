# Matrix request security monitoring

## Activation status — 2026-09-10 UTC

Source was merged as `8f1a2e13a5bfe687807a67c0715177304e9da5a2`. The later unrelated card-rendering change `18ffc7f86a468876b2eed7f1e7cc289303853bf4` is preserved.

- **Active:** Supabase request collection for the six Matrix RPC wrappers. All three policies remain `observe`; no new blocking is enabled. The original six algorithm bodies and grants were compared before application; their private implementation bodies retain their original hashes.
- **Active:** Railway's merged producer code. The production health endpoint returned HTTP 200 and release `8f1a2e13a5bfe687807a67c0715177304e9da5a2`.
- **Active:** `matrix-security-cleanup`, every five minutes. A direct cleanup invocation succeeded; bounded cleanup targets records older than seven days.
- **Deployed, dispatch paused:** `admin-security-push` Edge Function version 1. An authenticated empty-queue invocation returned HTTP 200 with claimed/sent/failed counts all zero. No real-device test notification was sent.
- **Blocked:** admin login producer and updated admin service worker deployment. AppDeploy rejected the existing app deployment because the Free lifetime deploy allowance is exhausted (125/125; no reset). Do not retry until allowance increases.
- **Not enabled:** `admin-security-push-minute`. The deployed admin worker still displays transfer-only notifications, so enabling security dispatch now would mislabel security alerts. Deploy and activate the reviewed worker before scheduling dispatch.

Supabase applied migration `20260910111850_security_monitoring` through the connected deployment tool using the reviewed SQL, and `20260910112657_security_monitoring_cleanup` using only the existing cleanup schedule statement. The corresponding files under `supabase/migrations` are exports of those actual server history entries, not invented versions or new migrations. The CLI could not execute in this environment. Do not reapply the initial subsystem SQL to this project.

Live PostgREST validation confirmed an invalid Explore request returns the expected HTTP 400 / `22023 INVALID_REQUEST` while its denial observation persists after the HTTP transaction. A valid anonymous Explore POST also returned HTTP 200 with `kind: explore` and `status: complete`. This is a narrow production smoke check, not a complete entitlement or load test. Full repository tests were not run.

## Behavior and limits

| Category | Initial mode | Proposed threshold | Window |
| --- | --- | --- | --- |
| Public Matrix queries | observe | 120 | 60 seconds |
| Admin login attempts | observe | 10 | 300 seconds |
| Unauthorized / unknown backend requests | observe | 10 | 300 seconds |

These are reviewable starting values, not production baselines. The threshold is exceeded on request N+1. Fixed windows permit boundary bursts. There is no permanent blocking. Public anonymous RPC traffic and backend traffic with no verified client identity are an **unattributed aggregate**: they may generate a volume alert but cannot be enforced and are not evidence of one attacker. Registered JWT subjects are authoritative for SQL identity. The six moved implementations retain the original JWT entitlement and result logic.

The collector stores only category, salted/ keyed source digest, bounded slot, timestamps, counts and group IDs. It never stores request body, URL/query, password, account name, IP address, user agent, cookies, session or service tokens. SQL digests use a private random database salt; backend digests use HMAC with the existing service key. Rotating the key changes source grouping. SQL and backend digests use different namespaces; this is not a complete cross-platform identity tracker. Backends using the same service key and verified address can share a digest.

Counters and event summaries each have at most 16,384 slots per category (49,152 rows total). A collision marks the entire counter window observation-only for both identities; a hostile collision can reduce enforcement effectiveness but cannot cause false enforcement of its original owner. Alerts group for 15 minutes by category/slot. Slots are a bounded approximation, not a forensics identity index. Event summaries keep aggregate request and denial counts, rather than a raw per-request log. At most 10,000 total security jobs exist. Admission is nonblocking; alerts can be dropped under lock contention or queue saturation. One alert per group/subscription is enqueued, not one per request. Claims contain the latest available group count at claim time; later requests do not modify an already delivered alert.

Telemetry counter lock waits are capped at 30ms. This setting is scoped to telemetry, not the algorithm function. SQL statement execution still depends on the existing PostgREST statement timeout; a client transaction cancel or an internal query failure may roll back telemetry. No claim is made that local SQL tests prove deployed gateway transaction behavior. Jobs/cleanup use 100ms lock waits. Cleanup runs every five minutes and removes up to 1,000 rows per table per tick older than seven days, including expired unfinished jobs. Retention is a target with bounded backlog processing, not a hard exactly-seven-day guarantee. Configuration audit records are also retained for seven days.

Railway normal query observation uses one daemon worker, a 256-item queue and a separate HTTP client with 250ms network timeouts, HTTP/1.1, no redirects. The optional synchronous enforcement check waits at most 300ms, including queue delay, then allows the existing business/auth flow to continue. Hung dependencies cannot spawn unlimited workers. A successful protected job/status call is not classified as unauthorized; failed authorization is observed separately. Health checks are excluded. Shutdown drains neither the queue nor unfinished observations; evidence can be lost at restart. Queue saturation and dependency failure produce fixed, sampled diagnostics without exception text.

Admin login checks run before password verification and wait at most 300ms; outcomes are recorded with a separate bounded call. A successful login or failed credential attempt is recorded even for superadmins, while the existing ordinary activity-log exemption is preserved. Security calls allow at most eight outstanding underlying operations per instance, even if a dependency ignores abort. Failure/deadline/saturation logs are fixed text, at most once per minute. The trusted source is only the platform-populated Lambda `requestContext.http.sourceIp`, never `X-Forwarded-For`. If absent or invalid, monitoring is aggregate-only. Auth is never weakened by observation failure.

Railway ignores all forwarded IP headers. `MATRIX_SECURITY_TRUST_DIRECT_PEER` defaults false; do not enable it for a Railway reverse-proxy socket, which identifies the proxy rather than a visitor. `MATRIX_SECURITY_ENFORCE` also defaults false and must be true before Railway waits for policy decisions. Per-client IP enforcement on Railway remains unavailable until the trusted proxy chain is independently verified and a corresponding bounded parser is reviewed. Merely setting a database policy to enforce does not safely establish proxy trust.

## Public RPC compatibility

The public names, `p_request jsonb` argument and `jsonb` results remain unchanged for all Explore/Tianyan/Tiangong list/validation RPCs. Their unchanged STABLE SECURITY DEFINER bodies are moved into private `*_impl` functions; public wrappers are VOLATILE, with fixed CASE dispatch and empty search paths. Migration preconditions abort on changed volatility, missing signatures, destination collisions or unexpected ACLs. Explore retains anon/authenticated/service_role access; Tianyan/Tiangong retain authenticated/service_role only. Helpers and private originals cannot be called by client roles. Moving preserves function bodies, owner and JWT claims; no claims are elevated.

Expected errors are caught in an inner subtransaction and the result is returned as `{code,message,details,hint}` with `response.status`, allowing telemetry to commit. 42501 maps to 401 for anon and 403 otherwise; invalid-input/conversion/P0001 known readiness/version errors retain the underlying PostgREST 400 status. Readiness/version errors do not increment security-denial counts. Unexpected errors rethrow. Non-HTTP SQL calls keep original exception semantics. GET/HEAD are intentionally rejected before any write; the current PWA uses POST. Client `Prefer: tx=rollback` is rejected before telemetry. Deployment must verify server `db-tx-end` is commit and a client cannot otherwise force rollback.

Failures before wrapper invocation — invalid JWT, malformed JSON, unknown RPC, argument binding failure, ACL denial on auth-only endpoints, request cancellation — remain platform-log-only. This subsystem does not detect all bots, attacks or failed calls. Future algorithm migrations must replace the private implementation or deliberately reapply wrappers; replacing a public wrapper with an old body disables this monitoring.

## Push delivery

`admin-security-push` uses a separate private queue and the existing dispatch token, VAPID secrets and admin subscriptions. Transfer code and queue are unchanged. Only enabled subscriptions currently owned by active superadmins are eligible; stale leases, disabled admins, expired subscriptions and re-enrolled devices are rechecked. Batches are 10, leases two minutes, maximum attempts five, retries exponential (1/2/4/8 minutes). Endpoint allowlists and provider 404/410 disabling match existing transfer behavior. No request identifiers or IPs are sent in the lock-screen body.

The admin service worker now recognizes only `kind: security`, displays fixed security text and a validated numeric count, and opens the existing admin root. Incoming URLs/titles/bodies are ignored. Transfer messages preserve their old text, tag and transfer destination. Deploy and activate this service worker **before enabling the security dispatcher**; an old installed worker would mislabel a security alert as a transfer. There is no new visual security-log page: inspect private summaries through approved operator SQL/platform tools.

## Policy administration

Existing authenticated superadmins can read `GET /api/security-policies` and update `PUT /api/security-policies/:category` with `{mode,threshold,windowSeconds,expectedRevision}`. The backend supplies the authenticated admin ID, never a caller-provided actor. Service-only SQL rechecks current active-superadmin status, range constraints, and the expected revision under lock, and writes previous/next values to the private audit table atomically. Stale revisions are rejected; reload current values before retrying. No settings UI is added. Review legitimate traffic first; enable only a chosen category after explicit release approval. SQL admin tooling can use the same service RPC rather than unaudited direct table updates.

## Remaining release guidance

1. Source integration is complete. Preserve concurrent work on any follow-up. The user explicitly prohibited the full suite; the approved integration used a no-content-change `[skip ci]` commit on the verified unprotected branch. No workflow or branch-protection settings were changed.
2. In a disposable Supabase/PostgREST environment, use CLI help to create the migration file and copy `security-monitoring.sql`. Run the named local tests below, then compare all six POST success/error cases against the original deployment for guest/free/paid/trial/disabled identities. Capture function definitions, owners, ACLs and dependencies before release. Confirm no SQL caller embeds recursion through the public names.
3. Confirm current Supabase gateway/PostgREST version, commit transaction mode, request GUCs, timeout, no client rollback overrides, exposed schemas excluding private, and ACL checks. Local PGlite verifies SQL execution and rollback mechanics but does not provide a live PostgREST wire test or multiconnection lock-contention test.
4. After approved migration application, release backend producers with defaults observe and Railway enforcement/trust flags false. Reuse existing secrets. Deploy/activate the service worker before enabling dispatch.
5. Deploy the new `admin-security-push` Edge Function using the existing project's dispatch-token authentication convention (`--no-verify-jwt` only after confirming CLI help and deployment policy). Reuse SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MATRIX_NOTIFICATION_DISPATCH_TOKEN and existing WEB_PUSH_* values. No new secret literals or credentials belong in code.
6. Only after the updated service worker is active, apply `security-monitoring-scheduler.sql`. Vault names and pg_cron/pg_net availability were checked; cleanup is already scheduled independently. It schedules only the new security tick and cleanup; transfer scheduling remains unchanged. Actual delivery to one approved test device and retention/timing observation are still required. No real-user test push was sent in development.
7. Independently inspect Cloudflare DNS proxy state, SSL/TLS mode, WAF/bot rules, rate rules and analytics against the approved scope. No connected Cloudflare account capability was available during implementation; none of these settings are verified or changed. Supabase/Railway direct endpoints may bypass a custom-domain Cloudflare rule.

## Rollback and reapply

First set relevant modes to observe using the audited policy RPC and stop new producers/dispatcher. Unschedule only `admin-security-push-minute` and `matrix-security-cleanup` if installed. Apply `security-monitoring-rollback.sql`: it restores original public STABLE functions and ACLs, revokes service observation/dispatch/config RPC access, and retains private evidence. Do not drop private tables or use CASCADE while investigating. The service worker remains backwards compatible.

To resume after that rollback, use `security-monitoring-reapply.sql`, which restores wrappers/grants using retained tables, followed by rescheduling the two existing security jobs. Do not rerun the initial full draft, which intentionally fails on existing objects. Reapply is only for the known rollback state, not a general idempotent migration. New full installation/rollback/reapply were executed locally with synthetic original-compatible functions; live rollback remains unverified.

## Focused local verification

From repository root:

```sh
node --test tests/security-monitoring.test.mjs tests/admin-security-push-sw.test.mjs
node_modules/.bin/vitest run apps/admin/backend/security-monitor.test.ts apps/admin/backend/index-wiring.test.ts apps/admin/backend/admin-credential-auth.test.ts
node_modules/.bin/vitest run --config vitest.edge-functions.config.ts supabase/functions/admin-security-push/handler.test.ts supabase/functions/admin-transfer-push/handler.test.ts
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --skipLibCheck apps/admin/backend/security-monitor.ts supabase/functions/admin-security-push/handler.ts
```

From `services/matrix-api`, using a Python environment with project dependencies:

```sh
python -m pytest tests/test_security_monitor.py tests/test_api_server_http.py tests/test_api_error_diagnostics.py -q
```

No full repository suite was run. Edge handler behavior was tested under Vitest; local Deno typechecking remains unavailable. The live Edge deployment and authenticated empty-queue call succeeded. Device delivery and scheduled security dispatch remain unverified and paused.
