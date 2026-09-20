from threading import Event
from uuid import uuid4

from app.manual_refresh import InMemoryRefreshStore, ManualRefreshCoordinator


def test_enqueue_returns_before_crawl_and_deduplicates_then_records_result():
    store = InMemoryRefreshStore()
    coordinator = ManualRefreshCoordinator()
    entered, release, done = Event(), Event(), Event()
    def crawl():
        entered.set()
        assert release.wait(2)
        return {"period": "123", "drawDate": "2026-09-20"}
    task = coordinator.enqueue("天天樂", store, crawl, on_done=done.set)
    try:
        assert task["status"] == "accepted"
        assert entered.wait(2)
        duplicate = coordinator.enqueue("天天樂", store, lambda: (_ for _ in ()).throw(AssertionError()))
        assert duplicate["requestId"] == task["requestId"]
        other_process = ManualRefreshCoordinator().enqueue("天天樂", store, lambda: (_ for _ in ()).throw(AssertionError()))
        assert other_process["requestId"] == task["requestId"]
        assert store.get("天天樂", task["requestId"])["status"] == "running"
        assert store.get("今彩539", task["requestId"]) is None
        assert store.get("天天樂", str(uuid4())) is None
    finally:
        release.set()
    assert done.wait(2)
    assert store.get("天天樂", task["requestId"]) == {
        **task, "status": "complete", "period": "123", "drawDate": "2026-09-20", "error": None,
    }


def test_failure_does_not_expose_source_error_or_claim_completion():
    store = InMemoryRefreshStore()
    done = Event()
    def crawl():
        raise RuntimeError("private-token")
    task = ManualRefreshCoordinator().enqueue("天天樂", store, crawl, on_done=done.set)
    assert done.wait(2)
    result = store.get("天天樂", task["requestId"])
    assert result["status"] == "failed"
    assert result["error"] == "REFRESH_FAILED"
    assert "private-token" not in str(result)
    assert result["period"] is None


def test_thread_start_failure_is_terminal(monkeypatch):
    from app import manual_refresh
    monkeypatch.setattr(manual_refresh.Thread, "start", lambda _: (_ for _ in ()).throw(RuntimeError("unavailable")))
    store = InMemoryRefreshStore()
    task = ManualRefreshCoordinator().enqueue("今彩539", store, lambda: {})
    assert task["status"] == "failed"


def test_expired_task_and_old_completion_cannot_overwrite_new_task():
    from datetime import UTC, datetime, timedelta
    store = InMemoryRefreshStore()
    first, second = str(uuid4()), str(uuid4())
    store.claim("天天樂", first)
    store.expires["天天樂"] = datetime.now(UTC) - timedelta(seconds=1)
    assert store.get("天天樂", first)["error"] == "REFRESH_INTERRUPTED"
    assert not store.update("天天樂", first, "complete", period="123")
    assert store.claim("天天樂", second)["requestId"] == second
    assert not store.update("天天樂", first, "failed", error="REFRESH_FAILED")
    assert store.get("天天樂", second)["status"] == "accepted"
