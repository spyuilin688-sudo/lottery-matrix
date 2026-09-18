# Security monitoring implementation plan

> For agentic workers: use superpowers:subagent-driven-development; one owner for this integrated subsystem. Execute without intermediate approval pauses; user approved this scope in chat.

**Goal:** Record suspicious requests and deliver grouped administrator push notifications, with configurable observation-first limits.
**Architecture:** Private Supabase telemetry and jobs; existing query RPC URLs wrapped without algorithm/ACL changes; Railway/admin producers and existing admin push dispatch infrastructure.
**Tech Stack:** PostgreSQL, TypeScript, Python, Web Push, PGlite, Vitest, pytest.
**Spec:** docs/superpowers/specs/2026-09-10-security-monitoring-design.md

## Global Constraints
- All initial policy modes are observe; no production settings or data changes.
- Only focused tests with explicit file paths; no full test suite.
- Preserve existing API names, payloads, roles, membership, algorithm logic and transfer notifications.
- No credentials, cookies, request bodies or passwords in telemetry or notifications.
- Use isolated snapshot branch; no merge/deploy. No nested subagents.

### Task 1: Deliver security monitoring subsystem
Files: new security migration and SQL tests; new Railway security_monitor.py and focused tests plus api_server.py integration; new admin backend security-monitor.ts and tests plus index.ts integration; admin push handler/index plus tests; operations documentation.
Interfaces: private SQL collector shared by public RPC wrappers and service-role-only observation RPC; guard returns allowed/retryAfter/mode; dispatcher claims security jobs separately from transfer jobs and preserves ownership/lease checks.
- [ ] Write failing SQL tests that call original-compatible query wrappers, retain error records after a committed mapped error, reject bypass roles, aggregate counts, dedupe jobs, and enforce only when configured.
- [ ] Implement SQL schema, collector, wrapper migration, service RPC, queue lifecycle, and bounded cleanup. Run `node --test tests/security-monitoring.test.mjs`.
- [ ] Write failing Python tests for observation, bounded queues/timeouts, policy checks, and real HTTP 429 without business execution. Implement and run `python -m pytest tests/test_security_monitor.py tests/test_api_server_http.py tests/test_api_error_diagnostics.py -q` under services/matrix-api.
- [ ] Write failing admin/Edge tests for failed-login telemetry, observation failure tolerance, 429 handling, grouped security payload, eligibility/leases/retries, and unchanged transfer payload. Implement and run only named files using Vitest.
- [ ] Review configuration defaults and operating limits against spec, document platform-log-only boundaries and exact installation/rollback steps.
- [ ] Commit local changes and return full test evidence for independent review.
