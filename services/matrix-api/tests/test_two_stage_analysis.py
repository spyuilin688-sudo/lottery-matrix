from copy import deepcopy
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app import worker
from app.domain.explore_engine import ExploreEngineSession, run_explore_batch
from app.domain.explore_state import DRAW_ORDER, SORTED_ORDER
from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.analysis_pipeline import AnalysisPipeline
from app.services.artifact_builders import create_artifact_builders
from app.services.explore_batches import work_units


PRELIMINARY = {
    'lottery': '今彩539', 'period': '115000220', 'drawDate': '2026-08-28',
    'numbers': ['01', '02', '03', '04', '05'],
    'sortedNumbers': ['01', '02', '03', '04', '05'],
    'resultStatus': 'preliminary',
}
CONFIRMED = {**PRELIMINARY, 'resultStatus': 'confirmed', 'drawOrderNumbers': ['05', '03', '01', '04', '02']}


def history(draw):
    return [deepcopy(draw)] + [{**CONFIRMED, 'period': str(115000220 - offset), 'drawDate': '2026-08-27'} for offset in range(1, 13)]


def stage_builders(events):
    def build(kind):
        def run(context):
            events.append((kind, tuple(context['numberOrders'])))
            return {'items': [], 'validationById': {}}
        return run
    return {kind: build(kind) for kind in ('explore', 'tianheng', 'tianyan', 'tiangong', 'status')}


def test_sorted_session_never_requires_preliminary_actual_history():
    session = ExploreEngineSession.build('今彩539', history(PRELIMINARY), number_orders=(SORTED_ORDER,))
    result = run_explore_batch('今彩539', history(PRELIMINARY), 0, 100, session=session)
    assert [context.number_order for context in session.contexts] == [SORTED_ORDER]
    assert result['complete'] is True
    assert result['total'] == 65


def test_draw_session_contains_only_actual_units():
    session = ExploreEngineSession.build('今彩539', history(CONFIRMED), number_orders=(DRAW_ORDER,))
    assert [context.number_order for context in session.contexts] == [DRAW_ORDER]
    assert len(session.indexed_units) == 65


def test_explicit_work_units_do_not_schedule_unavailable_orders():
    assert {unit['numberOrder'] for unit in work_units('今彩539', 13, 5, number_orders=(SORTED_ORDER,))} == {SORTED_ORDER}
    with pytest.raises(ValueError):
        work_units('天天樂', 13, 5, number_orders=(DRAW_ORDER,))


def test_sorted_builders_complete_all_algorithms_without_actual_order():
    context = {'draw': PRELIMINARY, 'history': history(PRELIMINARY), 'numberOrders': (SORTED_ORDER,), 'artifacts': {}, 'exploreBatch': {'start': 0, 'limit': 10}, 'tianhengBatch': {'start': 0, 'limit': 100}}
    builders = create_artifact_builders()
    for kind in ('explore', 'tianheng', 'tianyan', 'tiangong', 'status'):
        built = builders[kind](context)
        context['artifacts'][kind] = built.get('artifact', built)
    assert context['artifacts']['tiangong']['numberOrder'] == SORTED_ORDER
    assert context['artifacts']['status']['drawPeriod'] == PRELIMINARY['period']


def test_pipeline_stops_correction_before_publishing_or_overwriting_draw():
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(PRELIMINARY)
    events = []
    builders = stage_builders(events)
    corrected = {**CONFIRMED, 'numbers': ['01', '02', '03', '04', '06'], 'sortedNumbers': ['01', '02', '03', '04', '06'], 'drawOrderNumbers': ['06', '03', '01', '04', '02']}
    def correcting_builder(context):
        repository.upsert_draw(corrected)
        return {'items': [], 'validationById': {}}
    builders['explore'] = correcting_builder
    pipeline = AnalysisPipeline(repository, builders, '115000220:matrix-python-v14-sorted', number_orders=(SORTED_ORDER,))
    with pytest.raises(RuntimeError, match='ANALYSIS_(DRAW_CHANGED|RUN_LEASE_LOST)'):
        pipeline.run(deepcopy(PRELIMINARY), [deepcopy(PRELIMINARY)])
    assert repository.list_draws('今彩539', 1)[0]['numbers'][-1] == '06'
    assert repository.read_completed_artifact('今彩539', '115000220', 'explore') is None


