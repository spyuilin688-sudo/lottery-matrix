import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from postgrest import SyncPostgrestClient

from app.repositories.analysis_repository import InMemoryAnalysisRepository, SupabaseAnalysisRepository


KINDS = ["explore", "tianyan", "tiangong", "status"]


class FakeResponse:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class FakeQuery:
    def __init__(self, client: "FakeSupabaseClient", table: str) -> None:
        self.client = client
        self.table = table

    def select(self, columns: str) -> "FakeQuery":
        self.client.last_select = columns
        return self

    def upsert(self, record: dict[str, Any] | list[dict[str, Any]], **kwargs: Any) -> "FakeQuery":
        self.client.last_record = record
        self.client.last_on_conflict = kwargs.get("on_conflict")
        return self

    def eq(self, column: str, value: Any) -> "FakeQuery":
        self.client.last_filters.append((column, value))
        return self

    def order(self, column: str, desc: bool = False) -> "FakeQuery":
        self.client.last_orders.append((column, desc))
        return self

    def execute(self) -> FakeResponse:
        return FakeResponse(self.client.responses.get(self.table, []))


class FakeSupabaseClient:
    def __init__(self) -> None:
        self.last_table = ""
        self.last_select = ""
        self.last_on_conflict: str | None = None
        self.last_record: dict[str, Any] | list[dict[str, Any]] | None = None
        self.last_filters: list[tuple[str, Any]] = []
        self.last_orders: list[tuple[str, bool]] = []
        self.responses: dict[str, list[dict[str, Any]]] = {}

    def table(self, name: str) -> FakeQuery:
        self.last_table = name
        return FakeQuery(self, name)


def test_draw_upsert_is_idempotent_by_lottery_and_period() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({"lottery": "今彩539", "period": "114000123", "numbers": ["01", "02", "03", "04", "05"]})
    repository.upsert_draw({"lottery": "今彩539", "period": "114000123", "numbers": ["06", "07", "08", "09", "10"]})
    assert len(repository.draws) == 1
    assert repository.draws[("今彩539", "114000123")]["numbers"] == ["06", "07", "08", "09", "10"]


def test_draw_history_bulk_upsert_preserves_single_draw_idempotency() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draws([
        {
            "lottery": "天天樂", "period": "11977", "drawDate": "2026/08/23",
            "numbers": ["01", "02", "03", "04", "05"],
        },
    ])
    stored = repository.upsert_draws([
        {
            "lottery": "天天樂", "period": "11977", "drawDate": "2026/08/23",
            "numbers": ["06", "07", "08", "09", "10"],
        },
    ])

    assert len(repository.draws) == 1
    assert stored[-1]["numbers"] == ["06", "07", "08", "09", "10"]


def test_supabase_draw_history_uses_one_bulk_upsert_with_draw_conflict_key() -> None:
    fake_client = FakeSupabaseClient()
    fake_client.responses["lottery_draws"] = [
        {"lottery": "天天樂", "period": "11977"},
        {"lottery": "天天樂", "period": "11978"},
    ]
    repository = SupabaseAnalysisRepository(fake_client)

    stored = repository.upsert_draws([
        {
            "lottery": "天天樂", "period": "11977", "drawDate": "2026/08/23",
            "numbers": ["01", "02", "03", "04", "05"],
            "sortedNumbers": ["01", "02", "03", "04", "05"],
            "drawOrderNumbers": None, "sourceId": "calottery:11977",
        },
        {
            "lottery": "天天樂", "period": "11978", "drawDate": "2026/08/24",
            "numbers": ["06", "07", "08", "09", "10"],
        },
    ])

    assert stored == fake_client.responses["lottery_draws"]
    assert fake_client.last_table == "lottery_draws"
    assert fake_client.last_on_conflict == "lottery,period"
    assert fake_client.last_record == [
        {
            "lottery": "天天樂", "period": "11977", "draw_date": "2026/08/23",
            "numbers": ["01", "02", "03", "04", "05"],
            "sorted_numbers": ["01", "02", "03", "04", "05"],
            "draw_order_numbers": None, "source_id": "calottery:11977",
        },
        {
            "lottery": "天天樂", "period": "11978", "draw_date": "2026/08/24",
            "numbers": ["06", "07", "08", "09", "10"],
            "sorted_numbers": ["06", "07", "08", "09", "10"],
            "draw_order_numbers": None, "source_id": None,
        },
    ]


def test_supabase_empty_draw_history_does_not_issue_an_upsert() -> None:
    fake_client = FakeSupabaseClient()
    repository = SupabaseAnalysisRepository(fake_client)

    assert repository.upsert_draws([]) == []
    assert fake_client.last_table == ""


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


def test_list_draws_puts_undated_rows_after_dated_rows() -> None:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "今彩539", "period": "114000999", "drawDate": None,
        "numbers": ["01", "02", "03", "04", "05"],
    })
    repository.upsert_draw({
        "lottery": "今彩539", "period": "114000123", "drawDate": "2025/08/23",
        "numbers": ["06", "07", "08", "09", "10"],
    })

    assert [
        draw["period"] for draw in repository.list_draws("今彩539", limit=None)
    ] == ["114000123", "114000999"]


