from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.scraping.sources import LatestDrawSource
from app.worker import run_scheduled_worker


TAIPEI = ZoneInfo("Asia/Taipei")


def _draw(period: int) -> dict:
    return {
        "lottery": "今彩539",
        "period": str(period).zfill(9),
        "drawDate": "2026-08-28" if period == 121 else "2026-08-27",
        "numbers": ["01", "02", "03", "04", "05"],
    }


def test_repository_can_return_every_persisted_draw_without_a_fixed_limit() -> None:
    repository = InMemoryAnalysisRepository()
    for period in range(1, 122):
        repository.upsert_draw(_draw(period))

    history = repository.list_draws("今彩539", None)

    assert len(history) == 121


class ExistingHistorySource:
    def fetch(self, lottery: str) -> dict:
        draw = _draw(121)
        draw.pop("lottery")
        return draw

    def fetch_history(self, lottery: str, limit: int | None) -> list[dict]:
        raise AssertionError("existing complete history must not be replaced by a fixed-size download")


def test_scheduled_worker_analyzes_every_persisted_draw() -> None:
    repository = InMemoryAnalysisRepository()
    for period in range(1, 122):
        repository.upsert_draw(_draw(period))
    history_lengths: list[int] = []

    def builder(kind: str):
        def build(context: dict) -> dict:
            history_lengths.append(len(context["history"]))
            return {"kind": kind}

        return build

    builders = {
        kind: builder(kind)
        for kind in ("explore", "tianyan", "tiangong", "status")
    }

    result = run_scheduled_worker(
        "今彩539",
        datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI),
        repository,
        ExistingHistorySource(),
        builders,
    )

    assert result["status"] == "complete"
    assert history_lengths == [121, 121, 121, 121]


def test_fantasy5_complete_history_reads_until_the_last_official_page() -> None:
    requested_pages: list[int] = []

    def official_draw(period: int) -> dict:
        return {
            "DrawNumber": period,
            "DrawDate": "2026-08-23T07:00:00",
            "WinningNumbers": {
                "0": {"Number": "8"},
                "1": {"Number": "10"},
                "2": {"Number": "22"},
                "3": {"Number": "23"},
                "4": {"Number": "36"},
            },
        }

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.path.split("/")[-2])
        requested_pages.append(page)
        page_sizes = {1: 50, 2: 50, 3: 21}
        size = page_sizes.get(page, 0)
        first_period = 12100 - ((page - 1) * 50)
        return httpx.Response(
            200,
            json={
                "PreviousDraws": [
                    official_draw(first_period - offset)
                    for offset in range(size)
                ]
            },
        )

    source = LatestDrawSource(
        httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: datetime(2026, 8, 24),
    )

    history = source.fetch_history("天天樂", None)

    assert len(history) == 121
    assert requested_pages == [1, 2, 3]
