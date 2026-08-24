from datetime import UTC, datetime, timedelta

import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository, SupabaseAnalysisRepository


KINDS = ["explore", "tianyan", "tiangong", "status"]


def test_draw_upsert_is_idempotent_by_lottery_and_period() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({"lottery": "今彩539", "period": "114000123", "numbers": ["01", "02", "03", "04", "05"]})
    repository.upsert_draw({"lottery": "今彩539", "period": "114000123", "numbers": ["06", "07", "08", "09", "10"]})
    assert len(repository.draws) == 1
    assert repository.draws[("今彩539", "114000123")]["numbers"] == ["06", "07", "08", "09", "10"]


def test_list_draws_returns_newest_first_and_normalized_shape() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "今彩539", "period": "114000122", "drawDate": "2025/08/22",
        "numbers": ["01", "02", "03", "04", "05"],
        "sortedNumbers": ["01", "02", "03", "04", "05"],
        "drawOrderNumbers": ["05", "04", "03", "02", "01"],
    })
    repository.upsert_draw({
        "lottery": "今彩539", "period": "114000123", "drawDate": "2025/08/23",
        "numbers": ["06", "07", "08", "09", "10"],
        "sortedNumbers": ["06", "07", "08", "09", "10"],
        "drawOrderNumbers": None,
    })
    repository.upsert_draw({
        "lottery": "大樂透", "period": "114000999", "drawDate": "2025/08/24",
        "numbers": ["01", "02", "03", "04", "05", "06", "07"],
    })

    assert repository.list_draws("今彩539", limit=1) == [{
        "period": "114000123",
        "drawDate": "2025/08/23",
        "numbers": ["06", "07", "08", "09", "10"],
        "sortedNumbers": ["06", "07", "08", "09", "10"],
        "drawOrderNumbers": None,
    }]


def test_supabase_draw_normalization_converts_database_field_names() -> None:
    assert SupabaseAnalysisRepository._normalize_draw({
        "period": "114000123", "draw_date": "2025/08/23",
        "numbers": ["06", "07", "08", "09", "10"],
        "sorted_numbers": ["06", "07", "08", "09", "10"],
        "draw_order_numbers": None,
    }) == {
        "period": "114000123", "drawDate": "2025/08/23",
        "numbers": ["06", "07", "08", "09", "10"],
        "sortedNumbers": ["06", "07", "08", "09", "10"],
        "drawOrderNumbers": None,
    }


def test_incomplete_analysis_cannot_be_completed_or_read() -> None:
    repository = InMemoryAnalysisRepository()
    repository.begin_run("今彩539", "114000123", "v1", "2026-08-24T10:00:00+00:00")
    repository.save_artifact("今彩539", "114000123", "v1", "explore", {"items": []})
    assert repository.read_completed_artifact("今彩539", "114000123", "explore") is None
    with pytest.raises(ValueError, match="ANALYSIS_ARTIFACTS_INCOMPLETE"):
        repository.complete_run("今彩539", "114000123", "v1", "2026-08-24T10:01:00+00:00")


def test_complete_version_is_readable_and_duplicate_begin_reuses_run() -> None:
    repository = InMemoryAnalysisRepository()
    first = repository.begin_run("今彩539", "114000123", "v1", "2026-08-24T10:00:00+00:00")
    second = repository.begin_run("今彩539", "114000123", "v1", "2026-08-24T10:00:05+00:00")
    assert first == second
    for kind in KINDS:
        repository.save_artifact("今彩539", "114000123", "v1", kind, {"kind": kind})
    repository.complete_run("今彩539", "114000123", "v1", "2026-08-24T10:01:00+00:00")
    assert repository.read_completed_artifact("今彩539", "114000123", "tianyan") == {"kind": "tianyan"}
    assert repository.get_progress("今彩539", "114000123")["status"] == "complete"


def test_cleanup_removes_only_expired_artifacts() -> None:
    repository = InMemoryAnalysisRepository()
    now = datetime(2026, 8, 24, tzinfo=UTC)
    repository.artifacts[("今彩539", "old", "v1", "explore")] = {"payload": {}, "expiresAt": now - timedelta(seconds=1)}
    repository.artifacts[("今彩539", "new", "v2", "explore")] = {"payload": {}, "expiresAt": now + timedelta(days=1)}
    assert repository.cleanup_expired(now) == 1
    assert ("今彩539", "new", "v2", "explore") in repository.artifacts
