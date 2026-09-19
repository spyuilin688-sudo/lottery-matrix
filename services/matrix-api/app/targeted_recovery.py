"""Period-bound recovery using the existing crawler and leased analysis pipeline."""
from app.settings import load_settings
from app.repositories.analysis_repository import create_supabase_repository
from app.services.custom_status_recompute import recompute_custom_matrix_status_once
from app.worker import _draw_from_history, _run_analysis, analysis_version_for_order
from app.domain.explore_state import SORTED_ORDER, DRAW_ORDER


def make_repository():
    settings = load_settings()
    return create_supabase_repository(settings.supabase_url, settings.supabase_secret_key)


def verify_recovery(lottery: str, period: str | None) -> bool:
    if not period:
        return False
    state = make_repository().client.rpc('matrix_watchdog_chain_state', {
        'p_lottery': lottery, 'p_draw_period': period,
    }).execute().data
    return isinstance(state, dict) and state.get('latestPeriod') == period and all(
        state.get(key) is True for key in ('analysisComplete','matrixStatusComplete','customStatusComplete')
    )


def run_targeted_recovery(lottery: str, period: str | None, stage: str, minimum_draw_date: str | None, *, lease_owner: str | None = None, runner_id: str | None = None) -> str:
    if stage not in {'crawler','analysis','matrix-status','custom-status'}:
        raise ValueError('RECOVERY_STAGE_INVALID')
    if stage == 'crawler' and not minimum_draw_date:
        raise ValueError('RECOVERY_DRAW_DATE_REQUIRED')
    if stage == 'crawler':
        # Existing full path owns source refresh, history repair and its retries.
        from app.recovery_server import run_full_lottery_recovery
        run_full_lottery_recovery(lottery)
    repository = make_repository()
    latest = repository.list_draws(lottery, 1)
    if not latest:
        raise RuntimeError('RECOVERY_DRAW_MISSING')
    current = str(latest[0]['period'])
    if stage == 'crawler':
        if str(latest[0].get('drawDate') or '') < str(minimum_draw_date):
            raise RuntimeError('RECOVERY_SOURCE_PENDING')
        period = current
    if current != period:
        raise RuntimeError('RECOVERY_SUPERSEDED')
    if stage in {'analysis','matrix-status'}:
        if not lease_owner or not runner_id:
            raise RuntimeError('RECOVERY_LEASE_REQUIRED')
        history = repository.list_draws(lottery, None)
        draw = _draw_from_history(lottery, period, history)
        orders = (SORTED_ORDER,) if lottery == '天天樂' or draw.get('resultStatus') == 'preliminary' else (SORTED_ORDER,DRAW_ORDER)
        for order in orders:
            result = _run_analysis(repository, draw, history, None, number_order=order)
            if result.get('status') != 'complete':
                raise RuntimeError('RECOVERY_ANALYSIS_PENDING')
        # Reuse the worker's explicit versions; never select a historical run.
        restored = repository.client.rpc('matrix_restore_analysis_pointers', {
            'p_lottery': lottery, 'p_draw_period': period,
            'p_versions': {('sorted' if order == SORTED_ORDER else 'draw'):
                analysis_version_for_order(period, order) for order in orders},
            'p_owner_id': lease_owner, 'p_runner_id': runner_id,
        }).execute().data
        if restored is not True:
            raise RuntimeError('RECOVERY_POINTERS_NOT_VERIFIED')
    settings = load_settings()
    recompute_custom_matrix_status_once(settings.supabase_url, settings.supabase_secret_key, lottery, period)
    return period
