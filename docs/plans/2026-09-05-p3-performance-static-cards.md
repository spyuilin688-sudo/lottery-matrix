# P3 performance and pre-generated Matrix PNG cards

Scope confirmed by the user: split production JS by feature, fix the reported CSS/CI warnings, verify the FK index and consolidate equivalent SELECT policies, retain unused indexes, and pre-generate fixed PNG cards on the backend. Preserve the current UI, download confirmation, four lotteries, both number orders, and the existing 2276 × 3438 renderer geometry.

## Implementation

1. Move feature pages behind React.lazy boundaries, keep the navigation context eager, and load the card downloader only on confirmation. Keep Vite's 500 KB threshold and enforce it against actual output and its initial import graph.
2. Expand local CSS imports in computed-style tests. Replace the pathological 16-layer background shorthand with equivalent background-image; do not suppress parser diagnostics. Pin maintained checkout/setup-node releases while keeping application Node 22.
3. Verify admin_sessions(admin_id) already exists. Consolidate the two authenticated SELECT predicates with OR only after rollback-based identity/RLS tests. Observe all unused indexes without deleting them.
4. Publish cards independently from analysis artifacts using the existing Supabase project. A service-only publication row per lottery coordinates a lease and retains the last complete manifest. PNG objects are public, immutable and content addressed. Stage and validate both files before switching the manifest pointer. Re-read the source before publication; an expired/replaced lease cannot publish.
5. Preserve the prior ten-minute publication delay as ten minutes after the first complete snapshot observed by the card publisher. Existing five-minute worker ticks check eligibility; this is not an exact ten-minute SLA. Missing/invalid history does not publish. Failed generations retain the previous card and retry on a later tick.
6. New clients request `?format=png` and use the same PNG URL for preview and download. Keep the default SVG manifest/routes for previously installed PWA versions. Deploy backend support before releasing the frontend. Card notifications require an actually published matching period.

## Verification and rollout

Run existing frontend unit, Node, Edge Function, build and backend CI gates. Add tests for chunk boundaries, CSS parsing, the publication delay, all eight PNG variants and dimensions, identical repeated bytes, historical corrections, partial-upload failure, source/lease races, manifest reads without rendering, and download byte identity. Inspect a real rasterized card, with explicitly bundled fonts. Keep existing image layout assertions.

Database provisioning is additive and service-only. Apply and validate the migration before backend rollout, then generate the initial cards and verify published URLs before frontend rollout. The legacy API is intentionally retained during that transition. This change does not merge or deploy the application automatically.

## Measured results

The original production entry was 766.48 KB (Vite gzip 214.56 KB). After splitting, the entry is about 273 KB, with every emitted JS chunk below the unchanged 500 KB threshold. The initial **static import graph**, including Supabase and shared code, totals 529.23 KB before transfer compression. This is about 31% less initial JavaScript; the entry-file reduction alone must not be presented as total initial-download reduction. Deferred features still download when used.

The 16-layer CSS value had been exhausting css-tree's grammar matcher; this was not a selector-count limit. The longhand preserves all 16 layers and parser diagnostics remain enabled. Both targeted parser regression and the expanded local CSS tests pass without the reported messages.

`admin_sessions_admin_id_idx` already covers admin_sessions(admin_id), so no duplicate index was created. The equivalent SELECT policy migration was applied as `20260905114917`, with 12 rollback role scenarios passing. Static PNG publication infrastructure was applied as `20260905122413`, with 39 rollback ACL/lease/manifest checks passing after application. Unused indexes remain untouched.

The source checkout was synchronized with main `3c7516fbf97c40dbf406a138168acb6ac0dcad91`, preserving the separately merged mobile LINE SSO return fix.

## Application rollout

The database table and public PNG bucket exist; application deployment and initial Storage HTTP uploads are still required. No application was merged/deployed by preparing this change.

1. Deploy the backend revision first. Existing scheduled acquisition and Fantasy5 analysis workers check card publication before analysis/early returns.
2. In the existing worker service environment, run `uv run python -m app.card_worker --lottery all` to observe all four sources. This command uses the existing Supabase service credentials and sends no notifications. It exits without sleeping when waiting for eligibility.
3. After ten minutes, the next scheduled tick (or the same CLI command) renders and uploads eligible pairs. Verify each `/api/matrix/cards/{lottery}?format=png` returns a non-null period and eight total readable PNG URLs with 2276 × 3438 dimensions. The default SVG manifest remains compatible with installed old clients.
4. Release the frontend after all four PNG manifests are available. Its image preview and download use the same published object URL. Failure keeps the prior complete generation; retry does not overwrite a content-addressed object.

All four public history snapshots passed the complete-window check and produced both fixed PNG orders: 539 115000215, Fantasy5 11990, Mark Six 026095, Lotto 649 115000085. The 539 PNG was visually inspected; geometry, header/footer, CJK glyphs and future blank-number rows were retained. All eight variants also passed deterministic fixture tests. Storage HTTP upload/CDN behavior remains a deployment verification, not claimed by SQL or in-memory tests.

## Final local verification

- Production build passes with every JS chunk below 500 KB. Protected runtime: all 27 files unchanged and verified.
- Frontend: 140 Vitest files / 1,141 tests passed after synchronization with main.
- Node: 532 tests passed; CSS iteration-cap and relative-import diagnostics absent.
- Edge Functions: 44 tests passed.
- Matrix API: 635 tests passed, including fixed PNG rendering, timing, atomic publication, races and adapter transport checks.
- RLS fixtures: 12 member/admin scenarios; publication fixtures: 39 real database ACL/lease/manifest checks. All fixtures rolled back.
- Independent reviews approved the frontend extraction and amended PNG pipeline.
- Local Playwright browser installation was blocked by repeated CDN download timeouts. The browser runtime suite remains a GitHub Actions gate; no local browser pass is claimed.
