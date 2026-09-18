from collections.abc import Callable
from datetime import datetime
import json
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.domain.models import MatrixDraw
from app.scraping.sources import (
    CALIFORNIA_FANTASY5_HISTORY_URL,
    FORMAL_PAGE_REFERERS,
    NFD_MARKSIX_DRAW_ORDER_URL,
    NFD_MARKSIX_URL,
    SC888_FANTASY5_URL,
    SC888_MARKSIX_URL,
    TAIWAN_539_URL,
    TAIWAN_649_URL,
    _materialize_draw,
    _normalize_sc888_fantasy5_history,
    parse_california_fantasy5_history,
    parse_nfd_marksix_history,
    parse_sc888_fantasy5_history,
    parse_sc888_marksix_history,
    parse_taiwan_lottery_history,
)


TINYFISH_FETCH_URL = "https://api.fetch.tinyfish.ai"
TINYFISH_AGENT_URL = "https://agent.tinyfish.ai/v1/automation/run"
SUPPORTED_LOTTERIES = frozenset({"今彩539", "天天樂", "六合彩", "大樂透"})
TinyFishTelemetry = Callable[[str, str, str | None, str | None], None]


def _month_label(now: datetime, offset: int) -> str:
    month_index = now.year * 12 + (now.month - 1) - offset
    year, month_zero = divmod(month_index, 12)
    return f"{year:04d}-{month_zero + 1:02d}"


def _latest(draws: list[MatrixDraw]) -> MatrixDraw:
    if not draws:
        raise ValueError("TINYFISH_DRAW_INCOMPLETE")
    return max(
        draws,
        key=lambda draw: (str(draw.get("drawDate", "")), str(draw.get("period", ""))),
    )


