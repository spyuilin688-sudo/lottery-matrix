import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.draw_refresh import (
    DrawRefreshService,
    missing_history_periods,
    require_complete_history,
)


def _draw(period: int) -> dict:
    return {
        "period": str(period).zfill(9),
        "drawDate": f"2026-08-{((period - 1) % 28) + 1:02d}",
        "numbers": ["01", "02", "03", "04", "05"],
        "sortedNumbers": ["01", "02", "03", "04", "05"],
        "drawOrderNumbers": ["05", "04", "03", "02", "01"],
    }


class HistorySource:
    def __init__(self, history: list[dict]) -> None:
        self.history = history
        self.history_requests: list[tuple[str, int | None]] = []

    def fetch(self, lottery: str) -> dict:
        return dict(self.history[0])

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        self.history_requests.append((lottery, limit))
        rows = self.history if limit is None else self.history[:limit]
        return [dict(draw) for draw in rows]


def test_history_gap_check_understands_eight_digit_taiwan_period_years() -> None:
    history = [
        {**_draw(1), "period": "99000001"},
        {**_draw(261), "period": "98000261"},
        {**_draw(260), "period": "98000260"},
    ]

    assert missing_history_periods("今彩539", history) == []


def test_history_gap_check_keeps_taiwan_year_series_separate() -> None:
    history = [
        {**_draw(1), "period": "115000001"},
        {**_draw(261), "period": "114000261"},
        {**_draw(260), "period": "114000260"},
    ]

    assert missing_history_periods("今彩539", history) == []


def test_history_gap_check_keeps_marksix_year_series_separate() -> None:
    history = [
        {**_draw(1), "period": "026001"},
        {**_draw(155), "period": "025155"},
        {**_draw(154), "period": "025154"},
    ]

    assert missing_history_periods("六合彩", history) == []


def test_history_gap_check_understands_fantasy_year_series_format() -> None:
    history = [
        {**_draw(1), "period": "026001"},
        {**_draw(155), "period": "025155"},
        {**_draw(154), "period": "025154"},
    ]

    assert missing_history_periods("天天樂", history) == []


def test_history_gap_check_keeps_global_periods_continuous_across_digit_widths() -> None:
    history = [
        {**_draw(1), "period": "100000"},
        {**_draw(2), "period": "99998"},
    ]

    assert missing_history_periods("天天樂", history) == ["99999"]


def test_history_gap_check_keeps_six_digit_global_periods_continuous() -> None:
    history = [
        {**_draw(1), "period": "124001"},
        {**_draw(2), "period": "123999"},
    ]

    assert missing_history_periods("天天樂", history) == ["124000"]


def test_complete_history_requires_the_target_draw_to_be_present() -> None:
    history = [{**_draw(200), "drawDate": "2026-08-29"}]

    with pytest.raises(ValueError, match="DRAW_HISTORY_INCOMPLETE"):
        require_complete_history("今彩539", history, "000000201")


def test_ensure_history_persists_and_returns_complete_source_history() -> None:
    repository = InMemoryAnalysisRepository()
    source = HistorySource([_draw(period) for period in range(220, 99, -1)])

    history = DrawRefreshService(repository, source).ensure_history("今彩539")

    assert len(history) == 121
    assert source.history_requests == [("今彩539", None)]
    assert history == repository.list_draws("今彩539", None)


def test_ensure_history_uses_every_existing_draw_without_a_fixed_minimum() -> None:
    repository = InMemoryAnalysisRepository()
    for draw in [_draw(period) for period in range(179, 100, -1)]:
        repository.upsert_draw({**draw, "lottery": "今彩539"})
    source = HistorySource([_draw(999)])

    history = DrawRefreshService(repository, source).ensure_history("今彩539")

    assert len(history) == 79
    assert source.history_requests == []
    assert history == repository.list_draws("今彩539", None)


def test_ensure_history_checks_only_the_month_before_the_latest_draw() -> None:
    repository = InMemoryAnalysisRepository()
    stored = [
        {**_draw(201), "drawDate": "2026-08-30"},
        {**_draw(200), "drawDate": "2026-08-29"},
        {**_draw(102), "drawDate": "2026-06-03"},
        {**_draw(100), "drawDate": "2026-06-01"},
    ]
    for draw in stored:
        repository.upsert_draw({**draw, "lottery": "今彩539"})
    source = HistorySource([_draw(999)])

    history = DrawRefreshService(repository, source).ensure_history("今彩539")

    assert source.history_requests == []
    assert [draw["period"] for draw in history] == ["000000201", "000000200"]


def test_ensure_history_repairs_internal_missing_periods_before_returning() -> None:
    repository = InMemoryAnalysisRepository()
    complete = [_draw(period) for period in range(210, 199, -1)]
    for draw in complete:
        if draw["period"] not in {"000000208", "000000209"}:
            repository.upsert_draw({**draw, "lottery": "今彩539"})
    source = HistorySource(complete)

    history = DrawRefreshService(repository, source).ensure_history("今彩539")

    assert source.history_requests == [("今彩539", 3)]
    assert [draw["period"] for draw in history[:3]] == [
        "000000210", "000000209", "000000208",
    ]


def test_ensure_history_retargets_repair_after_learning_source_is_ahead() -> None:
    repository = InMemoryAnalysisRepository()
    for period in range(200, 169, -1):
        if period == 198:
            continue
        repository.upsert_draw({
            **_draw(period),
            "lottery": "今彩539",
            "drawDate": f"2026-08-{period - 169:02d}",
        })
    source = HistorySource([
        {
            **_draw(period),
            "drawDate": f"2026-08-{period - 174:02d}",
        }
        for period in range(205, 174, -1)
    ])

    history = DrawRefreshService(repository, source).ensure_history("今彩539")

    assert source.history_requests == [("今彩539", 3), ("今彩539", 8)]
    assert any(draw["period"] == "000000198" for draw in history)


def test_ensure_history_stops_when_source_cannot_repair_missing_periods() -> None:
    repository = InMemoryAnalysisRepository()
    incomplete = [
        _draw(period)
        for period in range(210, 199, -1)
        if period not in {208, 209}
    ]
    for draw in incomplete:
        repository.upsert_draw({**draw, "lottery": "今彩539"})
    source = HistorySource(incomplete)

    with pytest.raises(ValueError, match="DRAW_HISTORY_INCOMPLETE"):
        DrawRefreshService(repository, source).ensure_history("今彩539")

    assert source.history_requests == [("今彩539", 3)]


def test_ensure_history_rejects_an_empty_complete_source() -> None:
    repository = InMemoryAnalysisRepository()
    source = HistorySource([])

    with pytest.raises(ValueError, match="DRAW_HISTORY_INCOMPLETE"):
        DrawRefreshService(repository, source).ensure_history("今彩539")

    assert source.history_requests == [("今彩539", None)]
    assert repository.list_draws("今彩539", None) == []
