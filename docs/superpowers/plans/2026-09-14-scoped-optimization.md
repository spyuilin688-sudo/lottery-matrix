# Scoped optimization implementation plan

Goal: Correct confirmed production defects while retaining concurrent main changes and all draw data.
Baseline: 0820dec8ae17becf623373c84dc8b8f2fc4e1bd2, fetched from GitHub main.
Architecture: React PWA calls Railway api_server for draws; result RPCs and authorization remain in Supabase. Keep existing canonical modules and cleanup core.
Spec: User request in this conversation, nine scoped work items. No full-project tests, draw mutation/backfill, algorithm change, new CSS overrides, forced pushes, or unrelated deployment.

- [x] Push: reproduce temporary registration failure; repair getPushContext error classification, explicit UI initializing/recheck state, permission requests only on default; run src/push-subscription.test.ts and src/__tests__/NotificationsPagePatched.test.tsx.
- [x] HTTP: raw/HTTP regression for 204 body and Content-Type/Length; repair existing RailwayApiHandler._send; retain protected-job CORS separation; run services/matrix-api/tests/test_api_server_http.py.
- [x] Queries: record production latency/payload; implement database years summary and condition-filtered tongxing, bounded stable history continuation; coordinate src/lottery-api.ts and api_server.py; add scoped SQL and Python/client tests. Cache revision must reflect corrections, not latest period alone.
- [x] CSS: inspect canonical CSS, SVG viewBox and approved raster; compare dimensions/screenshots. Preserve current behavior if geometry cannot safely be maintained.
- [x] Security: verify role restrictions, fail closed for authorization; fix evidenced silent limiter degradation with safe logging and explicit retry response; retain migration and rollback SQL.
- [x] Storage/indexes: read sizes, retained references, cleanup preview and index plans; retain functioning existing cleanup and needed indexes.
- [x] Legacy: trace app/db/drizzle/examples through entry points/build/deploy/docs before removal.
- [ ] Integration: get current main again; compare touched blobs and semantic dependencies; create tree with latest main as base, reviewed patch only; no force update. Skip repository-wide Actions, run named checks locally. Deploy only affected services, check production health and commit version.

## Verified decisions before source deployment

- CSS retained: the expanded inline-size container also defines existing cqw typography/controls. Production measurement: frame 430px, membership stack418px, following card398px, title17.138px. SVG horizontal bounds span1563; changing compensation independently changes approved geometry. No CSS/image/ball changes made.
- Protection: main reports protected=false; traditional protection GET denied403 (integration lacks administration), rulesets GET denied403 (private-repository plan restriction). No unsupported claim of protection activation.
- Storage: fresh exact counts explore160381, tianheng69986, artifacts110, chunks875. Orphans0 and currently deletable expired rows0. Existing hourly bounded/advisory-lock/SKIP LOCKED cleanup healthy; no data deletion or duplicate cleanup added. Large physical storage includes TOAST; compressed chunks remain referenced recovery inputs.
- Indexes: no equivalent duplicate indexes found. Existing expiry indexes chosen by cleanup EXPLAIN; GIN indexes support low-frequency JSON filters. stats_reset NULL and recent postmaster start make unused counts insufficient deletion evidence. No indexes added/removed.
- Authorization: existing role checks/RLS retained. Isolated PGlite tests cover anonymous, normal, expired and disabled membership plus free-mode switches. Production anonymous read-only call is FORBIDDEN. Limiter outage now503/Retry-After5 and SQLSTATE-only LOG, while authorization errors stay denied.
- Applied migrations:20260914114232_guard_degradation and20260914114420_matrix_draw_query_pagination, with corresponding rollback scripts. No draw rows, lottery triggers, periods, dates or numbers modified. Query RPC is service_role-only SECURITY INVOKER with empty search_path.
- Query paging: up to500 rows per explicit request; legacy history/full Tongxing response compatibility retained. Revision hashes all raw periods/update timestamps, including out-of-order commits; source period alias normalization and conflict rejection precede paging and matching.
- Before external API measurements (539): history5966 rows/1431851bytes/16.211s; years20/151bytes/12.328s; Tongxing01+02/82groups/42183bytes/12.883s. Production new SQL history first page500 rows measured214.138ms. External postdeploy comparison remains required.
- Named verification: push90, frontend query27, SQL query12, guard16; Python HTTP26 plus bounded-concurrency1 and query-contract11 (38 total). TypeScript and Vite compilation pass. No full-project suites invoked.
- Railway: worker watchPatterns exclude api_server.py and tests; source/build/shared-worker settings unchanged. Only API and Cloudflare PWA source deployments should run.
- Removed dormant Next/D1 scaffold after entry/build/deploy/documentation tracing; retained actual worker/index.js, Vite src/main.tsx, Supabase migrations and Railway service.

Rollback: revert affected source patch from the latest main without overwriting intervening work; deploy prior API/frontend source first before dropping matrix_draw_query with its rollback. Guard rollback restores the exact prechange function. No data restoration is necessary because migrations alter functions only.
