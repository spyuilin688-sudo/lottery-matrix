from __future__ import annotations

from app.targeted_recovery import run_targeted_recovery, verify_recovery
from app.watchdog_lease import complete_recovery
from app.security_monitor import SecurityMonitor, request_category

import json
from hashlib import sha256
import logging
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from os import environ
from secrets import compare_digest
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any
from threading import BoundedSemaphore, Event, Thread
from uuid import UUID
from zoneinfo import ZoneInfo
from app.draw_read_cache import DrawReadCache
from app.public_result_updates import run_public_result_updates
from app.manual_refresh import ManualRefreshCoordinator, SourceNotReady
from app.fantasy5_crawler import run_fantasy5_crawler_once
from urllib.parse import parse_qs, quote, unquote, urlsplit

import httpx
from postgrest.exceptions import APIError

from app.repositories.card_repository import published_manifest
from app.services.card_publication import publication_orders
from app.card_renderer import card_layout, render_matrix_card
from app.analysis_worker import run_analysis_only_worker
from app.recovery import RecoveryCoordinator
from app.watchdog_lease import (
    begin_recovery_lease,
    release_recovery_lease,
    renew_recovery_lease,
    terminate_on_lease_loss,
)
from app.repositories.analysis_repository import AnalysisRepository, create_supabase_repository
from app.schedule import next_lottery_draw_time
from app.scraping.sources import LatestDrawSource
from app.services.draw_refresh import DrawRefreshService
from app.services.notification_events import notification_emitter_context
from app.services.marksix_calendar import sync_marksix_calendar
from app.services.tinyfish_status import tinyfish_status_payload
from app.settings import load_settings
from app.worker import create_notification_emitter, run_scheduled_worker
from app.worker_all import create_railway_ssl_context


LOTTERIES = {"今彩539", "天天樂", "六合彩", "大樂透"}
NUMBER_ORDERS = {"依號碼由小到大排序", "依實際開獎順序排序"}
HISTORY_RANGES = {1000, 3000, 5000}
PAGE_SIZE = 1000
MAX_REQUEST_BODY_BYTES = 64 * 1024
PUBLIC_API_MAX_CONCURRENCY = 32
SERVICE_NAME = "matrix-railway-api"
CARD_PREFIX = "/api/matrix/cards/"
_REFRESH_COORDINATOR = ManualRefreshCoordinator()
_TAIPEI = ZoneInfo("Asia/Taipei")


def public_read_ttl_seconds(now: datetime | None = None) -> int:
    """Probe often during draw windows; share stable results until the next window."""
    local = (now or datetime.now(_TAIPEI)).astimezone(_TAIPEI)
    minute = local.hour * 60 + local.minute
    if minute <= 70 or 9 * 60 + 20 <= minute <= 13 * 60 + 10 or minute >= 20 * 60 + 20:
        return 30
    next_start = local.replace(hour=9, minute=20, second=0, microsecond=0)
    if local >= next_start:
        next_start = local.replace(hour=20, minute=20, second=0, microsecond=0)
    if local >= next_start:
        next_start += timedelta(days=1)
        next_start = next_start.replace(hour=9, minute=20)
    return max(1, min(15 * 60, int((next_start - local).total_seconds())))


def _service_version() -> str:
    return (
        environ.get("MATRIX_SERVICE_VERSION", "").strip()
        or environ.get("RAILWAY_GIT_COMMIT_SHA", "").strip()
        or "unknown"
    )


def _health_payload(status: str) -> dict[str, Any]:
    return {
        "status": status,
        "service": SERVICE_NAME,
        "version": _service_version(),
        "database": {"status": status},
    }


def _normalize_number(value: Any) -> str:
    text = str(value if value is not None else "").strip()
    if not text.isdigit() or len(text) > 2:
        raise ValueError("請輸入有效號碼")
    number = int(text)
    if not 1 <= number <= 49:
        raise ValueError("請輸入有效號碼")
    return str(number).zfill(2)


def _parse_lottery(value: Any) -> str:
    lottery = str(value or "")
    if lottery not in LOTTERIES:
        raise ValueError("未知彩種")
    return lottery


def _scheduled_lotteries_for_date(client: Any, cycle_date: date) -> list[str]:
    payload = client.rpc("matrix_watchdog_draw_days", {
        "p_start_date": cycle_date.isoformat(),
        "p_end_date": cycle_date.isoformat(),
    }).execute().data
    if not isinstance(payload, dict):
        raise RuntimeError("LATEST_RESULT_DRAW_DAYS_INVALID")
    scheduled: list[str] = []
    for lottery in ("今彩539", "天天樂", "大樂透", "六合彩"):
        days = payload.get(lottery)
        if not isinstance(days, list) or any(not isinstance(day, str) for day in days):
            raise RuntimeError("LATEST_RESULT_DRAW_DAYS_INVALID")
        if cycle_date.isoformat() in days:
            scheduled.append(lottery)
    return scheduled


