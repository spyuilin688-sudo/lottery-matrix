# PR #156 Operational Status Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 PR #156 的 Railway 狀態安全、Supabase 狀態投影及 AppDeploy 相容性，使它可獨立驗證而不修改畫面或演算法。

**Architecture:** Railway 的 `/health` 維持公開；`/jobs/status` 只接受 AppDeploy 後端持有的共同密鑰。Railway 只輸出固定且不含原始錯誤的四彩狀態，AppDeploy 再次檢查格式，並將它加入既有 `/api/system-status`；舊 `/api/algorithm-status` 完全恢復原契約。

**Tech Stack:** Python 3.12、pytest 9、supabase-py/PostgREST 2.31、TypeScript、Vitest 4、AppDeploy backend router。

**Spec:** `docs/superpowers/specs/2026-08-29-pr156-railway-pages-convergence-design.md`

## Global Constraints

- 本計畫只涵蓋設計文件第 5 節「PR #156」。Railway Dashboard、Cloudflare Pages、PR #153/#154 與舊 UI 測試各自另立計畫。
- 不修改 `src/**`、`apps/admin/src/**`、CSS、手機版面、響應式規則或使用流程。
- 不修改探索、天衍、天工、Matrix 狀態或開獎排程規則。
- 不新增 npm/Python 套件、Supabase migration、trigger、資料表或索引。
- `/health` 保持公開；`/jobs/status` 使用 `MATRIX_ADMIN_STATUS_TOKEN` 與 `X-Matrix-Admin-Token`。
- Railway 驗證失敗統一回 403 `{"error":"FORBIDDEN"}`，投影失敗回 503 `{"error":"STATUS_UNAVAILABLE"}`。
- 不回傳或記錄密鑰、原始資料庫錯誤、stack trace 或上游錯誤本文。
- `lottery_draws.draw_date` 可為空；狀態、公開 API 與 Worker 的最新一期查詢都必須把空白日期排在最後。
- 既有四個 `system_job_status` 狀態卡也只能輸出固定欄位與安全錯誤代碼，不得把原始 Supabase row 或錯誤本文放進 `detail` / `error`；保留畫面既有使用的安全 `finished_at` 相容欄位。
- AppDeploy Railway 查詢的總期限固定為 5,000ms，不重試、不快取、禁止轉址。
- `system_job_status` 表示單次 Worker invocation 是否正常結束；分析是否完成由 `latestAnalysis` 表示。
- 保留已完成提交 `601c7f2`（job `updated_at`）與 `9385a15`（telemetry failure isolation），不重做或回退。
- 每個 task 只提交列出的檔案；不要加入既有未追蹤檔 `docs/superpowers/plans/2026-08-29-pr156-operational-status-safety.md`。

## File Structure

### Railway

- Modify `services/matrix-api/app/api_server.py`: `/jobs/status` 密鑰驗證、固定錯誤、路由專用 headers、安全 access log，以及公開最新/歷史查詢的空日期排序。
- Modify `services/matrix-api/app/repositories/analysis_repository.py`: 固定狀態投影、原始錯誤代碼化、最新開獎排序。
- Modify `services/matrix-api/tests/test_analysis_repository.py`: 記憶體與 Supabase 開獎排序測試。
- Modify `services/matrix-api/tests/test_public_api.py`: 純路由的授權、固定錯誤與公開最新查詢排序測試。
- Create `services/matrix-api/tests/test_api_server_http.py`: 真實 HTTP handler 的 header、CORS、大小寫 header 與 log 測試。
- Modify `services/matrix-api/tests/test_job_status_repository.py`: Supabase/PostgREST 排序與安全投影測試。
- Modify `services/matrix-api/tests/test_worker_job_status.py`: 鎖定已核准的 Worker 狀態意思。
- Modify `services/matrix-api/tests/test_worker.py`: 以含空日期資料鎖定排程的最新一期判斷。
- Modify `services/matrix-api/.env.example`: 增加 Railway 管理狀態密鑰名稱。
- Modify `services/matrix-api/README.md`: 說明公開與受保護端點。

### AppDeploy

- Modify `apps/admin/backend/algorithm-api.ts`: 恢復原本四個 AppDeploy 狀態端點。
- Modify `apps/admin/backend/algorithm-api.test.ts`: 恢復舊契約回歸測試。
- Modify `apps/admin/backend/worker-api.ts`: Railway 設定載入、5 秒期限、固定 DTO 檢查與安全請求。
- Modify `apps/admin/backend/worker-api.test.ts`: 密鑰、timeout、header、DTO 與無洩漏測試。
- Modify `apps/admin/backend/connection-status.ts`: 將 Railway 狀態加入統一系統狀態。
- Modify `apps/admin/backend/connection-status.test.ts`: 正確判斷 `{ok:false}`、第 13 張通用狀態卡及 retry。
- Modify `apps/admin/backend/index.ts`: 正確建立兩個 adapter、移除第二個 Railway 狀態路由並保留原權限。
- Create `apps/admin/backend/index-wiring.test.ts`: 使用 Vitest 的 AppDeploy 替代模組載入真實路由表，檢查必要路由與依賴接線行為。
- Modify `test/appdeploy-sdk.ts`: 補齊測試用 `secrets.listSecretNames()` 邊界。

---

### Task 0: Confirm the Approved Base

**Files:**
- Verify: `services/matrix-api/app/repositories/analysis_repository.py`
- Verify: `services/matrix-api/app/worker.py`
- Verify: `services/matrix-api/tests/test_job_status_repository.py`
- Verify: `services/matrix-api/tests/test_worker_job_status.py`

**Interfaces:**
- Consumes: commits `601c7f2` and `9385a15`.
- Produces: a known-green Phase 1 starting point before new changes.

- [ ] **Step 1: Confirm the branch and commits**

Run from repository root:

```bash
git status --short --branch
git log -4 --oneline
```

Expected: branch is `work/pr156-safe`; history contains `abd46a6`, `9385a15`, and `601c7f2`. The only unrelated untracked path is the earlier `2026-08-29-pr156-operational-status-safety.md` plan.

- [ ] **Step 2: Confirm the two completed safety fixes**

Run:

```bash
cd services/matrix-api
uv run pytest -q tests/test_job_status_repository.py tests/test_worker_job_status.py
```

Expected: PASS. If either file fails before new edits, stop and diagnose the baseline rather than changing the approved contract.

---

### Task 1: Restore the Legacy Algorithm Status Contract

**Files:**
- Modify: `apps/admin/backend/algorithm-api.test.ts`
- Modify: `apps/admin/backend/algorithm-api.ts`
- Modify: `apps/admin/backend/index.ts`

**Interfaces:**
- Consumes: `fetch` and the existing AppDeploy API base `https://api-v2.appdeploy.ai/app/app-snsxet`.
- Produces: `createAlgorithmApi(fetcher?: typeof fetch)` and `algorithmApi`, returning `{ ok, health, coverage, audit, cases }`.

- [ ] **Step 1: Restore the failing compatibility tests**

Replace the Railway-oriented expectations in `algorithm-api.test.ts` with these three contracts:

