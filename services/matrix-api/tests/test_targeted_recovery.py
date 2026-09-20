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
def test_analysis_restores_current_worker_pointers(monkeypatch, published):
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
    def run():
        return run_targeted_recovery('天天樂','12004','analysis',None,lease_owner='owner',runner_id='runner')
    if published:
        assert run() == '12004'
    else:
        with pytest.raises(RuntimeError, match='RECOVERY_POINTERS_NOT_VERIFIED'):
            run()
    assert len(events) == 1
    assert events[0] == ('matrix_restore_analysis_pointers', {
        'p_lottery':'天天樂','p_draw_period':'12004',
        'p_versions':{'sorted':analysis_version_for_order('12004',SORTED_ORDER)},
        'p_owner_id':'owner','p_runner_id':'runner',
    })


def test_recovery_verifies_standard_chain_without_custom_results(monkeypatch):
    from types import SimpleNamespace
    from app.targeted_recovery import verify_recovery
    class Client:
        def rpc(self, name, params):
            assert name == 'matrix_watchdog_chain_state'
            assert params == {'p_lottery': '天天樂', 'p_draw_period': '12004'}
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={
                'latestPeriod':'12004', 'analysisComplete':True, 'matrixStatusComplete':True,
            }))
    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: SimpleNamespace(client=Client()))
    assert verify_recovery('天天樂', '12004') is True


def test_retired_custom_recovery_is_rejected_before_any_database_access(monkeypatch):
    def unavailable():
        pytest.fail('Retired stage must not access the database')
    monkeypatch.setattr('app.targeted_recovery.make_repository', unavailable)
    with pytest.raises(ValueError, match='RECOVERY_STAGE_INVALID'):
        run_targeted_recovery('天天樂','12004','custom-status',None)


def test_recovery_http_rejects_retired_stage_without_enqueuing(monkeypatch):
    import json
    from app.recovery_server import handle_recovery_request
    from app.repositories.analysis_repository import InMemoryAnalysisRepository
    monkeypatch.setenv('MATRIX_ADMIN_STATUS_TOKEN', 'expected-token')
    def forbidden(*args, **kwargs):
        pytest.fail('Retired recovery must never be enqueued')
    status, payload = handle_recovery_request(
        'POST', '/jobs/recover',
        json.dumps({'lottery':'天天樂','leaseOwner':'owner','stage':'custom-status','drawPeriod':'12004'}).encode(),
        InMemoryAnalysisRepository(), request_monitor_token='expected-token', recover_lottery=forbidden,
    )
    assert status == 400
    assert payload == {'error': 'RECOVERY_STAGE_INVALID'}


def test_fantasy5_extra_check_carries_previous_cycle_to_crawler(monkeypatch):
    from app import recovery_server, fantasy5_crawler
    calls = []
    monkeypatch.setattr(fantasy5_crawler, 'run_fantasy5_crawler_once', lambda **kwargs: calls.append(kwargs) or {'status':'acquired'})
    monkeypatch.setattr(recovery_server, 'run_full_lottery_recovery', lambda lottery, **kwargs: kwargs['fantasy5_crawler']())
    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: Repo())
    assert run_targeted_recovery('天天樂', None, 'crawler', '2026-09-20') == '12005'
    assert calls == [{'expected_draw_date':'2026-09-20'}]
