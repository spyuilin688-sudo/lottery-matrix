from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.analysis_pipeline import AnalysisPipeline
import pytest


DRAW = {
    "lottery": "今彩539",
    "period": "114000123",
    "drawDate": "2026-08-24",
    "numbers": ["01", "02", "03", "04", "05"],
}


def test_pipeline_publishes_only_after_all_four_artifacts_finish() -> None:
    repository = InMemoryAnalysisRepository()
    calls: list[str] = []
    builders = {
        kind: (lambda context, selected=kind: calls.append(selected) or {"kind": selected, "period": context["draw"]["period"]})
        for kind in ("explore", "tianyan", "tiangong", "status")
    }

    result = AnalysisPipeline(repository, builders, analysis_version="matrix-python-v1").run(DRAW, history=[])

    assert result["status"] == "complete"
    assert calls == ["explore", "tianyan", "tiangong", "status"]
    assert repository.read_completed_artifact("今彩539", "114000123", "status") == {
        "kind": "status",
        "period": "114000123",
    }


def test_later_builders_can_consume_earlier_artifacts() -> None:
    repository = InMemoryAnalysisRepository()
    builders = {
        "explore": lambda _: {"items": ["road"]},
        "tianyan": lambda context: {"source": context["artifacts"]["explore"]["items"]},
        "tiangong": lambda _: {"items": []},
        "status": lambda context: {"source": context["artifacts"]["tianyan"]["source"]},
    }
    AnalysisPipeline(repository, builders).run(DRAW, history=[])
    assert repository.read_completed_artifact("今彩539", "114000123", "status") == {"source": ["road"]}


def test_pipeline_failure_marks_run_failed_and_keeps_partial_output_private() -> None:
    repository = InMemoryAnalysisRepository()

    def fail(_: dict) -> dict:
        raise RuntimeError("calculation failed")

    builders = {
        "explore": lambda _: {"items": []},
        "tianyan": fail,
        "tiangong": lambda _: {"items": []},
        "status": lambda _: {"items": []},
    }

    try:
        AnalysisPipeline(repository, builders).run(DRAW, history=[])
    except RuntimeError:
        pass

    progress = repository.get_progress("今彩539", "114000123")
    assert progress is not None
    assert progress["status"] == "failed"
    assert repository.read_completed_artifact("今彩539", "114000123", "explore") is None


def test_completed_version_is_idempotent_and_skips_recalculation() -> None:
    repository = InMemoryAnalysisRepository()
    calls = 0

    def build(_: dict) -> dict:
        nonlocal calls
        calls += 1
        return {"items": []}

    builders = {kind: build for kind in ("explore", "tianyan", "tiangong", "status")}
    pipeline = AnalysisPipeline(repository, builders, analysis_version="v1")
    pipeline.run(DRAW, history=[])
    second = pipeline.run(DRAW, history=[])

    assert second["status"] == "complete"
    assert second["skipped"] is True
    assert calls == 4


def test_pipeline_rejects_incomplete_or_noncanonical_draw_before_writing() -> None:
    repository = InMemoryAnalysisRepository()
    builders = {kind: (lambda _: {}) for kind in ("explore", "tianyan", "tiangong", "status")}
    invalid = {**DRAW, "numbers": ["1", "02", "03", "04", "05"]}

    with pytest.raises(ValueError, match="DRAW_NUMBERS_INVALID"):
        AnalysisPipeline(repository, builders).run(invalid, history=[])

    assert repository.draws == {}

def test_pipeline_resumes_checkpointed_explore_batch() -> None:
    repository = InMemoryAnalysisRepository()

    def explore(context: dict) -> dict:
        batch = context["exploreBatch"]
        start = batch["start"]
        stop = min(3, start + batch["limit"])
        existing = batch["existing"] or {"items": []}
        artifact = {"items": [*existing["items"], *range(start, stop)]}
        return {
            "artifact": artifact,
            "_checkpoint": {"cursor": stop, "total": 3, "complete": stop == 3},
        }

    builders = {
        "explore": explore,
        "tianyan": lambda context: {"source": context["artifacts"]["explore"]["items"]},
        "tiangong": lambda _: {"items": []},
        "status": lambda context: {"source": context["artifacts"]["tianyan"]["source"]},
    }
    pipeline = AnalysisPipeline(repository, builders, explore_batch_size=2)

    first = pipeline.run(DRAW, history=[])
    second = pipeline.run(DRAW, history=[])

    assert first["status"] == "running"
    assert first["cursor"] == 2
    assert second["status"] == "complete"
    assert repository.read_completed_artifact("今彩539", "114000123", "status") == {
        "source": [0, 1, 2],
    }