def test_pipeline_sorted_confirmation_does_not_restart_unchanged_work():
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(PRELIMINARY)
    events = []
    builders = stage_builders(events)
    original = builders['explore']
    def confirming_builder(context):
        repository.upsert_draw(CONFIRMED)
        return original(context)
    builders['explore'] = confirming_builder
    pipeline = AnalysisPipeline(repository, builders, '115000220:matrix-python-v14-sorted', number_orders=(SORTED_ORDER,))
    assert pipeline.run(deepcopy(PRELIMINARY), [deepcopy(PRELIMINARY)])['status'] == 'complete'
    assert repository.list_draws('今彩539', 1)[0]['resultStatus'] == 'confirmed'
    assert len(events) == 5


class Source:
    def __init__(self, draw=CONFIRMED):
        self.draw = draw
        self.calls = []

    def fetch(self, lottery):
        self.calls.append('latest')
        return deepcopy(self.draw)

    def fetch_history(self, lottery, limit):
        self.calls.append('history')
        raise AssertionError('Existing preliminary history must not trigger archive backfill')


def test_preliminary_outside_formal_window_runs_sorted_from_stored_history(monkeypatch):
    repository = InMemoryAnalysisRepository()
    repository.upsert_draws(history(PRELIMINARY))
    source = Source()
    events = []
    monkeypatch.setattr(worker, 'publish_current_card', lambda *args: events.append(('png', (SORTED_ORDER,))))
    result = worker.run_scheduled_worker('今彩539', datetime(2026, 8, 28, 20, 25, tzinfo=ZoneInfo('Asia/Taipei')), repository, source, stage_builders(events))
    assert result['analysisVersion'] == '115000220:matrix-python-v14-sorted'
    assert events[0][0] == 'png'
    assert {orders for kind, orders in events if kind != 'png'} == {(SORTED_ORDER,)}
    assert source.calls == []


def test_preliminary_date_does_not_skip_due_formal_fetch_and_sorted_is_not_recomputed(monkeypatch):
    repository = InMemoryAnalysisRepository()
    repository.upsert_draws(history(PRELIMINARY))
    source = Source()
    events = []
    monkeypatch.setattr(worker, 'publish_current_card', lambda *args: events.append(('png', ())))
    builders = stage_builders(events)
    worker.run_scheduled_worker('今彩539', datetime(2026, 8, 28, 20, 25, tzinfo=ZoneInfo('Asia/Taipei')), repository, source, builders)
    events.clear()
    result = worker.run_scheduled_worker('今彩539', datetime(2026, 8, 28, 20, 33, tzinfo=ZoneInfo('Asia/Taipei')), repository, source, builders)
    assert source.calls == ['latest']
    assert result['analysisVersion'] == '115000220:matrix-python-v14-draw'
    assert {orders for kind, orders in events if kind != 'png'} == {(DRAW_ORDER,)}
    assert events[0][0] == 'png'


def test_formal_first_runs_sorted_then_actual_under_separate_versions(monkeypatch):
    repository = InMemoryAnalysisRepository()
    repository.upsert_draws(history(CONFIRMED))
    events = []
    monkeypatch.setattr(worker, 'publish_current_card', lambda *args: events.append(('png', ())))
    result = worker.run_scheduled_worker('今彩539', datetime(2026, 8, 28, 20, 25, tzinfo=ZoneInfo('Asia/Taipei')), repository, Source(), stage_builders(events))
    assert result['analysisVersion'] == '115000220:matrix-python-v14-draw'
    assert events[0][0] == 'png'
    assert [orders for kind, orders in events if kind == 'explore'] == [(SORTED_ORDER,), (DRAW_ORDER,)]
    for suffix in ('sorted', 'draw'):
        assert repository.get_progress('今彩539', '115000220', f'115000220:matrix-python-v14-{suffix}')['status'] == 'complete'


def test_actual_png_notification_does_not_wait_for_algorithm_progress(monkeypatch):
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(CONFIRMED)
    class Emitter:
        enabled = True
        def __init__(self):
            self.events = []
        def emit(self, event):
            self.events.append(event['eventKey'])
    emitter = Emitter()
    monkeypatch.setattr(worker, '_card_ready', lambda *args: True)
    worker.emit_ready_notifications('今彩539', '115000220', repository, emitter, set())
    assert any('matrix_card' in key for key in emitter.events)


