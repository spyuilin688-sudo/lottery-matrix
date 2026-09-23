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


def test_confirmed_analysis_repairs_card_after_pointer_restore(monkeypatch):
    from types import SimpleNamespace

    actions = []

    class RecoveryRepo:
        def __init__(self):
            self.client = self

        def list_draws(self, lottery, limit):
            return [{'period': '12004', 'drawDate': '2026-09-19',
                     'resultStatus': 'confirmed'}]

        def rpc(self, name, params):
            actions.append('restore')
            assert name == 'matrix_restore_analysis_pointers'
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=True))

    monkeypatch.setattr('app.targeted_recovery.make_repository', RecoveryRepo)
    monkeypatch.setattr('app.targeted_recovery._draw_from_history',
                        lambda *args: {'resultStatus': 'confirmed'})
    monkeypatch.setattr('app.targeted_recovery._run_analysis',
                        lambda *args, **kwargs: {'status': 'complete'})
    monkeypatch.setattr('app.targeted_recovery.repair_current_card_if_needed',
                        lambda *args: actions.append('repair') or True)
    monkeypatch.setattr('app.targeted_recovery._notify_card_repair',
                        lambda *args: actions.append('notify'))
    assert run_targeted_recovery('天天樂', '12004', 'analysis', None,
                                 lease_owner='owner', runner_id='runner') == '12004'
    assert actions == ['restore', 'repair', 'notify']


def test_recovery_verifies_standard_chain_without_custom_results(monkeypatch):
    from types import SimpleNamespace
    from app.targeted_recovery import verify_recovery
    class Client:
        def rpc(self, name, params):
            assert name == 'matrix_watchdog_chain_state'
            assert params == {'p_lottery': '天天樂', 'p_draw_period': '12004'}
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={
                'latestPeriod':'12004', 'analysisComplete':True, 'matrixStatusComplete':True,
                'cardComplete': True,
            }))
    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: SimpleNamespace(client=Client()))
    assert verify_recovery('天天樂', '12004') is True


def test_recovery_refuses_complete_analysis_with_unpublished_card(monkeypatch):
    from types import SimpleNamespace
    from app.targeted_recovery import verify_recovery

    class Client:
        def rpc(self, name, params):
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={
                'latestPeriod': '12004', 'analysisComplete': True,
                'matrixStatusComplete': True, 'cardComplete': False,
            }))

    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: SimpleNamespace(client=Client()))
    assert verify_recovery('天天樂', '12004') is False


def test_recovery_keeps_existing_verification_before_card_gate_rollout(monkeypatch):
    from types import SimpleNamespace
    from app.targeted_recovery import verify_recovery

    class Client:
        def rpc(self, name, params):
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={
                'latestPeriod': '12004', 'analysisComplete': True,
                'matrixStatusComplete': True,
            }))

    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: SimpleNamespace(client=Client()))
    assert verify_recovery('天天樂', '12004') is True


def test_card_recovery_restores_missing_draw_card_without_crawl_or_analysis(monkeypatch):
    from copy import deepcopy
    from types import SimpleNamespace
    from app.repositories.card_repository import validate_published_manifest
    from app.services.card_publication import CardPublicationService
    from tests.test_card_publication import fixture, png_stub, NOW

    repository, cards = fixture('今彩539')
    initial = CardPublicationService(repository, cards, renderer=png_stub).ensure_current('今彩539', NOW)
    original_sorted = deepcopy(initial['cards']['sorted'])
    del cards.row['manifest']['cards']['draw']
    assert validate_published_manifest('今彩539', repository, cards.row['manifest'], require_all_orders=True) is None

    class ChainClient:
        def rpc(self, name, params):
            assert name == 'matrix_watchdog_chain_state'
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={
                'latestPeriod': '10000', 'analysisComplete': True,
                'matrixStatusComplete': True,
                'cardComplete': 'draw' in cards.row['manifest']['cards'],
            }))

    repository.client = ChainClient()
    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: repository)
    delivered = []
    monkeypatch.setattr('app.targeted_recovery._notify_card_repair',
                        lambda lottery, period, repo: delivered.append((lottery, period)))
    monkeypatch.setattr('app.targeted_recovery.publish_current_card',
                        lambda lottery, repo: CardPublicationService(repo, cards, renderer=png_stub).ensure_current(lottery, NOW))
    monkeypatch.setattr('app.targeted_recovery._run_analysis',
                        lambda *args, **kwargs: pytest.fail('card repair must not rerun analysis'))
    assert run_targeted_recovery('今彩539', '10000', 'card', None,
                                 lease_owner='owner', runner_id='runner') == '10000'
    assert cards.row['manifest']['cards']['sorted'] == original_sorted
    assert validate_published_manifest('今彩539', repository, cards.row['manifest'], require_all_orders=True)
    assert len(cards.objects) == 2
    assert delivered == [('今彩539', '10000')]


