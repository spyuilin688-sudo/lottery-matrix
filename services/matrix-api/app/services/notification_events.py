from __future__ import annotations

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from datetime import UTC, date, datetime
from os import environ
from typing import Any

import httpx


LOTTERY_CODES = {
    "今彩539": "539",
    "天天樂": "fantasy5",
    "六合彩": "marksix",
    "大樂透": "lotto649",
}

STATUS_LABELS = {
    "ACTIVE": "啟動",
    "FOCUS": "聚合",
    "RESONANCE": "共振",
    "CRITICAL": "臨界",
}


class NotificationConfigurationError(RuntimeError):
    """Raised when trusted notification producer configuration/input is invalid."""


class NotificationDeliveryError(RuntimeError):
    """Raised when a trusted notification event could not be delivered."""


def _occurred_at() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _lottery_code(lottery: Any) -> tuple[str, str]:
    if not isinstance(lottery, str) or lottery not in LOTTERY_CODES:
        raise NotificationConfigurationError("NOTIFICATION_LOTTERY_INVALID")
    return lottery, LOTTERY_CODES[lottery]


def _period(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise NotificationConfigurationError("NOTIFICATION_PERIOD_INVALID")
    return value.strip()


def _draw_date(value: Any) -> str:
    if not isinstance(value, str):
        raise NotificationConfigurationError("NOTIFICATION_DRAW_DATE_INVALID")
    normalized = value.strip().replace("/", "-").replace(".", "-")[:10]
    try:
        parsed = date.fromisoformat(normalized)
    except ValueError as error:
        raise NotificationConfigurationError("NOTIFICATION_DRAW_DATE_INVALID") from error
    if parsed.isoformat() != normalized:
        raise NotificationConfigurationError("NOTIFICATION_DRAW_DATE_INVALID")
    return normalized


def lottery_result_event(draw: Mapping[str, Any]) -> dict[str, Any]:
    lottery, lottery_code = _lottery_code(draw.get("lottery"))
    period = _period(draw.get("period"))
    draw_date = _draw_date(draw.get("drawDate"))
    raw_numbers = draw.get("numbers")
    if (
        not isinstance(raw_numbers, list)
        or not raw_numbers
        or any(not isinstance(number, str) or not number.strip() for number in raw_numbers)
    ):
        raise NotificationConfigurationError("NOTIFICATION_DRAW_NUMBERS_INVALID")
    numbers = [number.strip() for number in raw_numbers]
    return {
        "eventKey": f"lottery_result:{lottery_code}:{period}",
        "eventType": "lottery_result",
        "source": "railway",
        "occurredAt": _occurred_at(),
        "payload": {
            "lottery": lottery,
            "lotteryCode": lottery_code,
            "period": period,
            "numbers": numbers,
            "drawDate": draw_date,
        },
    }


def matrix_card_event(draw: Mapping[str, Any]) -> dict[str, Any]:
    lottery, lottery_code = _lottery_code(draw.get("lottery"))
    period = _period(draw.get("period"))
    draw_date = _draw_date(draw.get("drawDate"))
    return {
        "eventKey": f"matrix_card:{lottery_code}:{period}",
        "eventType": "matrix_card",
        "source": "railway",
        "occurredAt": _occurred_at(),
        "payload": {
            "lottery": lottery,
            "lotteryCode": lottery_code,
            "period": period,
            "drawDate": draw_date,
        },
    }


def matrix_status_event(
    lottery: str,
    period: str,
    status_artifact: Mapping[str, Any],
    *,
    draw_date: str,
) -> dict[str, Any] | None:
    lottery_name, lottery_code = _lottery_code(lottery)
    normalized_period = _period(period)
    summary = status_artifact.get("summary")
    if not isinstance(summary, Mapping):
        raise NotificationConfigurationError("NOTIFICATION_STATUS_ARTIFACT_INVALID")
    status = summary.get("status")
    if status == "DORMANT":
        return None
    if not isinstance(status, str) or status not in STATUS_LABELS:
        raise NotificationConfigurationError("NOTIFICATION_STATUS_INVALID")
    return {
        "eventKey": f"matrix_status:{lottery_code}:{normalized_period}",
        "eventType": "matrix_status",
        "source": "railway",
        "occurredAt": _occurred_at(),
        "payload": {
            "lottery": lottery_name,
            "lotteryCode": lottery_code,
            "period": normalized_period,
            "drawDate": _draw_date(draw_date),
            "status": status,
            "statusLabel": STATUS_LABELS[status],
        },
    }


class NotificationEventEmitter:
    def __init__(
        self,
        url: str,
        token: str,
        client: httpx.Client,
        *,
        supabase_url: str = "",
        supabase_service_key: str = "",
    ) -> None:
        self._url = url.strip()
        self._token = token.strip()
        self._client = client
        resolved_supabase_url = supabase_url or environ.get("SUPABASE_URL", "")
        resolved_service_key = supabase_service_key or environ.get("SUPABASE_SECRET_KEY", "")
        self._supabase_url = resolved_supabase_url.strip().rstrip("/")
        self._supabase_service_key = resolved_service_key.strip()
        if bool(self._url) != bool(self._token):
            raise NotificationConfigurationError("NOTIFICATION_INGEST_CONFIGURATION_INCOMPLETE")
        if bool(self._supabase_url) != bool(self._supabase_service_key):
            raise NotificationConfigurationError("NOTIFICATION_PREFLIGHT_CONFIGURATION_INCOMPLETE")
        self.enabled = bool(self._url and self._token)

    def exists(self, event_key: str) -> bool:
        if not isinstance(event_key, str) or not event_key.strip():
            raise NotificationConfigurationError("NOTIFICATION_EVENT_KEY_INVALID")
        if not self.enabled or not self._supabase_url or not self._supabase_service_key:
            return False
        try:
            response = self._client.post(
                f"{self._supabase_url}/rest/v1/rpc/notification_event_exists_server",
                headers={
                    "apikey": self._supabase_service_key,
                    "Authorization": f"Bearer {self._supabase_service_key}",
                    "Content-Type": "application/json",
                },
                json={"p_event_key": event_key},
            )
        except httpx.TransportError:
            # This preflight is an optimization only. If it is unavailable, the
            # ingest RPC's existing unique event key remains the final race guard.
            return False
        if response.status_code != 200:
            return False
        try:
            body = response.json()
        except ValueError:
            return False
        return body is True

    def emit(self, event: dict[str, Any]) -> dict[str, Any]:
        event_key = event.get("eventKey")
        if not isinstance(event_key, str) or not event_key:
            raise NotificationConfigurationError("NOTIFICATION_EVENT_KEY_INVALID")
        if not self.enabled:
            return {"created": False, "eventKey": event_key}
        if self.exists(event_key):
            return {"created": False, "eventKey": event_key}

        try:
            response = self._client.post(
                self._url,
                headers={"x-matrix-notification-token": self._token},
                json=event,
            )
        except httpx.TransportError as error:
            raise NotificationDeliveryError("NOTIFICATION_INGEST_TRANSPORT_FAILED") from error

        if response.status_code != 200:
            if 400 <= response.status_code <= 499:
                raise NotificationConfigurationError(
                    f"NOTIFICATION_INGEST_REJECTED:{response.status_code}"
                )
            raise NotificationDeliveryError(
                f"NOTIFICATION_INGEST_FAILED:{response.status_code}"
            )

        try:
            body = response.json()
        except ValueError as error:
            raise NotificationDeliveryError("NOTIFICATION_INGEST_RESPONSE_INVALID") from error
        if not isinstance(body, dict):
            raise NotificationDeliveryError("NOTIFICATION_INGEST_RESPONSE_INVALID")
        created = body.get("created")
        response_event_key = body.get("eventKey")
        if (
            not isinstance(created, bool)
            or not isinstance(response_event_key, str)
            or not response_event_key
            or response_event_key != event_key
        ):
            raise NotificationDeliveryError("NOTIFICATION_INGEST_RESPONSE_INVALID")
        return {"created": created, "eventKey": response_event_key}


@contextmanager
def notification_emitter_context(settings: Any) -> Iterator[NotificationEventEmitter | None]:
    url = str(getattr(settings, "notification_ingest_url", "") or "").strip()
    token = str(getattr(settings, "notification_ingest_token", "") or "").strip()
    if bool(url) != bool(token):
        raise NotificationConfigurationError("NOTIFICATION_INGEST_CONFIGURATION_INCOMPLETE")
    if not url:
        yield None
        return
    with httpx.Client() as client:
        yield NotificationEventEmitter(
            url,
            token,
            client,
            supabase_url=str(getattr(settings, "supabase_url", "") or ""),
            supabase_service_key=str(getattr(settings, "supabase_secret_key", "") or ""),
        )
