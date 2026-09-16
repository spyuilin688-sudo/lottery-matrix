from __future__ import annotations

import httpx

from app.services.notification_events import NotificationEventEmitter, lottery_result_event


def _draw() -> dict[str, object]:
    return {
        "lottery": "今彩539",
        "period": "115203",
        "drawDate": "2026-09-03",
        "numbers": ["01", "02", "03", "04", "05"],
    }


def _emitter(client: httpx.Client) -> NotificationEventEmitter:
    return NotificationEventEmitter(
        "https://project.supabase.co/functions/v1/notification-ingest",
        "ingest-token",
        client,
        supabase_url="https://project.supabase.co",
        supabase_service_key="service-role",
    )


def test_existing_event_skips_notification_ingest_post() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/rest/v1/rpc/notification_event_exists_server":
            return httpx.Response(200, json=True)
        raise AssertionError("existing event must not call notification-ingest")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = _emitter(client).emit(lottery_result_event(_draw()))

    assert result == {"created": False, "eventKey": "lottery_result:539:115203"}
    assert [request.url.path for request in requests] == [
        "/rest/v1/rpc/notification_event_exists_server",
    ]


def test_missing_event_checks_once_then_posts_to_ingest() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/rest/v1/rpc/notification_event_exists_server":
            return httpx.Response(200, json=False)
        if request.url.path == "/functions/v1/notification-ingest":
            return httpx.Response(200, json={
                "id": "event-1",
                "eventKey": "lottery_result:539:115203",
                "created": True,
                "fanoutStatus": "pending",
            })
        raise AssertionError(f"unexpected request: {request.url}")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = _emitter(client).emit(lottery_result_event(_draw()))

    assert result == {"created": True, "eventKey": "lottery_result:539:115203"}
    assert [request.url.path for request in requests] == [
        "/rest/v1/rpc/notification_event_exists_server",
        "/functions/v1/notification-ingest",
    ]
