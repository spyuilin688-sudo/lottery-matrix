# Matrix Artifact Chunk Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace repeated monolithic explore JSONB checkpoint writes with idempotent 10-work-unit chunks while preserving the existing analysis API response format.

**Architecture:** Explore builders emit only the current batch delta. The repository stores deltas in a new Supabase chunk table, materializes them once when explore finishes, and publishes a compact manifest in the existing artifact table. Completed-result reads resolve manifests back into the legacy payload shape.

**Tech Stack:** Python 3.12, FastAPI, supabase-py/PostgREST, PostgreSQL JSONB/RLS, pytest, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-25-matrix-artifact-chunk-storage-design.md`

## Global Constraints

- The explore batch size remains exactly 10 work units.
- Supported lotteries remain exactly 今彩539、天天樂、六合彩、大樂透.
- Artifact kinds remain exactly explore、tianyan、tiangong、status.
- Existing `/v1/analysis/{lottery}/{draw_period}/progress` and `/v1/analysis/{lottery}/{draw_period}/{kind}` response shapes must remain compatible.
- Partial chunks must never be returned by the completed-result API.
- Completed analysis rows and artifacts must not be reset by the migration.
- Artifact and chunk retention remains three days.
- Browser/PWA code must not receive the Supabase service-role secret.
- This plan does not modify UI, notification screens, algorithm formulas, or 天天樂 seasonal timing.

## File Map

- `services/matrix-api/app/services/explore_batches.py`: produce one delta artifact per batch.
- `services/matrix-api/app/services/artifact_builders.py`: expose delta checkpoint metadata without cumulative input.
- `services/matrix-api/app/repositories/artifact_chunks.py`: validate and merge ordered chunk records.
- `services/matrix-api/app/repositories/analysis_repository.py`: persist chunks, publish manifests, materialize completed explore results.
- `services/matrix-api/app/services/analysis_pipeline.py`: save chunk before advancing cursor and materialize only after the final batch.
- `supabase/migrations/20260825060000_matrix_analysis_artifact_chunks.sql`: create the chunk table, security rules, indexes, and reset only unpublished runs.
- `services/matrix-api/tests/test_explore_batches.py`: prove delta-only batch behavior.
- `services/matrix-api/tests/test_artifact_chunks.py`: prove ordering, completeness, and conflict handling.
- `services/matrix-api/tests/test_analysis_repository.py`: prove in-memory and Supabase repository behavior.
- `services/matrix-api/tests/test_analysis_pipeline.py`: prove checkpoint order and no cumulative read on partial runs.
- `services/matrix-api/tests/test_analysis_api.py`: prove API compatibility and privacy.

---

### Task 1: Delta-only Explore Batches

**Files:**
- Modify: `services/matrix-api/app/services/explore_batches.py`
- Modify: `services/matrix-api/app/services/artifact_builders.py`
- Modify: `services/matrix-api/tests/test_explore_batches.py`
- Modify: `services/matrix-api/tests/test_artifact_builders.py`

**Interfaces:**
- Produces: `build_explore_batch(..., start: int, limit: int, runner, append_result) -> dict[str, Any]`
- Produces: `{"artifact": delta, "cursorStart": start, "cursor": stop, "total": total, "complete": bool}`
- Consumes: existing `work_units()` and `_append_explore_result()`

- [ ] **Step 1: Write failing tests that reject cumulative input**

Add tests that call the second batch without an `existing` argument and assert its item list contains only results created by that call:

```python
def test_batch_returns_only_current_delta() -> None:
    calls: list[int] = []

    def runner(unit: dict, history: list[dict]) -> dict:
        calls.append(unit["lockedSourceIndex"])
        return {"results": [{"id": str(len(calls)), "ruleCount": 1}]}

    result = build_explore_batch(
        lottery="今彩539",
        draw_period="115000205",
        history=[{"period": str(index)} for index in range(13)],
        position_count=5,
        start=10,
        limit=2,
        runner=runner,
        append_result=lambda artifact, unit, response: artifact["items"].append(response["results"][0]),
    )

    assert result["cursorStart"] == 10
    assert result["cursor"] == 12
    assert len(result["artifact"]["items"]) == 2
```

In `test_artifact_builders.py`, assert `context["exploreBatch"]` needs only `start` and `limit`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
cd services/matrix-api
pytest tests/test_explore_batches.py tests/test_artifact_builders.py -v
```

Expected: failure because `existing` is still required and `cursorStart` is absent.

