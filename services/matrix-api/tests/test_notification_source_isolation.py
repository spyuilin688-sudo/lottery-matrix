from copy import deepcopy
from datetime import datetime, timedelta
import json
from zoneinfo import ZoneInfo

import httpx
import pytest

from app import worker
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.card_publication import CardPublicationService
from app.services.notification_events import NotificationEventEmitter
from tests.test_card_publication import MemoryCards, png_stub
from tests.test_worker_notifications import _builders


@pytest.mark.parametrize("lottery,code,hour,minute,count", [
    ("今彩539", "539", 20, 33, 5),
    ("六合彩", "marksix", 21, 33, 7),
    ("大樂透", "lotto649", 20, 53, 7),
])
def test_early_notification_cannot_replace_formal_acquisition_analysis_or_cards(
    monkeypatch, lottery, code, hour, minute, count,
):
    day = 29 if lottery == "六合彩" else 28
    now = datetime(2026, 8, day, hour, minute, tzinfo=ZoneInfo("Asia/Taipei"))
    formal_numbers = [f"{n:02}" for n in range(1, count + 1)]
    early_numbers = [f"{n:02}" for n in range(31, 31 + count)]
    repository = InMemoryAnalysisRepository()

    def draw(period, draw_day):
        return {"lottery": lottery, "period": str(period), "drawDate": draw_day.date().isoformat(),
                "numbers": formal_numbers[:], "sortedNumbers": formal_numbers[:],
                "drawOrderNumbers": formal_numbers[:]}

    history = [draw(1000 - i, now - timedelta(days=i + 1)) for i in range(300)]
    for row in history:
        repository.upsert_draw(row)

    class OfficialSource:
        ready = False
        fetches = 0

        def fetch(self, requested_lottery):
            assert requested_lottery == lottery
            self.fetches += 1
            return draw(1001, now) if self.ready else deepcopy(history[0])

        def fetch_history(self, requested_lottery, limit):
            assert requested_lottery == lottery
            rows = ([draw(1001, now)] if self.ready else []) + history
            return deepcopy(rows if limit is None else rows[:limit])

    cards = MemoryCards()
    repository.card_repository = cards
    rendered = []

    def render(requested_lottery, rows):
        rendered.append(deepcopy(rows))
        return png_stub(requested_lottery, rows)

    publisher = CardPublicationService(repository, cards, renderer=render)
    publisher.ensure_current(lottery, now - timedelta(minutes=11))
    publisher.ensure_current(lottery, now - timedelta(minutes=1))
    old_manifest = deepcopy(cards.row["manifest"])
    assert old_manifest["period"] == "1000"
    monkeypatch.setattr(worker, "publish_current_card", lambda name, repo, time=None: publisher.ensure_current(name, time))

    # The notification endpoint already holds today's Pilio result. Deliberately
    # use different numbers, so any leak into formal data is observable.
    early_event = {"source": "pilio", "lottery": lottery, "drawDate": now.date().isoformat(), "numbers": early_numbers}
    emitted = []

    def ingest(request):
        event = json.loads(request.content)
        emitted.append(event)
        created = event["eventType"] != "lottery_result"
        if not created:
            assert event["payload"]["lottery"] == early_event["lottery"]
            assert event["payload"]["drawDate"] == early_event["drawDate"]
        return httpx.Response(200, json={"created": created, "eventKey": event["eventKey"]})

    inputs = []
    builders = _builders()

    def explore(context):
        inputs.append(deepcopy(context["draw"]))
        assert all(row["numbers"] == formal_numbers for row in context["history"])
        return {"items": [], "validationById": {}}

    builders["explore"] = explore
    source = OfficialSource()
    with httpx.Client(transport=httpx.MockTransport(ingest)) as client:
        emitter = NotificationEventEmitter("https://example.invalid/notification-ingest", "test-token", client)
        waiting = worker.run_scheduled_worker(lottery, now, repository, source, builders, emitter)
        assert waiting["status"] == "not-acquired"
        assert repository.list_draws(lottery, 1)[0]["period"] == "1000"
        assert repository.get_progress(lottery, "1001", f"1001:{worker.ANALYSIS_VERSION}") is None
        assert cards.row["manifest"] == old_manifest
        assert inputs == []

        source.ready = True
        finished = worker.run_scheduled_worker(lottery, now, repository, source, builders, emitter)
        assert finished["status"] == "complete"
        assert source.fetches == 2
        assert repository.list_draws(lottery, 1)[0]["numbers"] == formal_numbers
        assert inputs and all(row["period"] == "1001" and row["numbers"] == formal_numbers for row in inputs)
        assert repository.get_progress(lottery, "1001", f"1001:{worker.ANALYSIS_VERSION}")["status"] == "complete"
        assert cards.row["manifest"] == old_manifest
        assert [event["eventType"] for event in emitted] == ["lottery_result", "matrix_status"]

        manifest = publisher.ensure_current(lottery, now + timedelta(minutes=10))
        assert manifest["period"] == "1001"
        assert rendered[-1][0]["numbers"] == formal_numbers
        worker.emit_ready_notifications(lottery, "1001", repository, emitter, set())
        assert any(event["eventKey"] == f"matrix_card:{code}:1001" for event in emitted)
        assert early_event["numbers"] == early_numbers
