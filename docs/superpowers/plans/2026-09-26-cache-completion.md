# Cache correctness and shared reads implementation plan

**Goal:** Close the four approved cache gaps without changing membership, payment, permissions, result formats or polling cadence.

**Architecture:** Keep the current browser cache owners and bounded process-local DrawReadCache. Use the existing database revision to validate public snapshots; expose only opaque public revision tokens for homepage readiness confirmation. No database migration is needed.

**Tech stack:** React/TypeScript, Python public API, existing Supabase revision RPC.

**Spec:** User-approved four-item cache repair proposal in this conversation; completed-result invariants remain in `docs/superpowers/specs/2026-09-24-completed-result-cache.md`.

## Constraints

- Work from isolated branch based on `ffbc829b422857062698ab1db261b485cc2da34e`.
- Follow AGENTS.md: only explicitly named affected tests, never full suites.
- No stale or invalid cache writes; keep capacity, expiry and validation guards.
- No persistent polling, credential exposure or long-lived caching of authorization/payment/admin operations.

## Tasks and evidence

1. `src/lottery-api.ts` and its tests: reproduce an old history-years request resolving after publication and a newer read; guard write and return with current ownership, reuse current request. Assert period and current derived data remain unchanged by the old response.
2. `src/published-result-refresh.ts`, `src/lottery-api.ts` and focused tests: subscribe-ready confirmation through `GET /api/matrix/result-revisions` with four opaque version strings. Preserve optional `revisions` on existing latest-result snapshots; unchanged baseline retains caches, changed/legacy baseline revalidates once. Test missed initial publication, concurrent confirmation, disposal and late responses. Backend owns the endpoint and metadata addition.
3. `services/matrix-api/app/api_server.py` and scoped Python tests: include history summary in revision-aware draw cache. Assert same revision reuse, changed revision reload, concurrent requests share and errors never become successful entries.
4. API/card repository/cache tests: cache validated PNG manifest by full source/publication version; preserve current digest/order checks. Assert concurrent readers share, corrections and added orders invalidate, invalid/missing responses are not retained, in-flight invalidation cannot restore old data.

For each task: demonstrate red regression, implement smallest change, run named tests, inspect diff. Frontend/backend owners write disjoint files. Root integrates and independently reviews all production changes.

## Integration

- Run the explicit affected tests together, root TypeScript check and production PWA/admin build.
- Compare new main changes, preserve other work, resolve conflicts, repeat affected gates.
- Create one reviewable PR and merge after verification. Confirm Cloudflare/Railway deployment state separately from merge state.
- Report any unavailable runtime checks; never turn missing test infrastructure into a passing claim.

## Verification record

- Integrated main through `77950ee1403c3c2ed2d0aa5cce9063c5f0006f12` without conflicts; preserved concurrent admin billing and unused-file cleanup work.
- Frontend: `node_modules/.bin/vitest run --config apps/admin/vite.config.ts --root . src/__tests__/lottery-api.test.ts src/__tests__/published-result-refresh.test.ts src/read-cache.test.ts` — 61 passed. The offline config avoids unrelated live-service test setup.
- Backend (from `services/matrix-api`): `/tmp/matrix-cache-python/bin/python -m pytest tests/test_result_revision_api.py tests/test_public_manifest_cache.py tests/test_draw_query_api.py tests/test_public_api.py tests/test_card_repository.py tests/test_draw_read_cache.py tests/test_security_monitor.py -q` — 99 passed using existing cached Python dependencies.
- `npm run build:pages` — runtime integrity, root TypeScript, PWA and admin production builds passed.
- `git diff --check` passed. Cross-review found and corrected both response-order races: a new homepage snapshot before the probe must invalidate derived data; an old probe after a newer snapshot must not rewind the baseline. Storage hydration, missing metadata and unchanged network snapshots must not suppress a newer probe. New regression assertions were observed failing before their fixes.
- Only named related tests were executed. No database migration or dependency changes.