def test_draw_engine_rejects_preliminary_even_if_stale_actual_field_is_present():
    with pytest.raises(ValueError, match='DRAW_ORDER_HISTORY_INCOMPLETE'):
        ExploreEngineSession.build('今彩539', history({**CONFIRMED, 'resultStatus': 'preliminary'}), number_orders=(DRAW_ORDER,))


def test_formal_actual_stage_runs_while_another_owner_holds_sorted_lease(monkeypatch):
    from datetime import UTC
    repository = InMemoryAnalysisRepository()
    repository.upsert_draws(history(CONFIRMED))
    repository.begin_run('今彩539', '115000220', '115000220:matrix-python-v14-sorted', datetime.now(UTC).isoformat(), owner_id='other-worker')
    events = []
    monkeypatch.setattr(worker, 'publish_current_card', lambda *args: None)
    worker.run_scheduled_worker('今彩539', datetime(2026, 8, 28, 20, 25, tzinfo=ZoneInfo('Asia/Taipei')), repository, Source(), stage_builders(events))
    assert {orders for kind, orders in events} == {(DRAW_ORDER,)}
    assert repository.get_progress('今彩539', '115000220', '115000220:matrix-python-v14-draw')['status'] == 'complete'
    assert repository.get_progress('今彩539', '115000220', '115000220:matrix-python-v14-sorted')['leaseOwner'] == 'other-worker'


def test_corrected_formal_period_cannot_be_recreated_by_stale_sorted_pipeline():
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(PRELIMINARY)
    repository.upsert_draw({**CONFIRMED, 'period': '115000221'})
    with pytest.raises(RuntimeError, match='ANALYSIS_DRAW_CHANGED'):
        AnalysisPipeline(repository, stage_builders([]), '115000220:matrix-python-v14-sorted', number_orders=(SORTED_ORDER,)).run(PRELIMINARY, history(PRELIMINARY))
    assert repository.get_draw('今彩539', '115000220') is None
    assert repository.get_progress('今彩539', '115000220', '115000220:matrix-python-v14-sorted') is None


def test_preliminary_sorted_analysis_survives_failed_due_formal_fetch(monkeypatch):
    import httpx
    repository = InMemoryAnalysisRepository()
    repository.upsert_draws(history(PRELIMINARY))
    class FailingSource(Source):
        def fetch(self, lottery):
            self.calls.append('latest')
            raise httpx.ConnectError('official source unavailable')
    events = []
    source = FailingSource()
    monkeypatch.setattr(worker, 'publish_current_card', lambda *args: None)
    with pytest.raises(httpx.ConnectError, match='official source unavailable'):
        worker.run_scheduled_worker('今彩539', datetime(2026, 8, 28, 20, 33, tzinfo=ZoneInfo('Asia/Taipei')), repository, source, stage_builders(events))
    assert source.calls == ['latest']
    progress = repository.get_progress('今彩539', '115000220', '115000220:matrix-python-v14-sorted')
    assert progress is not None and progress['status'] == 'complete'


def test_worker_marks_reconciled_snapshot_superseded_before_starting_stage():
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(PRELIMINARY)
    repository.upsert_draw({**CONFIRMED, 'period': '115000221'})
    result = worker._resume_stored_analysis('今彩539', repository, Source(), PRELIMINARY, stage_builders([]))
    assert result is not None and result['status'] == 'superseded'


@pytest.mark.parametrize('entrypoint', ['scheduled', 'analysis-only'])
def test_sorted_active_notification_survives_newer_dormant_actual_status(entrypoint):
    from app import analysis_worker
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw(CONFIRMED)
    for suffix, status, timestamp in [('sorted', 'ACTIVE', '2026-09-12T01:00:00+00:00'), ('draw', 'DORMANT', '2026-09-12T02:00:00+00:00')]:
        version = f'115000220:matrix-python-v14-{suffix}'
        repository.begin_run('今彩539', '115000220', version, timestamp)
        for kind in ('explore', 'tianheng', 'tianyan', 'tiangong', 'status'):
            repository.save_artifact('今彩539', '115000220', version, kind, {'items': [], 'summary': {'status': status}})
        repository.complete_run('今彩539', '115000220', version, timestamp)
    class Emitter:
        enabled = True
        def __init__(self):
            self.events = []
        def emit(self, event):
            self.events.append(event)
    emitter = Emitter()
    if entrypoint == 'scheduled':
        worker.emit_ready_notifications('今彩539', '115000220', repository, emitter, set())
    else:
        analysis_worker._emit_ready_notifications(CONFIRMED, [CONFIRMED], repository, emitter, set())
    assert any(event['eventType'] == 'matrix_status' for event in emitter.events)


