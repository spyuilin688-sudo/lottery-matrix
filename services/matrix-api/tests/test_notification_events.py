from __future__ import annotations

from datetime import datetime

import httpx
import pytest

from app.services.notification_events import (
    NotificationConfigurationError,
    NotificationDeliveryError,
    NotificationEventEmitter,
    lottery_result_event,
    matrix_card_event,
    matrix_status_event,
)
from app.settings import load_settings


def _draw(lottery: str = "今彩539") -> dict[str, object]:
    if lottery in {"今彩539", "天天樂"}:
        numbers = ["01", "02", "03", "04", "05"]
    else:
        numbers = ["01", "02", "03", "04", "05", "06", "07"]
    return {
        "lottery": lottery,
        "period": "115203",
        "drawDate": "2026-09-03",
        "numbers": numbers,
    }


def _assert_timestamp(value: str) -> None:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert parsed.tzinfo is not None


def test_lottery_result_event_is_stable() -> None:
    event = lottery_result_event(_draw())

    assert event["eventKey"] == "lottery_result:539:115203"
    assert event["eventType"] == "lottery_result"
    assert event["source"] == "railway"
    assert event["payload"] == {
        "lottery": "今彩539",
        "lotteryCode": "539",
        "period": "115203",
        "numbers": ["01", "02", "03", "04", "05"],
        "drawDate": "2026-09-03",
    }
    _assert_timestamp(event["occurredAt"])


@pytest.mark.parametrize(
    ("lottery", "code"),
    [
        ("今彩539", "539"),
        ("天天樂", "fantasy5"),
        ("六合彩", "marksix"),
        ("大樂透", "lotto649"),
    ],
)
def test_lottery_code_mapping_is_shared_by_result_and_card(lottery: str, code: str) -> None:
    draw = _draw(lottery)

    result = lottery_result_event(draw)
    card = matrix_card_event(draw)

    assert result["eventKey"] == f"lottery_result:{code}:115203"
    assert result["payload"]["lotteryCode"] == code
    assert card["eventKey"] == f"matrix_card:{code}:115203"
    assert card["payload"] == {
        "lottery": lottery,
        "lotteryCode": code,
        "period": "115203",
        "drawDate": "2026-09-03",
    }
    _assert_timestamp(card["occurredAt"])


@pytest.mark.parametrize(
    ("status", "label"),
    [
        ("ACTIVE", "啟動"),
        ("FOCUS", "聚合"),
        ("RESONANCE", "共振"),
        ("CRITICAL", "臨界"),
    ],
)
def test_matrix_status_event_maps_status_label(status: str, label: str) -> None:
    event = matrix_status_event(
        "六合彩",
        "115203",
        {"summary": {"status": status}},
        draw_date="2026-09-03",
    )

    assert event is not None
    assert event["eventKey"] == "matrix_status:marksix:115203"
    assert event["eventType"] == "matrix_status"
    assert event["source"] == "railway"
    assert event["payload"] == {
        "lottery": "六合彩",
        "lotteryCode": "marksix",
        "period": "115203",
        "status": status,
        "statusLabel": label,
        "drawDate": "2026-09-03",
    }
    _assert_timestamp(event["occurredAt"])


def test_dormant_status_produces_no_event() -> None:
    assert matrix_status_event(
        "今彩539",
        "115203",
        {"summary": {"status": "DORMANT"}},
        draw_date="2026-09-03",
    ) is None


def test_emitter_duplicate_200_is_success() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "id": "event-1",
                "eventKey": "lottery_result:539:115203",
                "created": False,
                "fanoutStatus": "complete",
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        emitter = NotificationEventEmitter(
            "https://example.invalid/functions/v1/notification-ingest",
            "secret-token",
            client,
        )
        result = emitter.emit(lottery_result_event(_draw()))

    assert emitter.enabled is True
    assert result == {
        "created": False,
        "eventKey": "lottery_result:539:115203",
    }
    assert len(requests) == 1
    assert requests[0].headers["x-matrix-notification-token"] == "secret-token"
    assert requests[0].url == "https://example.invalid/functions/v1/notification-ingest"


def test_emitter_403_is_configuration_error() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(403, json={"error": {"code": "INVALID_TOKEN"}}))
    with httpx.Client(transport=transport) as client:
        emitter = NotificationEventEmitter("https://example.invalid/ingest", "bad-token", client)
        with pytest.raises(NotificationConfigurationError):
            emitter.emit(lottery_result_event(_draw()))


def test_emitter_500_is_delivery_error() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(500, json={"error": {"code": "EVENT_ENQUEUE_FAILED"}}))
    with httpx.Client(transport=transport) as client:
        emitter = NotificationEventEmitter("https://example.invalid/ingest", "token", client)
        with pytest.raises(NotificationDeliveryError):
            emitter.emit(lottery_result_event(_draw()))


def test_emitter_transport_failure_is_delivery_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection failed", request=request)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        emitter = NotificationEventEmitter("https://example.invalid/ingest", "token", client)
        with pytest.raises(NotificationDeliveryError):
            emitter.emit(lottery_result_event(_draw()))


def test_disabled_emitter_performs_no_network_call() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise AssertionError("disabled emitter must not perform network I/O")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        emitter = NotificationEventEmitter("", "", client)
        result = emitter.emit(lottery_result_event(_draw()))

    assert emitter.enabled is False
    assert calls == 0
    assert result == {
        "created": False,
        "eventKey": "lottery_result:539:115203",
    }


@pytest.mark.parametrize(
    ("url", "token"),
    [
        ("https://example.invalid/ingest", ""),
        ("", "token"),
    ],
)
def test_partial_emitter_configuration_is_rejected(url: str, token: str) -> None:
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200))) as client:
        with pytest.raises(NotificationConfigurationError):
            NotificationEventEmitter(url, token, client)


def test_emitter_rejects_malformed_success_payload() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"created": True}))
    with httpx.Client(transport=transport) as client:
        emitter = NotificationEventEmitter("https://example.invalid/ingest", "token", client)
        with pytest.raises(NotificationDeliveryError):
            emitter.emit(lottery_result_event(_draw()))


def test_settings_load_notification_ingest_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MATRIX_NOTIFICATION_INGEST_URL", " https://example.invalid/ingest ")
    monkeypatch.setenv("MATRIX_NOTIFICATION_INGEST_TOKEN", " secret-token ")

    settings = load_settings()

    assert settings.notification_ingest_url == "https://example.invalid/ingest"
    assert settings.notification_ingest_token == "secret-token"

def test_matrix_status_event_deduplicates_status_upgrades_by_lottery_and_period() -> None:
    resonance = matrix_status_event(
        "今彩539",
        "115203",
        {"summary": {"status": "RESONANCE"}},
        draw_date="2026-09-03",
    )
    critical = matrix_status_event(
        "今彩539",
        "115203",
        {"summary": {"status": "CRITICAL"}},
        draw_date="2026-09-03",
    )

    assert resonance is not None
    assert critical is not None
    assert resonance["eventKey"] == "matrix_status:539:115203"
    assert critical["eventKey"] == resonance["eventKey"]
    assert resonance["payload"]["status"] == "RESONANCE"
    assert critical["payload"]["status"] == "CRITICAL"
