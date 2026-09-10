from __future__ import annotations

from app import analysis_worker, worker
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.notification_events import matrix_card_event, matrix_status_event
from tests.test_worker_notifications import NotificationSource, _builders, _due_time
from tests.test_analysis_worker_notifications import _repository, _builders as fantasy_builders


class Capture:
    enabled = True

    def __init__(self):
        self.events = []

    def emit(self, event):
        self.events.append(event)
        return {"created": True, "eventKey": event["eventKey"]}


def test_card_uses_the_draw_date_even_when_notification_is_created_later():
    event = matrix_card_event({"lottery": "今彩539", "period": "115000216", "drawDate": "2026-09-05"})
    assert event["payload"].get("drawDate") == "2026-09-05"


def test_status_uses_the_corresponding_draw_date():
    event = matrix_status_event("今彩539", "115000216", {"summary": {"status": "CRITICAL"}}, draw_date="2026-09-05")
    assert event["payload"]["drawDate"] == "2026-09-05"


def test_published_card_does_not_notify_before_full_analysis_completes(monkeypatch):
    repository = InMemoryAnalysisRepository()
    capture = Capture()
    monkeypatch.setattr(worker, "_card_ready", lambda *_: True)
    monkeypatch.setattr(worker, "_run_analysis", lambda *_: {"status": "running"})
    result = worker.run_scheduled_worker("今彩539", _due_time(), repository, NotificationSource(), _builders(), notification_emitter=capture)
    assert result["status"] == "running"
    assert [event["eventType"] for event in capture.events] == ["lottery_result"]


def test_completed_analysis_emits_card_and_status_with_the_same_draw_date(monkeypatch):
    repository = InMemoryAnalysisRepository()
    capture = Capture()
    monkeypatch.setattr(worker, "_card_ready", lambda *_: True)
    result = worker.run_scheduled_worker("今彩539", _due_time(), repository, NotificationSource(), _builders(), notification_emitter=capture)
    assert result["status"] == "complete"
    events = {event["eventType"]: event for event in capture.events}
    assert set(events) == {"lottery_result", "matrix_card", "matrix_status"}
    assert all(event["payload"].get("drawDate") == "2026-08-28" for event in events.values())


def test_fantasy5_published_card_waits_for_analysis_completion(monkeypatch):
    capture = Capture()
    monkeypatch.setattr(analysis_worker, "is_card_published", lambda *_: True)
    monkeypatch.setattr(analysis_worker, "_run_analysis", lambda *_: {"status": "running"})
    result = analysis_worker.run_analysis_only_worker("天天樂", _repository(), fantasy_builders(), notification_emitter=capture)
    assert result["status"] == "running"
    assert [event["eventType"] for event in capture.events] == ["lottery_result"]


def test_fantasy5_backlog_does_not_notify_an_older_draw(monkeypatch):
    repository = _repository()
    candidates = repository.list_draws("天天樂", 2)
    capture = Capture()
    monkeypatch.setattr(analysis_worker, "_select_analysis_draw", lambda *_: candidates[1])
    monkeypatch.setattr(analysis_worker, "_run_analysis", lambda *_: {"status": "complete"})
    analysis_worker.run_analysis_only_worker("天天樂", repository, fantasy_builders(), notification_emitter=capture)
    assert capture.events
    assert all(event["payload"]["period"] == candidates[0]["period"] for event in capture.events)

