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


@pytest.mark.parametrize('published', [True, False])
def test_analysis_restores_current_worker_pointers_before_custom_status(monkeypatch, published):
    from types import SimpleNamespace
    from app.worker import analysis_version_for_order
    from app.domain.explore_state import SORTED_ORDER
    events = []
    class RecoveryRepo:
        def list_draws(self, lottery, limit):
            return [{'period': '12004', 'drawDate': '2026-09-19'}]
        def rpc(self, name, params):
            events.append((name, params))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=published))
    repo = RecoveryRepo()
    repo.client = repo
    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: repo)
    monkeypatch.setattr('app.targeted_recovery._draw_from_history', lambda *_: {})
    monkeypatch.setattr('app.targeted_recovery._run_analysis', lambda *_, **__: {'status':'complete'})
    monkeypatch.setattr('app.targeted_recovery.load_settings', lambda: SimpleNamespace(supabase_url='url',supabase_secret_key='key'))
    monkeypatch.setattr('app.targeted_recovery.recompute_custom_matrix_status_once', lambda *_: events.append('custom'))
    def run():
        return run_targeted_recovery('天天樂','12004','analysis',None,lease_owner='owner',runner_id='runner')
    if published:
        assert run() == '12004'
        assert events[-1] == 'custom'
    else:
        with pytest.raises(RuntimeError, match='RECOVERY_POINTERS_NOT_VERIFIED'):
            run()
        assert 'custom' not in events
    assert events[0] == ('matrix_restore_analysis_pointers', {
        'p_lottery':'天天樂','p_draw_period':'12004',
        'p_versions':{'sorted':analysis_version_for_order('12004',SORTED_ORDER)},
        'p_owner_id':'owner','p_runner_id':'runner',
    })
