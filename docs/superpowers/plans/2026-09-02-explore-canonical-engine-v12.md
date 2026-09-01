# Explore Canonical Engine v12 Implementation Plan

**Goal:** Replace every executable legacy Explore algorithm with one canonical engine implementing the confirmed Add/Sum/Drag rules, bounded state search, coordinate isolation, and deterministic final-only persistence.

## Tasks

1. **RED contract tests**
   - Lock1 requires exactly one longest rule.
   - Different `(referenceOffset, referencePosition)` coordinates are independent roads.
   - Verify old v11 fails these contracts in Project CI before production changes.

2. **Canonical engine**
   - Add `services/matrix-api/app/domain/explore_engine.py`.
   - Rebuild occurrence index/source-unit/range-cell caches without versioned legacy names.
   - Preserve `+0` for Add and Drag.
   - Build 13 sources once; Standard derives from Full cells; Drag uses locked cell only.
   - Implement lock1 8-occurrence hard boundary and lock2 12-occurrence hard boundary.
   - Implement lock2 as bounded first-rule + second-candidate-pool state; no global Cartesian pair expansion.
   - Apply same-longest `>2` only within one coordinate after complete continuation.
   - Persist only final valid results.

3. **Runtime cutover**
   - Change `artifact_builders.py` to `ExploreEngineSession` / `run_explore_engine_batch`.
   - Keep Explore artifact, validation, Tianyan, status payload contracts compatible.
   - Bump Python analysis version to `matrix-python-v12`.

4. **Scope / Drag storage**
   - Add/Sum calculate Full base candidates once; Standard filters `FULL_ONLY` cells then evaluates independently.
   - Drag evaluates once and stores one canonical row.
   - v12 RPC returns Drag for either Standard or Full request without duplicating stored rows.

5. **Delete executable old algorithms**
   - Delete `app/domain/explore.py`.
   - Delete `app/domain/explore_v2.py` after cutover.
   - Delete/replace legacy and v2-specific tests/imports.
   - Do not delete historical migration files; instead replace/drop runtime DB functions through a new migration.

6. **Database cleanup / RPC v12**
   - Add a new migration that replaces Explore RPC runtime behavior for canonical v12.
   - Remove obsolete Explore result rows/artifacts/runs from old analysis versions without touching unrelated Tiangong data.
   - Ensure frontend reads only canonical completed v12 Explore results.

7. **Verification**
   - Project CI Python matrix-api suite green.
   - Node/build/runtime-integrity suites green.
   - Confirm no executable import/reference to `app.domain.explore` or `app.domain.explore_v2` remains.
   - Confirm no global candidate Cartesian-product helper exists.