- [ ] **Step 3: Implement delta-only batch output**

Remove `existing` from `build_explore_batch` and initialize a fresh artifact every call:

```python
artifact = {
    "lottery": lottery,
    "drawPeriod": draw_period,
    "items": [],
    "validationById": {},
}
```

Return `cursorStart` with the bounded cursor:

```python
return {
    "artifact": artifact,
    "cursorStart": cursor,
    "cursor": stop,
    "total": len(units),
    "complete": stop >= len(units),
}
```

Update `build_explore_artifact_chunk` and the builder factory to stop passing `existing`.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd services/matrix-api
pytest tests/test_explore_batches.py tests/test_artifact_builders.py -v
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/matrix-api/app/services/explore_batches.py services/matrix-api/app/services/artifact_builders.py services/matrix-api/tests/test_explore_batches.py services/matrix-api/tests/test_artifact_builders.py
git commit -m "refactor: emit explore checkpoint deltas"
```

---

### Task 2: Chunk Validation and Materialization

**Files:**
- Create: `services/matrix-api/app/repositories/artifact_chunks.py`
- Create: `services/matrix-api/tests/test_artifact_chunks.py`

**Interfaces:**
- Produces: `chunk_manifest(chunk_count: int, cursor: int, total: int, item_count: int) -> dict[str, int | str]`
- Produces: `materialize_chunks(lottery: str, draw_period: str, chunks: Sequence[Mapping[str, Any]], expected_total: int) -> dict[str, Any]`
- Raises: `ValueError("ANALYSIS_CHUNKS_INCOMPLETE")`
- Raises: `ValueError("ANALYSIS_CHUNK_CONFLICT")`

- [ ] **Step 1: Write failing tests for ordered merge, gaps, and conflicts**

```python
def test_materialize_chunks_restores_legacy_shape() -> None:
    chunks = [
        {"chunk_index": 1, "cursor_start": 10, "cursor_end": 20,
         "payload": {"items": [{"id": "b"}], "validationById": {"b": {"ruleSets": []}}}},
        {"chunk_index": 0, "cursor_start": 0, "cursor_end": 10,
         "payload": {"items": [{"id": "a"}], "validationById": {"a": {"ruleSets": []}}}},
    ]
    assert materialize_chunks("今彩539", "115000205", chunks, 20) == {
        "lottery": "今彩539",
        "drawPeriod": "115000205",
        "items": [{"id": "a"}, {"id": "b"}],
        "validationById": {"a": {"ruleSets": []}, "b": {"ruleSets": []}},
    }


def test_materialize_chunks_rejects_cursor_gap() -> None:
    with pytest.raises(ValueError, match="ANALYSIS_CHUNKS_INCOMPLETE"):
        materialize_chunks(
            "今彩539", "115000205",
            [{"chunk_index": 1, "cursor_start": 10, "cursor_end": 20,
              "payload": {"items": [], "validationById": {}}}],
            20,
        )


def test_materialize_chunks_rejects_conflicting_validation() -> None:
    chunks = [
        {"chunk_index": 0, "cursor_start": 0, "cursor_end": 10,
         "payload": {"items": [], "validationById": {"a": {"ruleSets": [1]}}}},
        {"chunk_index": 1, "cursor_start": 10, "cursor_end": 20,
         "payload": {"items": [], "validationById": {"a": {"ruleSets": [2]}}}},
    ]
    with pytest.raises(ValueError, match="ANALYSIS_CHUNK_CONFLICT"):
        materialize_chunks("今彩539", "115000205", chunks, 20)
```

- [ ] **Step 2: Run tests and verify import failure**

Run:

```bash
cd services/matrix-api
pytest tests/test_artifact_chunks.py -v
```

Expected: collection fails because `app.repositories.artifact_chunks` does not exist.

- [ ] **Step 3: Implement strict ordered materialization**

Implement `chunk_manifest` with exactly:

```python
{
    "storage": "chunks",
    "schemaVersion": 1,
    "chunkCount": chunk_count,
    "cursor": cursor,
    "total": total,
    "itemCount": item_count,
}
```

In `materialize_chunks`, sort by `chunk_index`, require the first `cursor_start` to be 0, require each next `cursor_start` to equal the previous `cursor_end`, and require the final `cursor_end` to equal `expected_total`. Merge items in sorted order. For duplicate validation keys, accept identical values and raise `ANALYSIS_CHUNK_CONFLICT` for different values.

- [ ] **Step 4: Run tests**

Run:

```bash
cd services/matrix-api
pytest tests/test_artifact_chunks.py -v
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/matrix-api/app/repositories/artifact_chunks.py services/matrix-api/tests/test_artifact_chunks.py
git commit -m "feat: validate and materialize analysis chunks"
```

---

### Task 3: Repository Chunk Persistence

**Files:**
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/tests/test_analysis_repository.py`

