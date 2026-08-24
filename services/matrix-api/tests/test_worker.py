import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import run_worker


class Source:
    def fetch(self, lottery: str) -> dict:
        count = 5 if lottery in {"今彩539", "天天樂"} else 7
        return {
            "period": "114000123", "drawDate": "2026-08-24",
            "numbers": [str(value).zfill(2) for value in range(1, count + 1)],
        }


def _builders(calls: list[str], failing: str | None = None) -> dict:
    def build(kind: str):
        def selected(_: dict) -> dict:
            calls.append(kind)
            if kind == failing:
                raise RuntimeError("builder failed")
            return {"kind": kind}
        return selected
    return {kind: build(kind) for kind in ("explore", "tianyan", "tiangong", "status")}


def test_worker_refreshes_history_and_publishes_four_artifacts_in_order() -> None:
    repository = InMemoryAnalysisRepository()
    calls: list[str] = []
    result = run_worker("今彩539", repository, Source(), _builders(calls))
    assert result["status"] == "complete"
    assert calls == ["explore", "tianyan", "tiangong", "status"]
    assert repository.list_draws("今彩539", 80)[0]["period"] == "114000123"


def test_worker_failure_does_not_replace_an_existing_completed_lottery() -> None:
    repository = InMemoryAnalysisRepository()
    run_worker("今彩539", repository, Source(), _builders([]))
    with pytest.raises(RuntimeError, match="builder failed"):
        run_worker("大樂透", repository, Source(), _builders([], failing="tianyan"))
    assert repository.read_completed_artifact("今彩539", "114000123", "status") == {"kind": "status"}
    assert repository.get_progress("大樂透", "114000123")["status"] == "failed"
