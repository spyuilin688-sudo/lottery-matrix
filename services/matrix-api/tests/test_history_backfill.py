import pytest

from app.domain.history_boundaries import COMPLETED_YEAR_LAST_SEQUENCES
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


def _seven_ball_draw(period: str, draw_date: str) -> dict:
    return {
        "period": period,
        "drawDate": draw_date,
        "numbers": ["01", "02", "03", "04", "05", "06", "49"],
        "sortedNumbers": ["01", "02", "03", "04", "05", "06", "49"],
        "drawOrderNumbers": ["06", "05", "04", "03", "02", "01", "49"],
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


class AlgorithmHistorySource(HistorySource):
    def __init__(self, history: list[dict], algorithm_history: list[dict]) -> None:
        super().__init__(history)
        self.algorithm_history = algorithm_history
        self.algorithm_history_requests: list[str] = []

    def fetch_algorithm_history(self, lottery: str) -> list[dict]:
        self.algorithm_history_requests.append(lottery)
        return [dict(draw) for draw in self.algorithm_history]


class BatchTrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.batch_sizes: list[int] = []

    def upsert_draws(self, draws: list[dict]) -> list[dict]:
        self.batch_sizes.append(len(draws))
        return super().upsert_draws(draws)


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


def test_history_gap_check_includes_old_rows_without_dates() -> None:
    history = [
        {**_seven_ball_draw("076003", ""), "drawDate": None},
        {**_seven_ball_draw("076001", ""), "drawDate": None},
    ]

    assert missing_history_periods("六合彩", history) == ["076002"]


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


def test_ordinary_history_repair_never_erases_existing_actual_order() -> None:
    repository = InMemoryAnalysisRepository()
    complete = [_draw(period) for period in range(210, 199, -1)]
    for draw in complete:
        if draw["period"] != "000000208":
            repository.upsert_draw({**draw, "lottery": "今彩539"})
    source_rows = [
        {**draw, "drawOrderNumbers": None}
        for draw in complete
    ]

    DrawRefreshService(repository, HistorySource(source_rows)).ensure_history("今彩539")

    stored = {
        draw["period"]: draw
        for draw in repository.list_draws("今彩539", None)
    }
    assert stored["000000210"]["drawOrderNumbers"] == [
        "05", "04", "03", "02", "01",
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


def test_algorithm_history_backfills_missing_actual_draw_order() -> None:
    repository = InMemoryAnalysisRepository()
    stored = [_draw(period) for period in range(96000121, 96000000, -1)]
    stored[40]["drawOrderNumbers"] = None
    for draw in stored:
        repository.upsert_draw({**draw, "lottery": "今彩539"})
    algorithm_history = [
        _draw(period)
        for period in range(96000121, 96000000, -1)
    ]
    algorithm_history[40]["drawDate"] = ""
    source = AlgorithmHistorySource(stored, algorithm_history)

    history = DrawRefreshService(repository, source).ensure_algorithm_history("今彩539")

    assert source.algorithm_history_requests == ["今彩539"]
    assert all(len(draw["drawOrderNumbers"]) == 5 for draw in history)


def test_algorithm_history_upserts_in_bounded_batches() -> None:
    repository = BatchTrackingRepository()
    stored = [_draw(period) for period in range(96001001, 96000000, -1)]
    stored[40]["drawOrderNumbers"] = None
    for draw in stored:
        repository.upsert_draw({**draw, "lottery": "今彩539"})
    source = AlgorithmHistorySource(
        stored,
        [_draw(period) for period in range(96001001, 96000000, -1)],
    )

    DrawRefreshService(repository, source).ensure_algorithm_history("今彩539")

    assert repository.batch_sizes == [500, 500, 1]


def test_algorithm_history_restores_truncated_marksix_from_official_boundary() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        **_seven_ball_draw("076002", "1976-01-03"),
        "lottery": "六合彩",
    })
    source_rows = [
        _seven_ball_draw("076002", "1976-01-03"),
        _seven_ball_draw("076001", ""),
    ]
    source = AlgorithmHistorySource(source_rows, source_rows)

    history = DrawRefreshService(repository, source).ensure_algorithm_history("六合彩")

    assert source.algorithm_history_requests == ["六合彩"]
    assert [draw["period"] for draw in history] == ["076002", "076001"]
    assert not history[1]["drawDate"]


