from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app import worker as worker_module
from app.worker import (
    ANALYSIS_VERSION,
    analysis_version_for_order,
    emit_ready_notifications,
    run_scheduled_worker,
)


TAIPEI = ZoneInfo("Asia/Taipei")
LOTTERY = "今彩539"
PERIOD = "000001001"
DRAW = {
    "lottery": LOTTERY,
    "period": PERIOD,
    "drawDate": "2026-08-28",
    "numbers": ["01", "02", "03", "04", "05"],
    "sortedNumbers": ["01", "02", "03", "04", "05"],
    "drawOrderNumbers": ["01", "02", "03", "04", "05"],
    "resultStatus": "confirmed",
}


class DurableReadyRepository:
    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict]:
        assert lottery == LOTTERY
        return [dict(DRAW)]

    def get_draw(self, lottery: str, period: str) -> dict | None:
        assert lottery == LOTTERY
        return dict(DRAW) if period == PERIOD else None

    def get_progress(self, lottery: str, period: str, analysis_version: str | None = None) -> dict | None:
        assert lottery == LOTTERY
        assert period == PERIOD
        if analysis_version in {
            analysis_version_for_order(PERIOD, "sorted"),
            analysis_version_for_order(PERIOD, "draw"),
        }:
            return {
                "drawPeriod": PERIOD,
                "analysisVersion": analysis_version,
                "status": "complete",
                "phase": "complete",
                "startedAt": "2026-08-28T12:34:00+00:00",
                "completedAt": "2026-08-28T12:40:00+00:00",
            }
        return None

    def has_artifact(self, lottery: str, period: str, analysis_version: str, kind: str) -> bool:
        return True

    def read_artifact(self, lottery: str, period: str, analysis_version: str, kind: str):
        if kind == "status":
            return {"summary": {"status": "ACTIVE"}}
        return {"items": []}

    def notification_event_exists(self, event: dict) -> bool:
        return True

    def restore_completed_results(self, *args, **kwargs) -> None:
        raise AssertionError("completed idle period must not restore analysis results")


class RaisingEmitter:
    enabled = True

    def emit(self, event: dict) -> dict:
        raise AssertionError(f"durable event must not be re-posted: {event['eventKey']}")


class RaisingSource:
    def fetch(self, lottery: str) -> dict:
        raise AssertionError("completed idle period must not refetch latest draw")

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        raise AssertionError("completed idle period must not fetch history")


def test_ready_notifications_skip_http_when_durable_event_state_already_exists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = DurableReadyRepository()
    monkeypatch.setattr(worker_module, "_card_ready", lambda *args, **kwargs: False)

    emit_ready_notifications(
        LOTTERY,
        PERIOD,
        repository,
        RaisingEmitter(),
        set(),
    )


def test_completed_confirmed_period_fast_exits_before_card_publish_restore_or_source_fetch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = DurableReadyRepository()
    monkeypatch.setattr(worker_module, "_card_ready", lambda *args, **kwargs: True)
    monkeypatch.setattr(
        worker_module,
        "publish_current_card",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("completed idle period must not republish card")
        ),
    )

    result = run_scheduled_worker(
        LOTTERY,
        datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI),
        repository,
        RaisingSource(),
        builders=None,
        notification_emitter=RaisingEmitter(),
    )

    assert result == {
        "lottery": LOTTERY,
        "drawPeriod": PERIOD,
        "status": "already-acquired",
    }


def test_preliminary_draw_is_never_eligible_for_completed_idle_fast_exit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = DurableReadyRepository()
    preliminary = {**DRAW, "resultStatus": "preliminary", "drawOrderNumbers": None}
    monkeypatch.setattr(repository, "list_draws", lambda lottery, limit=None: [dict(preliminary)])
    monkeypatch.setattr(repository, "get_draw", lambda lottery, period: dict(preliminary))
    monkeypatch.setattr(worker_module, "_card_ready", lambda *args, **kwargs: True)
    monkeypatch.setattr(worker_module, "publish_current_card", lambda *args, **kwargs: None)

    class ConfirmingSource:
        called = False

        def fetch(self, lottery: str) -> dict:
            self.called = True
            return dict(DRAW)

        def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
            return []

    source = ConfirmingSource()
    with pytest.raises(Exception):
        run_scheduled_worker(
            LOTTERY,
            datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI),
            repository,
            source,
            builders=None,
            notification_emitter=None,
        )
    assert source.called is True
