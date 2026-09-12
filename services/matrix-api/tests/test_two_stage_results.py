import json
from urllib.parse import quote

import httpx
from postgrest import SyncPostgrestClient

from app.api_server import handle_api_request
from app.repositories.analysis_repository import InMemoryAnalysisRepository, SupabaseAnalysisRepository


def preliminary(period="026100"):
    return {"lottery": "六合彩", "period": period, "drawDate": "2026-09-15",
            "numbers": ["01", "02", "03", "04", "05", "06", "49"],
            "sortedNumbers": ["01", "02", "03", "04", "05", "06", "49"],
            "drawOrderNumbers": None, "resultStatus": "preliminary"}


def test_formal_period_correction_reconciles_same_date_and_discards_old_results():
    repo = InMemoryAnalysisRepository()
    draft = preliminary()
    repo.upsert_draw(draft)
    version = "026100:matrix-python-v14-sorted"
    repo.begin_run("六合彩", "026100", version, "2026-09-15T13:40:00Z")
    repo.save_artifact("六合彩", "026100", version, "explore", {"items": []})
    repo.upsert_draw({**draft, "period": "026101", "resultStatus": "confirmed",
                      "drawOrderNumbers": ["06", "05", "04", "03", "02", "01", "49"]})
    rows = repo.list_draws("六合彩")
    assert len(rows) == 1
    assert rows[0]["period"] == "026101"
    assert rows[0]["resultStatus"] == "confirmed"
    assert repo.get_progress("六合彩", "026100", version) is None
    assert repo.read_artifact("六合彩", "026100", version, "explore") is None


def test_unchanged_sorted_stage_survives_confirmation_and_late_draft_cannot_demote_it():
    repo = InMemoryAnalysisRepository()
    draft = preliminary()
    repo.upsert_draw(draft)
    version = "026100:matrix-python-v14-sorted"
    repo.begin_run("六合彩", "026100", version, "2026-09-15T13:40:00Z")
    repo.save_artifact("六合彩", "026100", version, "explore", {"items": ["ready"]})
    confirmed = {**draft, "resultStatus": "confirmed", "drawOrderNumbers": draft["numbers"]}
    repo.upsert_draw(confirmed)
    repo.upsert_draw(draft)
    assert repo.list_draws("六合彩")[0]["resultStatus"] == "confirmed"
    assert repo.list_draws("六合彩")[0]["drawOrderNumbers"] == draft["numbers"]
    assert repo.read_artifact("六合彩", "026100", version, "explore") == {"items": ["ready"]}


def test_public_queries_keep_new_date_but_never_substitute_sorted_for_missing_actual():
    repo = InMemoryAnalysisRepository()
    repo.upsert_draw(preliminary())
    status, latest = handle_api_request("GET", "/api/matrix/latest/" + quote("六合彩"), None, repo)
    assert status == 200
    assert latest["item"]["drawDate"] == "2026-09-15"
    assert latest["item"]["resultStatus"] == "preliminary"
    assert latest["item"]["drawOrderNumbers"] is None
    request = {"lottery": "六合彩", "numberOrder": "依實際開獎順序排序", "historyRange": 1000, "numbers": []}
    status, reference = handle_api_request("POST", "/api/matrix/number-reference", json.dumps(request).encode(), repo)
    assert status == 200
    assert reference["items"][0]["period"] == "026100"
    assert reference["items"][0]["numbers"] == []
    assert reference["items"][0]["matchSlots"] == []


def test_result_ready_requires_shared_producer_token_and_matches_the_persisted_date(monkeypatch):
    monkeypatch.setenv("MATRIX_NOTIFICATION_INGEST_TOKEN", "producer-token")
    repo = InMemoryAnalysisRepository()
    repo.upsert_draw(preliminary())
    queued = []
    def enqueue(lottery, owner):
        queued.append((lottery, owner))
        return "accepted"
    body = json.dumps({"lottery": "六合彩", "drawDate": "2026-09-15"}).encode()
    for token in (None, "wrong"):
        status, _ = handle_api_request("POST", "/jobs/result-ready", body, repo,
            request_notification_token=token, recover_lottery=enqueue)
        assert status == 403
    assert queued == []
    status, _ = handle_api_request("POST", "/jobs/result-ready", body, repo,
        request_notification_token="producer-token", recover_lottery=enqueue)
    assert status == 202
    assert queued == [("六合彩", None)]
    wrong_date = json.dumps({"lottery": "六合彩", "drawDate": "2026-09-16"}).encode()
    status, _ = handle_api_request("POST", "/jobs/result-ready", wrong_date, repo,
        request_notification_token="producer-token", recover_lottery=enqueue)
    assert status == 409
    assert len(queued) == 1


def test_formal_rpc_response_is_normalized_for_worker_and_notification_consumers():
    def respond(request):
        assert request.url.path == "/rest/v1/rpc/matrix_upsert_draws"
        record = json.loads(request.content)["p_draws"][0]
        return httpx.Response(200, json=[{**record, "id": 42}])
    client = SyncPostgrestClient("https://example.test/rest/v1", http_client=httpx.Client(transport=httpx.MockTransport(respond)))
    repo = SupabaseAnalysisRepository(client)
    result = repo.upsert_draw({**preliminary(), "resultStatus": "confirmed"})
    assert result["lottery"] == "六合彩"
    assert result["drawDate"] == "2026-09-15"
    assert result["resultStatus"] == "confirmed"
    assert result["drawOrderNumbers"] is None


def test_historical_correction_invalidates_newer_analysis_that_used_it():
    repo = InMemoryAnalysisRepository()
    older = {**preliminary("026099"), "drawDate": "2026-09-12", "resultStatus": "confirmed"}
    repo.upsert_draw(older)
    repo.upsert_draw(preliminary())
    version = "026100:matrix-python-v14-sorted"
    repo.begin_run("六合彩", "026100", version, "2026-09-15T13:40:00Z")
    changed = ["11", "12", "13", "14", "15", "16", "49"]
    repo.upsert_draw({**older, "numbers": changed, "sortedNumbers": changed})
    assert repo.get_progress("六合彩", "026100", version) is None


def test_formal_period_correction_keeps_next_preliminary_date_and_rebases_its_estimate():
    repo = InMemoryAnalysisRepository()
    repo.upsert_draw(preliminary())
    repo.upsert_draw({**preliminary("026101"), "drawDate": "2026-09-17"})
    repo.upsert_draw({**preliminary("026101"), "resultStatus": "confirmed"})
    assert [(row["drawDate"], row["period"], row["resultStatus"]) for row in repo.list_draws("六合彩")] == [
        ("2026-09-17", "026102", "preliminary"), ("2026-09-15", "026101", "confirmed")]


def test_downward_period_correction_preserves_next_date_using_the_previous_key():
    repo = InMemoryAnalysisRepository()
    repo.upsert_draw(preliminary("026101"))
    repo.upsert_draw({**preliminary("026102"), "drawDate": "2026-09-17"})
    repo.upsert_draw({**preliminary("026100"), "resultStatus": "confirmed"})
    assert [(row["drawDate"], row["period"]) for row in repo.list_draws("六合彩")] == [
        ("2026-09-17", "026101"), ("2026-09-15", "026100")]
