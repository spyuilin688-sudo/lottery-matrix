from datetime import datetime
from zoneinfo import ZoneInfo

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")


class UnexpectedSource:
    def fetch(self, lottery: str) -> dict:
        raise AssertionError("source must not be called after the current draw is stored")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        raise AssertionError("source must not be called after the current draw is stored")


def _stored_draw(period: int, draw_date: str) -> dict:
    return {
        "lottery": "今彩539",
        "period": str(period).zfill(9),
        "drawDate": draw_date,
        "numbers": ["01", "02", "03", "04", "05"],
    }


def test_scheduled_worker_resumes_analysis_after_current_draw_is_already_stored() -> None:
    repository = InMemoryAnalysisRepository()
    for offset in range(80):
        repository.upsert_draw(_stored_draw(221 - offset, "2026-08-28" if offset == 0 else "2026-08-27"))

    calls: list[str] = []

    def build(kind: str):
        def selected(_: dict) -> dict:
            calls.append(kind)
            return {"kind": kind}
        return selected

    builders = {kind: build(kind) for kind in ("explore", "tianyan", "tiangong", "status")}

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI),
        repository,
        UnexpectedSource(),
        builders,
    )

    assert result["status"] == "complete"
    assert result["analysisVersion"] == "000000221:matrix-python-v3"
    assert calls == ["explore", "tianyan", "tiangong", "status"]
