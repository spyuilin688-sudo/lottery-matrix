from types import SimpleNamespace
from app import worker


def test_complete_result_publishes_certificate_before_return(monkeypatch):
    calls = []
    snapshot = {'identity': 'v', 'generation': 4, 'ready': False,
                'draw': {'period': '42', 'resultStatus': 'confirmed'}}
    monkeypatch.setattr(worker, '_read_worker_completion', lambda *a, **k: snapshot)
    monkeypatch.setattr(worker, '_completed_period_idle_ready', lambda *a: True)
    repo = SimpleNamespace(certify_worker_completion=lambda *args: calls.append(args))
    result = {'status': 'complete', 'drawPeriod': '42'}
    worker.certify_completed_result('今彩539', result, repo, None)
    assert calls == [('今彩539', '42', 'v', False, 4)]


def test_running_or_preliminary_cannot_publish_completion(monkeypatch):
    calls = []
    monkeypatch.setattr(worker, '_read_worker_completion', lambda *a, **k: calls.append('read'))
    worker.certify_completed_result('今彩539', {'status': 'running'}, SimpleNamespace(), None)
    assert calls == []
    monkeypatch.setattr(worker, '_read_worker_completion', lambda *a, **k: {
        'identity':'v','generation':1,'ready':False,'draw':{'period':'42','resultStatus':'preliminary'}})
    monkeypatch.setattr(worker, '_completed_period_idle_ready', lambda *a: False)
    repo = SimpleNamespace(certify_worker_completion=lambda *args: calls.append(args))
    worker.certify_completed_result('今彩539', {'status':'complete','drawPeriod':'42'}, repo, None)
    assert calls == []


def test_cannot_certify_superseded_period(monkeypatch):
    monkeypatch.setattr(worker, '_read_worker_completion', lambda *a, **k: {'draw':{'period':'43'},'ready':False})
    monkeypatch.setattr(worker, '_completed_period_idle_ready', lambda *a: (_ for _ in ()).throw(AssertionError('wrong period')))
    worker.certify_completed_result('今彩539', {'status':'complete','drawPeriod':'42'}, SimpleNamespace(), None)