```ts
it('reads only the four approved status endpoints', async () => {
  const urls: string[] = [];
  const api = createAlgorithmApi(async (input) => {
    urls.push(String(input));
    return new Response('{}', { status: 200 });
  });

  await expect(api.getAlgorithmStatus()).resolves.toMatchObject({ ok: true });
  expect(urls).toEqual([
    'https://api-v2.appdeploy.ai/app/app-snsxet/api/_healthcheck',
    'https://api-v2.appdeploy.ai/app/app-snsxet/api/matrix/coverage',
    'https://api-v2.appdeploy.ai/app/app-snsxet/api/matrix/audit',
    'https://api-v2.appdeploy.ai/app/app-snsxet/api/matrix/algorithm/cases',
  ]);
});

it('returns an unavailable status without throwing', async () => {
  const api = createAlgorithmApi(async () => { throw new Error('offline'); });
  await expect(api.getAlgorithmStatus()).resolves.toEqual({
    ok: false,
    health: null,
    coverage: null,
    audit: null,
    cases: null,
  });
});

it('fails atomically when any approved endpoint is unsuccessful', async () => {
  let call = 0;
  const api = createAlgorithmApi(async () => {
    call += 1;
    return new Response('{}', { status: call === 3 ? 500 : 200 });
  });
  await expect(api.getAlgorithmStatus()).resolves.toEqual({
    ok: false,
    health: null,
    coverage: null,
    audit: null,
    cases: null,
  });
});
```

- [ ] **Step 2: Run the compatibility test and verify RED**

Run from repository root:

```bash
npm run test:unit -- apps/admin/backend/algorithm-api.test.ts
```

Expected: FAIL because the branch still calls Railway `/health` and `/jobs/status` and returns `jobs` instead of `coverage/audit/cases`.

- [ ] **Step 3: Restore the minimal adapter implementation**

Restore `algorithm-api.ts` to this boundary:

```ts
export type AlgorithmStatus = {
  ok: boolean;
  health: unknown | null;
  coverage: unknown | null;
  audit: unknown | null;
  cases: unknown | null;
};

const algorithmBaseUrl = 'https://api-v2.appdeploy.ai/app/app-snsxet';
const endpoints = [
  '/api/_healthcheck',
  '/api/matrix/coverage',
  '/api/matrix/audit',
  '/api/matrix/algorithm/cases',
] as const;

const unavailable = (): AlgorithmStatus => ({
  ok: false,
  health: null,
  coverage: null,
  audit: null,
  cases: null,
});

export function createAlgorithmApi(fetcher: typeof fetch = fetch) {
  return {
    async getAlgorithmStatus(): Promise<AlgorithmStatus> {
      try {
        const responses = await Promise.all(
          endpoints.map((path) => fetcher(`${algorithmBaseUrl}${path}`)),
        );
        if (responses.some((response) => !response.ok)) return unavailable();
        const [health, coverage, audit, cases] = await Promise.all(
          responses.map((response) => response.json()),
        );
        return { ok: true, health, coverage, audit, cases };
      } catch {
        return unavailable();
      }
    },
  };
}

export const algorithmApi = createAlgorithmApi();
```

In `index.ts`, import the singleton and remove the Railway config argument from this adapter:

```ts
import { algorithmApi } from './algorithm-api';
```

Keep the existing route exactly behind `requireAuth()` and `guard('view')`.

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
npm run test:unit -- apps/admin/backend/algorithm-api.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit the compatibility restoration**

```bash
git add apps/admin/backend/algorithm-api.ts apps/admin/backend/algorithm-api.test.ts apps/admin/backend/index.ts
git commit -m "fix: restore algorithm status compatibility"
```

---

### Task 2: Sanitize and Correct the Supabase Status Projection

**Files:**
- Modify: `services/matrix-api/tests/test_job_status_repository.py`
- Modify: `services/matrix-api/app/repositories/analysis_repository.py`

**Interfaces:**
- Consumes: `AnalysisRepository.list_job_statuses()` and Supabase tables `system_job_status`, `lottery_draws`, `matrix_analysis_runs`.
- Produces: four fixed items with safe error codes, reliable job timestamps, no nested unreliable `updatedAt`, and canonical draw ordering.

- [ ] **Step 1: Add failing safe-projection tests**

Extend the in-memory test with raw stored failures and assert the exact output:

```python
def test_job_status_projection_hides_raw_errors_and_unreliable_timestamps() -> None:
    repository = InMemoryAnalysisRepository()
    repository.start_job("matrix-539-refresh-v2", "今彩539", "2026-08-29T01:00:00+00:00")
    repository.finish_job(
        "matrix-539-refresh-v2", "failed", "2026-08-29T01:01:00+00:00",
        "password=raw-worker-secret",
    )
    repository.upsert_draw({
        "lottery": "今彩539", "period": "003117", "drawDate": "2026-08-28",
        "numbers": ["01", "07", "11", "20", "39"],
    })
    repository.runs[("今彩539", "003117", "v3")] = {
        "lottery": "今彩539", "drawPeriod": "003117", "analysisVersion": "v3",
        "phase": "status", "cursor": 1, "total": 1, "status": "failed",
        "startedAt": "2026-08-29T01:00:00+00:00", "completedAt": None,
        "error": "database raw analysis error",
    }

    item = repository.list_job_statuses()[0]

    assert item["job"]["error"] == "WORKER_FAILED"
    assert item["latestAnalysis"]["error"] == "ANALYSIS_FAILED"
    assert "updatedAt" not in item["latestDraw"]
    assert "updatedAt" not in item["latestAnalysis"]
    assert "raw-worker-secret" not in str(item)
    assert "database raw analysis error" not in str(item)
```

Add a real PostgREST request-contract test using the pinned client:

```python
import httpx
from postgrest import SyncPostgrestClient

def test_job_status_uses_canonical_draw_postgrest_order() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=[])

    base_url = "https://example.supabase.co/rest/v1"
    http_client = httpx.Client(
        base_url=base_url,
        transport=httpx.MockTransport(handler),
    )
    with SyncPostgrestClient(base_url, http_client=http_client) as client:
        SupabaseAnalysisRepository(client).list_job_statuses()

    draw_requests = [
        request for request in requests
        if request.url.path.endswith("/lottery_draws")
    ]
    assert len(draw_requests) == 4
    assert all(
        request.url.params["order"] == "draw_date.desc.nullslast,period.desc"
        for request in draw_requests
    )
    assert all(request.url.params["limit"] == "1" for request in draw_requests)
```

- [ ] **Step 2: Run the repository tests and verify RED**

Run:

```bash
cd services/matrix-api
uv run pytest -q tests/test_job_status_repository.py
```

Expected: FAIL because raw errors and nested `updatedAt` are still returned and the draw query still orders by `updated_at` instead of putting undated rows last.

- [ ] **Step 3: Implement the fixed projection**

Use allowlisted normalizers:

```python
@staticmethod
def _normalize_job_status(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "jobName": row["job_name"],
        "lottery": row["lottery"],
        "status": row["status"],
        "startedAt": row["started_at"],
        "finishedAt": row.get("finished_at"),
        "error": "WORKER_FAILED" if row.get("error") else None,
        "updatedAt": row["updated_at"],
    }

@staticmethod
def _normalize_latest_draw_status(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "period": row["period"],
        "drawDate": row.get("draw_date"),
    }

@staticmethod
def _normalize_latest_analysis_status(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "drawPeriod": row["draw_period"],
        "status": row["status"],
        "phase": row["phase"],
        "startedAt": row["started_at"],
        "completedAt": row.get("completed_at"),
        "error": "ANALYSIS_FAILED" if row.get("error") else None,
    }
```

Make the in-memory projection use the same fixed fields and error mapping. Narrow the Supabase selects and fix the draw query:

