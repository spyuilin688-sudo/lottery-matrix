import json
from contextlib import contextmanager
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from threading import Thread
from typing import Iterator

import app.api_server as api_server
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


class ExplodingStatusRepository(HttpOperationalRepository):
    def list_job_statuses(self) -> list[dict]:
        raise RuntimeError("fake-database-secret")


@contextmanager
def running_server(repository: InMemoryAnalysisRepository) -> Iterator[tuple[str, int]]:
    class TestHandler(RailwayApiHandler):
        pass

    TestHandler.repository = repository
    server = ThreadingHTTPServer(("127.0.0.1", 0), TestHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        yield str(host), int(port)
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()


def request(
    address: tuple[str, int],
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
):
    connection = HTTPConnection(*address, timeout=2)
    connection.request(method, path, body=body, headers=headers or {})
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response, body


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
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert "X-Matrix-Admin-Token" not in str(
            response.getheader("Access-Control-Allow-Headers")
        )


def test_non_get_protected_status_response_has_no_store_and_no_cors(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "POST", "/jobs/status")
        assert response.status == 404
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None


def test_manual_refresh_is_protected_and_not_cors_accessible(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    with running_server(HttpOperationalRepository()) as address:
        response, _ = request(address, "POST", "/jobs/refresh")
        assert response.status == 403
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None


def test_manual_refresh_returns_only_the_latest_draw(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = HttpOperationalRepository()
    calls: list[tuple[str, InMemoryAnalysisRepository]] = []

    def refresh(lottery: str, requested_repository: InMemoryAnalysisRepository) -> dict:
        calls.append((lottery, requested_repository))
        return {
            "lottery": lottery,
            "period": "115000211",
            "drawDate": "2026-09-01",
            "numbers": ["01", "02", "03", "04", "05"],
        }

    monkeypatch.setattr(api_server, "refresh_latest_draw", refresh)
    with running_server(repository) as address:
        response, body = request(
            address,
            "POST",
            "/jobs/refresh",
            {
                "Content-Type": "application/json",
                "X-Matrix-Admin-Token": "expected-token",
            },
            json.dumps({"lottery": "今彩539"}).encode("utf-8"),
        )
        assert response.status == 200
        assert response.getheader("Cache-Control") == "no-store"
        assert response.getheader("Access-Control-Allow-Origin") is None
        assert json.loads(body) == {
            "lottery": "今彩539",
            "period": "115000211",
            "drawDate": "2026-09-01",
        }
    assert calls == [("今彩539", repository)]


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
            address,
            "GET",
            "/jobs/status?token=fake-log-secret",
        )
        assert response.status == 403
    assert "fake-log-secret" not in capsys.readouterr().out


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
