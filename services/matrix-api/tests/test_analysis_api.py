from fastapi.testclient import TestClient

from app.main import create_app
from app.repositories.analysis_repository import InMemoryAnalysisRepository


def test_analysis_progress_and_completed_result_endpoints() -> None:
    repository = InMemoryAnalysisRepository()
    repository.begin_run("今彩539", "114000123", "v1", "2026-08-24T10:00:00+00:00")
    app = create_app(repository)
    client = TestClient(app)

    progress = client.get("/v1/analysis/今彩539/114000123/progress")
    assert progress.status_code == 200
    assert progress.json()["status"] == "running"
    assert client.get("/v1/analysis/今彩539/114000123/explore").status_code == 404

    for kind in ("explore", "tianyan", "tiangong", "status"):
        repository.save_artifact("今彩539", "114000123", "v1", kind, {"kind": kind})
    repository.complete_run("今彩539", "114000123", "v1", "2026-08-24T10:01:00+00:00")

    result = client.get("/v1/analysis/今彩539/114000123/explore")
    assert result.status_code == 200
    assert result.json() == {"kind": "explore"}


def test_analysis_api_rejects_unknown_kind_and_missing_repository() -> None:
    repository = InMemoryAnalysisRepository()
    client = TestClient(create_app(repository))
    assert client.get("/v1/analysis/今彩539/114000123/unknown").status_code == 422
    assert TestClient(create_app()).get("/v1/analysis/今彩539/114000123/progress").status_code == 503


def test_completed_manifest_backed_explore_returns_legacy_payload() -> None:
    repository = InMemoryAnalysisRepository()
    repository.begin_run("今彩539", "114000123", "v1", "2026-08-24T10:00:00+00:00")
    first = {"items": [{"id": "a"}], "validationById": {"a": {"ruleSets": []}}}
    second = {"items": [{"id": "b"}], "validationById": {"b": {"ruleSets": []}}}
    repository.save_artifact_chunk("今彩539", "114000123", "v1", "explore", 0, 0, 1, first)
    repository.save_artifact_chunk("今彩539", "114000123", "v1", "explore", 1, 1, 2, second)
    repository.save_artifact("今彩539", "114000123", "v1", "explore", {
        "storage": "chunks", "schemaVersion": 1, "chunkCount": 2,
        "cursor": 2, "total": 2, "itemCount": 2,
    })
    for kind in ("tianyan", "tiangong", "status"):
        repository.save_artifact("今彩539", "114000123", "v1", kind, {"kind": kind})
    repository.complete_run("今彩539", "114000123", "v1", "2026-08-24T10:01:00+00:00")

    result = TestClient(create_app(repository)).get("/v1/analysis/今彩539/114000123/explore")

    assert result.status_code == 200
    assert result.json() == {
        "lottery": "今彩539",
        "drawPeriod": "114000123",
        "items": [{"id": "a"}, {"id": "b"}],
        "validationById": {"a": {"ruleSets": []}, "b": {"ruleSets": []}},
    }


def test_running_analysis_with_chunks_keeps_partial_explore_private() -> None:
    repository = InMemoryAnalysisRepository()
    repository.begin_run("今彩539", "114000123", "v1", "2026-08-24T10:00:00+00:00")
    repository.save_artifact_chunk(
        "今彩539", "114000123", "v1", "explore", 0, 0, 1,
        {"items": [{"id": "partial"}], "validationById": {}},
    )

    result = TestClient(create_app(repository)).get("/v1/analysis/今彩539/114000123/explore")

    assert result.status_code == 404
    assert result.json() == {"detail": "COMPLETED_ANALYSIS_NOT_FOUND"}