```python
job_response = self.client.table("system_job_status").select(
    "job_name,lottery,status,started_at,finished_at,error,updated_at"
).execute()
```

```python
draw_response = (
    self.client.table("lottery_draws")
    .select("period,draw_date")
    .eq("lottery", lottery)
    .order("draw_date", desc=True, nullsfirst=False)
    .order("period", desc=True)
    .limit(1)
    .execute()
)
```

```python
analysis_response = (
    self.client.table("matrix_analysis_runs")
    .select("draw_period,status,phase,started_at,completed_at,error")
    .eq("lottery", lottery)
    .order("started_at", desc=True)
    .limit(1)
    .execute()
)
```

- [ ] **Step 4: Run the repository tests and verify GREEN**

Run:

```bash
uv run pytest -q tests/test_job_status_repository.py
```

Expected: all tests pass, including four actual PostgREST draw requests with `draw_date.desc.nullslast,period.desc`.

- [ ] **Step 5: Commit the projection fix**

Run from repository root:

```bash
git add services/matrix-api/app/repositories/analysis_repository.py services/matrix-api/tests/test_job_status_repository.py
git commit -m "fix: sanitize Railway job status projection"
```

---

### Task 3: Protect `/jobs/status` and Separate Its HTTP Headers

**Files:**
- Modify: `services/matrix-api/tests/test_public_api.py`
- Create: `services/matrix-api/tests/test_api_server_http.py`
- Modify: `services/matrix-api/app/api_server.py`
- Modify: `services/matrix-api/.env.example`
- Modify: `services/matrix-api/README.md`

**Interfaces:**
- Consumes: environment variable `MATRIX_ADMIN_STATUS_TOKEN` and request header `X-Matrix-Admin-Token`.
- Produces: `handle_api_request(method, target, body, repository, request_monitor_token: str | None = None)`, protected `/jobs/status`, public `/health`, stable errors, no protected-route CORS, and `Cache-Control: no-store`.

- [ ] **Step 1: Add failing pure route security tests**

Add `status_reads` to `OperationalRepository.list_job_statuses()`, then add these tests:

```python
@pytest.mark.parametrize(
    ("configured", "supplied"),
    [
        ("expected-token", None),
        ("expected-token", "wrong-token"),
        ("", "expected-token"),
    ],
)
def test_jobs_status_rejects_invalid_configuration_or_token(
    monkeypatch, configured: str, supplied: str | None,
) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", configured)
    repository = OperationalRepository()

    status, payload = handle_api_request(
        "GET", "/jobs/status", None, repository,
        request_monitor_token=supplied,
    )

    assert status == 403
    assert payload == {"error": "FORBIDDEN"}
    assert repository.status_reads == 0

def test_jobs_status_accepts_the_configured_header_token(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = OperationalRepository()

    status, payload = handle_api_request(
        "GET", "/jobs/status", None, repository,
        request_monitor_token="expected-token",
    )

    assert status == 200
    assert payload == {"items": repository.status_rows}
    assert repository.status_reads == 1

def test_jobs_status_rejects_a_query_string_token(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = OperationalRepository()

    status, payload = handle_api_request(
        "GET", "/jobs/status?token=expected-token", None, repository,
    )

    assert status == 403
    assert payload == {"error": "FORBIDDEN"}
    assert repository.status_reads == 0
```

Add these exact fixed-error and comparison tests; import `app.api_server as api_server` for the spy:

```python
def test_jobs_status_uses_constant_time_byte_comparison(monkeypatch) -> None:
    calls: list[tuple[bytes, bytes]] = []

    def spy(candidate: bytes, expected: bytes) -> bool:
        calls.append((candidate, expected))
        return False

    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    monkeypatch.setattr(api_server, "compare_digest", spy)
    status, payload = handle_api_request(
        "GET", "/jobs/status", None, OperationalRepository()
    )

    assert (status, payload) == (403, {"error": "FORBIDDEN"})
    assert calls == [(b"", b"expected-token")]

class ExplodingStatusRepository(OperationalRepository):
    def list_job_statuses(self) -> list[dict]:
        self.status_reads += 1
        raise RuntimeError("fake-database-secret")

def test_jobs_status_returns_only_stable_unavailable_error(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    status, payload = handle_api_request(
        "GET", "/jobs/status", None, ExplodingStatusRepository(),
        request_monitor_token="expected-token",
    )
    assert (status, payload) == (503, {"error": "STATUS_UNAVAILABLE"})
    assert "fake-database-secret" not in str(payload)

class ExplodingHistoryRepository(InMemoryAnalysisRepository):
    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict]:
        raise RuntimeError("fake-public-database-secret")

def test_unexpected_public_error_is_stable() -> None:
    status, payload = handle_api_request(
        "GET", "/api/matrix/latest/%E4%BB%8A%E5%BD%A9539", None,
        ExplodingHistoryRepository(),
    )
    assert (status, payload) == (500, {"error": "INTERNAL_ERROR"})
    assert "fake-public-database-secret" not in str(payload)
```

- [ ] **Step 2: Add failing real HTTP header tests**

Create `test_api_server_http.py` with an ephemeral `ThreadingHTTPServer` helper:

```python
from contextlib import contextmanager
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from threading import Thread

from app.api_server import RailwayApiHandler
from app.repositories.analysis_repository import InMemoryAnalysisRepository

class HttpOperationalRepository(InMemoryAnalysisRepository):
    def health_check(self) -> None:
        return None

    def list_job_statuses(self) -> list[dict]:
        return [{
            "lottery": "今彩539",
            "jobName": "matrix-539-refresh-v2",
            "job": None,
            "latestDraw": None,
            "latestAnalysis": None,
        }]

@contextmanager
def running_server(repository):
    class TestHandler(RailwayApiHandler):
        pass

    TestHandler.repository = repository
    server = ThreadingHTTPServer(("127.0.0.1", 0), TestHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_address
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()
```

Add this exact lowercase-header success test after the `request()` helper below:

```python
def test_lowercase_admin_header_can_read_protected_status(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, body = request(
            address,
            "GET",
            "/jobs/status",
            {"x-matrix-admin-token": "expected-token"},
        )
        assert response.status == 200
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert b'"items"' in body
```

Add the remaining HTTP assertions with these exact cases:

```python
def request(address, method: str, path: str, headers: dict[str, str] | None = None):
    connection = HTTPConnection(*address, timeout=2)
    connection.request(method, path, headers=headers or {})
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response, body

def test_protected_status_errors_have_no_store_and_no_cors(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "GET", "/jobs/status")
        assert response.status == 403
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None

def test_protected_status_preflight_does_not_advertise_admin_header(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "OPTIONS", "/jobs/status")
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert "X-Matrix-Admin-Token" not in str(
            response.getheader("Access-Control-Allow-Headers")
        )

def test_public_health_keeps_cors(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "GET", "/health")
        assert response.status == 200
        assert response.getheader("Access-Control-Allow-Origin") == "*"

def test_query_token_is_not_written_to_access_log(monkeypatch, capsys) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(
            address, "GET", "/jobs/status?token=fake-log-secret"
        )
        assert response.status == 403
    assert "fake-log-secret" not in capsys.readouterr().out
```

Add the authorized 503 header test with the same `ExplodingStatusRepository` behavior in this file:

