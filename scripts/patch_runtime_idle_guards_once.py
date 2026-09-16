from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


worker_path = Path("services/matrix-api/app/worker.py")
worker = worker_path.read_text()

old_emit = '''def _emit_notification_event(
    notification_emitter: NotificationEventEmitter | None,
    event: dict[str, Any] | None,
    emitted_event_keys: set[str],
) -> None:
    if not _notification_enabled(notification_emitter) or event is None:
        return
    event_key = str(event["eventKey"])
    if event_key in emitted_event_keys:
        return
    notification_emitter.emit(event)
    emitted_event_keys.add(event_key)
'''
new_emit = '''def _durable_notification_event_exists(
    repository: AnalysisRepository,
    event: dict[str, Any],
) -> bool:
    checker = getattr(repository, "notification_event_exists", None)
    if callable(checker):
        try:
            return bool(checker(event))
        except Exception:
            return False
    client = getattr(repository, "client", None)
    if client is None:
        return False
    try:
        response = client.rpc("matrix_notification_event_exists", {
            "p_event_key": str(event["eventKey"]),
            "p_event_type": str(event["eventType"]),
            "p_payload": event.get("payload") or {},
        }).execute()
        return bool(response.data)
    except Exception:
        # The durable probe is an optimization. If it is temporarily
        # unavailable, fall through to the existing ingest unique fence rather
        # than suppressing a real notification.
        return False


def _emit_notification_event(
    repository: AnalysisRepository,
    notification_emitter: NotificationEventEmitter | None,
    event: dict[str, Any] | None,
    emitted_event_keys: set[str],
) -> None:
    if not _notification_enabled(notification_emitter) or event is None:
        return
    event_key = str(event["eventKey"])
    if event_key in emitted_event_keys:
        return
    if _durable_notification_event_exists(repository, event):
        emitted_event_keys.add(event_key)
        return
    notification_emitter.emit(event)
    emitted_event_keys.add(event_key)
'''
worker = replace_once(worker, old_emit, new_emit, "durable emitter")

for label, old, new in (
    (
        "result emit",
        '''    _emit_notification_event(\n        notification_emitter,\n        lottery_result_event(draw),\n        emitted_event_keys,\n    )''',
        '''    _emit_notification_event(\n        repository,\n        notification_emitter,\n        lottery_result_event(draw),\n        emitted_event_keys,\n    )''',
    ),
    (
        "card emit",
        '''        _emit_notification_event(\n            notification_emitter,\n            matrix_card_event(draw),\n            emitted_event_keys,\n        )''',
        '''        _emit_notification_event(\n            repository,\n            notification_emitter,\n            matrix_card_event(draw),\n            emitted_event_keys,\n        )''',
    ),
    (
        "status emit",
        '''    _emit_notification_event(\n        notification_emitter,\n        matrix_status_event(lottery, period, status_artifact, draw_date=draw["drawDate"]),\n        emitted_event_keys,\n    )''',
        '''    _emit_notification_event(\n        repository,\n        notification_emitter,\n        matrix_status_event(lottery, period, status_artifact, draw_date=draw["drawDate"]),\n        emitted_event_keys,\n    )''',
    ),
):
    worker = replace_once(worker, old, new, label)

