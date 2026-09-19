import pytest
from app.targeted_recovery import run_targeted_recovery

class Repo:
    def list_draws(self, lottery, limit):
        return [{'period':'12005','drawDate':'2026-09-20'}]

def test_old_period_never_runs_latest_analysis(monkeypatch):
    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: Repo())
    with pytest.raises(RuntimeError, match='RECOVERY_SUPERSEDED'):
        run_targeted_recovery('天天樂','12004','analysis',None)

def test_crawler_requires_expected_draw_date():
    with pytest.raises(ValueError, match='RECOVERY_DRAW_DATE_REQUIRED'):
        run_targeted_recovery('天天樂',None,'crawler',None)


def test_api_carries_period_and_stage_under_existing_admin_guard(monkeypatch):
    import json
    from app.recovery_server import handle_recovery_request
    from app.repositories.analysis_repository import InMemoryAnalysisRepository
    monkeypatch.setenv('MATRIX_ADMIN_STATUS_TOKEN', 'expected-token')
    calls = []
    body = json.dumps({'lottery':'天天樂','leaseOwner':'owner','stage':'analysis','drawPeriod':'12004'}).encode()
    callback = lambda *args, **kwargs: calls.append((args, kwargs)) or 'accepted'
    status, _ = handle_recovery_request('POST','/jobs/recover',body,InMemoryAnalysisRepository(),request_monitor_token='expected-token',recover_lottery=callback)
    assert status == 202
    assert calls == [(('天天樂','owner'),{'stage':'analysis','draw_period':'12004','minimum_draw_date':None})]
    status, _ = handle_recovery_request('POST','/jobs/recover',body,InMemoryAnalysisRepository(),request_monitor_token='wrong',recover_lottery=callback)
    assert status == 403
    assert len(calls) == 1