```python
class ExplodingStatusRepository(HttpOperationalRepository):
    def list_job_statuses(self) -> list[dict]:
        raise RuntimeError("fake-database-secret")

def test_protected_status_503_is_safe_and_not_cacheable(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(ExplodingStatusRepository()) as address:
        response, body = request(
            address,
            "GET",
            "/jobs/status",
            {"X-Matrix-Admin-Token": "expected-token"},
        )
        assert response.status == 503
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert body == b'{"error":"STATUS_UNAVAILABLE"}'
        assert b"fake-database-secret" not in body
```

- [ ] **Step 3: Run both test files and verify RED**

Run:

```bash
cd services/matrix-api
uv run pytest -q tests/test_public_api.py tests/test_api_server_http.py
```

Expected: FAIL because `/jobs/status` is public, every route receives wildcard CORS, there is no no-store header, and access logs include the query string.

- [ ] **Step 4: Implement token authentication and stable errors**

In `api_server.py`, add:

```python
from secrets import compare_digest

def _status_token_authorized(candidate_value: str | None) -> bool:
    expected = environ.get("MATRIX_ADMIN_STATUS_TOKEN", "")
    candidate = candidate_value or ""
    matched = compare_digest(
        candidate.encode("utf-8"),
        expected.encode("utf-8"),
    )
    return bool(expected) and bool(candidate) and matched
```

Extend the pure handler without passing the entire header collection:

```python
def handle_api_request(
    method: str,
    target: str,
    body: bytes | None,
    repository: AnalysisRepository,
    request_monitor_token: str | None = None,
) -> tuple[int, dict[str, Any]]:
```

Use this protected branch before any repository read:

```python
if method == "GET" and path == "/jobs/status":
    if not _status_token_authorized(request_monitor_token):
        return 403, {"error": "FORBIDDEN"}
    try:
        return 200, {"items": repository.list_job_statuses()}
    except Exception:
        return 503, {"error": "STATUS_UNAVAILABLE"}
```

Keep existing `ValueError` validation messages, but replace the final unexpected exception response with:

```python
except Exception:
    return 500, {"error": "INTERNAL_ERROR"}
```

- [ ] **Step 5: Implement route-specific headers and safe logging**

Change `_send` to:

```python
def _send(
    self,
    status: int,
    payload: dict[str, Any],
    *,
    allow_cors: bool = True,
    no_store: bool = False,
) -> None:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(encoded)))
    if no_store:
        self.send_header("Cache-Control", "no-store")
    if allow_cors:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    self.end_headers()
    self.wfile.write(encoded)
```

Use a helper based on parsed path:

```python
def _is_protected_status_path(self) -> bool:
    return urlsplit(self.path).path == "/jobs/status"
```

`do_OPTIONS()` sends no CORS and no-store for the protected path. `do_GET()` reads only `self.headers.get("X-Matrix-Admin-Token")`, passes it to `handle_api_request`, and uses no CORS/no-store for protected-path success and errors. Public GET/POST behavior remains unchanged.

Replace request-line logging with path-only logging so query values never appear:

```python
def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
    path = urlsplit(self.path).path
    print(
        f"railway-api {self.address_string()} "
        f"{self.command} {path} {code} {size}"
    )
```

Replace the existing `log_message()` implementation with a value-free handler event; request method, safe path and status are already emitted by `log_request()`:

```python
def log_message(self, format: str, *args: Any) -> None:
    print(f"railway-api {self.address_string()} handler-event")
```

- [ ] **Step 6: Document the two server-only variables and endpoint boundary**

Add to `.env.example`:

```text
MATRIX_ADMIN_STATUS_TOKEN=replace-with-shared-admin-status-token
```

Update the README required variables and endpoint list to state:

```text
GET /health       public Railway health check
GET /jobs/status  AppDeploy backend only; requires X-Matrix-Admin-Token
```

State that the same `MATRIX_ADMIN_STATUS_TOKEN` name must exist in Railway and AppDeploy and must never be a `VITE_` variable.

- [ ] **Step 7: Run tests and verify GREEN**

Run:

```bash
uv run pytest -q tests/test_public_api.py tests/test_api_server_http.py
```

Expected: all route and real-handler tests pass; no test response or captured log contains a fake secret.

- [ ] **Step 8: Commit the protected endpoint**

Run from repository root:

```bash
git add services/matrix-api/app/api_server.py services/matrix-api/tests/test_public_api.py services/matrix-api/tests/test_api_server_http.py services/matrix-api/.env.example services/matrix-api/README.md
git commit -m "feat: protect Railway job status endpoint"
```

---

### Task 4: Lock the Approved Worker Status Meaning

**Files:**
- Modify: `services/matrix-api/tests/test_worker_job_status.py`

**Interfaces:**
- Consumes: `run_worker()` and `run_scheduled_worker()` at current commit `9385a15`.
- Produces: characterization tests proving invocation-level success/failure without changing `worker.py`.

- [ ] **Step 1: Add the three missing characterization tests**

Add exactly these behavior checks:

```python
def test_not_acquired_finishes_invocation_as_success() -> None:
    repository = JobTrackingRepository()
    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI),
        repository,
        Source(draw_date="2026-08-27"),
        _builders(),
    )
    assert result["status"] == "not-acquired"
    assert repository.job_events[-1]["status"] == "success"

def test_running_analysis_checkpoint_finishes_invocation_as_success(monkeypatch) -> None:
    monkeypatch.setattr("app.worker.MAX_CYCLES_PER_INVOCATION", 1)
    repository = JobTrackingRepository()

    def explore(context: dict) -> dict:
        start = context["exploreBatch"]["start"]
        return {
            "artifact": {"items": [], "validationById": {}},
            "_checkpoint": {
                "cursorStart": start, "cursor": start + 10,
                "total": 20, "complete": False,
            },
        }

    builders = {
        "explore": explore,
        "tianyan": lambda _: {"items": []},
        "tiangong": lambda _: {"items": []},
        "status": lambda _: {"items": []},
    }
    result = run_worker("今彩539", repository, Source(), builders)
    assert result["status"] == "running"
    assert repository.job_events[-1]["status"] == "success"

def test_already_acquired_does_not_overwrite_job_status() -> None:
    repository = JobTrackingRepository()
    repository.upsert_draw({
        "lottery": "今彩539", "period": "000000221",
        "drawDate": "2026-08-28",
        "numbers": ["01", "02", "03", "04", "05"],
    })
    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI),
        repository,
        Source(),
        _builders(),
    )
    assert result["status"] == "already-acquired"
    assert repository.job_events == []
```

- [ ] **Step 2: Run the characterization tests**

Run:

```bash
cd services/matrix-api
uv run pytest -q tests/test_worker_job_status.py
```

Expected: all tests pass without modifying `app/worker.py`. If a new test fails, stop and diagnose it; do not silently redefine the approved status meaning.

- [ ] **Step 3: Commit only the tests**

Run from repository root:

```bash
git add services/matrix-api/tests/test_worker_job_status.py
git commit -m "test: lock Railway worker status semantics"
```

---

### Task 5: Harden the AppDeploy Railway Adapter

**Files:**
- Modify: `apps/admin/backend/worker-api.test.ts`
- Modify: `apps/admin/backend/worker-api.ts`

**Interfaces:**
- Consumes: `WorkerConfigLoader = () => Promise<WorkerConfig | null>` and an injectable `fetcher`.
- Produces: `createWorkerApi(loadConfig, fetcher?, timeoutMs?)`, `getWorkerConfig(secretReader)`, and a discriminated `WorkerStatus` containing only fixed safe fields.

- [ ] **Step 1: Replace the weak tests with the full failing contract**