idle_helpers = '''\n\ndef _analysis_order_complete(\n    lottery: str,\n    period: str,\n    repository: AnalysisRepository,\n    number_order: str,\n) -> bool:\n    version = analysis_version_for_order(period, number_order)\n    progress = repository.get_progress(lottery, period, version)\n    return bool(\n        progress is not None\n        and progress.get("status") == "complete"\n        and repository.has_artifact(lottery, period, version, "explore")\n        and repository.has_artifact(lottery, period, version, "status")\n    )\n\n\ndef _completed_period_idle_ready(\n    lottery: str,\n    draw: dict[str, Any],\n    repository: AnalysisRepository,\n    notification_emitter: NotificationEventEmitter | None,\n) -> bool:\n    if draw.get("resultStatus", "confirmed") == "preliminary":\n        return False\n    period = str(draw.get("period") or "")\n    if not period or not _analysis_order_complete(lottery, period, repository, SORTED_ORDER):\n        return False\n\n    draw_required = lottery != "天天樂"\n    if draw_required:\n        if not has_complete_draw_order(draw, lottery_position_count(lottery)):\n            return False\n        if not _analysis_order_complete(lottery, period, repository, DRAW_ORDER):\n            return False\n        if not _card_ready(lottery, period, repository):\n            return False\n\n    if not _notification_enabled(notification_emitter):\n        return True\n\n    full_draw = {"lottery": lottery, **draw}\n    sorted_version = analysis_version_for_order(period, SORTED_ORDER)\n    status_artifact = repository.read_artifact(lottery, period, sorted_version, "status")\n    if not isinstance(status_artifact, Mapping):\n        return False\n    try:\n        events: list[dict[str, Any] | None] = [\n            lottery_result_event(full_draw),\n            matrix_status_event(\n                lottery, period, status_artifact, draw_date=str(draw.get("drawDate") or ""),\n            ),\n        ]\n        if draw_required:\n            events.append(matrix_card_event(full_draw))\n    except Exception:\n        return False\n    return all(\n        event is None or _durable_notification_event_exists(repository, event)\n        for event in events\n    )\n\n\ndef _idle_exit_result(\n    lottery: str,\n    now: datetime | None,\n    repository: AnalysisRepository,\n    notification_emitter: NotificationEventEmitter | None,\n    latest: list[dict[str, Any]],\n    cycle: datetime | None,\n) -> dict[str, Any] | None:\n    if not latest:\n        return None\n    draw = latest[0]\n    if draw.get("resultStatus", "confirmed") == "preliminary":\n        return None\n\n    if cycle is not None:\n        current = now or datetime.now(cycle.tzinfo)\n        is_pre_draw_recovery = current.astimezone(cycle.tzinfo) < cycle\n        target_cycle = previous_lottery_call_time(lottery, cycle) if is_pre_draw_recovery else cycle\n        expected_draw_dates = _expected_source_draw_dates(lottery, target_cycle)\n        oldest_expected_draw_date = min(expected_draw_dates)\n        latest_draw_date = _normalized_draw_date(draw.get("drawDate"))\n        if not (\n            latest_draw_date in expected_draw_dates\n            or (is_pre_draw_recovery and latest_draw_date > oldest_expected_draw_date)\n        ):\n            return None\n\n    if not _completed_period_idle_ready(\n        lottery, draw, repository, notification_emitter,\n    ):\n        return None\n    return {\n        "lottery": lottery,\n        "drawPeriod": draw["period"],\n        "status": "not-due" if cycle is None else "already-acquired",\n    }\n'''
worker = replace_once(
    worker,
    '\n\ndef _best_effort_telemetry(write: Callable[[], None]) -> None:\n',
    idle_helpers + '\n\ndef _best_effort_telemetry(write: Callable[[], None]) -> None:\n',
    "idle helpers",
)

old_start = '''    emitted_event_keys: set[str] = set()\n    latest = repository.list_draws(lottery, 1)\n    def notify_cards(*, final: bool = False) -> None:\n        current = repository.list_draws(lottery, 1)\n        if current:\n            try:\n                emit_ready_notifications(lottery, str(current[0]["period"]), repository, notification_emitter, emitted_event_keys)\n            except NotificationDeliveryError:\n                if final:\n                    raise\n    notify_cards()\n    publish_current_card(lottery, repository, now)\n    notify_cards()\n    if allow_recovery_crawl:\n        cycle = due_call_cycle(lottery, now, allow_weekend_fallback=True)\n    else:\n        cycle = due_call_cycle(lottery, now)\n'''
new_start = '''    emitted_event_keys: set[str] = set()\n    latest = repository.list_draws(lottery, 1)\n    if allow_recovery_crawl:\n        cycle = due_call_cycle(lottery, now, allow_weekend_fallback=True)\n    else:\n        cycle = due_call_cycle(lottery, now)\n\n    idle_result = _idle_exit_result(\n        lottery, now, repository, notification_emitter, latest, cycle,\n    )\n    if idle_result is not None:\n        return idle_result\n\n    def notify_cards(*, final: bool = False) -> None:\n        current = repository.list_draws(lottery, 1)\n        if current:\n            try:\n                emit_ready_notifications(lottery, str(current[0]["period"]), repository, notification_emitter, emitted_event_keys)\n            except NotificationDeliveryError:\n                if final:\n                    raise\n\n    notify_cards()\n    publish_current_card(lottery, repository, now)\n    notify_cards()\n    latest = repository.list_draws(lottery, 1)\n    idle_result = _idle_exit_result(\n        lottery, now, repository, notification_emitter, latest, cycle,\n    )\n    if idle_result is not None:\n        return idle_result\n'''
worker = replace_once(worker, old_start, new_start, "worker entry fast exit")
worker_path.write_text(worker)


test_path = Path("services/matrix-api/tests/test_worker_idle_guards.py")
test = test_path.read_text()
test = replace_once(
    test,
    '''    def restore_completed_results(self, *args, **kwargs) -> None:\n        raise AssertionError("completed idle period must not restore analysis results")\n''',
    '''    def restore_completed_results(self, *args, **kwargs) -> None:\n        raise AssertionError("completed idle period must not restore analysis results")\n\n    def cleanup_expired(self, now: datetime) -> int:\n        return 0\n''',
    "preliminary fixture cleanup",
)
test_path.write_text(test)