**Interfaces:**
- Consumes: `chunk_manifest()` and `materialize_chunks()` from Task 2.
- Produces: `save_artifact_chunk(lottery, draw_period, analysis_version, kind, chunk_index, cursor_start, cursor_end, payload) -> None`
- Produces: `read_artifact_chunks(lottery, draw_period, analysis_version, kind) -> list[dict[str, Any]]`
- Produces: `materialize_artifact(lottery, draw_period, analysis_version, kind, expected_total) -> dict[str, Any]`

- [ ] **Step 1: Write failing in-memory repository tests**

Test that saving the same composite chunk key twice leaves one chunk and that `read_completed_artifact` resolves a chunk manifest:

```python
repository.save_artifact_chunk("今彩539", "115000205", "v1", "explore", 0, 0, 10, first)
repository.save_artifact_chunk("今彩539", "115000205", "v1", "explore", 0, 0, 10, first)
assert len(repository.read_artifact_chunks("今彩539", "115000205", "v1", "explore")) == 1
```

Create two chunks, save the manifest in `matrix_analysis_artifacts`, save the other three kinds, complete the run, and assert the completed explore read equals the legacy combined shape.

- [ ] **Step 2: Write a failing Supabase query-shape test**

Use the existing fake client pattern and assert:

```python
repository.save_artifact_chunk("今彩539", "115000205", "v1", "explore", 1, 10, 20, delta)
assert fake_client.last_table == "matrix_analysis_artifact_chunks"
assert fake_client.last_on_conflict == "lottery,draw_period,analysis_version,kind,chunk_index"
```

Assert `read_artifact_chunks` orders by `chunk_index` ascending and selects only `chunk_index,cursor_start,cursor_end,payload`.

- [ ] **Step 3: Run repository tests and verify missing methods**

Run:

```bash
cd services/matrix-api
pytest tests/test_analysis_repository.py -v
```

Expected: failures because the three chunk repository methods are absent.

- [ ] **Step 4: Implement protocol and in-memory storage**

Add the three method signatures to `AnalysisRepository`. Add:

```python
self.artifact_chunks: dict[tuple[str, str, str, str, int], dict[str, Any]] = {}
```

Use the full composite tuple as the idempotency key. Store `cursor_start`, `cursor_end`, payload, and `expiresAt`.

- [ ] **Step 5: Implement Supabase storage and manifest resolution**

Write chunk rows with `upsert(..., on_conflict="lottery,draw_period,analysis_version,kind,chunk_index")`. Read them with all four equality filters and `.order("chunk_index")`.

Change `read_artifact` and `read_completed_artifact` so only payloads with `storage == "chunks"` call `materialize_artifact`; direct payloads remain unchanged. Use manifest `total` as `expected_total`.

Update `cleanup_expired` to delete expired rows from both `matrix_analysis_artifacts` and `matrix_analysis_artifact_chunks` and return the combined count.

- [ ] **Step 6: Run repository and chunk tests**

Run:

```bash
cd services/matrix-api
pytest tests/test_artifact_chunks.py tests/test_analysis_repository.py -v
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```bash
git add services/matrix-api/app/repositories/analysis_repository.py services/matrix-api/tests/test_analysis_repository.py
git commit -m "feat: persist Matrix analysis chunks"
```

---

### Task 4: Pipeline Checkpoint Ordering and Publication

**Files:**
- Modify: `services/matrix-api/app/services/analysis_pipeline.py`
- Modify: `services/matrix-api/tests/test_analysis_pipeline.py`
- Modify: `services/matrix-api/tests/test_analysis_api.py`

**Interfaces:**
- Consumes: repository chunk methods from Task 3.
- Produces: partial runs that save exactly one delta then return progress.
- Produces: final runs that materialize explore once, publish a manifest, and continue through tianyan、tiangong、status.

- [ ] **Step 1: Write a failing pipeline spy test**

Create a repository spy that records method calls. Run one incomplete batch and assert the order is:

```python
assert repository.calls == [
    "save_artifact_chunk:explore:0",
    "update_progress:explore:2",
    "get_progress",
]
assert "read_artifact:explore" not in repository.calls
assert "materialize_artifact:explore" not in repository.calls
```

- [ ] **Step 2: Write a failing final-batch publication test**

Run two batches with total 3 and batch size 2. Assert:

```python
assert repository.materialize_calls == 1
manifest = repository.artifacts[("今彩539", "114000123", "v1", "explore")]["payload"]
assert manifest["storage"] == "chunks"
assert manifest["cursor"] == 3
assert repository.read_completed_artifact("今彩539", "114000123", "status") == {"source": [0, 1, 2]}
```

- [ ] **Step 3: Run pipeline and API tests and verify failure**

Run:

```bash
cd services/matrix-api
pytest tests/test_analysis_pipeline.py tests/test_analysis_api.py -v
```

Expected: failures because the pipeline still reads and rewrites cumulative explore artifacts.

- [ ] **Step 4: Refactor the explore branch**

Handle `explore` before the generic artifact read. For a checkpoint result:

1. Calculate `chunk_index = cursor_start // self.explore_batch_size`.
2. Call `save_artifact_chunk`.
3. Call `update_progress`.
4. Return progress immediately when incomplete.
5. On completion, call `materialize_artifact` once.
6. Create `chunk_manifest` using the materialized item count.
7. Save the manifest through `save_artifact`.
8. Put the materialized legacy artifact in `context["artifacts"]["explore"]`.
9. Continue to tianyan、tiangong、status.

Do not call `read_artifact` for an incomplete explore checkpoint.

- [ ] **Step 5: Verify API compatibility and privacy**

In `test_analysis_api.py`, assert a completed manifest-backed explore request returns the full legacy payload. Assert a running run with chunks still returns 404 and `COMPLETED_ANALYSIS_NOT_FOUND`.

- [ ] **Step 6: Run pipeline, API, repository, and builder tests**

Run:

```bash
cd services/matrix-api
pytest tests/test_explore_batches.py tests/test_artifact_builders.py tests/test_artifact_chunks.py tests/test_analysis_repository.py tests/test_analysis_pipeline.py tests/test_analysis_api.py -v
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```bash
git add services/matrix-api/app/services/analysis_pipeline.py services/matrix-api/tests/test_analysis_pipeline.py services/matrix-api/tests/test_analysis_api.py
git commit -m "feat: checkpoint explore results as chunks"
```

---

### Task 5: Supabase Migration and Database Verification

**Files:**
- Create: `supabase/migrations/20260825060000_matrix_analysis_artifact_chunks.sql`

**Interfaces:**
- Produces: `public.matrix_analysis_artifact_chunks`
- Preserves: complete rows in `matrix_analysis_runs` and all artifacts belonging to complete runs.
- Resets: only non-complete runs and their unpublished explore artifacts.

- [ ] **Step 1: Create the migration SQL**

Create the table with:

```sql
create table if not exists public.matrix_analysis_artifact_chunks (
  id bigint generated by default as identity primary key,
  lottery text not null check (lottery in ('今彩539', '天天樂', '六合彩', '大樂透')),
  draw_period text not null,
  analysis_version text not null,
  kind text not null check (kind in ('explore', 'tianyan', 'tiangong', 'status')),
  chunk_index integer not null check (chunk_index >= 0),
  cursor_start integer not null check (cursor_start >= 0),
  cursor_end integer not null check (cursor_end > cursor_start),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (lottery, draw_period, analysis_version, kind, chunk_index),
  foreign key (lottery, draw_period, analysis_version)
    references public.matrix_analysis_runs (lottery, draw_period, analysis_version)
    on delete cascade
);

create index if not exists matrix_analysis_artifact_chunks_expiry_idx
  on public.matrix_analysis_artifact_chunks (expires_at);

alter table public.matrix_analysis_artifact_chunks enable row level security;
revoke all on table public.matrix_analysis_artifact_chunks from anon, authenticated;
grant select, insert, update, delete on table public.matrix_analysis_artifact_chunks to service_role;
grant usage, select on sequence public.matrix_analysis_artifact_chunks_id_seq to service_role;
```

- [ ] **Step 2: Add the unpublished-run reset**

Use a transaction. Delete only explore artifacts joined to runs where `status <> 'complete'`, then reset only those runs:

```sql
delete from public.matrix_analysis_artifacts artifact
using public.matrix_analysis_runs run
where artifact.lottery = run.lottery
  and artifact.draw_period = run.draw_period
  and artifact.analysis_version = run.analysis_version
  and artifact.kind = 'explore'
  and run.status <> 'complete';