Define reusable valid responses:

```ts
const health = {
  status: 'ok',
  service: 'matrix-railway-api',
  version: 'test-sha',
  database: { status: 'ok' },
};
const lotteryJobs = [
  ['今彩539', 'matrix-539-refresh-v2'],
  ['天天樂', 'matrix-fantasy5-refresh-v2'],
  ['六合彩', 'matrix-marksix-refresh-v2'],
  ['大樂透', 'matrix-649-refresh-v2'],
] as const;
const jobItem = (lottery: typeof lotteryJobs[number][0], jobName: string) => ({
  lottery,
  jobName,
  job: {
    jobName, lottery, status: 'success' as const,
    startedAt: '2026-08-29T01:00:00Z', finishedAt: '2026-08-29T01:01:00Z',
    error: null, updatedAt: '2026-08-29T01:01:00Z',
  },
  latestDraw: { period: '003117', drawDate: '2026-08-28' },
  latestAnalysis: {
    drawPeriod: '003117', status: 'complete' as const, phase: 'complete' as const,
    startedAt: '2026-08-29T01:00:00Z', completedAt: '2026-08-29T01:01:00Z',
    error: null,
  },
});
const jobs = { items: lotteryJobs.map(([lottery, jobName]) => jobItem(lottery, jobName)) };
```

Use this response helper and add the exact request-boundary tests:

```ts
const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const unavailable = { ok: false, health: null, jobs: null };

it('normalizes the URL and sends the token only to jobs with one signal', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
    String(input).endsWith('/health') ? jsonResponse(health) : jsonResponse(jobs));
  const api = createWorkerApi(
    async () => ({ baseUrl: 'https://railway.example/', statusToken: 'server-token' }),
    fetcher,
  );

  await expect(api.getStatus()).resolves.toMatchObject({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const [healthUrl, healthInit] = fetcher.mock.calls[0];
  const [jobsUrl, jobsInit] = fetcher.mock.calls[1];
  expect(String(healthUrl)).toBe('https://railway.example/health');
  expect(String(jobsUrl)).toBe('https://railway.example/jobs/status');
  expect(healthInit).toMatchObject({ redirect: 'error', cache: 'no-store' });
  expect(jobsInit).toMatchObject({
    redirect: 'error',
    cache: 'no-store',
    headers: { 'X-Matrix-Admin-Token': 'server-token' },
  });
  expect((healthInit as RequestInit).headers).toBeUndefined();
  expect((healthInit as RequestInit).signal).toBe((jobsInit as RequestInit).signal);
});

it.each([
  null,
  { baseUrl: '', statusToken: 'server-token' },
  { baseUrl: 'https://railway.example', statusToken: '' },
])('performs no fetch when config is unusable', async (config) => {
  const fetcher = vi.fn();
  const api = createWorkerApi(async () => config, fetcher as typeof fetch);
  await expect(api.getStatus()).resolves.toEqual(unavailable);
  expect(fetcher).not.toHaveBeenCalled();
});

it('does not parse or expose a non-success response body', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) =>
    String(input).endsWith('/health')
      ? jsonResponse(health)
      : jsonResponse({ error: 'fake-upstream-secret' }, 503));
  const api = createWorkerApi(
    async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }),
    fetcher,
  );
  const result = await api.getStatus();
  expect(result).toEqual(unavailable);
  expect(JSON.stringify(result)).not.toContain('fake-upstream-secret');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('returns unavailable for malformed JSON', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) =>
    String(input).endsWith('/health')
      ? jsonResponse(health)
      : new Response('{', { status: 200 }));
  const api = createWorkerApi(
    async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }),
    fetcher,
  );
  await expect(api.getStatus()).resolves.toEqual(unavailable);
});
```

Add the exact invalid DTO table; each value must return the same `unavailable` object:

```ts
const invalidJobPayloads = [
  { name: 'missing lottery', value: { items: jobs.items.slice(0, 3) } },
  {
    name: 'duplicate lottery',
    value: { items: [jobs.items[0], jobs.items[0], jobs.items[2], jobs.items[3]] },
  },
  {
    name: 'mismatched job name',
    value: {
      items: jobs.items.map((item, index) =>
        index === 0 ? { ...item, jobName: 'matrix-fantasy5-refresh-v2' } : item),
    },
  },
  {
    name: 'wrong required field type',
    value: {
      items: jobs.items.map((item, index) =>
        index === 0 ? { ...item, latestDraw: { ...item.latestDraw, period: 3117 } } : item),
    },
  },
];

it.each(invalidJobPayloads)('rejects $name', async ({ value }) => {
  const fetcher = vi.fn(async (input: string | URL | Request) =>
    String(input).endsWith('/health') ? jsonResponse(health) : jsonResponse(value));
  const api = createWorkerApi(
    async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }),
    fetcher,
  );
  await expect(api.getStatus()).resolves.toEqual(unavailable);
});

it('rejects an invalid health DTO', async () => {
  const fetcher = vi.fn(async (input: string | URL | Request) =>
    String(input).endsWith('/health')
      ? jsonResponse({ ...health, version: 123 })
      : jsonResponse(jobs));
  const api = createWorkerApi(
    async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }),
    fetcher,
  );
  await expect(api.getStatus()).resolves.toEqual(unavailable);
});
```

Add the safe projection test:

```ts
it('projects extra fields and raw errors to a safe DTO', async () => {
  const tainted = structuredClone(jobs) as any;
  tainted.secret = 'top-level-secret';
  tainted.items[0].extra = 'row-secret';
  tainted.items[0].job.error = 'raw-worker-secret';
  tainted.items[0].latestAnalysis.error = 'raw-analysis-secret';
  tainted.items[0].latestDraw.updatedAt = 'unreliable';
  tainted.items[0].latestAnalysis.updatedAt = 'unreliable';
  const fetcher = vi.fn(async (input: string | URL | Request) =>
    String(input).endsWith('/health') ? jsonResponse(health) : jsonResponse(tainted));
  const api = createWorkerApi(
    async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }),
    fetcher,
  );

  const result = await api.getStatus();
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected safe Railway status');
  expect(result.jobs.items[0].job?.error).toBe('WORKER_FAILED');
  expect(result.jobs.items[0].latestAnalysis?.error).toBe('ANALYSIS_FAILED');
  expect(result.jobs.items[0].latestDraw).not.toHaveProperty('updatedAt');
  expect(result.jobs.items[0].latestAnalysis).not.toHaveProperty('updatedAt');
  expect(JSON.stringify(result)).not.toMatch(
    /top-level-secret|row-secret|raw-worker-secret|raw-analysis-secret|server-token/,
  );
});
```

Add both overall-deadline tests with fake timers:

```ts
it('times out a hanging config loader before making a request', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn();
    const api = createWorkerApi(
      () => new Promise(() => undefined),
      fetcher as typeof fetch,
    );
    const pending = api.getStatus();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual(unavailable);
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('aborts hanging fetches at five seconds without retry', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')));
      }));
    const api = createWorkerApi(
      async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }),
      fetcher as typeof fetch,
    );
    const pending = api.getStatus();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual(unavailable);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
```

Add exact `getWorkerConfig()` coverage:

