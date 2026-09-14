from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler
from threading import Event, Thread

from app.api_server import BoundedApiServer


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
