from __future__ import annotations

import json
from urllib.parse import quote

from app.api_server import handle_api_request
from app.repositories.analysis_repository import InMemoryAnalysisRepository


def _draw(lottery: str, period: str, draw_date: str, numbers: list[str], draw_order: list[str] | None = None) -> dict:
    return {
        "lottery": lottery,
        "period": period,
        "drawDate": draw_date,
        "numbers": numbers,
        "sortedNumbers": numbers,
        "drawOrderNumbers": draw_order,
    }


def _repository() -> InMemoryAnalysisRepository:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(_draw("今彩539", "003115", "2026-08-26", ["01", "02", "03", "04", "05"], ["05", "04", "03", "02", "01"]))
    repository.upsert_draw(_draw("今彩539", "003116", "2026-08-27", ["06", "07", "08", "09", "10"], ["10", "09", "08", "07", "06"]))
    repository.upsert_draw(_draw("今彩539", "003117", "2026-08-28", ["01", "07", "11", "20", "39"], ["39", "20", "11", "07", "01"]))
    return repository


def test_latest_and_history_are_read_from_repository() -> None:
    repository = _repository()
    lottery = quote("今彩539")

    status, latest = handle_api_request("GET", f"/api/matrix/latest/{lottery}", None, repository)
    assert status == 200
    assert latest["item"]["period"] == "003117"

    status, history = handle_api_request("GET", f"/api/matrix/history/{lottery}?limit=2", None, repository)
    assert status == 200
    assert [item["period"] for item in history["items"]] == ["003117", "003116"]


def test_history_without_limit_returns_all_rows() -> None:
    repository = _repository()
    status, history = handle_api_request("GET", f"/api/matrix/history/{quote('今彩539')}", None, repository)
    assert status == 200
    assert [item["period"] for item in history["items"]] == ["003117", "003116", "003115"]


def test_tongxing_matches_legacy_appdeploy_semantics() -> None:
    repository = _repository()
    body = json.dumps({
        "lottery": "今彩539",
        "numberOrder": "依號碼由小到大排序",
        "numbers": ["01"],
        "futureOffset": 2,
    }).encode()

    status, payload = handle_api_request("POST", "/api/matrix/tongxing", body, repository)
    assert status == 200
    assert payload["numbers"] == ["01"]
    assert payload["futureOffset"] == 2
    assert len(payload["groups"]) == 1
    assert payload["groups"][0]["lockedEntry"]["period"] == "003115"
    assert payload["groups"][0]["predictedEntry"]["period"] == "003117"


def test_number_reference_preserves_actual_order_and_match_slots() -> None:
    repository = _repository()
    body = json.dumps({
        "lottery": "今彩539",
        "numberOrder": "依實際開獎順序排序",
        "historyRange": 1000,
        "numbers": ["01", "07"],
    }).encode()

    status, payload = handle_api_request("POST", "/api/matrix/number-reference", body, repository)
    assert status == 200
    newest = payload["items"][-1]
    assert newest["period"] == "003117"
    assert newest["numbers"] == ["39", "20", "11", "07", "01"]
    assert newest["matchSlots"] == [0, 0, 0, 2, 1]


def test_invalid_route_is_404() -> None:
    status, payload = handle_api_request("GET", "/missing", None, _repository())
    assert status == 404
    assert payload == {"error": "NOT_FOUND"}