```ts
it('loads only the two approved server secrets', async () => {
  const reads: string[] = [];
  const config = await getWorkerConfig({
    listSecretNames: async () => [
      'RAILWAY_WORKER_URL', 'MATRIX_ADMIN_STATUS_TOKEN', 'UNRELATED_SECRET',
    ],
    readSecret: async (name) => {
      reads.push(name);
      return name === 'RAILWAY_WORKER_URL'
        ? 'https://railway.example/'
        : 'server-token';
    },
  });
  expect(config).toEqual({
    baseUrl: 'https://railway.example',
    statusToken: 'server-token',
  });
  expect(reads.sort()).toEqual([
    'MATRIX_ADMIN_STATUS_TOKEN', 'RAILWAY_WORKER_URL',
  ]);
});

it.each([
  ['missing token name', ['RAILWAY_WORKER_URL'], 'https://railway.example'],
  ['missing URL name', ['MATRIX_ADMIN_STATUS_TOKEN'], 'server-token'],
  ['blank stored value', ['RAILWAY_WORKER_URL', 'MATRIX_ADMIN_STATUS_TOKEN'], '   '],
])('returns null for %s', async (_name, names, value) => {
  const config = await getWorkerConfig({
    listSecretNames: async () => names as string[],
    readSecret: async () => value,
  });
  expect(config).toBeNull();
});

it('maps secret-store errors to null without exposing their text', async () => {
  const config = await getWorkerConfig({
    listSecretNames: async () => { throw new Error('fake-secret-value'); },
    readSecret: async () => '',
  });
  expect(config).toBeNull();
  expect(JSON.stringify(config)).not.toContain('fake-secret-value');
});
```

- [ ] **Step 2: Run the adapter tests and verify RED**

Run:

```bash
npm run test:unit -- apps/admin/backend/worker-api.test.ts
```

Expected: FAIL because the current adapter accepts only a URL, forwards unknown JSON, sends no token, and has no timeout.

- [ ] **Step 3: Define the exact safe types and config boundary**

Use these exported interfaces:

```ts
export type WorkerConfig = { baseUrl: string; statusToken: string };
export type WorkerConfigLoader = () => Promise<WorkerConfig | null>;
export type SecretReader = {
  listSecretNames(): Promise<string[]>;
  readSecret(name: string): Promise<unknown>;
};

export type RailwayHealth = {
  status: 'ok';
  service: string;
  version: string;
  database: { status: 'ok' };
};
export type RailwayJob = {
  jobName: string;
  lottery: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  error: 'WORKER_FAILED' | null;
  updatedAt: string;
};
export type RailwayLatestDraw = { period: string; drawDate: string | null };
export type RailwayLatestAnalysis = {
  drawPeriod: string;
  status: 'running' | 'complete' | 'failed';
  phase: 'explore' | 'tianyan' | 'tiangong' | 'status' | 'complete';
  startedAt: string;
  completedAt: string | null;
  error: 'ANALYSIS_FAILED' | null;
};
export type RailwayJobItem = {
  lottery: '今彩539' | '天天樂' | '六合彩' | '大樂透';
  jobName: string;
  job: RailwayJob | null;
  latestDraw: RailwayLatestDraw | null;
  latestAnalysis: RailwayLatestAnalysis | null;
};
export type RailwayJobs = { items: RailwayJobItem[] };
export type WorkerStatus =
  | { ok: true; health: RailwayHealth; jobs: RailwayJobs }
  | { ok: false; health: null; jobs: null };
```

Implement the fixed map and parsers directly; these functions project only allowlisted fields and never copy an error value:

```ts
const jobNameByLottery = {
  今彩539: 'matrix-539-refresh-v2',
  天天樂: 'matrix-fantasy5-refresh-v2',
  六合彩: 'matrix-marksix-refresh-v2',
  大樂透: 'matrix-649-refresh-v2',
} as const;
type Lottery = keyof typeof jobNameByLottery;
const lotteries = Object.keys(jobNameByLottery) as Lottery[];
const jobStatuses = ['running', 'success', 'failed'] as const;
const analysisStatuses = ['running', 'complete', 'failed'] as const;
const analysisPhases = ['explore', 'tianyan', 'tiangong', 'status', 'complete'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);
const includes = <T extends string>(values: readonly T[], value: unknown): value is T =>
  isString(value) && values.includes(value as T);

function parseHealth(value: unknown): RailwayHealth | null {
  if (!isRecord(value) || value.status !== 'ok') return null;
  if (!isString(value.service) || !isString(value.version)) return null;
  if (!isRecord(value.database) || value.database.status !== 'ok') return null;
  return {
    status: 'ok',
    service: value.service,
    version: value.version,
    database: { status: 'ok' },
  };
}

function parseJob(
  value: unknown,
  lottery: Lottery,
  jobName: string,
): RailwayJob | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (value.lottery !== lottery || value.jobName !== jobName) return undefined;
  if (!includes(jobStatuses, value.status)) return undefined;
  if (!isString(value.startedAt) || !isNullableString(value.finishedAt)) return undefined;
  if (!('error' in value) || !isNullableString(value.error)) return undefined;
  if (!isString(value.updatedAt)) return undefined;
  return {
    jobName,
    lottery,
    status: value.status,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    error: value.error === null ? null : 'WORKER_FAILED',
    updatedAt: value.updatedAt,
  };
}

function parseLatestDraw(value: unknown): RailwayLatestDraw | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (!isString(value.period) || !isNullableString(value.drawDate)) return undefined;
  return { period: value.period, drawDate: value.drawDate };
}

function parseLatestAnalysis(
  value: unknown,
): RailwayLatestAnalysis | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (!isString(value.drawPeriod)) return undefined;
  if (!includes(analysisStatuses, value.status)) return undefined;
  if (!includes(analysisPhases, value.phase)) return undefined;
  if (!isString(value.startedAt) || !isNullableString(value.completedAt)) return undefined;
  if (!('error' in value) || !isNullableString(value.error)) return undefined;
  return {
    drawPeriod: value.drawPeriod,
    status: value.status,
    phase: value.phase,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    error: value.error === null ? null : 'ANALYSIS_FAILED',
  };
}

function parseJobItem(value: unknown): RailwayJobItem | null {
  if (!isRecord(value) || !isString(value.lottery)) return null;
  if (!(value.lottery in jobNameByLottery)) return null;
  const lottery = value.lottery as Lottery;
  const jobName = jobNameByLottery[lottery];
  if (value.jobName !== jobName) return null;
  const job = parseJob(value.job, lottery, jobName);
  const latestDraw = parseLatestDraw(value.latestDraw);
  const latestAnalysis = parseLatestAnalysis(value.latestAnalysis);
  if (job === undefined || latestDraw === undefined || latestAnalysis === undefined) return null;
  return { lottery, jobName, job, latestDraw, latestAnalysis };
}

function parseJobs(value: unknown): RailwayJobs | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length !== 4) {
    return null;
  }
  const byLottery = new Map<Lottery, RailwayJobItem>();
  for (const raw of value.items) {
    const item = parseJobItem(raw);
    if (!item || byLottery.has(item.lottery)) return null;
    byLottery.set(item.lottery, item);
  }
  if (byLottery.size !== lotteries.length) return null;
  return { items: lotteries.map((lottery) => byLottery.get(lottery)!) };
}

const unavailable = (): WorkerStatus => ({
  ok: false,
  health: null,
  jobs: null,
});
```

- [ ] **Step 4: Implement secret loading and the shared five-second deadline**

Implement the loader:

