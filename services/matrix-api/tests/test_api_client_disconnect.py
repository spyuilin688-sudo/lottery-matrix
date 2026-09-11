import pytest

from app.api_server import RailwayApiHandler


class DisconnectedWriter:
    def write(self, _: bytes) -> None:
        raise BrokenPipeError(32, "Broken pipe")


@pytest.mark.parametrize(
    ("method_name", "args"),
    [
        ("_send", (200, {"status": "ok"})),
        ("_send_svg", (200, "<svg/>")),
    ],
)
def test_response_write_does_not_escape_when_client_disconnects(
    method_name: str,
    args: tuple[object, ...],
) -> None:
    handler = object.__new__(RailwayApiHandler)
    handler.security_monitor = None
    handler._security_retry_after = 0
    handler.send_response = lambda *_: None
    handler.send_header = lambda *_: None
    handler.end_headers = lambda: None
    handler.wfile = DisconnectedWriter()

    getattr(handler, method_name)(*args)
