from __future__ import annotations

import argparse
from collections.abc import Callable
from datetime import date, datetime, time, timedelta
import json
from threading import Event, Lock, Thread
from typing import Any

import httpx

from app.analysis_worker import (
    _emit_ready_notifications as emit_fantasy5_ready_notifications,
    _completed_period_idle_ready,
    run_analysis_only_worker,
)
from app.repositories.analysis_repository import create_supabase_repository
from app.schedule import TAIPEI
from app.scraping.resilient_source import wrap_source_with_tinyfish
from app.scraping.sources import LatestDrawSource
from app.services.marksix_calendar import sync_marksix_calendar
from app.services.notification_events import notification_emitter_context
from app.services.tinyfish_status import create_tinyfish_telemetry
from app.settings import load_settings
from app.targeted_recovery import repair_current_card_if_needed
from app.worker import (
    _read_worker_completion,
    analysis_version_for_order,
    certify_completed_result,
    create_notification_emitter,
    emit_ready_notifications,
    run_scheduled_worker,
)
from app.worker_all import (
    _needs_formal_source_retry,
    create_railway_ssl_context,
    run_all_workers,
)


PRIMARY_LOTTERIES: dict[str, tuple[str, ...]] = {
    "evening": ("今彩539", "大樂透", "六合彩"),
    "fantasy5": ("天天樂",),
}


class PrimaryCoordinator:
    def __init__(
        self,
        runner: Callable[[str, date, tuple[str, ...]], None],
    ) -> None:
        self._runner = runner
        self._lock = Lock()
        self._running: dict[str, Event] = {}

    def enqueue(
        self,
        group: str,
        cycle_date: date,
        lotteries: tuple[str, ...],
    ) -> str:
        with self._lock:
            if group in self._running:
                return "already-running"
            completed = Event()
            self._running[group] = completed
        thread = Thread(
            target=self._execute,
            args=(group, cycle_date, lotteries, completed),
            daemon=False,
            name=f"matrix-primary-{group}",
        )
        try:
            thread.start()
        except Exception:
            with self._lock:
                self._running.pop(group, None)
            raise
        return "accepted"

    def _execute(
        self,
        group: str,
        cycle_date: date,
        lotteries: tuple[str, ...],
        completed: Event,
    ) -> None:
        try:
            self._runner(group, cycle_date, lotteries)
        except Exception as error:
            print(f"{group} primary worker failed: {type(error).__name__}")
        finally:
            with self._lock:
                self._running.pop(group, None)
            completed.set()

    def wait(self, group: str, timeout: float) -> bool:
        with self._lock:
            completed = self._running.get(group)
        return True if completed is None else completed.wait(timeout)


def _validate_request(
    group: str,
    lotteries: tuple[str, ...],
) -> None:
    allowed = PRIMARY_LOTTERIES.get(group)
    if allowed is None:
        raise ValueError("PRIMARY_GROUP_INVALID")
    if not lotteries or len(set(lotteries)) != len(lotteries):
        raise ValueError("PRIMARY_LOTTERIES_INVALID")
    if any(lottery not in allowed for lottery in lotteries):
        raise ValueError("PRIMARY_LOTTERIES_INVALID")


def _card_only_result(lottery: str, cycle_date: date, repository: Any) -> dict[str, Any] | None:
    latest = repository.list_draws(lottery, 1)
    if not latest or latest[0].get('drawDate') != cycle_date.isoformat() or latest[0].get('resultStatus') != 'confirmed':
        return None
    period = str(latest[0]['period'])
    # Older chain-state deployments have no card flag. Their existing worker
    # path keeps running until the final migration installs this evidence.
    try:
        chain = repository.client.rpc('matrix_watchdog_chain_state', {
            'p_lottery': lottery, 'p_draw_period': period,
        }).execute().data
    except Exception:
        return None
    if (not isinstance(chain, dict) or chain.get('latestPeriod') != period
            or chain.get('cardComplete') is not False
            or chain.get('analysisComplete') is not True
            or chain.get('matrixStatusComplete') is not True):
        return None
    if not repair_current_card_if_needed(lottery, period, repository):
        return None
    return {'lottery': lottery, 'drawPeriod': period, 'status': 'complete'}


def run_primary_group(
    group: str,
    cycle_date: date,
    lotteries: tuple[str, ...],
) -> None:
    _validate_request(group, lotteries)
    settings = load_settings()
    repository = create_supabase_repository(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
    if group == "fantasy5":
        with notification_emitter_context(settings) as emitter:
            result = _card_only_result('天天樂', cycle_date, repository)
            if result is not None:
                latest = repository.list_draws('天天樂', 1)[0]
                emit_fantasy5_ready_notifications(
                    {'lottery': '天天樂', **latest}, repository, emitter, set(),
                )
            else:
                result = run_analysis_only_worker(
                    "天天樂", repository, notification_emitter=emitter,
                )
            certify_completed_result(
                "天天樂", result, repository, emitter, scope="analysis-only",
                ready_check=lambda draw: _completed_period_idle_ready(
                    {"lottery": "天天樂", **draw},
                    repository.get_progress(
                        "天天樂",
                        str(draw["period"]),
                        analysis_version_for_order(str(draw["period"])),
                    ),
                    repository,
                    emitter,
                ),
            )
        return

    now = datetime.now(TAIPEI)
    with httpx.Client(verify=create_railway_ssl_context()) as client:
        if "六合彩" in lotteries:
            sync_marksix_calendar(repository, client)
        source = wrap_source_with_tinyfish(
            LatestDrawSource(client),
            client,
            settings,
            telemetry=create_tinyfish_telemetry(repository),
        )
        emitter = create_notification_emitter(settings, client)

        def run_one(lottery: str) -> dict[str, Any]:
            repaired = _card_only_result(lottery, cycle_date, repository)
            if repaired is not None:
                emit_ready_notifications(lottery, repaired['drawPeriod'], repository, emitter, set())
                certify_completed_result(lottery, repaired, repository, emitter)
                return repaired
            completion = _read_worker_completion(lottery, repository, emitter)
            options: dict[str, Any] = {
                "primary_cycle_date": cycle_date,
                "_completion_snapshot": completion,
            }
            if completion is not None and completion.get("draw", {}).get("resultStatus") == "preliminary":
                options["allow_recovery_crawl"] = True
            elif completion is None and _needs_formal_source_retry(repository, lottery):
                options["allow_recovery_crawl"] = True
            if emitter is not None:
                options["notification_emitter"] = emitter
            result = run_scheduled_worker(lottery, now, repository, source, **options)
            certify_completed_result(lottery, result, repository, emitter)
            return result

        result = run_all_workers(run_one, lotteries=lotteries)
    for run in result["runs"]:
        print(json.dumps(run, ensure_ascii=False, separators=(",", ":")))
    if result["failed"]:
        raise RuntimeError("PRIMARY_WORKER_FAILED")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run one daily primary fallback")
    parser.add_argument("--group", choices=tuple(PRIMARY_LOTTERIES), required=True)
    args = parser.parse_args(argv)
    current = datetime.now(TAIPEI)
    cycle_date = current.date()
    if args.group == "evening" and current.time() < time(20, 30):
        cycle_date -= timedelta(days=1)
    run_primary_group(args.group, cycle_date, PRIMARY_LOTTERIES[args.group])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