```ts
export async function getWorkerConfig(reader: SecretReader): Promise<WorkerConfig | null> {
  try {
    const names = await reader.listSecretNames();
    if (!names.includes('RAILWAY_WORKER_URL') || !names.includes('MATRIX_ADMIN_STATUS_TOKEN')) {
      return null;
    }
    const [baseUrlValue, tokenValue] = await Promise.all([
      reader.readSecret('RAILWAY_WORKER_URL'),
      reader.readSecret('MATRIX_ADMIN_STATUS_TOKEN'),
    ]);
    const baseUrl = String(baseUrlValue ?? '').trim().replace(/\/+$/, '');
    const statusToken = String(tokenValue ?? '').trim();
    return baseUrl && statusToken ? { baseUrl, statusToken } : null;
  } catch {
    return null;
  }
}
```

Implement the request boundary:

```ts
export function createWorkerApi(
  loadConfig: WorkerConfigLoader,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5_000,
) {
  return {
    async getStatus(): Promise<WorkerStatus> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('WORKER_STATUS_TIMEOUT'));
        }, timeoutMs);
      });
      const work = (async (): Promise<WorkerStatus> => {
        const config = await loadConfig();
        const baseUrl = config?.baseUrl.trim().replace(/\/+$/, '') ?? '';
        const statusToken = config?.statusToken.trim() ?? '';
        if (!baseUrl || !statusToken || controller.signal.aborted) return unavailable();
        const [healthResponse, jobsResponse] = await Promise.all([
          fetcher(`${baseUrl}/health`, {
            signal: controller.signal, redirect: 'error', cache: 'no-store',
          }),
          fetcher(`${baseUrl}/jobs/status`, {
            signal: controller.signal, redirect: 'error', cache: 'no-store',
            headers: { 'X-Matrix-Admin-Token': statusToken },
          }),
        ]);
        if (!healthResponse.ok || !jobsResponse.ok) {
          controller.abort();
          return unavailable();
        }
        const [healthValue, jobsValue] = await Promise.all([
          healthResponse.json(), jobsResponse.json(),
        ]);
        const health = parseHealth(healthValue);
        const jobs = parseJobs(jobsValue);
        return health && jobs ? { ok: true, health, jobs } : unavailable();
      })();
      try {
        return await Promise.race([work, timeout]);
      } catch {
        controller.abort();
        return unavailable();
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}
```

- [ ] **Step 5: Run the adapter tests and verify GREEN**

Run:

```bash
npm run test:unit -- apps/admin/backend/worker-api.test.ts
```

Expected: all adapter tests pass; fake timers report no remaining timer and serialized results contain no raw error or secret.

- [ ] **Step 6: Commit the hardened adapter**

```bash
git add apps/admin/backend/worker-api.ts apps/admin/backend/worker-api.test.ts
git commit -m "fix: harden Railway status adapter"
```

---

### Task 6: Add Railway to the Unified System Status and Wire Routes

**Files:**
- Modify: `apps/admin/backend/connection-status.test.ts`
- Create: `apps/admin/backend/index-wiring.test.ts`
- Modify: `apps/admin/backend/connection-status.ts`
- Modify: `apps/admin/backend/index.ts`
- Modify: `test/appdeploy-sdk.ts`

**Interfaces:**
- Consumes: `getWorkerStatus: () => Promise<WorkerStatus>` and `getWorkerConfig(secrets)` from Task 5.
- Produces: one `railway-worker-api` item inside `/api/system-status`, retry through the existing route, unchanged `/api/algorithm-status` permissions, no standalone `/api/admin/worker/status` route, and safe allowlisted details for the four existing cron cards.

- [ ] **Step 1: Add failing system-status tests**

Add this dependency:

```ts
getWorkerStatus: () => Promise<WorkerStatus>;
```

In the test, add:

```ts
import type { WorkerStatus } from './worker-api';
```

Define one safe dependency result and supply `getWorkerStatus: async () => healthyWorkerStatus` in every existing `createConnectionStatus()` test. Change the existing item count from 12 to 13:

```ts
const healthyWorkerStatus: WorkerStatus = {
  ok: true,
  health: {
    status: 'ok',
    service: 'matrix-railway-api',
    version: 'test-sha',
    database: { status: 'ok' },
  },
  jobs: { items: [] },
};
```

Add the exact success and failure regressions:

```ts
it('includes a healthy Railway item with only the safe adapter detail', async () => {
  const getWorkerStatus = vi.fn(async () => healthyWorkerStatus);
  const status = createConnectionStatus({
    supabase: { selectRows: vi.fn(async () => []) },
    loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
    fetcher: vi.fn(async () => response({ ok: true })),
    getWorkerStatus,
    now: () => new Date('2026-08-21T03:00:00Z'),
  });
  const result = await status.get();
  expect(result.items).toHaveLength(13);
  expect(result.items.find((item) => item.id === 'railway-worker-api')).toMatchObject({
    ok: true,
    retryable: true,
    detail: healthyWorkerStatus,
  });
});

it('does not treat a resolved unavailable object as healthy', async () => {
  const status = createConnectionStatus({
    supabase: { selectRows: vi.fn(async () => []) },
    loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
    fetcher: vi.fn(async () => response({ ok: true })),
    getWorkerStatus: async () => ({ ok: false, health: null, jobs: null }),
    now: () => new Date('2026-08-21T03:00:00Z'),
  });
  const result = await status.get();
  expect(result.items.find((item) => item.id === 'railway-worker-api')).toMatchObject({
    ok: false,
    retryable: true,
    error: 'Railway Worker API 暫時無法使用',
  });
  expect(result.items.find((item) => item.id === 'railway-worker-api')).not.toHaveProperty('detail');
});
```

Add the exact retry test:

```ts
it('retries only the Railway status adapter', async () => {
  const getWorkerStatus = vi.fn(async () => healthyWorkerStatus);
  const fetcher = vi.fn();
  const status = createConnectionStatus({
    supabase: { selectRows: vi.fn(async () => []) },
    loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
    fetcher,
    getWorkerStatus,
  });
  await expect(status.retry('railway-worker-api')).resolves.toMatchObject({
    id: 'railway-worker-api',
    ok: true,
    retryable: true,
  });
  expect(getWorkerStatus).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
});
```

Add a regression proving existing cron rows cannot expose raw Supabase errors:

```ts
it('projects existing cron rows without raw errors', async () => {
  const status = createConnectionStatus({
    supabase: {
      selectRows: vi.fn(async (table: string) => table === 'system_job_status' ? [{
        job_name: 'matrix-539-refresh-v2', lottery: '今彩539', status: 'failed',
        started_at: '2026-08-21T02:00:00Z', finished_at: '2026-08-21T02:00:10Z',
        updated_at: '2026-08-21T02:00:10Z', error: 'password=raw-worker-secret',
        extra: 'raw-row-secret',
      }] : [],
    },
    loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
    fetcher: vi.fn(async () => response({ ok: true })),
    getWorkerStatus: async () => healthyWorkerStatus,
  });
  const result = await status.get();
  const item = result.items.find((entry) => entry.id === 'cron-matrix-539-refresh-v2');
  expect(item?.detail).toEqual({
    jobName: 'matrix-539-refresh-v2', lottery: '今彩539', status: 'failed',
    startedAt: '2026-08-21T02:00:00Z', finishedAt: '2026-08-21T02:00:10Z',
    finished_at: '2026-08-21T02:00:10Z',
    updatedAt: '2026-08-21T02:00:10Z', error: 'WORKER_FAILED',
  });
  expect(JSON.stringify(item)).not.toMatch(/raw-worker-secret|raw-row-secret/);
});
```