def test_supabase_list_draws_puts_undated_rows_last() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=[])

    base_url = "https://example.supabase.co/rest/v1"
    http_client = httpx.Client(
        base_url=base_url,
        transport=httpx.MockTransport(handler),
    )
    with SyncPostgrestClient(base_url, http_client=http_client) as client:
        SupabaseAnalysisRepository(client).list_draws("今彩539", limit=1)

    assert len(requests) == 1
    assert requests[0].url.params["order"] == (
        "draw_date.desc.nullslast,period.desc"
    )


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


def test_artifact_chunks_are_idempotent_by_full_composite_key() -> None:
    repository = InMemoryAnalysisRepository()
    first = {"items": [{"id": "a"}], "validationById": {"a": {"ruleSets": []}}}

    repository.save_artifact_chunk("今彩539", "115000205", "v1", "explore", 0, 0, 10, first)
    repository.save_artifact_chunk("今彩539", "115000205", "v1", "explore", 0, 0, 10, first)

    assert len(repository.read_artifact_chunks("今彩539", "115000205", "v1", "explore")) == 1


def test_completed_manifest_artifact_materializes_legacy_explore_shape() -> None:
    repository = InMemoryAnalysisRepository()
    repository.begin_run("今彩539", "115000205", "v1", "2026-08-24T10:00:00+00:00")
    first = {"items": [{"id": "a"}], "validationById": {"a": {"ruleSets": []}}}
    second = {"items": [{"id": "b"}], "validationById": {"b": {"ruleSets": []}}}
    repository.save_artifact_chunk("今彩539", "115000205", "v1", "explore", 0, 0, 10, first)
    repository.save_artifact_chunk("今彩539", "115000205", "v1", "explore", 1, 10, 20, second)
    repository.save_artifact("今彩539", "115000205", "v1", "explore", {
        "storage": "chunks", "schemaVersion": 1, "chunkCount": 2,
        "cursor": 20, "total": 20, "itemCount": 2,
    })
    for kind in ("tianyan", "tiangong", "status"):
        repository.save_artifact("今彩539", "115000205", "v1", kind, {"kind": kind})
    repository.complete_run("今彩539", "115000205", "v1", "2026-08-24T10:01:00+00:00")

    assert repository.read_completed_artifact("今彩539", "115000205", "explore") == {
        "lottery": "今彩539",
        "drawPeriod": "115000205",
        "items": [{"id": "a"}, {"id": "b"}],
        "validationById": {"a": {"ruleSets": []}, "b": {"ruleSets": []}},
    }


def test_cleanup_removes_expired_artifacts_and_chunks() -> None:
    repository = InMemoryAnalysisRepository()
    now = datetime(2026, 8, 24, tzinfo=UTC)
    repository.artifacts[("今彩539", "old", "v1", "explore")] = {"payload": {}, "expiresAt": now - timedelta(seconds=1)}
    repository.artifact_chunks[("今彩539", "old", "v1", "explore", 0)] = {
        "cursor_start": 0, "cursor_end": 10, "payload": {}, "expiresAt": now - timedelta(seconds=1),
    }

    assert repository.cleanup_expired(now) == 2


def test_supabase_chunk_queries_use_composite_upsert_and_ordered_minimal_read() -> None:
    fake_client = FakeSupabaseClient()
    repository = SupabaseAnalysisRepository(fake_client)
    delta = {"items": [{"id": "b"}], "validationById": {"b": {"ruleSets": []}}}

    repository.save_artifact_chunk("今彩539", "115000205", "v1", "explore", 1, 10, 20, delta)

    assert fake_client.last_table == "matrix_analysis_artifact_chunks"
    assert fake_client.last_on_conflict == "lottery,draw_period,analysis_version,kind,chunk_index"
    fake_client.responses["matrix_analysis_artifact_chunks"] = [{
        "chunk_index": 1, "cursor_start": 10, "cursor_end": 20, "payload": delta,
    }]
    assert repository.read_artifact_chunks("今彩539", "115000205", "v1", "explore") == [{
        "chunk_index": 1, "cursor_start": 10, "cursor_end": 20, "payload": delta,
    }]
    assert fake_client.last_select == "chunk_index,cursor_start,cursor_end,payload"
    assert fake_client.last_filters == [
        ("lottery", "今彩539"), ("draw_period", "115000205"),
        ("analysis_version", "v1"), ("kind", "explore"),
    ]
    assert fake_client.last_orders == [("chunk_index", False)]


def test_supabase_chunk_write_compacts_large_payload() -> None:
    fake_client = FakeSupabaseClient()
    repository = SupabaseAnalysisRepository(fake_client)
    repeated_evidence = "matrix-validation-evidence-" * 8_000
    delta = {
        "items": [{"id": "large", "evidence": repeated_evidence}],
        "validationById": {
            "large": {"ruleSets": [{"evidence": repeated_evidence}]},
        },
    }

    repository.save_artifact_chunk(
        "大樂透", "115000205", "v1", "explore", 0, 0, 10, delta,
    )

    stored_payload = fake_client.last_record["payload"]
    raw_size = len(json.dumps(delta, ensure_ascii=False, separators=(",", ":")))
    stored_size = len(json.dumps(stored_payload, separators=(",", ":")))
    assert stored_payload["encoding"] == "zlib+base64"
    assert stored_payload["schemaVersion"] == 1
    assert stored_size < raw_size // 10
