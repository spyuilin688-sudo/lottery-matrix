from app.worker_all import _worker_outcome


def test_running_analysis_is_not_reported_as_completed() -> None:
    assert _worker_outcome({"status": "running"}) == "running"


def test_acquired_draw_is_not_reported_as_already_analyzed() -> None:
    assert _worker_outcome({"status": "already-acquired"}) == "already-acquired"