def _latest_completed_results(
    repository: AnalysisRepository,
    cycle_date: date | None = None,
) -> dict[str, Any]:
    client = getattr(repository, "client", None)
    if client is None:
        payload: dict[str, Any] = {"drawDate": None, "items": []}
        if cycle_date is not None:
            payload["dueLotteries"] = []
        return payload

    due_lotteries = (
        _scheduled_lotteries_for_date(client, cycle_date)
        if cycle_date is not None
        else None
    )
    empty_payload: dict[str, Any] = {"drawDate": None, "items": []}
    if due_lotteries is not None:
        empty_payload["dueLotteries"] = due_lotteries

    latest_response = (
        client.table("lottery_draws")
        .select("lottery,period,draw_date,result_status")
        .eq("result_status", "confirmed")
        .order("draw_date", desc=True, nullsfirst=False)
        .order("period", desc=True)
        .limit(1)
        .execute()
    )
    latest_rows = latest_response.data if isinstance(latest_response.data, list) else []
    if not latest_rows:
        return empty_payload

    latest_date = str(latest_rows[0].get("draw_date") or "") if isinstance(latest_rows[0], dict) else ""
    try:
        if date.fromisoformat(latest_date).isoformat() != latest_date:
            raise ValueError("draw_date")
    except ValueError as error:
        raise RuntimeError("LATEST_RESULT_DRAW_INVALID") from error

    response = (
        client.table("lottery_draws")
        .select("lottery,period,draw_date,result_status")
        .eq("result_status", "confirmed")
        .eq("draw_date", latest_date)
        .order("period", desc=True)
        .execute()
    )
    rows = response.data if isinstance(response.data, list) else []
    latest_by_lottery: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise RuntimeError("LATEST_RESULT_DRAW_INVALID")
        lottery = str(row.get("lottery") or "")
        if lottery not in LOTTERIES or lottery in latest_by_lottery:
            continue
        latest_by_lottery[lottery] = row

    items: list[dict[str, str]] = []
    for lottery in ("今彩539", "天天樂", "大樂透", "六合彩"):
        row = latest_by_lottery.get(lottery)
        if row is None:
            continue
        period = str(row.get("period") or "")
        if not period:
            raise RuntimeError("LATEST_RESULT_DRAW_INVALID")
        chain = client.rpc("matrix_watchdog_chain_state", {
            "p_lottery": lottery,
            "p_draw_period": period,
        }).execute().data
        if not isinstance(chain, dict):
            raise RuntimeError("LATEST_RESULT_CHAIN_INVALID")
        if (
            str(chain.get("latestPeriod") or "") == period
            and chain.get("analysisComplete") is True
            and chain.get("matrixStatusComplete") is True
        ):
            items.append({"lottery": lottery, "period": period})

    payload: dict[str, Any] = {"drawDate": latest_date, "items": items}
    if due_lotteries is not None:
        payload["dueLotteries"] = due_lotteries
    return payload


def _parse_recovery_lease_owner(value: Any) -> str:
    owner = str(value or "").strip()
    if not owner or len(owner) > 200:
        raise ValueError("INVALID_RECOVERY_LEASE_OWNER")
    return owner


def _parse_number_order(value: Any) -> str:
    order = str(value or "")
    if order not in NUMBER_ORDERS:
        raise ValueError("未知號碼順序")
    return order


def _card_manifest(lottery: str, repository: AnalysisRepository) -> dict[str, Any]:
    encoded_lottery = quote(lottery, safe="")
    latest = _history(repository, lottery, sum(card_layout(lottery)["column_rows"]))
    item = latest[0] if latest else None
    return {
        "lottery": lottery,
        "period": None if item is None else item["period"],
        "cards": {
            order: {"url": f"{CARD_PREFIX}{encoded_lottery}/{order}.svg"}
            for order in publication_orders(lottery, latest, repository) if item is not None
        },
    }


class MatrixCardRequestError(ValueError):
    """A known card request error whose message is safe for clients."""


def handle_matrix_card_request(
    target: str,
    repository: AnalysisRepository,
) -> tuple[int, str] | None:
    path = urlsplit(target).path
    if not path.startswith(CARD_PREFIX) or not path.endswith(".svg"):
        return None
    route = path[len(CARD_PREFIX):-4]
    try:
        encoded_lottery, order = route.rsplit("/", 1)
    except ValueError as error:
        raise MatrixCardRequestError("牌單路徑格式錯誤") from error
    try:
        lottery = _parse_lottery(unquote(encoded_lottery))
    except ValueError as error:
        raise MatrixCardRequestError("未知彩種") from error
    if order not in {"draw", "sorted"}:
        raise MatrixCardRequestError("未知牌單順序")
    row_count = sum(card_layout(lottery)["column_rows"])
    draws = _history(repository, lottery, row_count)
    if not draws or order not in publication_orders(lottery, draws, repository):
        raise MatrixCardRequestError("牌單尚未建立")
    return 200, render_matrix_card(lottery, order, draws)


def _parse_numbers(value: Any, maximum: int = 3) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("探索號碼格式錯誤")
    if len(value) > maximum:
        raise ValueError(f"最多只能輸入 {maximum} 個號碼。")
    numbers = [_normalize_number(item) for item in value]
    if len(set(numbers)) != len(numbers):
        raise ValueError("探索號碼不可重複")
    return numbers


def _normalize_draw(draw: dict[str, Any]) -> dict[str, Any]:
    numbers = [_normalize_number(value) for value in draw.get("numbers", [])]
    sorted_numbers = [_normalize_number(value) for value in draw.get("sortedNumbers", numbers)]
    draw_order_raw = draw.get("drawOrderNumbers")
    draw_order = [_normalize_number(value) for value in draw_order_raw] if isinstance(draw_order_raw, list) else None
    return {
        "period": str(draw.get("period", "")),
        "issue": str(draw.get("period", "")),
        "drawDate": draw.get("drawDate"),
        "date": draw.get("drawDate"),
        "numbers": sorted_numbers,
        "sortedNumbers": sorted_numbers,
        "drawOrderNumbers": draw_order,
        "resultStatus": draw.get("resultStatus", "confirmed"),
    }


def _normalize_supabase_draw(draw: dict[str, Any]) -> dict[str, Any]:
    return _normalize_draw({
        "period": draw.get("period"),
        "drawDate": draw.get("draw_date"),
        "numbers": draw.get("numbers") or [],
        "sortedNumbers": draw.get("sorted_numbers") or draw.get("numbers") or [],
        "drawOrderNumbers": draw.get("draw_order_numbers"),
        "resultStatus": draw.get("result_status", "confirmed"),
    })


