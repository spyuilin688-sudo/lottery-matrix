from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app import analysis_worker, worker, worker_all
from app.repositories.analysis_repository import SupabaseAnalysisRepository


@pytest.fixture(autouse=True)
def deployment_identity(monkeypatch):
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "revision-a")
    monkeypatch.delenv("GITHUB_SHA", raising=False)


class CachedRepository:
    def __init__(self, lottery):
        self.calls = []
        self.draw = {
            "lottery": lottery, "period": "11988", "drawDate": "2026-08-28",
            "numbers": ["01", "02", "03", "04", "05"],
            "sortedNumbers": ["01", "02", "03", "04", "05"],
            "drawOrderNumbers": ["01", "02", "03", "04", "05"],
            "resultStatus": "confirmed",
        }

    def read_worker_completion(self, lottery, analysis_name, require_notifications):
        self.calls.append((lottery, analysis_name, require_notifications))
        return {"draw": self.draw, "generation": 8, "ready": True}

    def list_draws(self, *args):
        raise AssertionError("a certified idle run must perform only the completion probe")


@pytest.mark.parametrize("notifications", [False, True])
def test_fantasy5_cached_completion_skips_all_candidate_and_readiness_queries(notifications):
    repository = CachedRepository("天天樂")
    result = analysis_worker.run_analysis_only_worker(
        "天天樂", repository,
        notification_emitter=SimpleNamespace(enabled=True) if notifications else None,
    )
    assert result["status"] == "already-analyzed"
    assert repository.calls == [("天天樂", f"{worker.ANALYSIS_VERSION}:completion-v1:analysis-only:revision-a", notifications)]


def test_scheduled_cached_completion_keeps_schedule_gate():
    repository = CachedRepository("今彩539")
    result = worker.run_scheduled_worker(
        "今彩539", datetime(2026, 8, 28, 20, 33, tzinfo=ZoneInfo("Asia/Taipei")),
        repository, SimpleNamespace(),
    )
    assert result["status"] == "already-acquired"
    assert len(repository.calls) == 1


def test_repository_normalizes_atomic_snapshot_and_requires_literal_ready():
    calls = []

    class Client:
        def rpc(self, name, params):
            calls.append((name, params))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={
                "generation": 3, "ready": "true",
                "draw": {"period": "11988", "draw_date": "2026-08-28", "numbers": []},
            }))

    result = SupabaseAnalysisRepository(Client()).read_worker_completion("天天樂", "v15", True)
    assert result["draw"]["drawDate"] == "2026-08-28"
    assert result["ready"] is False
    assert calls == [("matrix_worker_completion_snapshot", {
        "p_lottery": "天天樂", "p_analysis_name": "v15", "p_require_notifications": True,
    })]


def test_unknown_deployment_identity_uses_existing_readiness_path(monkeypatch):
    monkeypatch.delenv("RAILWAY_GIT_COMMIT_SHA")
    repository = CachedRepository("天天樂")
    assert worker._read_worker_completion("天天樂", repository, None) is None
    assert repository.calls == []


def test_deployment_revision_is_part_of_certificate_identity(monkeypatch):
    repository = CachedRepository("天天樂")
    worker._read_worker_completion("天天樂", repository, None)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "revision-b")
    worker._read_worker_completion("天天樂", repository, None)
    assert repository.calls[0][1] != repository.calls[1][1]


def test_analysis_only_and_scheduled_certificates_have_distinct_scopes():
    repository = CachedRepository("天天樂")
    worker._read_worker_completion("天天樂", repository, None)
    worker._read_worker_completion("天天樂", repository, None, scope="analysis-only")
    assert repository.calls[0][1] != repository.calls[1][1]


def test_fantasy5_cold_completion_certifies_only_after_full_guard(monkeypatch):
    from test_analysis_worker_completed_idle_guard import _completed_repository

    repository = _completed_repository()
    certificates = []
    monkeypatch.setattr(repository, "read_worker_completion", lambda *_: {
        "draw": repository.get_draw("天天樂", "11988"), "generation": 17, "ready": False,
    }, raising=False)
    monkeypatch.setattr(repository, "certify_worker_completion", lambda *args: certificates.append(args), raising=False)
    monkeypatch.setattr(analysis_worker, "is_card_published", lambda *_, **__: True)
    result = analysis_worker.run_analysis_only_worker("天天樂", repository)
    assert result["status"] == "already-analyzed"
    assert certificates == [("天天樂", "11988", f"{worker.ANALYSIS_VERSION}:completion-v1:analysis-only:revision-a", False, 17)]


def test_fantasy5_missing_card_cannot_certify(monkeypatch):
    from test_analysis_worker_completed_idle_guard import _completed_repository

    repository = _completed_repository()
    certificates = []
    monkeypatch.setattr(repository, "read_worker_completion", lambda *_: {
        "draw": repository.get_draw("天天樂", "11988"), "generation": 17, "ready": False,
    }, raising=False)
    monkeypatch.setattr(repository, "certify_worker_completion", lambda *args: certificates.append(args), raising=False)
    monkeypatch.setattr(analysis_worker, "is_card_published", lambda *_, **__: False)
    monkeypatch.setattr(analysis_worker, "publish_current_card", lambda *_: None)
    analysis_worker.run_analysis_only_worker("天天樂", repository)
    assert certificates == []


def test_batch_worker_reuses_snapshot_for_formal_retry_and_idle_guard(monkeypatch):
    repository = CachedRepository("今彩539")
    calls = []

    class Client:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    monkeypatch.setattr(worker_all, "load_settings", lambda: SimpleNamespace(supabase_url="url", supabase_secret_key="key"))
    monkeypatch.setattr(worker_all, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(worker_all.httpx, "Client", lambda **_: Client())
    monkeypatch.setattr(worker_all, "sync_marksix_calendar", lambda *_: {"status": "not-due"})
    monkeypatch.setattr(worker_all, "create_tinyfish_telemetry", lambda *_: None)
    monkeypatch.setattr(worker_all, "wrap_source_with_tinyfish", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(worker_all, "create_notification_emitter", lambda *_: None)
    monkeypatch.setattr(worker_all, "run_scheduled_worker", lambda *args, **kwargs: calls.append(kwargs) or {"status": "not-due"})
    assert worker_all.main() == 0
    assert len(repository.calls) == len(worker_all.LOTTERIES)
    assert all(call["_completion_snapshot"]["ready"] for call in calls)
