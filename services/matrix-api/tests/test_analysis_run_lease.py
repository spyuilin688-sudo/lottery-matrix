from datetime import UTC, datetime, timedelta

import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.analysis_pipeline import AnalysisPipeline


DRAW = {
    "lottery": "今彩539",
    "period": "114000123",
    "drawDate": "2026-08-24",
    "numbers": ["01", "02", "03", "04", "05"],
}


def builders_with_calls(calls: list[str]) -> dict:
    return {
        kind: (
            lambda _context, selected=kind:
            calls.append(selected) or {"kind": selected, "items": []}
        )
        for kind in ("explore", "tianyan", "tiangong", "status")
    }


def test_only_one_owner_holds_a_live_analysis_lease() -> None:
    repository = InMemoryAnalysisRepository()
    started_at = datetime.now(UTC).isoformat()

    first = repository.begin_run(
        "今彩539", "114000123", "v1", started_at,
        owner_id="worker-a", lease_seconds=60,
    )
    blocked = repository.begin_run(
        "今彩539", "114000123", "v1", started_at,
        owner_id="worker-b", lease_seconds=60,
    )

    assert first["leaseAcquired"] is True
    assert first["leaseOwner"] == "worker-a"
    assert blocked["leaseAcquired"] is False
    assert blocked["leaseOwner"] == "worker-a"


def test_expired_analysis_lease_can_be_taken_over_without_losing_checkpoint() -> None:
    repository = InMemoryAnalysisRepository()
    first_started_at = datetime(2026, 9, 4, 1, 0, tzinfo=UTC)

    repository.begin_run(
        "今彩539", "114000123", "v1", first_started_at.isoformat(),
        owner_id="worker-a", lease_seconds=30,
    )
    repository.update_progress(
        "今彩539", "114000123", "v1", "explore", 20, 100,
        owner_id="worker-a",
    )

    takeover = repository.begin_run(
        "今彩539", "114000123", "v1",
        (first_started_at + timedelta(seconds=31)).isoformat(),
        owner_id="worker-b", lease_seconds=30,
    )

    assert takeover["leaseAcquired"] is True
    assert takeover["leaseOwner"] == "worker-b"
    assert takeover["phase"] == "explore"
    assert takeover["cursor"] == 20
    assert takeover["total"] == 100

    with pytest.raises(RuntimeError, match="ANALYSIS_RUN_LEASE_LOST"):
        repository.update_progress(
            "今彩539", "114000123", "v1", "explore", 30, 100,
            owner_id="worker-a",
        )


def test_pipeline_skips_when_another_owner_has_a_live_lease() -> None:
    repository = InMemoryAnalysisRepository()
    calls: list[str] = []
    repository.begin_run(
        "今彩539", "114000123", "v1", datetime.now(UTC).isoformat(),
        owner_id="other-worker", lease_seconds=300,
    )

    result = AnalysisPipeline(
        repository,
        builders_with_calls(calls),
        analysis_version="v1",
    ).run(DRAW, history=[])

    assert result["skipped"] is True
    assert result["leaseAcquired"] is False
    assert calls == []
    assert repository.artifacts == {}


class LeaseLosingRepository(InMemoryAnalysisRepository):
    def renew_run_lease(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        owner_id: str,
        lease_seconds: int = 300,
    ) -> bool:
        return False


def test_pipeline_does_not_publish_after_lease_is_lost() -> None:
    repository = LeaseLosingRepository()
    calls: list[str] = []

    with pytest.raises(RuntimeError, match="ANALYSIS_RUN_LEASE_LOST"):
        AnalysisPipeline(
            repository,
            builders_with_calls(calls),
            analysis_version="v1",
        ).run(DRAW, history=[])

    assert repository.artifacts == {}
    assert repository.artifact_chunks == {}
    assert repository.explore_results == {}
