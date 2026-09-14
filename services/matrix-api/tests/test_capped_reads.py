"""Server row limits must bound each response, never truncate a logical read."""
from contextlib import contextmanager
from types import SimpleNamespace

import httpx
import pytest
from postgrest import SyncPostgrestClient

from app.api_server import _history
from app.repositories.analysis_repository import SupabaseAnalysisRepository


ROWS = [dict(period=f"11500000{i}", draw_date=f"2026-09-0{i}",
             numbers=["01", "02", "03", "04", "05"],
             sorted_numbers=["01", "02", "03", "04", "05"],
             draw_order_numbers=None) for i in range(7, 0, -1)]


@contextmanager
def capped_client(rows, cap):
    requests = []
    def handler(request):
        requests.append(request)
        params = request.url.params
        available = rows
        if "draw_date" in params:
            available = [row for row in available if row["draw_date"] >= params["draw_date"].removeprefix("gte.")]
        if "chunk_index" in params:
            available = [row for row in available if row["chunk_index"] > int(params["chunk_index"].removeprefix("gt."))]
        offset = int(params.get("offset", "0"))
        size = min(cap, int(params.get("limit", str(cap))))
        return httpx.Response(200, json=available[offset:offset + size])
    url = "https://example.supabase.co/rest/v1"
    transport = httpx.Client(base_url=url, transport=httpx.MockTransport(handler))
    with SyncPostgrestClient(url, http_client=transport) as client:
        yield client, requests


@pytest.mark.parametrize("limit", [None, 5])
def test_repository_fills_history_across_short_server_pages(limit):
    with capped_client(ROWS, 2) as (client, requests):
        items = SupabaseAnalysisRepository(client).list_draws("今彩539", limit)
    assert [row["period"] for row in items] == [row["period"] for row in ROWS[:limit]]
    assert [int(r.url.params.get("offset", "0")) for r in requests][:3] == [0, 2, 4]


def test_recent_history_filters_each_page_without_truncating_it():
    with capped_client(ROWS, 2) as (client, requests):
        items = SupabaseAnalysisRepository(client).list_draws_since("今彩539", "2026-09-03")
    assert [row["period"] for row in items] == [row["period"] for row in ROWS[:5]]
    assert all(r.url.params["draw_date"] == "gte.2026-09-03" for r in requests)


def test_artifact_cursor_advances_until_empty_when_server_cap_is_one():
    chunks = [dict(chunk_index=i, cursor_start=i, cursor_end=i+1, payload={"items": []}) for i in range(4)]
    with capped_client(chunks, 1) as (client, requests):
        items = SupabaseAnalysisRepository(client).read_artifact_chunks("今彩539", "115000007", "v1", "explore")
    assert [row["chunk_index"] for row in items] == [0, 1, 2, 3]
    assert [r.url.params.get("chunk_index") for r in requests] == [None, "gt.0", "gt.1", "gt.2", "gt.3"]


@pytest.mark.parametrize("limit", [None, 5])
def test_installed_client_history_alias_reads_all_requested_rows(limit):
    with capped_client(ROWS, 2) as (client, requests):
        items = _history(SimpleNamespace(client=client), "今彩539", limit)
    assert [row["period"] for row in items] == [row["period"] for row in ROWS[:limit]]
