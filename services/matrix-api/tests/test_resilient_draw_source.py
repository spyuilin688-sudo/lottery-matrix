from types import SimpleNamespace

import httpx
import pytest

from app.scraping.resilient_source import (
    ResilientLatestDrawSource,
    wrap_source_with_tinyfish,
)


DRAW = {
    "period": "115000221",
    "drawDate": "2026-09-15",
    "numbers": ["01", "08", "17", "23", "36"],
    "sortedNumbers": ["01", "08", "17", "23", "36"],
    "drawOrderNumbers": None,
}


class PrimarySource:
    def __init__(self, *, error: Exception | None = None) -> None:
        self.error = error
        self.fetch_calls: list[str] = []
        self.history_calls: list[tuple[str, int | None]] = []
        self.algorithm_history_calls: list[str] = []

    def fetch(self, lottery: str) -> dict:
        self.fetch_calls.append(lottery)
        if self.error is not None:
            raise self.error
        return dict(DRAW)

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.history_calls.append((lottery, limit))
        return [dict(DRAW)]

    def fetch_algorithm_history(self, lottery: str) -> list[dict]:
        self.algorithm_history_calls.append(lottery)
        return [dict(DRAW)]


class Fallback:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def fetch_latest(self, lottery: str) -> dict:
        self.calls.append(lottery)
        return dict(DRAW)


def _transport_error() -> httpx.ConnectError:
    return httpx.ConnectError(
        "source unavailable",
        request=httpx.Request("GET", "https://source.example.test/latest"),
    )


def test_primary_success_never_calls_tinyfish() -> None:
    primary = PrimarySource()
    fallback = Fallback()
    source = ResilientLatestDrawSource(primary, fallback)

    assert source.fetch("今彩539") == DRAW
    assert primary.fetch_calls == ["今彩539"]
    assert fallback.calls == []


def test_latest_network_failure_uses_tinyfish_once() -> None:
    primary = PrimarySource(error=_transport_error())
    fallback = Fallback()
    source = ResilientLatestDrawSource(primary, fallback)

    assert source.fetch("今彩539") == DRAW
    assert fallback.calls == ["今彩539"]


def test_latest_parse_failure_can_use_tinyfish_but_unknown_lottery_does_not() -> None:
    fallback = Fallback()
    source = ResilientLatestDrawSource(
        PrimarySource(error=ValueError("TAIWAN_LOTTERY_DRAW_INCOMPLETE")),
        fallback,
    )

    assert source.fetch("大樂透") == DRAW
    assert fallback.calls == ["大樂透"]

    unknown_fallback = Fallback()
    unknown = ResilientLatestDrawSource(
        PrimarySource(error=ValueError("UNKNOWN_LOTTERY")),
        unknown_fallback,
    )
    with pytest.raises(ValueError, match="UNKNOWN_LOTTERY"):
        unknown.fetch("不存在")
    assert unknown_fallback.calls == []


def test_history_and_algorithm_history_never_use_tinyfish() -> None:
    primary = PrimarySource()
    fallback = Fallback()
    source = ResilientLatestDrawSource(primary, fallback)

    assert source.fetch_history("今彩539", 7) == [DRAW]
    assert source.fetch_algorithm_history("今彩539") == [DRAW]
    assert primary.history_calls == [("今彩539", 7)]
    assert primary.algorithm_history_calls == ["今彩539"]
    assert fallback.calls == []


def test_without_api_key_factory_returns_original_source() -> None:
    primary = PrimarySource()
    settings = SimpleNamespace(
        tinyfish_api_key="",
        tinyfish_fetch_fallback_enabled=True,
        tinyfish_browser_fallback_enabled=False,
    )

    assert wrap_source_with_tinyfish(primary, object(), settings) is primary


def test_fetch_disabled_factory_returns_original_source_even_with_key() -> None:
    primary = PrimarySource()
    settings = SimpleNamespace(
        tinyfish_api_key="secret",
        tinyfish_fetch_fallback_enabled=False,
        tinyfish_browser_fallback_enabled=False,
    )

    assert wrap_source_with_tinyfish(primary, object(), settings) is primary
