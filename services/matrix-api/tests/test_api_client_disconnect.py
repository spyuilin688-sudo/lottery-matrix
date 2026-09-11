from io import BytesIO

import pytest

from app.api_server import RailwayApiHandler


class DisconnectedWriter:
    def write(self, _: bytes) -> None:
        raise BrokenPipeError(32, "Broken pipe")


def disconnected_headers() -> None:
    raise BrokenPipeError(32, "Broken pipe")


@pytest.mark.parametrize(
    ("method_name", "args", "disconnect_at"),
    [
        ("_send", (200, {"status": "ok"}), "headers"),
        ("_send", (200, {"status": "ok"}), "body"),
        ("_send_svg", (200, "<svg/>"), "headers"),
        ("_send_svg", (200, "<svg/>"), "body"),
    ],
)
def test_response_write_does_not_escape_when_client_disconnects(
    method_name: str,
    args: tuple[object, ...],
    disconnect_at: str,
) -> None:
    handler = object.__new__(RailwayApiHandler)
    handler.security_monitor = None
    handler._security_retry_after = 0
    handler.send_response = lambda *_: None
    handler.send_header = lambda *_: None
    handler.end_headers = disconnected_headers if disconnect_at == "headers" else lambda: None
    handler.wfile = DisconnectedWriter() if disconnect_at == "body" else BytesIO()

    getattr(handler, method_name)(*args)