def test_algorithm_history_rejects_an_internal_gap_after_full_backfill() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        **_seven_ball_draw("076003", "1976-01-05"),
        "lottery": "六合彩",
    })
    source_rows = [
        _seven_ball_draw("076003", "1976-01-05"),
        _seven_ball_draw("076001", ""),
    ]
    source = AlgorithmHistorySource(source_rows, source_rows)

    with pytest.raises(ValueError, match="DRAW_HISTORY_INCOMPLETE"):
        DrawRefreshService(repository, source).ensure_algorithm_history("六合彩")


def test_algorithm_history_orders_undated_marksix_across_century_rollover() -> None:
    source_rows = [_seven_ball_draw("001001", "2001-01-02")]
    source_rows.extend(
        _seven_ball_draw(f"0{year % 100:02d}001", "")
        for year in range(2000, 1975, -1)
    )

    history = DrawRefreshService._sort_algorithm_history("六合彩", source_rows)

    periods = [draw["period"] for draw in history]
    assert periods[:4] == ["001001", "000001", "099001", "098001"]
    assert periods[-1] == "076001"


def test_algorithm_history_deduplicates_legacy_taiwan_period_widths() -> None:
    legacy = {**_draw(1), "period": "96000001"}
    canonical = {**_draw(1), "period": "096000001"}

    history = DrawRefreshService._sort_algorithm_history(
        "今彩539",
        [legacy, canonical],
    )

    assert [draw["period"] for draw in history] == ["096000001"]


def test_algorithm_history_rejects_taiwan_width_alias_conflicts() -> None:
    official = {**_draw(1), "period": "96000001"}
    fallback = {
        **_draw(1),
        "period": "096000001",
        "numbers": ["06", "07", "08", "09", "10"],
        "sortedNumbers": ["06", "07", "08", "09", "10"],
        "drawOrderNumbers": ["10", "09", "08", "07", "06"],
    }

    with pytest.raises(ValueError, match="DRAW_HISTORY_CONFLICT"):
        DrawRefreshService._sort_algorithm_history(
            "今彩539",
            [fallback, official],
        )


def test_algorithm_history_repairs_width_alias_conflict_from_official_source() -> None:
    official = {
        **_draw(1),
        "period": "96000001",
        "drawDate": "2007-01-01",
    }
    fallback = {
        **official,
        "period": "096000001",
        "numbers": ["06", "07", "08", "09", "10"],
        "sortedNumbers": ["06", "07", "08", "09", "10"],
        "drawOrderNumbers": ["10", "09", "08", "07", "06"],
    }
    repaired = {**official, "period": "096000001"}
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({**official, "lottery": "今彩539"})
    repository.upsert_draw({**fallback, "lottery": "今彩539"})
    source = AlgorithmHistorySource([official, fallback], [repaired])

    history = DrawRefreshService(repository, source).ensure_algorithm_history(
        "今彩539",
    )

    assert source.algorithm_history_requests == ["今彩539"]
    assert history == [repaired]


def test_lotto_history_repairs_old_api_alias_from_verified_biga_source() -> None:
    placeholder = {
        "period": "93000001",
        "drawDate": "2004-01-05",
        "numbers": ["01", "01", "03", "03", "06", "09", "02"],
        "sortedNumbers": ["01", "01", "03", "03", "06", "09", "02"],
        "drawOrderNumbers": ["03", "01", "06", "09", "03", "01", "02"],
    }
    canonical_placeholder = {**placeholder, "period": "093000001"}
    repaired = _seven_ball_draw("093000001", "2004-01-05")
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({**placeholder, "lottery": "大樂透"})
    repository.upsert_draw({**canonical_placeholder, "lottery": "大樂透"})
    source = AlgorithmHistorySource(
        [placeholder, canonical_placeholder],
        [repaired],
    )

    history = DrawRefreshService(repository, source).ensure_algorithm_history(
        "大樂透",
    )

    assert source.algorithm_history_requests == ["大樂透"]
    assert history == [repaired]


