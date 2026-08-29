from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.analysis_pipeline import AnalysisPipeline
import pytest


DRAW = {
    "lottery": "今彩539",
    "period": "114000123",
    "drawDate": "2026-08-24",
    "numbers": ["01", "02", "03", "04", "05"],
}


class RepositorySpy(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[str] = []
        self.materialize_calls = 0

    def save_artifact_chunk(
        self, lottery: str, draw_period: str, analysis_version: str, kind: str,
        chunk_index: int, cursor_start: int, cursor_end: int, payload: object,
    ) -> None:
        self.calls.append(f"save_artifact_chunk:{kind}:{chunk_index}")
        super().save_artifact_chunk(
            lottery, draw_period, analysis_version, kind,
            chunk_index, cursor_start, cursor_end, payload,
        )

    def update_progress(
        self, lottery: str, draw_period: str, analysis_version: str,
        phase: str, cursor: int, total: int,
    ) -> None:
        self.calls.append(f"update_progress:{phase}:{cursor}")
        super().update_progress(lottery, draw_period, analysis_version, phase, cursor, total)

    def get_progress(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str | None = None,
    ) -> dict | None:
        self.calls.append("get_progress")
        return super().get_progress(lottery, draw_period, analysis_version)

    def read_artifact(
        self, lottery: str, draw_period: str, analysis_version: str, kind: str,
    ) -> object | None:
        self.calls.append(f"read_artifact:{kind}")
        return super().read_artifact(lottery, draw_period, analysis_version, kind)

    def materialize_artifact(
        self, lottery: str, draw_period: str, analysis_version: str,
        kind: str, expected_total: int,
    ) -> dict:
        self.calls.append(f"materialize_artifact:{kind}")
        self.materialize_calls += 1
        return super().materialize_artifact(
            lottery, draw_period, analysis_version, kind, expected_total,
        )


def checkpoint_builders(total: int) -> dict:
    def explore(context: dict) -> dict:
        start = context["exploreBatch"]["start"]
        stop = min(total, start + context["exploreBatch"]["limit"])
        return {
            "artifact": {"items": list(range(start, stop)), "validationById": {}},
            "_checkpoint": {
                "cursorStart": start,
                "cursor": stop,
                "total": total,
                "complete": stop == total,
            },
        }

    return {
        "explore": explore,
        "tianyan": lambda context: {"source": context["artifacts"]["explore"]["items"]},
        "tiangong": lambda _: {"items": []},
        "status": lambda context: {"source": context["artifacts"]["tianyan"]["source"]},
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
        artifact = {"items": list(range(start, stop)), "validationById": {}}
        return {
            "artifact": artifact,
            "_checkpoint": {
                "cursorStart": start,
                "cursor": stop,
                "total": 3,
                "complete": stop == 3,
            },
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


def test_incomplete_explore_saves_delta_before_progress_without_cumulative_read() -> None:
    repository = RepositorySpy()

    result = AnalysisPipeline(
        repository, checkpoint_builders(total=3), analysis_version="v1", explore_batch_size=2,
    ).run(DRAW, history=[])

    assert result["status"] == "running"
    assert repository.calls == [
        "save_artifact_chunk:explore:0",
        "update_progress:explore:2",
        "get_progress",
    ]
    assert "read_artifact:explore" not in repository.calls
    assert "materialize_artifact:explore" not in repository.calls


def test_final_explore_batch_materializes_once_and_publishes_manifest() -> None:
    repository = RepositorySpy()
    pipeline = AnalysisPipeline(
        repository, checkpoint_builders(total=3), analysis_version="v1", explore_batch_size=2,
    )

    first = pipeline.run(DRAW, history=[])
    second = pipeline.run(DRAW, history=[])

    assert first["status"] == "running"
    assert second["status"] == "complete"
    assert repository.materialize_calls == 1
    manifest = repository.artifacts[("今彩539", "114000123", "v1", "explore")]["payload"]
    assert manifest["storage"] == "chunks"
    assert manifest["cursor"] == 3
    assert repository.read_completed_artifact("今彩539", "114000123", "status") == {
        "source": [0, 1, 2],
    }


def test_retry_after_final_explore_publication_does_not_overwrite_final_chunk() -> None:
    repository = InMemoryAnalysisRepository()
    base_builders = checkpoint_builders(total=3)
    explore_starts: list[int] = []
    tianyan_attempts = 0

    def explore(context: dict) -> dict:
        explore_starts.append(context["exploreBatch"]["start"])
        return base_builders["explore"](context)

    def tianyan(context: dict) -> dict:
        nonlocal tianyan_attempts
        tianyan_attempts += 1
        if tianyan_attempts == 1:
            raise RuntimeError("tianyan failed")
        return {"source": context["artifacts"]["explore"]["items"]}

    builders = {**base_builders, "explore": explore, "tianyan": tianyan}
    pipeline = AnalysisPipeline(
        repository, builders, analysis_version="v1", explore_batch_size=2,
    )

    first = pipeline.run(DRAW, history=[])
    with pytest.raises(RuntimeError, match="tianyan failed"):
        pipeline.run(DRAW, history=[])
    retried = pipeline.run(DRAW, history=[])

    assert first["status"] == "running"
    assert retried["status"] == "complete"
    assert explore_starts == [0, 2]
    assert [
        (chunk["chunk_index"], chunk["cursor_start"], chunk["cursor_end"])
        for chunk in repository.read_artifact_chunks("今彩539", "114000123", "v1", "explore")
    ] == [(0, 0, 2), (1, 2, 3)]
    assert repository.read_completed_artifact("今彩539", "114000123", "status") == {
        "source": [0, 1, 2],
    }


def test_pipeline_resumes_checkpointed_tiangong_and_materializes_chunks() -> None:
    repository = InMemoryAnalysisRepository()
    starts: list[int] = []

    def tiangong(context: dict) -> dict:
        start = context["tiangongBatch"]["start"]
        starts.append(start)
        stop = min(2, start + context["tiangongBatch"]["limit"])
        identifier = f"road-{start}"
        return {
            "artifact": {
                "items": [{"id": identifier}],
                "validationById": {identifier: {"itemId": identifier}},
            },
            "_checkpoint": {
                "cursorStart": start, "cursor": stop, "total": 2, "complete": stop == 2,
            },
        }

    builders = {
        "explore": lambda _: {"items": [], "validationById": {}},
        "tianyan": lambda _: {"items": []},
        "tiangong": tiangong,
        "status": lambda context: {
            "ids": [item["id"] for item in context["artifacts"]["tiangong"]["items"]],
        },
    }
    pipeline = AnalysisPipeline(
        repository, builders, analysis_version="v1", tiangong_batch_size=1,
    )

    first = pipeline.run(DRAW, history=[])
    second = pipeline.run(DRAW, history=[])

    assert first["status"] == "running"
    assert first["phase"] == "tiangong"
    assert first["cursor"] == 1
    assert second["status"] == "complete"
    assert starts == [0, 1]
    manifest = repository.artifacts[("今彩539", "114000123", "v1", "tiangong")]["payload"]
    assert manifest["storage"] == "chunks"
    assert repository.read_completed_artifact("今彩539", "114000123", "status") == {
        "ids": ["road-0", "road-1"],
    }
