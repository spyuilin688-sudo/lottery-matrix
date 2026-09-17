from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler
from inspect import getsource, signature
from threading import Event, Thread

from app.api_server import (
    BoundedApiServer,
    PUBLIC_API_MAX_CONCURRENCY,
    create_repository,
)


def test_public_api_default_concurrency_budget_is_32_and_shared_with_pool():
    assert PUBLIC_API_MAX_CONCURRENCY == 32
    assert (
        signature(BoundedApiServer.__init__).parameters["max_requests"].default
        == PUBLIC_API_MAX_CONCURRENCY
    )
    source = getsource(create_repository)
    assert "max_connections=PUBLIC_API_MAX_CONCURRENCY" in source
    assert "max_keepalive_connections=PUBLIC_API_MAX_CONCURRENCY" in source


def test_saturated_server_rejects_extra_connection_and_recovers():
    entered = Event()
    release = Event()
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            entered.set()
            release.wait(2)
            self.send_response(200)
            self.end_headers()
        def log_message(self, *_):
            pass
    server = BoundedApiServer(('127.0.0.1', 0), Handler, max_requests=1)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    first = HTTPConnection(*server.server_address, timeout=2)
    try:
        first.request('GET','/health')
        assert entered.wait(1)
        second = HTTPConnection(*server.server_address, timeout=2)
        second.request('GET','/health')
        response = second.getresponse()
        assert response.status == 503
        assert response.getheader('Retry-After') == '1'
        assert response.read() == b''
        second.close()
        release.set()
        assert first.getresponse().status == 200
    finally:
        release.set()
        first.close()
        server.shutdown()
        server.server_close()
        thread.join(2)