def _history_years(repository: AnalysisRepository, lottery: str) -> list[str]:
    if getattr(repository, "client", None) is not None:
        return _draw_query(repository, lottery, "summary")["years"]
    # In-memory repositories retain the same contract for isolated tests.
    years: set[str] = set()

    def add_date(value: Any) -> None:
        text = str(value or "")
        if len(text) >= 10 and text[:4].isdigit() and text[4] in {"-", "/"}:
            years.add(text[:4])

    for draw in repository.list_draws(lottery, None):
        add_date(draw.get("drawDate"))
    return sorted(years, reverse=True)


class HistoryChangedError(Exception):
    pass


def _page_size(value: Any) -> int:
    try:
        size = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError("INVALID_PAGE_SIZE") from error
    if isinstance(value, bool) or str(size) != str(value) or not 1 <= size <= 500:
        raise ValueError("INVALID_PAGE_SIZE")
    return size


def _draw_query(repository: AnalysisRepository, lottery: str, kind: str, **params: Any) -> dict[str, Any]:
    cursor = params.get("p_cursor")
    if cursor is not None and not isinstance(cursor, dict):
        raise ValueError("INVALID_CURSOR")
    cache = getattr(repository, "draw_read_cache", None)
    if cache is not None and kind == "latest":
        # One bounded probe per public API process, rather than one per visitor.
        # Realtime publication invalidates sooner; the TTL covers missed events.
        key = json.dumps([lottery, "latest", params], sort_keys=True, ensure_ascii=False)
        return cache.read(key, lambda: _execute_draw_query(repository, lottery, kind, **params),
                          ttl=public_read_ttl_seconds())
    if cache is not None and kind in {"history", "tongxing"}:
        # Revalidate with a small latest-row response before reusing a large page.
        # Database revisions cover all history corrections and cross-process writers.
        latest = _draw_query(repository, lottery, "latest")
        revision = latest.get("revision")
        if isinstance(revision, str) and revision and (cursor is None or cursor.get("revision") == revision):
            key = json.dumps([lottery, revision, kind, params], sort_keys=True, ensure_ascii=False)
            return cache.read(key, lambda: _execute_draw_query(repository, lottery, kind, **params))
    return _execute_draw_query(repository, lottery, kind, **params)


def _execute_draw_query(repository: AnalysisRepository, lottery: str, kind: str, **params: Any) -> dict[str, Any]:
    data = repository.client.rpc("matrix_draw_query", {
        "p_lottery": lottery, "p_kind": kind, **params,
    }).execute().data
    if not isinstance(data, dict):
        raise RuntimeError("DRAW_QUERY_INVALID_RESPONSE")
    if data.get("error") == "DRAW_HISTORY_CHANGED":
        raise HistoryChangedError()
    if data.get("error") == "DRAW_HISTORY_CONFLICT":
        raise ValueError("DRAW_HISTORY_CONFLICT")
    return data


def _cached_legacy_draw_read(
    repository: AnalysisRepository,
    lottery: str,
    query: list[Any],
    load: Callable[[str | None], dict[str, Any]],
) -> dict[str, Any]:
    cache = getattr(repository, "draw_read_cache", None)
    if cache is None:
        return load(None)
    revision = _draw_query(repository, lottery, "latest").get("revision")
    if not isinstance(revision, str) or not revision:
        return load(None)
    key = json.dumps([lottery, revision, "legacy", query], sort_keys=True, ensure_ascii=False)
    return cache.read(key, lambda: load(revision))


def _history(repository: AnalysisRepository, lottery: str, limit: int | None) -> list[dict[str, Any]]:
    if getattr(repository, "client", None) is None:
        return _uncached_history(repository, lottery, limit)

    def load(revision: str | None) -> dict[str, Any]:
        items = _uncached_history(repository, lottery, limit)
        # Legacy table pages have no revision cursor. Check the database again
        # before publishing the complete response, so corrections cannot cache
        # a mixed snapshot. Keep its existing ordering and alias reconciliation.
        # This final fence must start after the pages, rather than join an older
        # in-flight latest probe from another request.
        if revision is not None and _execute_draw_query(repository, lottery, "latest").get("revision") != revision:
            raise HistoryChangedError()
        return {"items": items}

    return _cached_legacy_draw_read(repository, lottery, ["history", limit], load)["items"]


