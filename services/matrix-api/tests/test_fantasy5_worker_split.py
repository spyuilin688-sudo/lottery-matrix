from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app import analysis_worker, fantasy5_crawler, worker
from app.analysis_worker import run_analysis_only_worker
from app.fantasy5_crawler import run_fantasy5_crawler
from app.repositories.analysis_repository import ARTIFACT_KINDS, InMemoryAnalysisRepository


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = SERVICE_ROOT.parents[1]
WORKFLOW_ROOT = REPOSITORY_ROOT / ".github" / "workflows"
TAIPEI = ZoneInfo("Asia/Taipei")
FANTASY5_JOB_NAME = "matrix-fantasy5-refresh-v2"
FANTASY5_VERSION = "11988:matrix-python-v12"


def _draw(period: str, draw_date: str, numbers: list[str] | None = None) -> dict:
    actual_numbers = numbers or ["03", "06", "23", "29", "35"]
    return {
        "lottery": "天天樂",
        "period": period,
        "drawDate": draw_date,
        "numbers": actual_numbers,
        "sortedNumbers": sorted(actual_numbers),
        "drawOrderNumbers": None,
    }


class Fantasy5Source:
    def __init__(self, latest: dict, history: list[dict] | None = None) -> None:
        self.latest = latest
        self.history = history or []
        self.latest_calls: list[str] = []
        self.history_limits: list[int | None] = []

    def fetch(self, lottery: str) -> dict:
        self.latest_calls.append(lottery)
        return dict(self.latest)

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.history_limits.append(limit)
        rows = [dict(draw) for draw in self.history]
        return rows if limit is None else rows[:limit]


def test_fantasy5_railway_service_is_analysis_only() -> None:
    config = (SERVICE_ROOT / "railway.fantasy5.json").read_text(encoding="utf-8")
    entrypoint = (SERVICE_ROOT / "app" / "analysis_worker.py").read_text(encoding="utf-8")

    assert '"startCommand": "uv run python -u -m app.analysis_worker --lottery 天天樂"' in config
    assert "app.worker --lottery 天天樂" not in config
    assert "LatestDrawSource" not in entrypoint
    assert "DrawRefreshService" not in entrypoint
    assert "httpx" not in entrypoint


def test_fantasy5_github_workflow_is_crawler_only() -> None:
    workflow = (WORKFLOW_ROOT / "fantasy5-crawler.yml").read_text(encoding="utf-8")
    entrypoint = (SERVICE_ROOT / "app" / "fantasy5_crawler.py").read_text(encoding="utf-8")

    assert "uv run python -m app.fantasy5_crawler" in workflow
    assert "secrets.SUPABASE_URL" in workflow
    assert "secrets.SUPABASE_SECRET_KEY" in workflow
    assert "app.worker" not in workflow
    assert "matrix-analysis" not in workflow.lower()
    assert "AnalysisPipeline" not in entrypoint
    assert "create_artifact_builders" not in entrypoint
    assert "_run_analysis" not in entrypoint
    for cron in (
        "33,38,43,48,53,58 1 * 3-11 *",
        "3,8,13,18,48 2 * 3-11 *",
        "18,48 3 * 3-11 *",
        "18 4-7 * 3-11 *",
        "33,38,43,48,53,58 2 * 11,12,1-3 *",
        "3,8,13,18,48 3 * 11,12,1-3 *",
        "18,48 4 * 11,12,1-3 *",
        "18 5-8 * 11,12,1-3 *",
    ):
        assert cron in workflow


def test_existing_github_analysis_workflow_excludes_fantasy5() -> None:
    workflow = (WORKFLOW_ROOT / "matrix-analysis.yml").read_text(encoding="utf-8")

    assert "id: fantasy5" not in workflow
    assert "lottery: 天天樂" not in workflow


def test_crawler_repairs_an_internal_period_gap_without_running_analysis() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(_draw("11989", "2026-09-03"))
    repository.upsert_draw(_draw("11987", "2026-09-01", ["01", "07", "08", "18", "39"]))
    source = Fantasy5Source(
        _draw("11989", "2026-09-03"),
        [
            _draw("11989", "2026-09-03"),
            _draw("11988", "2026-09-02"),
        ],
    )

    result = run_fantasy5_crawler(
        repository,
        source,
        datetime(2026, 9, 4, 9, 33, tzinfo=TAIPEI),
    )

    assert result == {
        "lottery": "天天樂",
        "drawPeriod": "11989",
        "status": "acquired",
    }
    assert source.latest_calls == ["天天樂"]
    assert source.history_limits == [2]
    assert {draw["period"] for draw in repository.list_draws("天天樂", None)} == {
        "11987", "11988", "11989",
    }
    assert repository.runs == {}
    assert repository.artifacts == {}


def test_crawler_bootstraps_history_when_supabase_has_no_draws() -> None:
    repository = InMemoryAnalysisRepository()
    source = Fantasy5Source(
        _draw("11989", "2026-09-03"),
        [
            _draw("11989", "2026-09-03"),
            _draw("11988", "2026-09-02"),
            _draw("11987", "2026-09-01"),
        ],
    )

    result = run_fantasy5_crawler(
        repository,
        source,
        datetime(2026, 9, 4, 9, 33, tzinfo=TAIPEI),
    )

    assert result["status"] == "acquired"
    assert source.history_limits == [None]
    assert {draw["period"] for draw in repository.list_draws("天天樂", None)} == {
        "11987", "11988", "11989",
    }


