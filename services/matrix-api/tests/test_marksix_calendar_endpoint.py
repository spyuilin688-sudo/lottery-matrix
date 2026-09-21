from types import SimpleNamespace

from app.api_server import handle_api_request
from app.recovery_server import POST_PATHS


def test_calendar_route_requires_worker_token(monkeypatch):
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    called = []
    repository = SimpleNamespace()
    refresh = lambda repo: called.append(repo) or {"status": "synced", "days": 61}

    assert handle_api_request(
        "POST", "/jobs/calendar/marksix", b"{}", repository,
        request_monitor_token="wrong-token", refresh_marksix=refresh,
    ) == (403, {"error": "FORBIDDEN"})
    assert called == []


def test_calendar_route_runs_only_calendar_refresh(monkeypatch):
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    repository = SimpleNamespace()
    calls = []

    status, payload = handle_api_request(
        "POST", "/jobs/calendar/marksix", b"{}", repository,
        request_monitor_token="expected-token",
        refresh_marksix=lambda repo: calls.append(repo) or {"status": "synced", "days": 61},
    )

    assert status == 200
    assert payload == {"lottery": "六合彩", "status": "synced", "days": 61}
    assert calls == [repository]


def test_calendar_route_maps_source_failure_to_service_unavailable(monkeypatch):
    monkeypatch.setenv("MATRIX_ADMIN_STATUS_TOKEN", "expected-token")
    status, payload = handle_api_request(
        "POST", "/jobs/calendar/marksix", b"{}", SimpleNamespace(),
        request_monitor_token="expected-token",
        refresh_marksix=lambda _repo: {"status": "unavailable"},
    )
    assert (status, payload) == (503, {"error": "CALENDAR_UNAVAILABLE"})


def test_recovery_service_allows_calendar_only_route():
    assert "/jobs/calendar/marksix" in POST_PATHS
