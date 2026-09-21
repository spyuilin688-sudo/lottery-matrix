# Result item storage normalization Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Existing user authorization is to inspect and handle all five listed items; continue natively without another approval loop.

**Goal:** Remove proven duplicate item storage without changing any public result, validation detail, filter, recovery source or scheduling rule.

**Architecture:** Keep typed query columns. Add an internal integer mask recording exactly which public item keys were present and equal to typed values; store only residual item JSON. Existing list RPCs reconstruct public items. Owned writes and completed-result restoration propagate the mask atomically. All validation JSON and checkpoint chunks remain intact because they have consumers and sampled validation bodies are largely distinct.

**Tech Stack:** PostgreSQL 17, existing Supabase RPCs, PGlite Node integration tests. No dependencies added.

**Spec:** User's five-item storage/index/old-service cleanup request in this conversation; audit baseline7130c4937f543dc1c30ff668a810971650a0ff3d, source definitions read from production before editing.

## Global Constraints

- No result deletion, validation truncation, algorithm changes, primary/recovery schedule changes or frontend modifications.
- Preserve absent versus null, scalar types, arbitrary item-only fields, both number orders and list ordering/statistics.
- Do not treat idx_scan=0 alone as deletion evidence; retain primary/unique, FK and expiry infrastructure.
- Railway old services have no volumes/domains/dependencies; stage only named removals. Platform requires dashboard two-factor verification to apply; do not bypass it.
- Repository AGENTS.md: named related tests only, never full suite.
- Existing notification UI changes from PR710 are included in baseline and preserved.

## Review Focus

1. Owned upsert of different item key presence must replace the old mask as well as residual JSON.
2. Legacy rows and compact rows coexist; actual list responses and validation must compare equal.
3. Missing/null/type-different values remain in residual data, never reconstructed with changed semantics.
4. Pure storage backfill must preserve completion generation; real changes, including validation/expiry changes, still invalidate it.
5. Bounded backfill with row locks preserves concurrent writes; migration checks exact prior function definitions before applying targeted replacements.

## Task 1: lossless item storage

Files: supabase/migrations/20260921003028_result_item_dedup.sql, tests/result-item-dedup.test.mjs, tests/fixtures/result-item-dedup-baseline.sql.

Interfaces: private.matrix_result_item(row) returns original public jsonb; private.matrix_result_columns(row) returns typed JSON values; private.matrix_result_item_backfill(kind,limit) returns rows and item bytes before/after. mask=0 is legacy, bit18 marks processed; bits0..17 map a fixed key array.

- [ ] Create realistic Explore/Tianheng schema fixture and load actual existing reader/write/restore/invalidation functions.
- [ ] Add failing roundtrip, list parity, upsert presence, ownership/restore fencing and completion-invalidation tests; run `node --test tests/result-item-dedup.test.mjs`.
- [ ] Implement typed reconstruction, normalizing trigger, bounded backfill and narrowly scoped function patches. Every new compact row must satisfy `matrix_result_item(new) = incoming_item` before persistence.
- [ ] Verify all named tests plus existing `tests/worker-completion-cache.test.mjs`; compare sampled physical payload size and exact JSON equivalence before rollout.
- [ ] Commit coherent migration and tests, review diff, then merge after related CI. Deploy migration, backfill bounded batches only after parity passes, record actual live payload reduction separately from allocated disk.

## Task 2: validation/artifact/index disposition

- [ ] Confirm validation consumers and bounded distinct counts. Preserve full validation and chunks when no lossless alternative has been proven; record why generic deletion is invalid.
- [ ] Inventory every zero-scan index and constraint/dependency purpose. Inspect plans for the two largest prediction-number GIN candidates; if evidence remains insufficient, retain and report it rather than pretending cleanup happened.
- [ ] Preserve expiry indexes used by existing hourly retention cleanup. Record no new retention job.

## Task 3: old Railway services

- [x] Inspect service source/start/cron/domains/variables/volumes and reverse dependencies for all three named services.
- [x] Stage only named service deletions. Empty affectionate-analysis deletion was already staged.
- [ ] User completes platform-required dashboard two-factor verification; API refusal is not task authorization uncertainty. Read back deletions if verification becomes available.

## Initial evidence

Explore575.06MiB/135294 estimated rows; Tianheng257.67MiB/55432; artifacts91.37MiB; chunks125.73MiB. Bounded sample: Explore1462 rows, item527B, validation1470B, sourceA1358 distinct; Tianheng1500, item595B, validation1622B, sourceA1486 distinct. Validation minus itemId has1461/1500 unique values respectively. No validation or chunk data has been deleted.
