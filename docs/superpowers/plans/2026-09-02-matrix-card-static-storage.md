# Matrix Card Static Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate each lottery's two Matrix card SVGs once per stored draw and serve the published pair from Supabase Storage instead of rendering on every view or download.

**Architecture:** A focused card-publication service renders both orders from one bounded history snapshot, uploads immutable period paths, then atomically advances a one-row-per-lottery publication pointer. Scheduled and manual ingestion call the publisher; the API reads only the publication pointer and returns public Storage URLs, while legacy SVG routes redirect without rendering.

**Tech Stack:** Python 3.12, Supabase Python 2.31, PostgreSQL/Supabase Storage, stdlib HTTP server, pytest, React/TypeScript/Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-matrix-card-static-storage-design.md`

## Global Constraints

- Use the public Supabase Storage bucket `matrix-cards`.
- Use immutable paths `{lottery-slug}/{period}/draw.svg` and `{lottery-slug}/{period}/sorted.svg`.
- Never expose `SUPABASE_SECRET_KEY` to browser code.
- Publish the database pointer only after both uploads succeed.
- Do not dynamically render cards from an HTTP request.
- Preserve the previous publication after any render or upload failure.
- Do not redesign the card or change lottery schedules and Matrix algorithms.

---

### Task 1: Storage schema and publication repository

**Files:**
- Create: `supabase/migrations/20260902193000_matrix_card_static_storage.sql`
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`
- Modify: `services/matrix-api/tests/test_analysis_repository.py`
- Create: `tests/matrix-card-static-storage-migration.test.mjs`

**Interfaces:**
- Produces: `AnalysisRepository.get_card_publication(lottery: str) -> dict[str, Any] | None`
- Produces: `AnalysisRepository.upsert_card_publication(lottery: str, period: str, draw_path: str, sorted_path: str, published_at: str) -> dict[str, Any]`
- Publication dictionaries use `lottery`, `period`, `drawPath`, `sortedPath`, and `publishedAt`.

- [x] **Step 1: Write repository and migration tests**

```python
def test_card_publication_upsert_replaces_only_the_current_lottery_pointer():
    repository = InMemoryAnalysisRepository()
    repository.upsert_card_publication(
        "今彩539", "001", "daily539/001/draw.svg",
        "daily539/001/sorted.svg", "2026-09-02T00:00:00+00:00",
    )
    repository.upsert_card_publication(
        "今彩539", "002", "daily539/002/draw.svg",
        "daily539/002/sorted.svg", "2026-09-02T01:00:00+00:00",
    )
    assert repository.get_card_publication("今彩539")["period"] == "002"
```

The Node migration test must assert the bucket is public, accepts only `image/svg+xml`, the table has a lottery primary key, RLS is enabled, browser roles are revoked, and `service_role` receives CRUD.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
cd services/matrix-api && uv run pytest tests/test_analysis_repository.py -q
cd ../.. && node --test tests/matrix-card-static-storage-migration.test.mjs
```

Expected: repository methods and migration file are absent.

- [x] **Step 3: Add the migration and repository methods**

The migration creates `matrix_card_publications`, enables RLS, revokes `anon` and `authenticated`, grants `service_role`, and inserts the public bucket with a one-megabyte SVG-only limit.

The Supabase implementation selects/upserts snake-case columns and normalizes them through one helper:

```python
def _normalize_card_publication(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "lottery": row["lottery"],
        "period": row["period"],
        "drawPath": row["draw_path"],
        "sortedPath": row["sorted_path"],
        "publishedAt": row["published_at"],
    }
```

- [x] **Step 4: Run focused tests**

Run the two commands from Step 2. Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/20260902193000_matrix_card_static_storage.sql \
  services/matrix-api/app/repositories/analysis_repository.py \
  services/matrix-api/tests/test_analysis_repository.py \
  tests/matrix-card-static-storage-migration.test.mjs
git commit -m "feat(matrix-card): add static publication storage"
```

---

### Task 2: Idempotent card publisher

**Files:**
- Create: `services/matrix-api/app/services/card_publication.py`
- Create: `services/matrix-api/tests/test_card_publication.py`