@pytest.mark.parametrize('number_order', [SORTED_ORDER, DRAW_ORDER])
def test_pipeline_rejects_history_corrected_before_run_acquisition(number_order):
    repository = InMemoryAnalysisRepository()
    snapshot = history(CONFIRMED)
    repository.upsert_draws(snapshot)
    repository.upsert_draw({**snapshot[3], 'numbers': ['01', '02', '03', '04', '06'], 'sortedNumbers': ['01', '02', '03', '04', '06'], 'drawOrderNumbers': ['06', '03', '01', '04', '02']})
    events = []
    pipeline = AnalysisPipeline(repository, stage_builders(events), worker.analysis_version_for_order('115000220', number_order), number_orders=(number_order,))
    with pytest.raises(RuntimeError, match='ANALYSIS_DRAW_CHANGED'):
        pipeline.run(CONFIRMED, snapshot)
    assert events == []
    assert repository.read_completed_artifact('今彩539', '115000220', 'explore') is None


def test_pipeline_rejects_older_row_inserted_after_history_snapshot():
    repository = InMemoryAnalysisRepository()
    snapshot = history(CONFIRMED)
    repository.upsert_draws(snapshot)
    repository.upsert_draw({**CONFIRMED, 'period': '115000207', 'drawDate': '2026-08-14'})
    pipeline = AnalysisPipeline(repository, stage_builders([]), '115000220:matrix-python-v14-sorted', number_orders=(SORTED_ORDER,))
    with pytest.raises(RuntimeError, match='ANALYSIS_DRAW_CHANGED'):
        pipeline.run(CONFIRMED, snapshot)


def test_sorted_history_verification_ignores_actual_order_enrichment():
    repository = InMemoryAnalysisRepository()
    snapshot = history(CONFIRMED)
    repository.upsert_draws(snapshot)
    repository.upsert_draw({**snapshot[3], 'drawOrderNumbers': ['04', '03', '01', '05', '02']})
    pipeline = AnalysisPipeline(repository, stage_builders([]), '115000220:matrix-python-v14-sorted', number_orders=(SORTED_ORDER,))
    assert pipeline.run(CONFIRMED, snapshot)['status'] == 'complete'


def test_history_verification_is_cached_across_checkpoints():
    from tests.test_analysis_pipeline import checkpoint_builders
    class CountingRepository(InMemoryAnalysisRepository):
        def __init__(self):
            super().__init__()
            self.full_reads = 0
        def list_draws(self, lottery, limit=None):
            if limit is None:
                self.full_reads += 1
            return super().list_draws(lottery, limit)
    repository = CountingRepository()
    snapshot = history(CONFIRMED)
    repository.upsert_draws(snapshot)
    pipeline = AnalysisPipeline(repository, checkpoint_builders(2), '115000220:matrix-python-v14-sorted', explore_batch_size=1, number_orders=(SORTED_ORDER,))
    assert pipeline.run(CONFIRMED, snapshot)['status'] == 'running'
    assert pipeline.run(CONFIRMED, snapshot)['status'] == 'complete'
    assert repository.full_reads == 1


def test_history_is_reverified_after_invalidation_recreates_same_version():
    from tests.test_analysis_pipeline import checkpoint_builders
    repository = InMemoryAnalysisRepository()
    snapshot = history(CONFIRMED)
    repository.upsert_draws(snapshot)
    pipeline = AnalysisPipeline(repository, checkpoint_builders(2), '115000220:matrix-python-v14-sorted', explore_batch_size=1, number_orders=(SORTED_ORDER,))
    assert pipeline.run(CONFIRMED, snapshot)['status'] == 'running'
    repository.upsert_draw({**snapshot[3], 'numbers': ['01', '02', '03', '04', '06'], 'sortedNumbers': ['01', '02', '03', '04', '06'], 'drawOrderNumbers': ['06', '03', '01', '04', '02']})
    with pytest.raises(RuntimeError, match='ANALYSIS_DRAW_CHANGED'):
        pipeline.run(CONFIRMED, snapshot)
    assert repository.get_progress('今彩539', '115000220', '115000220:matrix-python-v14-sorted')['status'] == 'failed'