def _json_document(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    text = str(value or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    decoder = json.JSONDecoder()
    starts = [index for index in (text.find("{"), text.find("[")) if index >= 0]
    for start in sorted(starts):
        try:
            return decoder.raw_decode(text[start:])[0]
        except json.JSONDecodeError:
            continue
    raise ValueError("TINYFISH_JSON_INVALID")


def _result_text(item: Any) -> str:
    if not isinstance(item, dict):
        raise ValueError("TINYFISH_FETCH_RESULT_INVALID")
    for key in ("text", "content", "html", "markdown", "json"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
    raise ValueError("TINYFISH_FETCH_RESULT_EMPTY")


def _normalize_agent_draw(lottery: str, payload: Any) -> MatrixDraw:
    data = _json_document(payload)
    if not isinstance(data, dict):
        raise ValueError("TINYFISH_AGENT_RESULT_INVALID")
    numbers = data.get("numbers")
    draw_order = data.get("drawOrderNumbers")
    if not isinstance(numbers, list):
        raise ValueError("TINYFISH_AGENT_RESULT_INVALID")
    if draw_order is not None and not isinstance(draw_order, list):
        raise ValueError("TINYFISH_AGENT_RESULT_INVALID")
    count = 5 if lottery in {"今彩539", "天天樂"} else 7
    return _materialize_draw(
        str(data.get("period", "")),
        str(data.get("drawDate", "")),
        numbers,
        count,
        draw_order,
    )


class TinyFishLatestFallback:
    def __init__(
        self,
        client: httpx.Client,
        api_key: str,
        *,
        browser_enabled: bool = False,
        browser_max_duration_seconds: int = 60,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.client = client
        self.api_key = api_key.strip()
        self.browser_enabled = browser_enabled
        self.browser_max_duration_seconds = max(15, min(120, browser_max_duration_seconds))
        self.now = now or (lambda: datetime.now(ZoneInfo("Asia/Taipei")))

    @property
    def headers(self) -> dict[str, str]:
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    def _fetch_contents(self, urls: list[str], *, format: str) -> list[dict[str, Any]]:
        response = self.client.post(
            TINYFISH_FETCH_URL,
            headers=self.headers,
            json={
                "urls": urls,
                "format": format,
                "links": False,
                "image_links": False,
                "page_metadata": False,
                "ttl": 0,
                "per_url_timeout_ms": 20000,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list) or not results:
            raise ValueError("TINYFISH_FETCH_EMPTY")
        return [item for item in results if isinstance(item, dict)]

    def _fetch_taiwan(self, lottery: str) -> MatrixDraw:
        is_539 = lottery == "今彩539"
        base_url = TAIWAN_539_URL if is_539 else TAIWAN_649_URL
        key = "daily539Res" if is_539 else "lotto649Res"
        count = 5 if is_539 else 7
        now = self.now()
        urls = [
            f"{base_url}?period&month={_month_label(now, offset)}&pageSize=31"
            for offset in (0, 1)
        ]
        draws: list[MatrixDraw] = []
        for result in self._fetch_contents(urls, format="markdown"):
            try:
                draws.extend(
                    parse_taiwan_lottery_history(_json_document(_result_text(result)), key, count)
                )
            except ValueError:
                continue
        return _latest(draws)

    def _fetch_fantasy5(self) -> MatrixDraw:
        official_url = CALIFORNIA_FANTASY5_HISTORY_URL.format(page=1, size=50)
        try:
            results = self._fetch_contents([official_url], format="markdown")
            for result in results:
                try:
                    draws = parse_california_fantasy5_history(
                        _json_document(_result_text(result))
                    )
                    if draws:
                        return _latest(draws)
                except ValueError:
                    continue
        except (httpx.HTTPError, ValueError):
            pass

        results = self._fetch_contents([SC888_FANTASY5_URL], format="html")
        draws: list[MatrixDraw] = []
        for result in results:
            try:
                draws.extend(
                    _normalize_sc888_fantasy5_history(
                        parse_sc888_fantasy5_history(_result_text(result))
                    )
                )
            except ValueError:
                continue
        return _latest(draws)

    def _fetch_marksix(self) -> MatrixDraw:
        try:
            results = self._fetch_contents([SC888_MARKSIX_URL], format="html")
            for result in results:
                draws = parse_sc888_marksix_history(_result_text(result))
                if draws:
                    return _latest(draws)
        except (httpx.HTTPError, ValueError):
            pass

        year = self.now().year
        normal_url = NFD_MARKSIX_URL.format(year=year)
        order_url = NFD_MARKSIX_DRAW_ORDER_URL.format(year=year)
        results = self._fetch_contents([normal_url, order_url], format="html")
        by_url: dict[str, str] = {}
        sequential: list[str] = []
        for result in results:
            text = _result_text(result)
            sequential.append(text)
            url = str(result.get("url") or result.get("final_url") or "")
            if url:
                by_url[url] = text
        normal_html = by_url.get(normal_url) or (sequential[0] if sequential else "")
        order_html = by_url.get(order_url) or (sequential[1] if len(sequential) > 1 else "")
        draws = parse_nfd_marksix_history(normal_html, order_html or None)
        return _latest(draws)

    def _fetch_via_fetch_api(self, lottery: str) -> MatrixDraw:
        if lottery in {"今彩539", "大樂透"}:
            return self._fetch_taiwan(lottery)
        if lottery == "天天樂":
            return self._fetch_fantasy5()
        if lottery == "六合彩":
            return self._fetch_marksix()
        raise ValueError("UNKNOWN_LOTTERY")

    def _agent_start_url(self, lottery: str) -> str:
        if lottery in FORMAL_PAGE_REFERERS:
            return FORMAL_PAGE_REFERERS[lottery]
        if lottery == "天天樂":
            return SC888_FANTASY5_URL
        if lottery == "六合彩":
            return SC888_MARKSIX_URL
        raise ValueError("UNKNOWN_LOTTERY")

    def _fetch_via_agent(self, lottery: str) -> MatrixDraw:
        response = self.client.post(
            TINYFISH_AGENT_URL,
            headers=self.headers,
            json={
                "url": self._agent_start_url(lottery),
                "goal": (
                    f"Find the latest completed {lottery} draw displayed by this source. "
                    "Return only explicitly displayed data. Never infer missing values. "
                    "Use YYYY-MM-DD for drawDate. For numbers, include the complete official "
                    "result; for a 6+1 lottery keep the special number last. Include "
                    "drawOrderNumbers only when the source explicitly shows actual draw order."
                ),
                "browser_profile": "lite",
                "agent_config": {
                    "max_duration_seconds": self.browser_max_duration_seconds,
                },
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "period": {"type": "string"},
                        "drawDate": {"type": "string"},
                        "numbers": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "drawOrderNumbers": {
                            "type": ["array", "null"],
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["period", "drawDate", "numbers"],
                },
            },
            timeout=float(self.browser_max_duration_seconds + 30),
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or str(payload.get("status", "")).lower() not in {
            "completed",
            "complete",
            "success",
        }:
            raise ValueError("TINYFISH_AGENT_NOT_COMPLETED")
        return _normalize_agent_draw(lottery, payload.get("result"))

    def fetch_latest(self, lottery: str) -> MatrixDraw:
        try:
            draw = self._fetch_via_fetch_api(lottery)
            print(json.dumps({
                "event": "tinyfish_fetch_fallback_succeeded",
                "lottery": lottery,
                "period": draw.get("period"),
            }, ensure_ascii=False, separators=(",", ":")))
            return draw
        except (httpx.HTTPError, ValueError) as fetch_error:
            print(json.dumps({
                "event": "tinyfish_fetch_fallback_failed",
                "lottery": lottery,
                "error": type(fetch_error).__name__,
            }, ensure_ascii=False, separators=(",", ":")))
            if not self.browser_enabled:
                raise

        draw = self._fetch_via_agent(lottery)
        print(json.dumps({
            "event": "tinyfish_browser_fallback_succeeded",
            "lottery": lottery,
            "period": draw.get("period"),
        }, ensure_ascii=False, separators=(",", ":")))
        return draw


class ResilientLatestDrawSource:
    def __init__(
        self,
        primary: Any,
        fallback: Any,
        *,
        telemetry: TinyFishTelemetry | None = None,
    ) -> None:
        self.primary = primary
        self.fallback = fallback
        self.telemetry = telemetry

    def _report(
        self,
        lottery: str,
        status: str,
        period: str | None,
        error: str | None,
    ) -> None:
        if self.telemetry is None:
            return
        try:
            self.telemetry(lottery, status, period, error)
        except Exception as telemetry_error:
            print(json.dumps({
                "event": "tinyfish_telemetry_callback_failed",
                "lottery": lottery,
                "error": type(telemetry_error).__name__,
            }, ensure_ascii=False, separators=(",", ":")))

    def fetch(self, lottery: str) -> MatrixDraw:
        try:
            return self.primary.fetch(lottery)
        except (httpx.HTTPError, ValueError) as primary_error:
            if lottery not in SUPPORTED_LOTTERIES or str(primary_error) == "UNKNOWN_LOTTERY":
                raise
            try:
                draw = self.fallback.fetch_latest(lottery)
                self._report(lottery, "success", str(draw.get("period") or "") or None, None)
                return draw
            except Exception as fallback_error:
                self._report(lottery, "failed", None, type(fallback_error).__name__)
                print(json.dumps({
                    "event": "tinyfish_fallback_exhausted",
                    "lottery": lottery,
                    "primaryError": type(primary_error).__name__,
                    "fallbackError": type(fallback_error).__name__,
                }, ensure_ascii=False, separators=(",", ":")))
                raise primary_error from fallback_error

    def fetch_history(self, lottery: str, limit: int | None) -> list[MatrixDraw]:
        return self.primary.fetch_history(lottery, limit)

    def fetch_algorithm_history(self, lottery: str) -> list[MatrixDraw]:
        return self.primary.fetch_algorithm_history(lottery)


def _setting_bool(settings: Any, name: str, default: bool) -> bool:
    value = getattr(settings, name, default)
    if isinstance(value, bool):
        return value
    normalized = str(value or "").strip().lower()
    if not normalized:
        return default
    return normalized in {"1", "true", "yes", "on"}


def wrap_source_with_tinyfish(
    primary: Any,
    client: httpx.Client,
    settings: Any,
    *,
    now: Callable[[], datetime] | None = None,
    telemetry: TinyFishTelemetry | None = None,
) -> Any:
    api_key = str(getattr(settings, "tinyfish_api_key", "") or "").strip()
    fetch_enabled = _setting_bool(settings, "tinyfish_fetch_fallback_enabled", True)
    if not api_key or not fetch_enabled:
        return primary
    browser_enabled = _setting_bool(
        settings,
        "tinyfish_browser_fallback_enabled",
        False,
    )
    duration = int(getattr(settings, "tinyfish_browser_max_duration_seconds", 60) or 60)
    fallback = TinyFishLatestFallback(
        client,
        api_key,
        browser_enabled=browser_enabled,
        browser_max_duration_seconds=duration,
        now=now,
    )
    return ResilientLatestDrawSource(primary, fallback, telemetry=telemetry)