**Interfaces:**
- Consumes: Task 1 repository methods.
- Produces: `SupabaseCardStorage(client: Any, bucket: str = "matrix-cards")`.
- Produces: `MatrixCardPublisher(repository: AnalysisRepository, storage: CardStorage)`.
- Produces: `MatrixCardPublisher.publish(lottery: str, period: str) -> dict[str, Any]`.
- Produces: `public_matrix_card_url(supabase_url: str, path: str) -> str`.
- Produces: `create_card_publisher(repository: AnalysisRepository) -> MatrixCardPublisher` for concrete Supabase repositories.

- [x] **Step 1: Write failing publisher tests**

Tests cover URL-safe slugs, immutable paths, one bounded history read, two uploads from one snapshot, same-period skip, requested-period mismatch, and preservation of the old pointer when the second upload raises.

```python
def test_publisher_reads_history_once_and_publishes_after_both_uploads():
    result = publisher.publish("今彩539", "003117")
    assert storage.paths == [
        "daily539/003117/draw.svg",
        "daily539/003117/sorted.svg",
    ]
    assert repository.history_limits == [227]
    assert result["period"] == "003117"
```

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
cd services/matrix-api && uv run pytest tests/test_card_publication.py -q
```

Expected: `app.services.card_publication` is missing.

- [x] **Step 3: Implement the minimal service**

Use `sum(card_layout(lottery)["column_rows"])` for the bounded read. Render both orders before uploading either file. Upload bytes with:

```python
{
    "content-type": "image/svg+xml",
    "cache-control": "31536000",
    "upsert": "true",
}
```

Check the publication before reading history. Upsert the publication row only after both uploads return successfully.

- [x] **Step 4: Run focused tests**

Run the command from Step 2. Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add services/matrix-api/app/services/card_publication.py \
  services/matrix-api/tests/test_card_publication.py
git commit -m "feat(matrix-card): publish immutable SVG pairs"
```

---

### Task 3: Scheduled and manual ingestion integration

**Files:**
- Modify: `services/matrix-api/app/worker.py`
- Modify: `services/matrix-api/app/worker_all.py`
- Modify: `services/matrix-api/app/api_server.py`
- Modify: `services/matrix-api/tests/test_worker.py`
- Modify: `services/matrix-api/tests/test_scheduled_worker_resume.py`
- Modify: `services/matrix-api/tests/test_public_api.py`

**Interfaces:**
- Consumes: `MatrixCardPublisher.publish(lottery, period)` from Task 2.
- Changes: `run_scheduled_worker(..., card_publisher: MatrixCardPublisher | None = None)`.
- Changes: `handle_api_request(..., publish_cards: Callable[[str, str], dict[str, Any]] | None = None, matrix_card_public_base_url: str | None = None)`.

- [x] **Step 1: Add failing integration tests**

Prove all of these calls publish the current period:

```python
run_scheduled_worker(... current draw newly acquired ..., card_publisher=publisher)
run_scheduled_worker(... current draw already stored ..., card_publisher=publisher)
run_scheduled_worker(... outside a due window ..., card_publisher=publisher)
handle_api_request("POST", "/jobs/refresh", ..., publish_cards=publish)
```

Also assert publishing happens before analysis builders and a publication failure prevents analysis rather than silently returning success.

- [x] **Step 2: Run tests to verify failure**

Run:

```bash
cd services/matrix-api && uv run pytest \
  tests/test_worker.py tests/test_scheduled_worker_resume.py tests/test_public_api.py -q
```

Expected: the new injection parameters are unsupported and no publication calls occur.

- [x] **Step 3: Integrate the publisher**

Create one production publisher from the existing Supabase repository client in `worker.main`, `worker_all.main`, and `api_server.main`. Pass the latest stored period into `publish`:

```python
if card_publisher is not None:
    card_publisher.publish(lottery, str(latest_draw["period"]))
```

For new acquisition, publish after required history repair and before `_run_analysis`. For existing draws, call the idempotent publisher before returning `not-due` or `already-acquired`. After protected manual refresh, publish the returned draw period before returning HTTP 200.

- [x] **Step 4: Run focused tests**

Run the command from Step 2. Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add services/matrix-api/app/worker.py \
  services/matrix-api/app/worker_all.py \
  services/matrix-api/app/api_server.py \
  services/matrix-api/tests/test_worker.py \
  services/matrix-api/tests/test_scheduled_worker_resume.py \
  services/matrix-api/tests/test_public_api.py