def test_algorithm_history_rejects_non_alias_period_conflicts() -> None:
    first = {**_draw(1), "period": "096000001"}
    conflicting = {
        **first,
        "numbers": ["06", "07", "08", "09", "10"],
        "sortedNumbers": ["06", "07", "08", "09", "10"],
        "drawOrderNumbers": ["10", "09", "08", "07", "06"],
    }

    with pytest.raises(ValueError, match="DRAW_HISTORY_CONFLICT"):
        DrawRefreshService._sort_algorithm_history(
            "今彩539",
            [first, conflicting],
        )


def test_algorithm_history_rejects_a_whole_missing_middle_year() -> None:
    repository = InMemoryAnalysisRepository()
    source_rows = [
        _seven_ball_draw("078001", "1978-01-03"),
        _seven_ball_draw("076001", ""),
    ]
    for draw in source_rows:
        repository.upsert_draw({**draw, "lottery": "六合彩"})
    source = AlgorithmHistorySource(source_rows, source_rows)

    with pytest.raises(ValueError, match="DRAW_HISTORY_INCOMPLETE"):
        DrawRefreshService(repository, source).ensure_algorithm_history("六合彩")

    assert source.algorithm_history_requests == ["六合彩"]


def test_algorithm_history_fails_closed_when_actual_draw_order_remains_missing() -> None:
    repository = InMemoryAnalysisRepository()
    stored = [_draw(period) for period in range(96000121, 96000000, -1)]
    stored[40]["drawOrderNumbers"] = None
    for draw in stored:
        repository.upsert_draw({**draw, "lottery": "今彩539"})
    source = AlgorithmHistorySource(stored, stored)

    with pytest.raises(ValueError, match="DRAW_ORDER_HISTORY_INCOMPLETE"):
        DrawRefreshService(repository, source).ensure_algorithm_history("今彩539")


def test_marksix_algorithm_history_allows_missing_order_before_1991_boundary() -> None:
    repository = InMemoryAnalysisRepository()
    stored = []
    for year in range(1991, 1975, -1):
        final_sequence = (
            1
            if year == 1991
            else COMPLETED_YEAR_LAST_SEQUENCES["六合彩"][year]
        )
        for sequence in range(final_sequence, 0, -1):
            period = f"0{year % 100:02d}{sequence:03d}"
            draw = _seven_ball_draw(period, f"{year}-01-01")
            if year < 1991:
                draw["drawOrderNumbers"] = None
            stored.append(draw)
            repository.upsert_draw({**draw, "lottery": "六合彩"})
    source = AlgorithmHistorySource(stored, [])

    history = DrawRefreshService(repository, source).ensure_algorithm_history("六合彩")

    assert source.algorithm_history_requests == []
    assert history[0]["period"] == "091001"
    assert history[-1]["period"] == "076001"


def test_seven_ball_history_repairs_special_number_outside_last_position() -> None:
    repository = InMemoryAnalysisRepository()
    stored = {
        "lottery": "大樂透",
        "period": "093000001",
        "drawDate": "2004-01-05",
        "numbers": ["01", "02", "03", "04", "05", "06", "49"],
        "sortedNumbers": ["01", "02", "03", "04", "05", "06", "49"],
        "drawOrderNumbers": ["49", "01", "02", "03", "04", "05", "06"],
    }
    repaired = {
        **stored,
        "drawOrderNumbers": ["06", "05", "04", "03", "02", "01", "49"],
    }
    repository.upsert_draw(stored)
    source = AlgorithmHistorySource([stored], [repaired])

    history = DrawRefreshService(repository, source).ensure_algorithm_history("大樂透")

    assert source.algorithm_history_requests == ["大樂透"]
    assert history[0]["drawOrderNumbers"][-1] == "49"


def test_algorithm_history_keeps_fantasy5_sorted_only_without_order_backfill() -> None:
    repository = InMemoryAnalysisRepository()
    stored = [
        {**_draw(period), "drawOrderNumbers": None}
        for period in range(220, 99, -1)
    ]
    for draw in stored:
        repository.upsert_draw({**draw, "lottery": "天天樂"})
    source = AlgorithmHistorySource(stored, [])

    history = DrawRefreshService(repository, source).ensure_algorithm_history("天天樂")

    assert source.algorithm_history_requests == []
    assert len(history) == 121
