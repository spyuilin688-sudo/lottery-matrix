from __future__ import annotations

import json
import logging
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from os import environ
from secrets import compare_digest
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlsplit

import httpx

from app.repositories.card_repository import published_manifest
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
from app.settings import load_settings
from app.worker import create_notification_emitter, run_scheduled_worker
from app.worker_all import create_railway_ssl_context


LOTTERIES = {"今彩539", "天天樂", "六合彩", "大樂透"}
NUMBER_ORDERS = {"依號碼由小到大排序", "依實際開獎順序排序"}
HISTORY_RANGES = {1000, 3000, 5000}
PAGE_SIZE = 1000
MAX_REQUEST_BODY_BYTES = 64 * 1024
SERVICE_NAME = "matrix-railway-api"
CARD_PREFIX = "/api/matrix/cards/"
FANTASY5_CRAWLER_ERROR = "FANTASY5_CRAWLER_GITHUB_ONLY"


def _service_version() -> str:
    return (
        environ.get("MATRIX_SERVICE_VERSION", "").strip()
        or environ.get("RAILWAY_GIT_COMMIT_SHA", "").strip()
        or "unknown"
    )


def _health_payload(status: str) -> dict[str, Any]:
    admin_api_status = (
        "ok"
        if environ.get("MATRIX_ADMIN_STATUS_TOKEN", "").strip()
        else "misconfigured"
    )
    return {
        "status": status,
        "service": SERVICE_NAME,
        "version": _service_version(),
        "database": {"status": status},
        "adminApi": {"status": admin_api_status},
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
    latest = _history(repository, lottery, 1)
    item = latest[0] if latest else None
    return {
        "lottery": lottery,
        "period": None if item is None else item["period"],
        "cards": {
            "draw": {"url": f"{CARD_PREFIX}{encoded_lottery}/draw.svg"},
            "sorted": {"url": f"{CARD_PREFIX}{encoded_lottery}/sorted.svg"},
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
    if not draws:
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
    }


def _normalize_supabase_draw(draw: dict[str, Any]) -> dict[str, Any]:
    return _normalize_draw({
        "period": draw.get("period"),
        "drawDate": draw.get("draw_date"),
        "numbers": draw.get("numbers") or [],
        "sortedNumbers": draw.get("sorted_numbers") or draw.get("numbers") or [],
        "drawOrderNumbers": draw.get("draw_order_numbers"),
    })


def _history_years(repository: AnalysisRepository, lottery: str) -> list[str]:
    # Fetch only dates; year choices must include history outside the current UI limit.
    years: set[str] = set()

    def add_date(value: Any) -> None:
        text = str(value or "")
        if len(text) >= 10 and text[:4].isdigit() and text[4] in {"-", "/"}:
            years.add(text[:4])

    client = getattr(repository, "client", None)
    if client is None:
        for draw in repository.list_draws(lottery, None):
            add_date(draw.get("drawDate"))
    else:
        offset = 0
        while True:
            rows = (client.table("lottery_draws").select("draw_date")
                    .eq("lottery", lottery)
                    .order("draw_date", desc=True, nullsfirst=False)
                    .order("period", desc=True)
                    .range(offset, offset + PAGE_SIZE - 1).execute()).data
            if not rows:
                break
            for row in rows:
                add_date(row.get("draw_date"))
            offset += len(rows)
    return sorted(years, reverse=True)


def _history(repository: AnalysisRepository, lottery: str, limit: int | None) -> list[dict[str, Any]]:
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
            .select("period,draw_date,numbers,sorted_numbers,draw_order_numbers")
            .eq("lottery", lottery)
            .order("draw_date", desc=True, nullsfirst=False)
            .order("period", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = [dict(row) for row in response.data]
        for row in rows:
            append_unique(_normalize_supabase_draw(row))
        if len(rows) < page_size:
            break
        offset += len(rows)
        if remaining is not None:
            remaining = limit - len(items)
    return items if limit is None else items[:limit]


def _ordered_numbers(draw: dict[str, Any], order: str) -> list[str]:
    if order == "依實際開獎順序排序" and isinstance(draw.get("drawOrderNumbers"), list):
        actual = draw["drawOrderNumbers"]
        if actual:
            return list(actual)
    return list(draw.get("sortedNumbers") or draw.get("numbers") or [])


def _project_draw(draw: dict[str, Any], order: str) -> dict[str, Any]:
    numbers = _ordered_numbers(draw, order)
    projected = {
        "period": draw["period"],
        "issue": draw["period"],
        "drawDate": draw.get("drawDate"),
        "date": draw.get("drawDate"),
        "numbers": numbers,
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
        raise ValueError(FANTASY5_CRAWLER_ERROR)
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
    begin_lease=begin_recovery_lease,
    renew_lease=renew_recovery_lease,
    release_lease=release_recovery_lease,
    on_lease_lost=terminate_on_lease_loss,
)


def handle_api_request(
    method: str,
    target: str,
    body: bytes | None,
    repository: AnalysisRepository,
    request_monitor_token: str | None = None,
    refresh_lottery: Callable[[str, AnalysisRepository], dict[str, Any]] | None = None,
    recover_lottery: Callable[[str, str], str] | None = None,
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
                return 200, {"items": repository.list_job_statuses()}
            except Exception:
                return 503, {"error": "STATUS_UNAVAILABLE"}
        if method == "POST" and path == "/jobs/refresh":
            if not _status_token_authorized(request_monitor_token):
                return 403, {"error": "FORBIDDEN"}
            lottery = _parse_lottery(_decode_body(body).get("lottery"))
            if lottery == "天天樂":
                return 409, {"error": FANTASY5_CRAWLER_ERROR}
            try:
                draw = (refresh_lottery or refresh_latest_draw)(lottery, repository)
                return 200, {
                    "lottery": lottery,
                    "period": str(draw["period"]),
                    "drawDate": draw.get("drawDate"),
                }
            except Exception:
                return 503, {"error": "REFRESH_UNAVAILABLE"}
        if method == "POST" and path == "/jobs/recover":
            if not _status_token_authorized(request_monitor_token):
                return 403, {"error": "FORBIDDEN"}
            recovery_request = _decode_body(body)
            lottery = _parse_lottery(recovery_request.get("lottery"))
            lease_owner = _parse_recovery_lease_owner(
                recovery_request.get("leaseOwner")
            )
            try:
                recovery_status = (recover_lottery or _RECOVERY_COORDINATOR.enqueue)(
                    lottery,
                    lease_owner,
                )
                return 202, {"lottery": lottery, "status": recovery_status}
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
        latest_prefix = "/api/matrix/latest/"
        years_prefix = "/api/matrix/history-years/"
        if method == "GET" and path.startswith(years_prefix):
            lottery = _parse_lottery(unquote(path[len(years_prefix):]))
            return 200, {"years": _history_years(repository, lottery)}
        history_prefix = "/api/matrix/history/"
        if method == "GET" and path.startswith(latest_prefix):
            lottery = _parse_lottery(unquote(path[len(latest_prefix):]))
            items = _history(repository, lottery, 1)
            item = items[0] if items else None
            if item is not None:
                item = {**item, "nextDrawAt": next_lottery_draw_time(lottery).isoformat()}
            return 200, {"item": item}
        if method == "GET" and path.startswith(history_prefix):
            lottery = _parse_lottery(unquote(path[len(history_prefix):]))
            query = parse_qs(parsed.query)
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

    def _send(
        self,
        status: int,
        payload: dict[str, Any],
        *,
        allow_cors: bool = True,
        no_store: bool = False,
    ) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        if no_store:
            self.send_header("Cache-Control", "no-store")
        if allow_cors:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type,X-Request-ID")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(encoded)

    def _is_protected_job_path(self) -> bool:
        return urlsplit(self.path).path in {
            "/jobs/status",
            "/jobs/refresh",
            "/jobs/recover",
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
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:
        protected = self._is_protected_job_path()
        self._send(204, {}, allow_cors=not protected, no_store=protected)

    def do_GET(self) -> None:
        protected = self._is_protected_job_path()
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
        )
        self._send(
            status,
            payload,
            allow_cors=not protected,
            no_store=protected or self._is_matrix_card_path(),
        )

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        protected = self._is_protected_job_path()
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


def create_repository() -> AnalysisRepository:
    settings = load_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise RuntimeError("SUPABASE_CONFIG_MISSING")
    # A terminated shared HTTP/2 connection caused concurrent history/Tongxing 500s.
    # Keep the PostgREST timeout while using HTTP/1.1 for this long-lived API client.
    client = httpx.Client(http2=False, timeout=120, follow_redirects=True)
    try:
        return create_supabase_repository(
            settings.supabase_url, settings.supabase_secret_key, httpx_client=client,
        )
    except Exception:
        client.close()
        raise


def main() -> None:
    host = "0.0.0.0"
    port = int(environ.get("PORT", "8000"))
    RailwayApiHandler.repository = create_repository()
    server = ThreadingHTTPServer((host, port), RailwayApiHandler)
    print(f"Railway Matrix API listening on {host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
