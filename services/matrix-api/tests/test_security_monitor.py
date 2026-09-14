import json
import logging
import threading
import httpx
from app.security_monitor import EndpointRateLimiter, SecurityMonitor, request_category, source_identity
from test_api_server_http import running_server, request, HttpOperationalRepository
import app.api_server as api_server

def test_source_requires_explicit_direct_trust():
    value, trusted = source_identity('127.0.0.1', 'secret', False)
    assert not trusted and len(value) == 64 and '127.0.0.1' not in value
    assert source_identity('invalid', 'secret', True)[1] is False
    assert source_identity('203.0.113.4', 'secret', True)[1] is True


def test_request_categories_separate_public_costs_and_exempt_protected_services():
    assert request_category('/api/matrix/latest/%E4%BB%8A%E5%BD%A9539', 'GET') == 'public_read'
    assert request_category('/api/matrix/cards/%E4%BB%8A%E5%BD%A9539', 'GET') == 'public_read'
    assert request_category('/api/matrix/history/%E4%BB%8A%E5%BD%A9539', 'GET') == 'public_compute'
    assert request_category('/api/matrix/tongxing', 'POST') == 'public_compute'
    assert request_category('/jobs/result-ready', 'POST') is None
    assert request_category('/jobs/status', 'GET') is None
    assert request_category('/not-an-api', 'GET') == 'unauthorized'


def test_endpoint_rate_limiter_refills_without_using_proxy_identity():
    now = [100.0]
    limiter = EndpointRateLimiter({'public_compute': (2, 1.0)}, clock=lambda: now[0])
    assert limiter.check('public_compute')['allowed']
    assert limiter.check('public_compute')['allowed']
    denied = limiter.check('public_compute')
    assert denied == {'allowed': False, 'retryAfter': 1, 'mode': 'local'}
    now[0] += 1.0
    assert limiter.check('public_compute')['allowed']


def test_untrusted_public_traffic_is_guarded_by_endpoint_class_not_forwarded_ip(monkeypatch):
    limiter = EndpointRateLimiter({'public_read': (1, 0.01)})
    monitor = SecurityMonitor(
        'https://example.test',
        'secret',
        enforce=True,
        endpoint_limiter=limiter,
        client=httpx.Client(transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={'allowed': True, 'mode': 'observe'})
        )),
    )
    monkeypatch.setattr(api_server.RailwayApiHandler, 'security_monitor', monitor)
    try:
        with running_server(HttpOperationalRepository()) as address:
            first, _ = request(address, 'GET', '/api/matrix/latest/%E4%BB%8A%E5%BD%A9539', {
                'X-Forwarded-For': '198.51.100.7',
            })
            second, _ = request(address, 'GET', '/api/matrix/latest/%E4%BB%8A%E5%BD%A9539', {
                'X-Forwarded-For': '203.0.113.99',
            })
        assert first.status == 200
        assert second.status == 429
        assert second.getheader('Retry-After') == '100'
    finally:
        monitor.close()

def test_queue_is_bounded_and_failure_does_not_escape(caplog):
    entered = threading.Event(); release = threading.Event()
    def transport(request):
        entered.set(); release.wait(1); raise RuntimeError('secret-token')
    monitor=SecurityMonitor('https://example.test','secret',client=httpx.Client(transport=httpx.MockTransport(transport)),queue_size=2)
    try:
        monitor.observe('public_query','a'*64,False,'attempt'); assert entered.wait(1)
        for _ in range(20): monitor.observe('public_query','a'*64,False,'attempt')
        assert monitor.pending <= 2
        release.set()
    finally: monitor.close()
    assert 'secret-token' not in caplog.text
    records = [record for record in caplog.records if record.message.startswith('security-observation-')]
    assert records
    details = json.loads(records[-1].message.split(' ', 1)[1])
    assert set(details) >= {'reason', 'stage', 'elapsedMs', 'failures', 'retries', 'dropped', 'pending'}

