from types import SimpleNamespace

import httpx
import pytest

from app.api_server import tinyfish_status_payload
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.scraping.resilient_source import ResilientLatestDrawSource
from app.services.tinyfish_status import (
    TINYFISH_JOB_NAME_BY_LOTTERY,
    list_tinyfish_fallback_statuses,
    record_tinyfish_fallback,
)


DRAW = {
    "period": "115000224",
    "drawDate": "2026-09-15",
    "numbers": ["01", "08", "17", "23", "36"],
    "sortedNumbers": ["01", "08", "17", "23", "36"],
    "drawOrderNumbers": None,
}


class FailingPrimary:
    def fetch(self, lottery: str) -> dict:
        raise httpx.ConnectError(
            "primary unavailable",
            request=httpx.Request("GET", "https://primary.example.test/latest"),
        )


class SuccessfulFallback:
    def fetch_latest(self, lottery: str) -> dict:
        return dict(DRAW)


class FailingFallback:
    def fetch_latest(self, lottery: str) -> dict:
        raise RuntimeError("fallback-private-detail")


def test_resilient_source_reports_successful_tinyfish_use() -> None:
    events: list[tuple[str, str, str | None, str | None]] = []
    source = ResilientLatestDrawSource(
        FailingPrimary(),
        SuccessfulFallback(),
        telemetry=lambda lottery, status, period, error: events.append(
            (lottery, status, period, error)
        ),
    )

    assert source.fetch("今彩539") == DRAW
    assert events == [("今彩539", "success", "115000224", None)]


def test_resilient_source_reports_failed_tinyfish_use_without_leaking_detail() -> None:
    events: list[tuple[str, str, str | None, str | None]] = []
    source = ResilientLatestDrawSource(
        FailingPrimary(),
        FailingFallback(),
        telemetry=lambda lottery, status, period, error: events.append(
            (lottery, status, period, error)
        ),
    )

    with pytest.raises(httpx.ConnectError, match="primary unavailable"):
        source.fetch("今彩539")

    assert events == [("今彩539", "failed", None, "RuntimeError")]
    assert "fallback-private-detail" not in str(events)


def test_tinyfish_repository_projection_uses_existing_job_status_store() -> None:
    repository = InMemoryAnalysisRepository()
    record_tinyfish_fallback(
        repository,
        "今彩539",
        "success",
        "2026-09-15T17:50:00+00:00",
        source_period="115000224",
    )
    record_tinyfish_fallback(
        repository,
        "六合彩",
        "failed",
        "2026-09-15T17:51:00+00:00",
        error="private-provider-detail",
    )

    assert TINYFISH_JOB_NAME_BY_LOTTERY["今彩539"] in repository.job_statuses
    assert list_tinyfish_fallback_statuses(repository) == [
        {
            "lottery": "今彩539",
            "status": "success",
            "finishedAt": "2026-09-15T17:50:00+00:00",
            "sourcePeriod": "115000224",
            "error": None,
        },
        {
            "lottery": "六合彩",
            "status": "failed",
            "finishedAt": "2026-09-15T17:51:00+00:00",
            "sourcePeriod": None,
            "error": "TINYFISH_FAILED",
        },
    ]
    assert "private-provider-detail" not in str(list_tinyfish_fallback_statuses(repository))


def test_tinyfish_status_payload_exposes_configuration_not_secret() -> None:
    repository = InMemoryAnalysisRepository()
    record_tinyfish_fallback(
        repository,
        "大樂透",
        "success",
        "2026-09-15T17:52:00+00:00",
        source_period="115000088",
    )
    settings = SimpleNamespace(
        tinyfish_api_key="private-tinyfish-secret",
        tinyfish_fetch_fallback_enabled=True,
        tinyfish_browser_fallback_enabled=False,
        tinyfish_browser_max_duration_seconds=60,
    )

    payload = tinyfish_status_payload(repository, settings)

    assert payload == {
        "configured": True,
        "fetchEnabled": True,
        "browserEnabled": False,
        "browserMaxDurationSeconds": 60,
        "lastFallbacks": [{
            "lottery": "大樂透",
            "status": "success",
            "finishedAt": "2026-09-15T17:52:00+00:00",
            "sourcePeriod": "115000088",
            "error": None,
        }],
    }
    assert "private-tinyfish-secret" not in str(payload)