def _uncached_history(repository: AnalysisRepository, lottery: str, limit: int | None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: dict[str, dict[str, Any]] = {}

    def append_unique(draw: dict[str, Any]) -> None:
        period = draw["period"]
        if lottery in {"今彩539", "大樂透"} and len(period) == 8 and period.isdigit():
            period = period.zfill(9)
        draw = {**draw, "period": period, "issue": period}
        previous = seen.get(period)
        if previous is not None:
            if previous != draw:
                raise ValueError("DRAW_HISTORY_CONFLICT")
            return
        seen[period] = draw
        items.append(draw)

    client = getattr(repository, "client", None)
    if client is None:
        rows = repository.list_draws(lottery, limit)
        for draw in rows:
            append_unique(_normalize_draw(draw))
        if limit is not None and len(items) < limit and len(rows) == limit:
            for draw in repository.list_draws(lottery, None):
                append_unique(_normalize_draw(draw))
                if len(items) >= limit:
                    break
        return items if limit is None else items[:limit]

    offset = 0
    remaining = limit
    while remaining is None or remaining > 0:
        page_size = PAGE_SIZE if remaining is None else min(PAGE_SIZE, remaining)
        response = (
            client.table("lottery_draws")
            .select("period,draw_date,numbers,sorted_numbers,draw_order_numbers,result_status")
            .eq("lottery", lottery)
            .order("draw_date", desc=True, nullsfirst=False)
            .order("period", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = [dict(row) for row in response.data]
        for row in rows:
            append_unique(_normalize_supabase_draw(row))
        # A short page can be the server row cap, not the end of history.
        if not rows:
            break
        offset += len(rows)
        if remaining is not None:
            remaining = limit - len(items)
    return items if limit is None else items[:limit]


def _ordered_numbers(draw: dict[str, Any], order: str) -> list[str]:
    if order == "依實際開獎順序排序":
        actual = draw.get("drawOrderNumbers")
        return list(actual) if isinstance(actual, list) and draw.get("resultStatus") != "preliminary" else []
    return list(draw.get("sortedNumbers") or draw.get("numbers") or [])


def _project_draw(draw: dict[str, Any], order: str) -> dict[str, Any]:
    numbers = _ordered_numbers(draw, order)
    projected = {
        "period": draw["period"],
        "issue": draw["period"],
        "drawDate": draw.get("drawDate"),
        "date": draw.get("drawDate"),
        "numbers": numbers,
        "resultStatus": draw.get("resultStatus", "confirmed"),
        "sortedNumbers": draw.get("sortedNumbers", draw.get("numbers", [])),
        "drawOrderNumbers": draw.get("drawOrderNumbers"),
    }
    if len(numbers) == 7:
        projected["specialNumber"] = numbers[6]
    return projected


def _tongxing(repository: AnalysisRepository, body: dict[str, Any]) -> dict[str, Any]:
    lottery = _parse_lottery(body.get("lottery"))
    number_order = _parse_number_order(body.get("numberOrder"))
    numbers = _parse_numbers(body.get("numbers", []))
    try:
        future_offset = int(body.get("futureOffset"))
    except (TypeError, ValueError) as error:
        raise ValueError("驗證期數請設定 1 至 30 期。") from error
    if not 1 <= future_offset <= 30:
        raise ValueError("驗證期數請設定 1 至 30 期。")
    groups: list[dict[str, Any]] = []
    if not numbers:
        return {"lottery": lottery, "numberOrder": number_order, "numbers": numbers, "futureOffset": future_offset, "groups": groups}
    if getattr(repository, "client", None) is not None:
        explicit_page = "pageSize" in body
        page_size = _page_size(body.get("pageSize", 500))
        initial_cursor = body.get("cursor")
        if initial_cursor is not None and not isinstance(initial_cursor, dict):
            raise ValueError("INVALID_CURSOR")

        def load(revision: str | None) -> dict[str, Any]:
            cursor = initial_cursor
            groups: list[dict[str, Any]] = []
            # A legacy response is one cached query, including every filtered
            # page. Its revision pins all pages without another probe per page.
            query = _execute_draw_query if revision is not None else _draw_query
            while True:
                data = query(repository, lottery, "tongxing",
                    p_limit=page_size, p_cursor=cursor,
                    p_numbers=numbers, p_order=number_order, p_future_offset=future_offset)
                if revision is not None and data["revision"] != revision:
                    raise HistoryChangedError()
                revision = data["revision"]
                page_groups = data["groups"]
                groups.extend({key: _project_draw(_normalize_supabase_draw(pair[key]), number_order)
                               for key in ("lockedEntry", "predictedEntry")} for pair in page_groups)
                next_cursor = data.get("nextCursor")
                if explicit_page or next_cursor is None:
                    break
                offset = cursor.get("offset", 0) if cursor is not None else 0
                if (not page_groups or not isinstance(next_cursor, dict)
                        or type(next_cursor.get("offset")) is not int
                        or next_cursor["offset"] != offset + len(page_groups)):
                    raise RuntimeError("DRAW_QUERY_INVALID_CURSOR")
                if next_cursor.get("revision") != revision:
                    raise HistoryChangedError()
                cursor = next_cursor
            return {"lottery": lottery, "numberOrder": number_order, "numbers": numbers,
                    "futureOffset": future_offset, "groups": groups,
                    "revision": data["revision"], "nextCursor": data.get("nextCursor")}

        if explicit_page:
            return load(None)
        return _cached_legacy_draw_read(repository, lottery,
            ["tongxing", number_order, numbers, future_offset, initial_cursor], load)
    history = _history(repository, lottery, None)
    for locked_index in range(future_offset, len(history)):
        locked_entry = history[locked_index]
        locked_numbers = _ordered_numbers(locked_entry, number_order)
        if not all(number in locked_numbers for number in numbers):
            continue
        predicted_entry = history[locked_index - future_offset]
        groups.append({
            "lockedEntry": _project_draw(locked_entry, number_order),
            "predictedEntry": _project_draw(predicted_entry, number_order),
        })
    groups.reverse()
    return {"lottery": lottery, "numberOrder": number_order, "numbers": numbers, "futureOffset": future_offset, "groups": groups}


def _number_reference(repository: AnalysisRepository, body: dict[str, Any]) -> dict[str, Any]:
    lottery = _parse_lottery(body.get("lottery"))
    number_order = _parse_number_order(body.get("numberOrder"))
    try:
        history_range = int(body.get("historyRange"))
    except (TypeError, ValueError) as error:
        raise ValueError("歷史範圍僅支援1000、3000、5000期") from error
    if history_range not in HISTORY_RANGES:
        raise ValueError("歷史範圍僅支援1000、3000、5000期")
    numbers = _parse_numbers(body.get("numbers", []))
    history = _history(repository, lottery, history_range)
    items: list[dict[str, Any]] = []
    for draw in reversed(history):
        displayed = _ordered_numbers(draw, number_order)
        item = _project_draw(draw, number_order)
        item["matchSlots"] = [numbers.index(number) + 1 if number in numbers else 0 for number in displayed]
        items.append(item)
    return {"lottery": lottery, "numberOrder": number_order, "historyRange": history_range, "numbers": numbers, "items": items}


def _decode_body(body: bytes | None) -> dict[str, Any]:
    if not body:
        return {}
    value = json.loads(body.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("查詢條件格式錯誤")
    return value


def _status_token_authorized(candidate_value: str | None) -> bool:
    expected = environ.get("MATRIX_ADMIN_STATUS_TOKEN", "")
    candidate = candidate_value or ""
    matched = compare_digest(
        candidate.encode("utf-8"),
        expected.encode("utf-8"),
    )
    return bool(expected) and bool(candidate) and matched


def refresh_latest_draw(
    lottery: str,
    repository: AnalysisRepository,
) -> dict[str, Any]:
    if lottery == "天天樂":
        result = run_fantasy5_crawler_once()
        if result.get("status") == "not-acquired":
            raise SourceNotReady()
        if result.get("status") not in {"acquired", "already-acquired"}:
            raise ValueError("INVALID_CRAWLER_RESULT")
        draw = repository.get_draw(lottery, str(result.get("drawPeriod") or ""))
        if draw is None:
            raise ValueError("DRAW_NOT_STORED")
        return draw
    with httpx.Client(verify=create_railway_ssl_context()) as client:
        return DrawRefreshService(repository, LatestDrawSource(client)).refresh(lottery)


def run_lottery_recovery(lottery: str) -> None:
    settings = load_settings()
    repository = create_supabase_repository(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
    if lottery == "天天樂":
        with notification_emitter_context(settings) as notification_emitter:
            run_analysis_only_worker(
                lottery,
                repository,
                notification_emitter=notification_emitter,
            )
        return

    with httpx.Client(verify=create_railway_ssl_context()) as client:
        notification_emitter = create_notification_emitter(settings, client)
        run_scheduled_worker(
            lottery,
            None,
            repository,
            LatestDrawSource(client),
            notification_emitter=notification_emitter,
            allow_recovery_crawl=True,
        )


_RECOVERY_COORDINATOR = RecoveryCoordinator(
    run_lottery_recovery,
    targeted_runner=run_targeted_recovery,
    verify=verify_recovery,
    record_success=complete_recovery,
    begin_lease=begin_recovery_lease,
    renew_lease=renew_recovery_lease,
    release_lease=release_recovery_lease,
    on_lease_lost=terminate_on_lease_loss,
)


def refresh_marksix_calendar(repository: AnalysisRepository) -> dict[str, Any]:
    with httpx.Client(verify=create_railway_ssl_context()) as client:
        return sync_marksix_calendar(repository, client)


def handle_api_request(
    method: str,
    target: str,
    body: bytes | None,
    repository: AnalysisRepository,
    request_monitor_token: str | None = None,
    refresh_lottery: Callable[[str, AnalysisRepository], dict[str, Any]] | None = None,
    recover_lottery: Callable[[str, str], str] | None = None,
    run_primary: Callable[[str, date, tuple[str, ...]], str] | None = None,
    refresh_marksix: Callable[[AnalysisRepository], dict[str, Any]] | None = None,
    request_notification_token: str | None = None,
) -> tuple[int, dict[str, Any]]:
    parsed = urlsplit(target)
    path = parsed.path
    try:
        if method == "GET" and path == "/health":
            try:
                repository.health_check()
            except Exception:
                return 503, _health_payload("error")
            return 200, _health_payload("ok")
        if method == "GET" and path == "/jobs/status":
            if not _status_token_authorized(request_monitor_token):
                return 403, {"error": "FORBIDDEN"}
            try:
                settings = load_settings()
                return 200, {
                    "items": repository.list_job_statuses(),
                    "tinyfish": tinyfish_status_payload(repository, settings),
                }
            except Exception:
                return 503, {"error": "STATUS_UNAVAILABLE"}
        if method == "POST" and path == "/jobs/refresh":
            if not _status_token_authorized(request_monitor_token):
                return 403, {"error": "FORBIDDEN"}
            lottery = _parse_lottery(_decode_body(body).get("lottery"))
            try:
                task = _REFRESH_COORDINATOR.enqueue(lottery, repository.manual_refresh,
                    lambda: (refresh_lottery or refresh_latest_draw)(lottery, repository))
                return 202, task
            except Exception:
                return 503, {"error": "REFRESH_UNAVAILABLE"}
        if method == "GET" and path == "/jobs/refresh/status":
            if not _status_token_authorized(request_monitor_token):
                return 403, {"error": "FORBIDDEN"}
            query = parse_qs(parsed.query)
            lottery = _parse_lottery(query.get("lottery", [None])[0])
            request_id = str(UUID(query.get("requestId", [""])[0]))
            try:
                task = repository.manual_refresh.get(lottery, request_id)
                return (200, task) if task else (404, {"error": "REFRESH_NOT_FOUND"})
            except Exception:
                return 503, {"error": "STATUS_UNAVAILABLE"}
        if method == "POST" and path == "/jobs/recover":
            if not _status_token_authorized(request_monitor_token):
                return 403, {"error": "FORBIDDEN"}
            recovery_request = _decode_body(body)
            lottery = _parse_lottery(recovery_request.get("lottery"))
            lease_owner = _parse_recovery_lease_owner(
                recovery_request.get("leaseOwner")
            )
            stage = recovery_request.get("stage")
            period = recovery_request.get("drawPeriod")
            minimum_date = recovery_request.get("minimumDrawDate")
            options = {}
            if stage is not None:
                if stage not in {"crawler", "analysis", "matrix-status", "card"}:
                    raise ValueError("RECOVERY_STAGE_INVALID")
                if stage != "crawler" and (not isinstance(period, str) or not period.isascii() or not period.isdigit() or len(period) > 20):
                    raise ValueError("RECOVERY_PERIOD_REQUIRED")
                if stage == "crawler":
                    if not isinstance(minimum_date, str):
                        raise ValueError("RECOVERY_DRAW_DATE_REQUIRED")
                    date.fromisoformat(minimum_date)
                options = {"stage": stage, "draw_period": period, "minimum_draw_date": minimum_date}
            try:
                recovery_status = (recover_lottery or _RECOVERY_COORDINATOR.enqueue)(
                    lottery, lease_owner, **options,
                )
                return 202, {"lottery": lottery, "status": recovery_status}
            except Exception:
                return 503, {"error": "RECOVERY_UNAVAILABLE"}
        if method == "POST" and path == "/jobs/calendar/marksix":
            if not _status_token_authorized(request_monitor_token):
                return 403, {"error": "FORBIDDEN"}
            try:
                result = (refresh_marksix or refresh_marksix_calendar)(repository)
            except Exception:
                return 503, {"error": "CALENDAR_UNAVAILABLE"}
            status = result.get("status")
            if status == "unavailable":
                return 503, {"error": "CALENDAR_UNAVAILABLE"}
            if status not in {"synced", "not-due"}:
                return 503, {"error": "CALENDAR_UNAVAILABLE"}
            payload: dict[str, Any] = {"lottery": "六合彩", "status": status}
            if isinstance(result.get("days"), int):
                payload["days"] = result["days"]
            return 200, payload
        if method == "POST" and path == "/jobs/primary":
            if not _status_token_authorized(request_monitor_token):
                return 403, {"error": "FORBIDDEN"}
            primary_request = _decode_body(body)
            group = primary_request.get("group")
            if group not in {"evening", "fantasy5"}:
                raise ValueError("PRIMARY_GROUP_INVALID")
            try:
                cycle_date = date.fromisoformat(primary_request.get("cycleDate"))
            except (TypeError, ValueError) as error:
                raise ValueError("PRIMARY_CYCLE_DATE_INVALID") from error
            lotteries_value = primary_request.get("lotteries")
            if not isinstance(lotteries_value, list) or any(
                not isinstance(lottery, str) for lottery in lotteries_value
            ):
                raise ValueError("PRIMARY_LOTTERIES_INVALID")
            lotteries = tuple(lotteries_value)
            allowed = (
                {"今彩539", "大樂透", "六合彩"}
                if group == "evening" else {"天天樂"}
            )
            if not lotteries or len(set(lotteries)) != len(lotteries) or any(
                lottery not in allowed for lottery in lotteries
            ):
                raise ValueError("PRIMARY_LOTTERIES_INVALID")
            if run_primary is None:
                return 503, {"error": "PRIMARY_UNAVAILABLE"}
            try:
                primary_status = run_primary(group, cycle_date, lotteries)
                return 202, {"group": group, "status": primary_status}
            except Exception:
                return 503, {"error": "PRIMARY_UNAVAILABLE"}
        if method == "POST" and path == "/jobs/result-ready":
            expected = environ.get("MATRIX_NOTIFICATION_INGEST_TOKEN", "").strip()
            supplied = request_notification_token or ""
            if not expected or not supplied or not compare_digest(expected.encode(), supplied.encode()):
                return 403, {"error": "FORBIDDEN"}
            ready = _decode_body(body)
            lottery = _parse_lottery(ready.get("lottery"))
            latest = repository.list_draws(lottery, 1)
            if not latest or not ready.get("drawDate") or latest[0].get("drawDate") != ready["drawDate"]:
                return 409, {"error": "RESULT_NOT_CURRENT"}
            try:
                result = (recover_lottery or _RECOVERY_COORDINATOR.enqueue)(lottery, None)
                return 202, {"lottery": lottery, "status": result}
            except Exception:
                return 503, {"error": "RECOVERY_UNAVAILABLE"}
        if method == "GET" and path.startswith(CARD_PREFIX):
            card_lottery = path[len(CARD_PREFIX):]
            if "/" not in card_lottery:
                lottery = _parse_lottery(unquote(card_lottery))
                if parse_qs(parsed.query).get('format') == ['png']:
                    return 200, published_manifest(lottery, repository) or {
                        'lottery': lottery, 'period': None, 'cards': {},
                    }
                # Keep the pre-PNG manifest for installed PWA clients.
                return 200, _card_manifest(lottery, repository)
        if method == "GET" and path == "/api/matrix/latest-result":
            query = parse_qs(parsed.query)
            cycle_values = query.get("cycleDate", [])
            if len(cycle_values) > 1:
                raise ValueError("INVALID_CYCLE_DATE")
            cycle_date = None
            if cycle_values:
                try:
                    cycle_date = date.fromisoformat(cycle_values[0])
                except ValueError as error:
                    raise ValueError("INVALID_CYCLE_DATE") from error
                if cycle_date.isoformat() != cycle_values[0]:
                    raise ValueError("INVALID_CYCLE_DATE")
            cache = getattr(repository, "draw_read_cache", None)
            # Calendar overrides are independent of draw/result revisions.
            # Resolve due lotteries on every dated request.
            if cycle_date is not None or cache is None or getattr(repository, "client", None) is None:
                return 200, _latest_completed_results(repository, cycle_date)
            key = json.dumps(["latest-result", cycle_date.isoformat() if cycle_date else None])
            return 200, cache.read(key, lambda: _latest_completed_results(repository, cycle_date),
                                   ttl=public_read_ttl_seconds())
        latest_prefix = "/api/matrix/latest/"
        years_prefix = "/api/matrix/history-years/"
        if method == "GET" and path.startswith(years_prefix):
            lottery = _parse_lottery(unquote(path[len(years_prefix):]))
            return 200, {"years": _history_years(repository, lottery)}
        history_prefix = "/api/matrix/history/"
        if method == "GET" and path.startswith(latest_prefix):
            lottery = _parse_lottery(unquote(path[len(latest_prefix):]))
            metadata = {}
            if getattr(repository, "client", None) is not None:
                data = _draw_query(repository, lottery, "latest")
                items = [_normalize_supabase_draw(row) for row in data["items"]]
                metadata = {"revision": data["revision"]}
            else:
                items = _history(repository, lottery, 1)
            item = items[0] if items else None
            if item is not None:
                item = {**item, "nextDrawAt": next_lottery_draw_time(lottery).isoformat()}
            return 200, {"item": item, **metadata}
        if method == "GET" and path.startswith(history_prefix):
            lottery = _parse_lottery(unquote(path[len(history_prefix):]))
            query = parse_qs(parsed.query)
            if "periods" in query:
                periods = json.loads(query["periods"][0])
                if (not isinstance(periods, list) or len(periods) > 500
                    or any(not isinstance(period, str) or not period.isascii()
                           or not period.isdigit() or not 1 <= len(period) <= 12 for period in periods)):
                    raise ValueError("INVALID_PERIODS")
                data = repository.client.rpc("matrix_draw_periods", {
                    "p_lottery": lottery, "p_periods": list(dict.fromkeys(periods)),
                }).execute().data
                if not isinstance(data, dict) or not isinstance(data.get("items"), list):
                    if isinstance(data, dict) and data.get("error") == "DRAW_HISTORY_CONFLICT":
                        raise ValueError("DRAW_HISTORY_CONFLICT")
                    raise RuntimeError("DRAW_QUERY_INVALID_RESPONSE")
                return 200, {"items": [_normalize_supabase_draw(row) for row in data["items"]]}
            # Explicit pagination preserves the full legacy response for installed clients.
            # Updated PWA clients always use pageSize and follow nextCursor.
            if "pageSize" in query:
                size = _page_size(query["pageSize"][0])
                cursor = json.loads(query["cursor"][0]) if "cursor" in query else None
                data = _draw_query(repository, lottery, "history", p_limit=size, p_cursor=cursor)
                return 200, {**data, "items": [_normalize_supabase_draw(row) for row in data["items"]]}
            limit: int | None = None
            if "limit" in query:
                try:
                    limit = int(query["limit"][0])
                except (TypeError, ValueError) as error:
                    raise ValueError("limit 必須為正整數") from error
                if limit <= 0:
                    raise ValueError("limit 必須為正整數")
            return 200, {"items": _history(repository, lottery, limit)}
        if method == "POST" and path == "/api/matrix/tongxing":
            return 200, _tongxing(repository, _decode_body(body))
        if method == "POST" and path == "/api/matrix/number-reference":
            return 200, _number_reference(repository, _decode_body(body))
        return 404, {"error": "NOT_FOUND"}
    except HistoryChangedError:
        return 409, {"error": "DRAW_HISTORY_CHANGED"}
    except APIError as error:
        if error.code == "22023":
            return 400, {"error": "INVALID_QUERY"}
        logging.getLogger(__name__).error("matrix-query-database-error %s", error.code)
        return 503, {"error": "QUERY_TEMPORARILY_UNAVAILABLE"}
    except (httpx.TimeoutException, httpx.PoolTimeout):
        return 503, {"error": "QUERY_TEMPORARILY_UNAVAILABLE"}
    except (ValueError, json.JSONDecodeError) as error:
        return 400, {"error": str(error)}
    except Exception as error:
        # Log only exception classes and code locations; messages may contain credentials.
        chain = []
        seen = set()
        current = error
        while current is not None and id(current) not in seen and len(chain) < 5:
            seen.add(id(current))
            frames = traceback.extract_tb(current.__traceback__)
            chain.append({"type": type(current).__name__, "frames": [
                {"function": frame.name, "line": frame.lineno} for frame in frames[-6:]
            ]})
            current = current.__cause__ or current.__context__
        logging.getLogger(__name__).error("matrix-api-internal-error %s", json.dumps(chain))
        return 500, {"error": "INTERNAL_ERROR"}


class RailwayApiHandler(BaseHTTPRequestHandler):
    repository: AnalysisRepository
    security_monitor: SecurityMonitor | None = None

    def _security_before(self, method: str) -> bool:
        monitor = self.security_monitor
        category = request_category(self.path, method)
        self._security_category = category
        if monitor is None or category is None:
            return True
        source, trusted = monitor.identity(self.client_address[0])
        self._security_identity = (source, trusted)
        result = monitor.check(category, source, trusted)
        if not result["allowed"]:
            self._security_retry_after = result["retryAfter"]
            self._send(429, {"error": "RATE_LIMITED"}, allow_cors=not self._is_protected_job_path(), no_store=True)
            return False
        return True

    def _security_outcome(self, status: int) -> None:
        if self.security_monitor is None:
            return
        if self._is_protected_job_path() and status in (401, 403):
            source, trusted = self.security_monitor.identity(self.client_address[0])
            self.security_monitor.observe("unauthorized", source, trusted, "attempt")
            self.security_monitor.observe("unauthorized", source, trusted, "denied")
            return
        if not getattr(self, "_security_category", None):
            return
        if status in (400, 401, 403, 404, 413):
            source, trusted = self._security_identity
            self.security_monitor.observe(self._security_category, source, trusted,
                                          "denied" if status in (401, 403) else "invalid")

    def _write_response(self, encoded: bytes) -> None:
        try:
            self.end_headers()
            self.wfile.write(encoded)
        except BrokenPipeError:
            return

    def _send(
        self,
        status: int,
        payload: dict[str, Any],
        *,
        allow_cors: bool = True,
        no_store: bool = False,
    ) -> None:
        self._security_outcome(status)
        encoded = b"" if status == 204 else json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        history_read = self.command == "GET" and urlsplit(self.path).path.startswith("/api/matrix/history/")
        etag = None
        if history_read and status == 200 and not no_store:
            etag = '"' + sha256(encoded).hexdigest() + '"'
            validators = [value.strip().removeprefix("W/")
                          for value in self.headers.get("If-None-Match", "").split(",")]
            if etag in validators or validators == ["*"]:
                status, encoded = 304, b""
        self.send_response(status)
        if status not in (204, 304):
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
        if status == 429:
            self.send_header("Retry-After", str(self._security_retry_after))
        if etag is not None:
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "private, no-cache")
        elif no_store or history_read:
            self.send_header("Cache-Control", "no-store")
        if allow_cors:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type,X-Request-ID,If-None-Match")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self._write_response(encoded)

    def _is_protected_job_path(self) -> bool:
        return urlsplit(self.path).path in {
            "/jobs/status",
            "/jobs/refresh",
            "/jobs/refresh/status",
            "/jobs/recover",
            "/jobs/calendar/marksix",
            "/jobs/primary",
            "/jobs/result-ready",
        }

    def _is_matrix_card_path(self) -> bool:
        return urlsplit(self.path).path.startswith(CARD_PREFIX)

    def _send_svg(self, status: int, svg: str) -> None:
        encoded = svg.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self._write_response(encoded)

    def do_OPTIONS(self) -> None:
        protected = self._is_protected_job_path()
        self._send(204, {}, allow_cors=not protected, no_store=protected)

    def do_GET(self) -> None:
        # Job control belongs exclusively to the isolated recovery service.
        # Keep the shared dispatcher for recovery_server.py, but never expose it
        # through the public Matrix API process even when a valid admin token is supplied.
        if self._is_protected_job_path():
            self._send(404, {"error": "NOT_FOUND"}, allow_cors=False, no_store=True)
            return
        if not self._security_before("GET"):
            return
        protected = False
        if self._is_matrix_card_path() and urlsplit(self.path).path.endswith(".svg"):
            try:
                card_response = handle_matrix_card_request(self.path, self.repository)
            except MatrixCardRequestError as error:
                self._send(400, {"error": str(error)}, no_store=True)
                return
            except Exception as error:
                # Keep database/transport failures inside the HTTP boundary;
                # exception messages may include credentials or query details.
                logging.getLogger(__name__).error(
                    "matrix-card-unavailable %s", type(error).__name__
                )
                self._send(503, {"error": "CARD_UNAVAILABLE"}, no_store=True)
                return
            if card_response is not None:
                status, svg = card_response
                self._send_svg(status, svg)
                return
        status, payload = handle_api_request(
            "GET",
            self.path,
            None,
            self.repository,
            request_monitor_token=self.headers.get("X-Matrix-Admin-Token"),
            request_notification_token=self.headers.get("X-Matrix-Notification-Token"),
        )
        self._send(
            status,
            payload,
            allow_cors=not protected,
            no_store=protected or self._is_matrix_card_path(),
        )

    def do_POST(self) -> None:
        if self._is_protected_job_path():
            self._send(404, {"error": "NOT_FOUND"}, allow_cors=False, no_store=True)
            return
        if not self._security_before("POST"):
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        protected = False
        if length > MAX_REQUEST_BODY_BYTES:
            self._send(
                413,
                {"error": "PAYLOAD_TOO_LARGE"},
                allow_cors=not protected,
                no_store=protected,
            )
            return
        body = self.rfile.read(length) if length > 0 else b""
        status, payload = handle_api_request(
            "POST",
            self.path,
            body,
            self.repository,
            request_monitor_token=self.headers.get("X-Matrix-Admin-Token"),
            request_notification_token=self.headers.get("X-Matrix-Notification-Token"),
        )
        self._send(status, payload, allow_cors=not protected, no_store=protected)

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        path = urlsplit(self.path).path
        print(
            f"railway-api {self.address_string()} "
            f"{self.command} {path} {code} {size}"
        )

    def log_message(self, format: str, *args: Any) -> None:
        print(f"railway-api {self.address_string()} handler-event")


class BoundedApiServer(ThreadingHTTPServer):
    """Keep parallel reads, with a fixed upper bound and no unbounded thread queue."""

    def __init__(self, address, handler, *, max_requests=PUBLIC_API_MAX_CONCURRENCY):
        self._request_slots = BoundedSemaphore(max_requests)
        super().__init__(address, handler)

    def get_request(self):
        request, address = super().get_request()
        request.settimeout(10)
        return request, address

    def process_request(self, request, client_address):
        if not self._request_slots.acquire(blocking=False):
            try:
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nRetry-After: 1\r\nCache-Control: no-store\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


def create_repository() -> AnalysisRepository:
    settings = load_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise RuntimeError("SUPABASE_CONFIG_MISSING")
    # A terminated shared HTTP/2 connection caused concurrent history/Tongxing 500s.
    # Keep the PostgREST timeout while using HTTP/1.1 for this long-lived API client.
    client = httpx.Client(http2=False, timeout=httpx.Timeout(6, connect=2, pool=1),
                         limits=httpx.Limits(
                             max_connections=PUBLIC_API_MAX_CONCURRENCY,
                             max_keepalive_connections=PUBLIC_API_MAX_CONCURRENCY,
                         ),
                         follow_redirects=True)
    try:
        repository = create_supabase_repository(
            settings.supabase_url, settings.supabase_secret_key, httpx_client=client,
        )
        repository.draw_read_cache = DrawReadCache()
        return repository
    except Exception:
        client.close()
        raise


def main() -> None:
    host = "0.0.0.0"
    port = int(environ.get("PORT", "8000"))
    RailwayApiHandler.repository = create_repository()
    settings = load_settings()
    publication_stop = Event()
    publication_thread = Thread(
        target=run_public_result_updates,
        args=(settings.supabase_url, settings.supabase_secret_key,
              RailwayApiHandler.repository.draw_read_cache, publication_stop),
        name='public-result-updates', daemon=True,
    )
    publication_thread.start()
    RailwayApiHandler.security_monitor = SecurityMonitor(
        settings.supabase_url, settings.supabase_secret_key,
        enforce=environ.get("MATRIX_SECURITY_ENFORCE", "") == "true",
        trust_direct_peer=environ.get("MATRIX_SECURITY_TRUST_DIRECT_PEER", "") == "true",
    )
    server = BoundedApiServer((host, port), RailwayApiHandler)
    print(f"Railway Matrix API listening on {host}:{port}")
    try:
        server.serve_forever()
    finally:
        publication_stop.set()
        publication_thread.join(timeout=2)
        RailwayApiHandler.security_monitor.close()
        server.server_close()


if __name__ == "__main__":
    main()