update public.matrix_analysis_runs
set phase = 'explore',
    cursor = 0,
    total = 0,
    status = 'running',
    completed_at = null,
    error = null,
    updated_at = now()
where status <> 'complete';
```

- [ ] **Step 3: Commit the migration**

```bash
git add supabase/migrations/20260825060000_matrix_analysis_artifact_chunks.sql
git commit -m "db: add Matrix artifact chunk storage"
```

- [ ] **Step 4: Apply the exact committed SQL to Supabase**

Apply the migration to project `wcimzbbapfrdotjsfyxa` using the Supabase migration action with name `matrix_analysis_artifact_chunks`.

Expected: migration succeeds once and appears in migration history.

- [ ] **Step 5: Verify schema and security**

Execute read-only SQL that confirms:

```sql
select
  c.relrowsecurity,
  has_table_privilege('anon', 'public.matrix_analysis_artifact_chunks', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.matrix_analysis_artifact_chunks', 'select') as authenticated_select,
  has_table_privilege('service_role', 'public.matrix_analysis_artifact_chunks', 'select,insert,update,delete') as service_access
from pg_class c
where c.oid = 'public.matrix_analysis_artifact_chunks'::regclass;
```

Expected: `relrowsecurity=true`, both public-role selects false, service access true.

Query `pg_indexes` and verify the unique composite index and expiry index exist. Query non-complete runs and confirm cursor is 0. Query complete runs before and after applying the migration and confirm their identifiers and completed timestamps are unchanged.

- [ ] **Step 6: Run Supabase advisors**

Run security and performance advisors for project `wcimzbbapfrdotjsfyxa`. Resolve only findings caused by this migration before continuing.

---

### Task 6: Full Verification and Four-Lottery Resume Check

**Files:**
- Verify: `.github/workflows/matrix-analysis.yml`
- Verify: `services/matrix-api/**`
- Verify: `supabase/migrations/20260825060000_matrix_analysis_artifact_chunks.sql`

**Interfaces:**
- Consumes: deployed code and applied schema from Tasks 1–5.
- Produces: evidence that each lottery advances by 10-work-unit chunks and completed APIs preserve existing output.

- [ ] **Step 1: Run the complete Python test suite**

Run:

```bash
cd services/matrix-api
pytest -v
```

Expected: all tests pass with no failed or errored tests.

- [ ] **Step 2: Run compile verification**

Run:

```bash
cd services/matrix-api
python -m compileall app tests
```

Expected: exit code 0.

- [ ] **Step 3: Push the tested commits to main**

Confirm the main HEAD contains all task commits and the design/plan documents. Do not force-update the branch.

- [ ] **Step 4: Trigger one worker run per lottery**

Trigger 今彩539、天天樂、六合彩、大樂透 independently. After each run, query:

```sql
select lottery, draw_period, phase, cursor, total, status, error
from public.matrix_analysis_runs
where lottery = '<彩種>'
order by started_at desc
limit 1;
```

Expected for an incomplete explore run: cursor advances by exactly 10, status is running, and error is null.

- [ ] **Step 5: Verify chunk sizes and uniqueness**

For each latest run, query:

```sql
select chunk_index, cursor_start, cursor_end,
       jsonb_array_length(payload->'items') as item_count
from public.matrix_analysis_artifact_chunks
where lottery = '<彩種>'
  and draw_period = '<期別>'
  and analysis_version = '<版本>'
order by chunk_index;
```

Expected: cursor ranges are contiguous, each non-final range spans 10, and no composite key is duplicated.

- [ ] **Step 6: Continue scheduled runs until one complete result exists per lottery**

For each lottery, verify the latest run has `phase='complete'`, `status='complete'`, and exactly four rows in `matrix_analysis_artifacts`.

- [ ] **Step 7: Verify API output**

Call progress plus explore、tianyan、tiangong、status result endpoints for each completed lottery. Expected: HTTP 200, explore contains `lottery`、`drawPeriod`、`items`、`validationById`, and no response exposes `storage` or raw chunk rows.

- [ ] **Step 8: Record the final verification commit**

If verification requires no code change, add the verified run identifiers and test command results to the existing implementation handoff note and commit it:

```bash
git add docs/superpowers
git commit -m "docs: record Matrix chunk verification"
```