def test_crawler_rejects_a_stale_source_without_overwriting_supabase() -> None:
    repository = InMemoryAnalysisRepository()
    stored = _draw("11987", "2026-09-01", ["01", "07", "08", "18", "39"])
    repository.upsert_draw(stored)
    source = Fantasy5Source(
        _draw("11987", "2026-09-01", ["02", "09", "16", "27", "35"]),
    )

    result = run_fantasy5_crawler(
        repository,
        source,
        datetime(2026, 9, 4, 9, 33, tzinfo=TAIPEI),
    )

    assert result == {
        "lottery": "天天樂",
        "drawPeriod": "11987",
        "status": "not-acquired",
    }
    assert repository.list_draws("天天樂", 1)[0]["numbers"] == stored["numbers"]
    assert source.history_limits == []
    job = repository.job_statuses[FANTASY5_JOB_NAME]
    assert job["status"] == "waiting_source"
    assert job["sourcePeriod"] == "11987"
    assert job["databasePeriod"] == "11987"
    assert job["writtenPeriod"] is None


def test_crawler_cli_never_constructs_matrix_artifact_builders(monkeypatch) -> None:
    repository = InMemoryAnalysisRepository()
    expected_date = (datetime.now(TAIPEI).date() - timedelta(days=1)).isoformat()
    source = Fantasy5Source(_draw("11989", expected_date))
    repository.upsert_draw(_draw("11989", expected_date))

    class Client:
        def __enter__(self) -> object:
            return object()

        def __exit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(
        "app.services.artifact_builders.create_artifact_builders",
        lambda: (_ for _ in ()).throw(AssertionError("crawler must not build Matrix artifacts")),
    )
    monkeypatch.setattr(
        fantasy5_crawler,
        "load_settings",
        lambda: SimpleNamespace(supabase_url="https://example.test", supabase_secret_key="secret"),
    )
    monkeypatch.setattr(fantasy5_crawler, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(fantasy5_crawler.httpx, "Client", lambda: Client())
    monkeypatch.setattr(fantasy5_crawler, "LatestDrawSource", lambda _: source)

    assert fantasy5_crawler.main() == 0
    assert repository.runs == {}
    assert repository.artifacts == {}


def _repository_with_fantasy5_history() -> InMemoryAnalysisRepository:
    repository = InMemoryAnalysisRepository()
    for period in range(11988, 11908, -1):
        repository.upsert_draw(_draw(str(period), "2026-09-02"))
    return repository


def test_analysis_only_worker_skips_a_completed_latest_version() -> None:
    repository = _repository_with_fantasy5_history()
    repository.begin_run("天天樂", "11988", FANTASY5_VERSION, "2026-09-04T01:00:00+00:00")
    for kind in ARTIFACT_KINDS:
        repository.save_artifact("天天樂", "11988", FANTASY5_VERSION, kind, {"kind": kind})
    repository.complete_run(
        "天天樂",
        "11988",
        FANTASY5_VERSION,
        "2026-09-04T01:10:00+00:00",
    )

    def unexpected_builder(_: dict) -> dict:
        raise AssertionError("completed latest period must not be rebuilt")

    result = run_analysis_only_worker(
        "天天樂",
        repository,
        {kind: unexpected_builder for kind in ARTIFACT_KINDS},
    )

    assert result == {
        "lottery": "天天樂",
        "drawPeriod": "11988",
        "analysisVersion": FANTASY5_VERSION,
        "status": "already-analyzed",
    }


def test_analysis_only_worker_resumes_from_supabase_without_constructing_a_source(
    monkeypatch,
) -> None:
    repository = _repository_with_fantasy5_history()
    repository.begin_run("天天樂", "11988", FANTASY5_VERSION, "2026-09-04T01:00:00+00:00")
    calls: list[str] = []

    def build(kind: str):
        def selected(_: dict) -> dict:
            calls.append(kind)
            return {"items": []}

        return selected

    monkeypatch.setattr(
        worker,
        "LatestDrawSource",
        lambda *_: (_ for _ in ()).throw(AssertionError("analysis must not construct a source")),
    )
    monkeypatch.setattr(
        worker.httpx,
        "Client",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("analysis must not construct an HTTP client")
        ),
    )

    result = run_analysis_only_worker(
        "天天樂",
        repository,
        {kind: build(kind) for kind in ("explore", "tianyan", "tiangong", "status")},
    )

    assert result["status"] == "complete"
    assert result["analysisVersion"] == FANTASY5_VERSION
    assert calls == ["explore", "tianyan", "tiangong", "status"]


def test_analysis_worker_cli_reads_only_supabase(monkeypatch) -> None:
    repository = _repository_with_fantasy5_history()
    calls: list[tuple[str, object]] = []

    monkeypatch.setattr(
        analysis_worker,
        "load_settings",
        lambda: SimpleNamespace(supabase_url="https://example.test", supabase_secret_key="secret"),
    )
    monkeypatch.setattr(analysis_worker, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(
        analysis_worker,
        "run_analysis_only_worker",
        lambda lottery, actual_repository: (
            calls.append((lottery, actual_repository))
            or {
                "lottery": lottery,
                "drawPeriod": "11988",
                "status": "already-analyzed",
            }
        ),
    )

    assert analysis_worker.main(["--lottery", "天天樂"]) == 0
    assert calls == [("天天樂", repository)]
