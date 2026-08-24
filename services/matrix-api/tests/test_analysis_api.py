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