Create `index-wiring.test.ts` using the existing Vitest alias for `@appdeploy/sdk`. Mock only the Worker and connection-status factories, import the real `handler`, and assert the actual route object and dependency behavior:

```ts
import { describe, expect, it, vi } from 'vitest';

const wiring = vi.hoisted(() => {
  const workerGetStatus = vi.fn(async () => ({
    ok: false, health: null, jobs: null,
  }));
  const getWorkerConfig = vi.fn(async () => ({
    baseUrl: 'https://railway.example', statusToken: 'server-token',
  }));
  const createWorkerApi = vi.fn(() => ({ getStatus: workerGetStatus }));
  const createConnectionStatus = vi.fn(() => ({
    get: vi.fn(), retry: vi.fn(),
  }));
  return { workerGetStatus, getWorkerConfig, createWorkerApi, createConnectionStatus };
});

vi.mock('./worker-api', () => ({
  createWorkerApi: wiring.createWorkerApi,
  getWorkerConfig: wiring.getWorkerConfig,
}));
vi.mock('./connection-status', () => ({
  createConnectionStatus: wiring.createConnectionStatus,
}));

import { secrets as appDeploySecrets } from '@appdeploy/sdk';
import { handler } from './index';

const routes = handler as unknown as Record<string, unknown[]>;

describe('admin Railway route wiring', () => {
  it('keeps the system and legacy routes without a duplicate Railway route', () => {
    expect(routes).toHaveProperty('GET /api/algorithm-status');
    expect(routes).toHaveProperty('GET /api/system-status');
    expect(routes).toHaveProperty('POST /api/system-status/:id/retry');
    expect(routes).not.toHaveProperty('GET /api/admin/worker/status');
  });

  it('loads both Railway secrets and passes Worker status into system status', async () => {
    const loadConfig = wiring.createWorkerApi.mock.calls[0][0];
    await loadConfig();
    expect(wiring.getWorkerConfig).toHaveBeenCalledWith(appDeploySecrets);
    const dependencies = wiring.createConnectionStatus.mock.calls[0][0];
    await dependencies.getWorkerStatus();
    expect(wiring.workerGetStatus).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm run test:unit -- apps/admin/backend/connection-status.test.ts apps/admin/backend/index-wiring.test.ts
```

Expected: FAIL because the dependency and Railway item do not exist and the standalone route still exists.

- [ ] **Step 3: Add the explicit Railway status item**

Import `WorkerStatus`, add `getWorkerStatus` to `Dependencies`, and append this core check:

```ts
{
  id: 'railway-worker-api',
  name: 'Railway Worker API',
  description: '顯示 Railway 自動計算服務與工作狀態。',
  retryable: true,
  operation: async () => {
    const status = await dependencies.getWorkerStatus();
    if (!status.ok) throw new Error('Railway Worker API 暫時無法使用');
    return status;
  },
},
```

Do not add TSX/CSS. The existing generic renderer will display the 13th item.

For the four existing cron cards, project only `jobName`, `lottery`, `status`, `startedAt`, `finishedAt`, the legacy-safe `finished_at` alias, `updatedAt`, and `error`. Map any stored error to `WORKER_FAILED`; use only a generic display error such as `排程狀態：failed`. Never put the original Supabase row in `detail`.

- [ ] **Step 4: Wire the config loader and remove the duplicate route**

In `index.ts`, use:

```ts
import { algorithmApi } from './algorithm-api';
import { createWorkerApi, getWorkerConfig } from './worker-api';

const workerApi = createWorkerApi(() => getWorkerConfig(secrets));
const connectionStatus = createConnectionStatus({
  supabase,
  loadConfig: () => getSupabaseConfig(secrets),
  getWorkerStatus: () => workerApi.getStatus(),
});
```

Remove the old `loadWorkerBaseUrl`, the Railway argument to `createAlgorithmApi`, and this duplicate route:

```ts
'GET /api/admin/worker/status'
```

Leave these guards unchanged:

```ts
'GET /api/algorithm-status': [requireAuth(), guard('view'), async () =>
  json(await algorithmApi.getAlgorithmStatus())],

'GET /api/system-status': [requireAuth(), moduleGuard('systemSettings', 'view'), async () =>
  json(await connectionStatus.get())],

'POST /api/system-status/:id/retry': [requireAuth(), moduleGuard('systemSettings', 'view'), async (ctx: Context) => {
  try {
    return json({ item: await connectionStatus.retry(ctx.params.id) });
  } catch (cause) {
    return fail(cause);
  }
}],
```

- [ ] **Step 5: Run the tests and verify GREEN**

Run:

```bash
npm run test:unit -- apps/admin/backend/connection-status.test.ts apps/admin/backend/index-wiring.test.ts
```

Expected: all tests pass; total system-status items are 13, `{ok:false}` is shown as failed, retry calls only the Railway adapter, and the duplicate route is absent.

- [ ] **Step 6: Commit the unified status wiring**

```bash
git add apps/admin/backend/connection-status.ts apps/admin/backend/connection-status.test.ts apps/admin/backend/index.ts apps/admin/backend/index-wiring.test.ts test/appdeploy-sdk.ts
git commit -m "feat: expose Railway status in system settings"
```

---

### Task 7: Verify Phase 1 Without Hiding the Known Root-Test Baseline

**Files:**
- Verify: `services/matrix-api/**`
- Verify: `apps/admin/backend/**`
- Verify: repository build and diff

**Interfaces:**
- Consumes: all Task 1–6 commits plus pre-existing `601c7f2` and `9385a15`.
- Produces: explicit evidence for PR #156 review without changing UI tests or weakening CI.

- [ ] **Step 1: Run the complete Railway suite**

```bash
cd services/matrix-api
uv run pytest -q
```

Expected: all Matrix API tests pass; baseline before these tasks was 181 passed.

- [ ] **Step 2: Run every changed AppDeploy backend test**

Run from repository root:

```bash
npm run test:unit -- apps/admin/backend/algorithm-api.test.ts apps/admin/backend/worker-api.test.ts apps/admin/backend/connection-status.test.ts apps/admin/backend/index-wiring.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 3: Run the repository production build**

```bash
npm run build
```

Expected: TypeScript/Vite/Sites packaging succeeds. This command does not prove the AppDeploy backend SDK compiles; the backend files are verified by the focused Vitest files and later AppDeploy deployment compiler.

- [ ] **Step 4: Verify diff scope and secret boundaries**

```bash
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
rg -n "GET /api/admin/worker/status" apps/admin/backend/index.ts
git status --short --branch
```

Expected:

- `git diff --check` has no output.
- No `src/**`, `apps/admin/src/**`, CSS, migration or algorithm file appears.
- The `rg` command has no output because the duplicate route was removed.
- No secret value is committed; only the approved secret names appear.
- The earlier untracked `2026-08-29-pr156-operational-status-safety.md` remains untouched.

- [ ] **Step 5: Re-run the root test baseline for classification only**

```bash
node --test tests/*.test.mjs
```

Expected: compare names against the recorded 56 known failures. Do not claim the full suite is green, delete conflicting UI tests, or modify UI code in this Phase 1 plan. No newly failing backend/API test name may be introduced.

- [ ] **Step 6: Record the exact verification evidence in the PR handoff**

Record only actual command output: Python pass count, focused Vitest pass count, build result, diff scope, and root failure-name comparison. Do not state that Railway production or AppDeploy production is fixed until the separate deployment phase verifies them.