git commit -m "feat(matrix-card): publish after draw ingestion"
```

---

### Task 4: Static manifest and legacy redirects

**Files:**
- Modify: `services/matrix-api/app/api_server.py`
- Modify: `services/matrix-api/tests/test_matrix_card_api.py`
- Modify: `src/lottery-api.ts`
- Modify: `src/__tests__/FeatureActions.test.tsx`
- Modify: `src/__tests__/MatrixCardPage.layout.test.tsx`

**Interfaces:**
- Consumes: publication dictionaries from Task 1.
- Consumes: `public_matrix_card_url` from Task 2.
- Changes: unpublished manifests return `cards.draw` and `cards.sorted` as `null`.
- Changes: published manifests return absolute public Supabase URLs.
- Changes: `handle_matrix_card_request(...) -> tuple[302, str] | None` returns a redirect target, never SVG content.

- [x] **Step 1: Replace dynamic API expectations with failing static expectations**

```python
assert payload["cards"]["draw"]["url"] == (
    "https://project.supabase.co/storage/v1/object/public/"
    "matrix-cards/daily539/003117/draw.svg"
)
assert handle_matrix_card_request(...)[0] == 302
```

Add a repository spy whose `list_draws` raises; both manifest and legacy route must succeed from the publication pointer, proving no history read or rendering.

- [x] **Step 2: Run backend and frontend tests to verify failure**

Run:

```bash
cd services/matrix-api && uv run pytest tests/test_matrix_card_api.py -q
cd ../.. && npm run test:unit -- src/__tests__/FeatureActions.test.tsx src/__tests__/MatrixCardPage.layout.test.tsx
```

Expected: API still returns Railway SVG routes and frontend rejects nullable unpublished cards.

- [x] **Step 3: Implement manifest, redirect, and nullable frontend metadata**

Remove renderer imports from `api_server.py`. Add `_send_redirect` to emit `Location`, `Cache-Control: no-store`, and CORS headers. Update `MatrixCardManifest` so each card is `{url: string} | null`, validate URLs only for a non-null period, and compute `cardUrl` with optional chaining.

- [x] **Step 4: Run focused tests**

Run the commands from Step 2. Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add services/matrix-api/app/api_server.py \
  services/matrix-api/tests/test_matrix_card_api.py \
  src/lottery-api.ts src/__tests__/FeatureActions.test.tsx \
  src/__tests__/MatrixCardPage.layout.test.tsx
git commit -m "feat(matrix-card): serve published static assets"
```

---

### Task 5: Operations documentation and complete verification

**Files:**
- Modify: `services/matrix-api/.env.example`
- Modify: `services/matrix-api/README.md`
- Modify: `docs/superpowers/plans/2026-09-02-matrix-card-static-storage.md`

**Interfaces:**
- Documents the automatic initial backfill, public bucket, immutable paths, manual refresh behavior, and failure retry behavior.

- [x] **Step 1: Update service documentation**

Document that no new secret is required, both scheduled workers and `/jobs/refresh` publish cards, the first worker tick backfills current cards, and preview/download traffic bypasses Railway after the manifest response.

- [x] **Step 2: Run format and focused static checks**

Run:

```bash
git diff --check
rg -n "render_matrix_card|card_layout" services/matrix-api/app/api_server.py
```

Expected: no whitespace errors and no HTTP-request renderer imports/usages.

- [x] **Step 3: Run the full backend suite**

Run:

```bash
cd services/matrix-api && uv run pytest -q
```

Expected: all backend tests pass.

- [x] **Step 4: Run the full frontend and repository suites**

Run:

```bash
npm run test:unit
npm run build
node --test tests/*.test.mjs
```

Expected: all tests and production build pass.

- [x] **Step 5: Rebase safety check and commit documentation**

Fetch `origin/main`, inspect `git diff --stat HEAD..origin/main`, and rebase only after confirming same-file changes can be integrated. Re-run affected focused tests after any rebase.

```bash
git add services/matrix-api/.env.example services/matrix-api/README.md \
  docs/superpowers/plans/2026-09-02-matrix-card-static-storage.md
git commit -m "docs(matrix-card): document static publishing"
```

- [x] **Step 6: Request review and prepare PR**

Use `superpowers:requesting-code-review`, address verified findings, then use `superpowers:verification-before-completion` before pushing the branch and opening a pull request. Do not merge without a new explicit user instruction.
