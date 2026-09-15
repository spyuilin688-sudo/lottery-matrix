import json
from contextlib import contextmanager
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from threading import Thread
from typing import Iterator

from app.api_server import RailwayApiHandler
from app.repositories.analysis_repository import InMemoryAnalysisRepository


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


def request(address: tuple[str, int], headers: dict[str, str]):
    connection = HTTPConnection(*address, timeout=2)
    connection.request("GET", "/jobs/status", headers=headers)
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response, body


def test_jobs_status_includes_tinyfish_configuration_without_secret(monkeypatch) -> None:
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    monkeypatch.setenv("TINYFISH_API_KEY", "private-tinyfish-secret")
    monkeypatch.setenv("TINYFISH_FETCH_FALLBACK_ENABLED", "true")
    monkeypatch.setenv("TINYFISH_BROWSER_FALLBACK_ENABLED", "false")
    monkeypatch.setenv("TINYFISH_BROWSER_MAX_DURATION_SECONDS", "60")
    repository = InMemoryAnalysisRepository()

    with running_server(repository) as address:
        response, body = request(address, {"X-Matrix-Admin-Token": "expected-token"})

    assert response.status == 200
    payload = json.loads(body)
    assert payload["tinyfish"] == {
        "configured": True,
        "fetchEnabled": True,
        "browserEnabled": False,
        "browserMaxDurationSeconds": 60,
        "lastFallbacks": [],
    }
    assert b"private-tinyfish-secret" not in body
