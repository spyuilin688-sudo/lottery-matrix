from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from os import environ
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from app.repositories.analysis_repository import AnalysisRepository, create_supabase_repository
from app.settings import load_settings


LOTTERIES = {"今彩539", "天天樂", "六合彩", "大樂透"}
NUMBER_ORDERS = {"依號碼由小到大排序", "依實際開獎順序排序"}
HISTORY_RANGES = {1000, 3000, 5000}
PAGE_SIZE = 1000


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


def _parse_number_order(value: Any) -> str:
    order = str(value or "")
    if order not in NUMBER_ORDERS:
        raise ValueError("未知號碼順序")
    return order


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


def _history(repository: AnalysisRepository, lottery: str, limit: int | None) -> list[dict[str, Any]]:
    client = getattr(repository, "client", None)
    if client is None:
        request_limit = limit if limit is not None else 100_000
        return [_normalize_draw(draw) for draw in repository.list_draws(lottery, request_limit)]

    items: list[dict[str, Any]] = []
    offset = 0
    remaining = limit
    while remaining is None or remaining > 0:
        page_size = PAGE_SIZE if remaining is None else min(PAGE_SIZE, remaining)
        response = (
            client.table("lottery_draws")
            .select("period,draw_date,numbers,sorted_numbers,draw_order_numbers")
            .eq("lottery", lottery)
            .order("draw_date", desc=True)
            .order("period", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = [dict(row) for row in response.data]
        items.extend(_normalize_supabase_draw(row) for row in rows)
        if len(rows) < page_size:
            break
        offset += len(rows)
        if remaining is not None:
            remaining -= len(rows)
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


def handle_api_request(
    method: str,
    target: str,
    body: bytes | None,
    repository: AnalysisRepository,
) -> tuple[int, dict[str, Any]]:
    parsed = urlsplit(target)
    path = parsed.path
    try:
        if method == "GET" and path == "/health":
            return 200, {"status": "ok"}
        latest_prefix = "/api/matrix/latest/"
        history_prefix = "/api/matrix/history/"
        if method == "GET" and path.startswith(latest_prefix):
            lottery = _parse_lottery(unquote(path[len(latest_prefix):]))
            items = _history(repository, lottery, 1)
            return 200, {"item": items[0] if items else None}
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
        return 500, {"error": str(error)}


class RailwayApiHandler(BaseHTTPRequestHandler):
    repository: AnalysisRepository

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:
        self._send(204, {})

    def do_GET(self) -> None:
        status, payload = handle_api_request("GET", self.path, None, self.repository)
        self._send(status, payload)

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length > 0 else b""
        status, payload = handle_api_request("POST", self.path, body, self.repository)
        self._send(status, payload)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"railway-api {self.address_string()} {format % args}")


def create_repository() -> AnalysisRepository:
    settings = load_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise RuntimeError("SUPABASE_CONFIG_MISSING")
    return create_supabase_repository(settings.supabase_url, settings.supabase_secret_key)


def main() -> None:
    host = "0.0.0.0"
    port = int(environ.get("PORT", "8000"))
    RailwayApiHandler.repository = create_repository()
    server = ThreadingHTTPServer((host, port), RailwayApiHandler)
    print(f"Railway Matrix API listening on {host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