def test_card_recovery_does_not_republish_complete_manifest_despite_cleanup_error(monkeypatch):
    from types import SimpleNamespace
    from app.services.card_publication import CardPublicationService
    from tests.test_card_publication import fixture, png_stub, NOW

    repository, cards = fixture('今彩539')
    CardPublicationService(repository, cards, renderer=png_stub).ensure_current('今彩539', NOW)
    cards.row['last_error'] = 'CLEANUP_FAILED'
    repository.client = SimpleNamespace(rpc=lambda name, params: SimpleNamespace(
        execute=lambda: SimpleNamespace(data={
            'latestPeriod': '10000', 'analysisComplete': True,
            'matrixStatusComplete': True, 'cardComplete': True,
        })))
    monkeypatch.setattr('app.targeted_recovery.make_repository', lambda: repository)
    monkeypatch.setattr('app.targeted_recovery._notify_card_repair', lambda *args: None)
    monkeypatch.setattr('app.targeted_recovery.publish_current_card',
                        lambda *args: pytest.fail('complete card must not republish'))
    assert run_targeted_recovery('今彩539', '10000', 'card', None,
                                 lease_owner='owner', runner_id='runner') == '10000'


def test_card_recovery_waits_for_confirmed_draw_and_completed_analysis(monkeypatch):
    from types import SimpleNamespace

    class PendingRepo:
        def __init__(self, status, ready):
            self.status = status
            self.ready = ready
            self.client = self

        def list_draws(self, lottery, limit):
            return [{'period': '12004', 'resultStatus': self.status}]

        def rpc(self, name, params):
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={
                'latestPeriod': '12004', 'analysisComplete': self.ready,
                'matrixStatusComplete': self.ready, 'cardComplete': False,
            }))

    monkeypatch.setattr('app.targeted_recovery.publish_current_card',
                        lambda *args: pytest.fail('pending card must not publish'))
    monkeypatch.setattr('app.targeted_recovery._notify_card_repair',
                        lambda *args: pytest.fail('pending card must not notify'))
    for status, ready in [('preliminary', True), ('confirmed', False)]:
        monkeypatch.setattr('app.targeted_recovery.make_repository',
                            lambda status=status, ready=ready: PendingRepo(status, ready))
        with pytest.raises(RuntimeError, match='RECOVERY_CARD_PENDING'):
            run_targeted_recovery('天天樂', '12004', 'card', None,
                                  lease_owner='owner', runner_id='runner')


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


def test_confirmed_latest_without_actual_order_fetches_formal_result_before_worker(monkeypatch):
    from app import api_server, recovery_server

    events = []

    class MissingActualRepo:
        def list_draws(self, lottery, limit):
            return [{'period': '115000231', 'drawDate': '2026-09-23',
                     'resultStatus': 'confirmed', 'numbers': ['01', '02', '03', '04', '05'],
                     'drawOrderNumbers': None}]

    monkeypatch.setattr('app.targeted_recovery.make_repository', MissingActualRepo)
    monkeypatch.setattr(api_server, 'refresh_latest_draw',
                        lambda lottery, repository: events.append('refresh') or {'period': '115000231'})
    monkeypatch.setattr(recovery_server, 'run_full_lottery_recovery',
                        lambda lottery: events.append('run'))
    assert run_targeted_recovery('今彩539', None, 'crawler', '2026-09-23') == '115000231'
    assert events == ['refresh', 'run']
