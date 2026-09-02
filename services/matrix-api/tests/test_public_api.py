from __future__ import annotations

import json
from urllib.parse import quote

import httpx
import pytest
from postgrest import SyncPostgrestClient

import app.api_server as api_server
from app.api_server import handle_api_request
from app.repositories.analysis_repository import (
    InMemoryAnalysisRepository,
    SupabaseAnalysisRepository,
)


def _draw(lottery: str, period: str, draw_date: str, numbers: list[str], draw_order: list[str] | None = None) -> dict:
    return {
        "lottery": lottery,
        "period": period,
        "drawDate": draw_date,
        "numbers": numbers,
        "sortedNumbers": numbers,
        "drawOrderNumbers": draw_order,
    }


def _repository() -> InMemoryAnalysisRepository:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(_draw("今彩539", "003115", "2026-08-26", ["01", "02", "03", "04", "05"], ["05", "04", "03", "02", "01"]))
    repository.upsert_draw(_draw("今彩539", "003116", "2026-08-27", ["06", "07", "08", "09", "10"], ["10", "09", "08", "07", "06"]))
    repository.upsert_draw(_draw("今彩539", "003117", "2026-08-28", ["01", "07", "11", "20", "39"], ["39", "20", "11", "07", "01"]))
    return repository


class OperationalRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.health_checks = 0
        self.status_reads = 0
        self.status_rows = [{
            "lottery": "今彩539",
            "jobName": "matrix-539-refresh-v2",
            "job": {"status": "success"},
            "latestDraw": {"period": "003117"},
            "latestAnalysis": {"status": "complete"},
        }]

    def health_check(self) -> None:
        self.health_checks += 1

    def list_job_statuses(self) -> list[dict]:
        self.status_reads += 1
        return list(self.status_rows)


class OfflineOperationalRepository(OperationalRepository):
    def health_check(self) -> None:
        self.health_checks += 1
        raise RuntimeError("database offline")


