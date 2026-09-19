from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app import analysis_worker
from app.analysis_worker import run_analysis_only_worker
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.worker import ANALYSIS_VERSION


LOTTERY = "天天樂"
PERIOD = "11988"
VERSION = f"{PERIOD}:{ANALYSIS_VERSION}-sorted"


def _draw(period: int, offset: int) -> dict:
    draw_date = (datetime(2026, 9, 2) - timedelta(days=offset)).date().isoformat()
    return {
        "lottery": LOTTERY,
        "period": str(period),
        "drawDate": draw_date,
        "numbers": ["03", "06", "23", "29", "35"],
        "sortedNumbers": ["03", "06", "23", "29", "35"],
        "drawOrderNumbers": None,
        "resultStatus": "confirmed",
    }


def _completed_repository() -> InMemoryAnalysisRepository:
    repository = InMemoryAnalysisRepository()
    for offset in range(227):
        repository.upsert_draw(_draw(11988 - offset, offset))
    repository.begin_run(LOTTERY, PERIOD, VERSION, "2026-09-04T01:00:00+00:00")
    for kind, payload in {
        "explore": {"items": [{"id": "fixture-explore"}]},
        "tianheng": {"items": [{"id": "fixture-tianheng"}]},
        "tianshu": {"items": [{"id": "fixture-tianshu"}]},
        "tianyan": {"items": []},
        "tiangong": {"items": []},
        "status": {"summary": {"status": "ACTIVE"}},
    }.items():
        repository.save_artifact(LOTTERY, PERIOD, VERSION, kind, payload)
    repository.complete_run(
        LOTTERY,
        PERIOD,
        VERSION,
        "2026-09-04T01:10:00+00:00",
    )
    expires_at = datetime.now(UTC) + timedelta(days=1)
    repository.explore_results[(LOTTERY, PERIOD, VERSION, "fixture-explore")] = {
        "expiresAt": expires_at,
    }
    repository.tianheng_results[(LOTTERY, PERIOD, VERSION, "fixture-tianheng")] = {
        "expiresAt": expires_at,
    }
    repository.tianshu_results[(LOTTERY, PERIOD, VERSION, "fixture-tianshu")] = {
        "expiresAt": expires_at,
    }
    return repository


class RejectingEmitter:
    enabled = True

    def emit(self, event: dict) -> dict:
        raise AssertionError(f"completed idle period must not emit {event['eventKey']}")


def test_completed_fantasy5_period_exits_before_card_restore_or_http(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = _completed_repository()
    monkeypatch.setattr(
        repository,
        "notification_event_exists",
        lambda _event: True,
        raising=False,
    )
    monkeypatch.setattr(
        analysis_worker,
        "is_card_published",
        lambda lottery, period, _repository, *, order="draw": (
            lottery == LOTTERY and period == PERIOD and order == "sorted"
        ),
    )

    def reject(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("completed idle period must exit before repair work")

    monkeypatch.setattr(analysis_worker, "publish_current_card", reject)
    monkeypatch.setattr(analysis_worker, "_restore_completed_explore_results", reject)
    monkeypatch.setattr(analysis_worker, "_restore_completed_tianheng_results", reject)
    monkeypatch.setattr(analysis_worker, "_restore_completed_tianshu_results", reject)

    result = run_analysis_only_worker(
        LOTTERY,
        repository,
        notification_emitter=RejectingEmitter(),
    )

    assert result == {
        "lottery": LOTTERY,
        "drawPeriod": PERIOD,
        "analysisVersion": VERSION,
        "status": "already-analyzed",
    }


def test_preliminary_fantasy5_period_never_uses_completed_idle_exit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = _completed_repository()
    repository.draws[(LOTTERY, PERIOD)]["resultStatus"] = "preliminary"
    monkeypatch.setattr(
        repository,
        "notification_event_exists",
        lambda _event: True,
        raising=False,
    )
    monkeypatch.setattr(
        analysis_worker,
        "is_card_published",
        lambda *_args, **_kwargs: True,
    )
    calls: list[str] = []
    monkeypatch.setattr(
        analysis_worker,
        "publish_current_card",
        lambda *_args, **_kwargs: calls.append("publish") or None,
    )

    run_analysis_only_worker(LOTTERY, repository, notification_emitter=None)

    assert calls == ["publish"]