def test_enforced_http_429_does_not_execute_business(monkeypatch):
    captured=[]
    def transport(request):
        captured.append(request)
        return httpx.Response(200,json={'allowed':False,'retryAfter':17,'mode':'enforce'})
    monitor=SecurityMonitor('https://example.test','secret',enforce=True,trust_direct_peer=True,client=httpx.Client(transport=httpx.MockTransport(transport)))
    monkeypatch.setattr(api_server.RailwayApiHandler,'security_monitor',monitor)
    monkeypatch.setattr(api_server,'handle_api_request',lambda *a,**kw: (_ for _ in ()).throw(AssertionError('business executed')))
    try:
        with running_server(HttpOperationalRepository()) as address:
            response,body=request(address,'GET','/api/matrix/history/secret?token=secret',{'X-Forwarded-For':'attacker','Authorization':'secret'})
            assert response.status == 429 and response.getheader('Retry-After') == '17'
        assert b'attacker' not in captured[0].content and b'Authorization' not in captured[0].content
    finally: monitor.close()

def test_observe_never_blocks_and_transport_timeout_is_short():
    def transport(request):
        assert max(request.extensions['timeout'].values()) <= 0.75
        return httpx.Response(200,json={'allowed':False,'retryAfter':10,'mode':'observe'})
    monitor=SecurityMonitor('https://example.test','secret',enforce=True,client=httpx.Client(transport=httpx.MockTransport(transport)))
    try: assert monitor.check('public_query','a'*64,True)['allowed'] is True
    finally: monitor.close()

def test_deadline_bounds_a_hung_dependency_and_limits_do_not_trust_proxy(monkeypatch):
    import time
    release=threading.Event()
    def transport(request):
        release.wait(1)
        return httpx.Response(200,json={'allowed':False,'retryAfter':17,'mode':'enforce'})
    monitor=SecurityMonitor('https://example.test','secret',enforce=True,client=httpx.Client(transport=httpx.MockTransport(transport)))
    try:
        start=time.monotonic()
        assert monitor.check('public_query','a'*64,False)['allowed']
        assert time.monotonic()-start < 0.5
        release.set()
    finally: monitor.close()

def test_protected_success_is_not_counted_as_unauthorized(monkeypatch):
    class Monitor:
        def __init__(self): self.events=[]
        def identity(self,peer): return 'a'*64,False
        def observe(self,*args): self.events.append(args)
    monitor=Monitor()
    monkeypatch.setattr(api_server.RailwayApiHandler,'security_monitor',monitor)
    monkeypatch.setenv('MATRIX_ADMIN_STATUS_TOKEN','expected-token')
    with running_server(HttpOperationalRepository()) as address:
        response,_=request(address,'GET','/jobs/status',{'X-Matrix-Admin-Token':'expected-token'})
        assert response.status == 200 and monitor.events == []
        response,_=request(address,'GET','/jobs/status')
        assert response.status == 403
    assert [e[3] for e in monitor.events] == ['attempt','denied']


def test_valid_result_ready_is_not_preclassified_as_unauthorized(monkeypatch):
    class Monitor:
        def __init__(self): self.events=[]
        def identity(self,peer): return 'a'*64,False
        def observe(self,*args): self.events.append(args)
    monitor=Monitor()
    monkeypatch.setattr(api_server.RailwayApiHandler,'security_monitor',monitor)
    monkeypatch.setenv('MATRIX_NOTIFICATION_INGEST_TOKEN','expected-token')
    repository = HttpOperationalRepository()
    repository.upsert_draw({'lottery':'今彩539','period':'115000215','drawDate':'2026-09-05','numbers':['01','02','03','04','05'],'sortedNumbers':['01','02','03','04','05']})
    with running_server(repository) as address:
        response,_=request(address,'POST','/jobs/result-ready',{
            'Content-Type':'application/json',
            'X-Matrix-Notification-Token':'expected-token',
        }, json.dumps({'lottery':'今彩539','drawDate':'2026-09-05'}).encode())
        assert response.status == 202
    assert monitor.events == []