def test_health_checks_database_and_reports_service_metadata(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_SERVICE_VERSION", "test-version")
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = OperationalRepository()

    status, payload = handle_api_request("GET", "/health", None, repository)

    assert status == 200
    assert repository.health_checks == 1
    assert payload == {
        "status": "ok",
        "service": "matrix-railway-api",
        "version": "test-version",
        "database": {"status": "ok"},
        "adminApi": {"status": "ok"},
    }


def test_health_reports_missing_admin_api_configuration(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_SERVICE_VERSION", "test-version")
    monkeypatch.delenv("MATRIX_ADMIN_STATUS_TOKEN", raising=False)
    repository = OperationalRepository()

    status, payload = handle_api_request("GET", "/health", None, repository)

    assert status == 200
    assert payload == {
        "status": "ok",
        "service": "matrix-railway-api",
        "version": "test-version",
        "database": {"status": "ok"},
        "adminApi": {"status": "misconfigured"},
    }


def test_health_returns_503_when_database_probe_fails(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_SERVICE_VERSION", "test-version")
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = OfflineOperationalRepository()

    status, payload = handle_api_request("GET", "/health", None, repository)

    assert status == 503
    assert repository.health_checks == 1
    assert payload == {
        "status": "error",
        "service": "matrix-railway-api",
        "version": "test-version",
        "database": {"status": "error"},
        "adminApi": {"status": "ok"},
    }


def test_jobs_status_returns_repository_operational_rows(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = OperationalRepository()

    status, payload = handle_api_request(
        "GET",
        "/jobs/status",
        None,
        repository,
        request_monitor_token="expected-token",
    )

    assert status == 200
    assert payload == {"items": repository.status_rows}
    assert repository.status_reads == 1


@pytest.mark.parametrize(
    ("configured", "supplied"),
    [
        ("expected-token", None),
        ("expected-token", "wrong-token"),
        ("", "expected-token"),
    ],
)
def test_jobs_status_rejects_invalid_configuration_or_token(
    monkeypatch,
    configured: str,
    supplied: str | None,
) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", configured)
    repository = OperationalRepository()

    status, payload = handle_api_request(
        "GET",
        "/jobs/status",
        None,
        repository,
        request_monitor_token=supplied,
    )

    assert status == 403
    assert payload == {"error": "FORBIDDEN"}
    assert repository.status_reads == 0


def test_jobs_status_accepts_the_configured_header_token(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = OperationalRepository()

    status, payload = handle_api_request(
        "GET",
        "/jobs/status",
        None,
        repository,
        request_monitor_token="expected-token",
    )

    assert status == 200
    assert payload == {"items": repository.status_rows}
    assert repository.status_reads == 1


def test_jobs_status_rejects_a_query_string_token(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = OperationalRepository()

    status, payload = handle_api_request(
        "GET",
        "/jobs/status?token=expected-token",
        None,
        repository,
    )

    assert status == 403
    assert payload == {"error": "FORBIDDEN"}
    assert repository.status_reads == 0


def test_jobs_status_uses_constant_time_byte_comparison(monkeypatch) -> None:
    calls: list[tuple[bytes, bytes]] = []

    def spy(candidate: bytes, expected: bytes) -> bool:
        calls.append((candidate, expected))
        return False

    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    monkeypatch.setattr(api_server, "compare_digest", spy)
    status, payload = handle_api_request(
        "GET",
        "/jobs/status",
        None,
        OperationalRepository(),
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
        "GET",
        "/jobs/status",
        None,
        ExplodingStatusRepository(),
        request_monitor_token="expected-token",
    )
    assert (status, payload) == (503, {"error": "STATUS_UNAVAILABLE"})
    assert "fake-database-secret" not in str(payload)


def test_jobs_refresh_requires_the_admin_token_and_returns_only_the_latest_draw(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = OperationalRepository()
    calls: list[str] = []

    def refresh(lottery: str, _repository: InMemoryAnalysisRepository) -> dict:
        calls.append(lottery)
        return _draw(
            lottery,
            "115000211",
            "2026-09-01",
            ["01", "02", "03", "04", "05"],
        )

    status, payload = handle_api_request(
        "POST",
        "/jobs/refresh",
        json.dumps({"lottery": "今彩539"}, ensure_ascii=False).encode("utf-8"),
        repository,
        request_monitor_token="expected-token",
        refresh_lottery=refresh,
    )

    assert (status, payload) == (200, {
        "lottery": "今彩539",
        "period": "115000211",
        "drawDate": "2026-09-01",
    })
    assert calls == ["今彩539"]


def test_jobs_refresh_does_not_invoke_the_crawler_without_a_valid_admin_token(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    calls: list[str] = []

    status, payload = handle_api_request(
        "POST",
        "/jobs/refresh",
        json.dumps({"lottery": "今彩539"}, ensure_ascii=False).encode("utf-8"),
        OperationalRepository(),
        request_monitor_token="wrong-token",
        refresh_lottery=lambda lottery, _: calls.append(lottery) or {},
    )

    assert (status, payload) == (403, {"error": "FORBIDDEN"})
    assert calls == []


def test_jobs_refresh_hides_upstream_failure_details(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")

    def refresh(_lottery: str, _repository: InMemoryAnalysisRepository) -> dict:
        raise RuntimeError("source api key fake-secret")

    status, payload = handle_api_request(
        "POST",
        "/jobs/refresh",
        json.dumps({"lottery": "今彩539"}, ensure_ascii=False).encode("utf-8"),
        OperationalRepository(),
        request_monitor_token="expected-token",
        refresh_lottery=refresh,
    )

    assert (status, payload) == (503, {"error": "REFRESH_UNAVAILABLE"})
    assert "fake-secret" not in str(payload)


def test_refresh_latest_draw_upserts_one_formal_latest_draw(monkeypatch) -> None:
    repository = InMemoryAnalysisRepository()
    source = type("Source", (), {
        "fetch": lambda self, _lottery: _draw(
            "今彩539",
            "115000211",
            "2026-09-01",
            ["01", "02", "03", "04", "05"],
        ),
    })()
    client_options: list[dict] = []

    class Client:
        def __init__(self, **options: object) -> None:
            client_options.append(options)

        def __enter__(self):
            return self

        def __exit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(api_server, "httpx", type("Httpx", (), {"Client": Client}), raising=False)
    monkeypatch.setattr(api_server, "LatestDrawSource", lambda _: source, raising=False)
    monkeypatch.setattr(api_server, "create_railway_ssl_context", lambda: "ssl-context", raising=False)

    draw = api_server.refresh_latest_draw("今彩539", repository)

    assert draw["period"] == "115000211"
    assert repository.list_draws("今彩539", 1)[0]["period"] == "115000211"
    assert client_options == [{"verify": "ssl-context"}]


class ExplodingHistoryRepository(InMemoryAnalysisRepository):
    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict]:
        raise RuntimeError("fake-public-database-secret")


def test_unexpected_public_error_is_stable() -> None:
    status, payload = handle_api_request(
        "GET",
        "/api/matrix/latest/%E4%BB%8A%E5%BD%A9539",
        None,
        ExplodingHistoryRepository(),
    )
    assert (status, payload) == (500, {"error": "INTERNAL_ERROR"})
    assert "fake-public-database-secret" not in str(payload)


def test_latest_and_history_are_read_from_repository() -> None:
    repository = _repository()
    lottery = quote("今彩539")

    status, latest = handle_api_request("GET", f"/api/matrix/latest/{lottery}", None, repository)
    assert status == 200
    assert latest["item"]["period"] == "003117"

    status, history = handle_api_request("GET", f"/api/matrix/history/{lottery}?limit=2", None, repository)
    assert status == 200
    assert [item["period"] for item in history["items"]] == ["003117", "003116"]


def test_public_latest_supabase_query_puts_undated_rows_last() -> None:
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
        repository = SupabaseAnalysisRepository(client)
        status, payload = handle_api_request(
            "GET",
            f"/api/matrix/latest/{quote('今彩539')}",
            None,
            repository,
        )

    assert (status, payload) == (200, {"item": None})
    assert len(requests) == 1
    assert requests[0].url.params["order"] == (
        "draw_date.desc.nullslast,period.desc"
    )


def test_history_without_limit_returns_all_rows() -> None:
    repository = _repository()
    status, history = handle_api_request("GET", f"/api/matrix/history/{quote('今彩539')}", None, repository)
    assert status == 200
    assert [item["period"] for item in history["items"]] == ["003117", "003116", "003115"]


def test_tongxing_matches_legacy_appdeploy_semantics() -> None:
    repository = _repository()
    repository.upsert_draw(_draw("今彩539", "003114", "2026-08-25", ["01", "12", "13", "14", "15"]))
    body = json.dumps({
        "lottery": "今彩539",
        "numberOrder": "依號碼由小到大排序",
        "numbers": ["01"],
        "futureOffset": 1,
    }).encode()

    status, payload = handle_api_request("POST", "/api/matrix/tongxing", body, repository)
    assert status == 200
    assert payload["numbers"] == ["01"]
    assert payload["futureOffset"] == 1
    assert [
        (group["lockedEntry"]["period"], group["predictedEntry"]["period"])
        for group in payload["groups"]
    ] == [
        ("003114", "003115"),
        ("003115", "003116"),
    ]


def test_number_reference_preserves_actual_order_and_match_slots() -> None:
    repository = _repository()
    body = json.dumps({
        "lottery": "今彩539",
        "numberOrder": "依實際開獎順序排序",
        "historyRange": 1000,
        "numbers": ["01", "07"],
    }).encode()

    status, payload = handle_api_request("POST", "/api/matrix/number-reference", body, repository)
    assert status == 200
    newest = payload["items"][-1]
    assert newest["period"] == "003117"
    assert newest["numbers"] == ["39", "20", "11", "07", "01"]
    assert newest["matchSlots"] == [0, 0, 0, 2, 1]


def test_invalid_route_is_404() -> None:
    status, payload = handle_api_request("GET", "/missing", None, _repository())
    assert status == 404
    assert payload == {"error": "NOT_FOUND"}