def test_history_verification_excludes_newer_draws_when_repairing_old_period():
    repository = InMemoryAnalysisRepository()
    snapshot = history(CONFIRMED)
    repository.upsert_draws(snapshot)
    repository.upsert_draw({**CONFIRMED, 'period': '115000221', 'drawDate': '2026-08-29'})
    pipeline = AnalysisPipeline(repository, stage_builders([]), '115000220:matrix-python-v14-sorted', number_orders=(SORTED_ORDER,))
    assert pipeline.run(CONFIRMED, snapshot)['status'] == 'complete'


@pytest.mark.parametrize('actual_history_incomplete', [False, True])
def test_actual_history_backfill_rebuilds_invalidated_sorted_stage(monkeypatch, actual_history_incomplete):
    repository = InMemoryAnalysisRepository()
    repository.upsert_draws(history(CONFIRMED))
    events = []
    builders = stage_builders(events)
    def explore(context):
        events.append(('explore', tuple(context['numberOrders']), len(context['history'])))
        return {'items': [], 'historyCount': len(context['history'])}
    builders['explore'] = explore
    monkeypatch.setattr(worker, 'create_artifact_builders', lambda: builders)
    monkeypatch.setattr(worker, 'publish_current_card', lambda *args: None)
    def repair(_service, lottery):
        repository.upsert_draw({**CONFIRMED, 'period': '115000207', 'drawDate': '2026-08-14'})
        if actual_history_incomplete:
            raise ValueError('DRAW_ORDER_HISTORY_INCOMPLETE')
        return repository.list_draws(lottery, None)
    monkeypatch.setattr(worker.DrawRefreshService, 'ensure_algorithm_history', repair)
    def run():
        return worker.run_scheduled_worker('今彩539', datetime(2026, 8, 28, 20, 25, tzinfo=ZoneInfo('Asia/Taipei')), repository, Source())
    if actual_history_incomplete:
        with pytest.raises(ValueError, match='DRAW_ORDER_HISTORY_INCOMPLETE'):
            run()
    else:
        assert run()['status'] == 'complete'
    assert [event[2] for event in events if event[:2] == ('explore', (SORTED_ORDER,))] == [13, 14]
    assert repository.read_artifact('今彩539', '115000220', '115000220:matrix-python-v14-sorted', 'explore')['historyCount'] == 14
    assert repository.get_progress('今彩539', '115000220', '115000220:matrix-python-v14-sorted')['status'] == 'complete'


def test_history_verification_accepts_matching_canonical_period_aliases():
    repository = InMemoryAnalysisRepository()
    older = {**CONFIRMED, 'period': '096000001', 'drawDate': '2007-01-01'}
    snapshot = [CONFIRMED, older]
    repository.upsert_draws(snapshot)
    repository.upsert_draw({**older, 'period': '96000001'})
    pipeline = AnalysisPipeline(repository, stage_builders([]), '115000220:matrix-python-v14-sorted', number_orders=(SORTED_ORDER,))
    assert pipeline.run(CONFIRMED, snapshot)['status'] == 'complete'


def test_historical_correction_during_computation_revokes_publication_lease():
    repository = InMemoryAnalysisRepository()
    snapshot = history(CONFIRMED)
    repository.upsert_draws(snapshot)
    builders = stage_builders([])
    def correcting_builder(context):
        repository.upsert_draw({**snapshot[3], 'numbers': ['01', '02', '03', '04', '06'], 'sortedNumbers': ['01', '02', '03', '04', '06'], 'drawOrderNumbers': ['06', '03', '01', '04', '02']})
        return {'items': [{'id': 'stale-result'}]}
    builders['explore'] = correcting_builder
    pipeline = AnalysisPipeline(repository, builders, '115000220:matrix-python-v14-sorted', number_orders=(SORTED_ORDER,))
    with pytest.raises(RuntimeError, match='ANALYSIS_RUN_LEASE_LOST'):
        pipeline.run(CONFIRMED, snapshot)
    assert repository.read_completed_artifact('今彩539', '115000220', 'explore') is None
