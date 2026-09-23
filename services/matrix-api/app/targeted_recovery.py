"""Period-bound recovery using the existing crawler and leased analysis pipeline."""
from datetime import UTC, datetime
import logging
from uuid import uuid4

from app.card_renderer import card_layout
from app.settings import load_settings
from app.repositories.analysis_repository import create_supabase_repository
from app.worker import _draw_from_history, _run_analysis, analysis_version_for_order
from app.domain.explore_state import SORTED_ORDER, DRAW_ORDER
from app.domain.history_boundaries import has_complete_draw_order
from app.domain.models import lottery_position_count
from app.repositories.card_repository import card_repository, validate_published_manifest
from app.services.card_publication import complete_snapshot, publish_current_card, snapshot_digest

LOGGER = logging.getLogger(__name__)


def make_repository():
    settings = load_settings()
    return create_supabase_repository(settings.supabase_url, settings.supabase_secret_key)


def _notify_card_repair(lottery: str, period: str, repository) -> None:
    # Reuse existing durable event keys and the normal post-publication sender.
    # Its event_exists check ensures an already sent card is never replayed.
    settings = load_settings()
    if lottery == '天天樂':
        from app.analysis_worker import _emit_ready_notifications
        from app.services.notification_events import notification_emitter_context
        with notification_emitter_context(settings) as emitter:
            draw = repository.list_draws(lottery, 1)[0]
            _emit_ready_notifications({'lottery': lottery, **draw}, repository, emitter, set())
        return
    import httpx
    from app.worker import create_notification_emitter, emit_ready_notifications
    from app.worker_all import create_railway_ssl_context
    with httpx.Client(verify=create_railway_ssl_context()) as client:
        emitter = create_notification_emitter(settings, client)
        emit_ready_notifications(lottery, period, repository, emitter, set())


def verify_recovery(lottery: str, period: str | None) -> bool:
    if not period:
        return False
    state = make_repository().client.rpc('matrix_watchdog_chain_state', {
        'p_lottery': lottery, 'p_draw_period': period,
    }).execute().data
    return isinstance(state, dict) and state.get('latestPeriod') == period and all(
        state.get(key) is True for key in (
            'analysisComplete', 'matrixStatusComplete',
            *(['cardComplete'] if 'cardComplete' in state else []),
        )
    )


def repair_current_card_if_needed(lottery: str, period: str, repository) -> bool:
    """Repair only current confirmed card data once analysis and status are complete.

    False means another stage still owns this period, so the normal worker may
    continue source/analysis processing. Publication failures remain retryable.
    """
    latest = repository.list_draws(lottery, 1)
    if not latest or str(latest[0].get('period')) != period:
        return False
    draw = latest[0]
    if draw.get('resultStatus', 'confirmed') != 'confirmed':
        return False
    if lottery != '天天樂' and not has_complete_draw_order(draw, lottery_position_count(lottery)):
        return False
    def chain_state():
        return repository.client.rpc('matrix_watchdog_chain_state', {
            'p_lottery': lottery, 'p_draw_period': period,
        }).execute().data

    state = chain_state()
    if not isinstance(state, dict) or state.get('latestPeriod') != period or any(
        state.get(key) is not True for key in ('analysisComplete', 'matrixStatusComplete')
    ):
        return False
    cards = card_repository(repository)
    if cards is None:
        raise RuntimeError('RECOVERY_CARD_PENDING')

    required = ('sorted',) if lottery == '天天樂' else ('sorted', 'draw')

    def ready():
        manifest = validate_published_manifest(
            lottery, repository, cards.read_manifest(lottery), require_all_orders=True,
        )
        return manifest if (manifest and manifest.get('period') == period and
                            all(manifest.get('cards', {}).get(order) for order in required)) else None

    # Before the final database migration, older chain-state functions do not
    # expose cardComplete. Card repair remains safe and the legacy path remains.
    manifest = ready()
    if manifest and state.get('cardComplete') is not False:
        return True
    if manifest:
        # draw_changed can clear desired metadata after an unrelated historical
        # correction while leaving the visible card snapshot unchanged. Rebind
        # the existing PNGs under the usual claim/observe/publish lease without
        # changing the renderer digest or overwriting immutable card objects.
        metadata = cards.read_state(lottery) if callable(getattr(cards, 'read_state', None)) else getattr(cards, 'row', {})
        if (metadata.get('desired_digest') == manifest['generation'] and
                metadata.get('desired_period') == period):
            raise RuntimeError('RECOVERY_CARD_PENDING')
        token = str(uuid4())
        claimed = cards.claim(lottery, token, datetime.now(UTC))
        if claimed is None:
            raise RuntimeError('RECOVERY_CARD_PENDING')
        error_code = None
        cleanup_error = None
        try:
            draws = repository.list_draws(lottery, sum(card_layout(lottery)['column_rows']))
            if (not complete_snapshot(lottery, draws)
                    or str(draws[0]['period']) != period
                    or snapshot_digest(lottery, draws) != manifest['generation']):
                raise RuntimeError('RECOVERY_CARD_PENDING')
            if (claimed['desired_digest'] != manifest['generation'] or
                    claimed['desired_period'] != period):
                if not cards.update(lottery, token, {
                    'desired_digest': manifest['generation'], 'desired_period': period,
                }):
                    raise RuntimeError('RECOVERY_CARD_PENDING')
            if snapshot_digest(lottery, repository.list_draws(lottery, len(draws))) != manifest['generation']:
                raise RuntimeError('RECOVERY_CARD_PENDING')
            if not cards.update(lottery, token, {'manifest': manifest}):
                raise RuntimeError('RECOVERY_CARD_PENDING')
            try:
                cards.prune(
                    lottery, period, manifest['generation'], token,
                    keep_generations={card['inputDigest'] for card in manifest['cards'].values()},
                )
            except Exception as error:
                cleanup_error = type(error).__name__
                LOGGER.warning('Matrix card cleanup failed for %s (%s)', lottery, cleanup_error)
        except Exception as error:
            error_code = type(error).__name__
            raise
        finally:
            cards.release(lottery, token, error_code or cleanup_error)
    else:
        publish_current_card(lottery, repository)
    if not ready():
        raise RuntimeError('RECOVERY_CARD_PENDING')
    latest_state = chain_state()
    if isinstance(latest_state, dict) and latest_state.get('cardComplete') is False:
        raise RuntimeError('RECOVERY_CARD_PENDING')
    return True


def run_targeted_recovery(lottery: str, period: str | None, stage: str, minimum_draw_date: str | None, *, lease_owner: str | None = None, runner_id: str | None = None) -> str:
    if stage not in {'crawler','analysis','matrix-status','card'}:
        raise ValueError('RECOVERY_STAGE_INVALID')
    if stage == 'crawler' and not minimum_draw_date:
        raise ValueError('RECOVERY_DRAW_DATE_REQUIRED')
    if stage == 'crawler':
        # Existing full path owns source refresh, history repair and its retries.
        from app.recovery_server import run_full_lottery_recovery
        if lottery == "天天樂":
            from app.fantasy5_crawler import run_fantasy5_crawler_once
            run_full_lottery_recovery(lottery, fantasy5_crawler=lambda: run_fantasy5_crawler_once(
                expected_draw_date=minimum_draw_date,
            ))
        else:
            # The scheduled worker normally resumes a confirmed current draw
            # from storage. With a missing formal order, that resume cannot
            # fetch the source, so make one explicit formal fetch first.
            source_repository = make_repository()
            known = source_repository.list_draws(lottery, 1)
            if (known and known[0].get('resultStatus') == 'confirmed'
                    and str(known[0].get('drawDate') or '') >= str(minimum_draw_date)
                    and not has_complete_draw_order(known[0], lottery_position_count(lottery))):
                from app.api_server import refresh_latest_draw
                refresh_latest_draw(lottery, source_repository)
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
    if stage in {'analysis','matrix-status','card'}:
        if not lease_owner or not runner_id:
            raise RuntimeError('RECOVERY_LEASE_REQUIRED')
        if stage == 'card':
            if not repair_current_card_if_needed(lottery, period, repository):
                raise RuntimeError('RECOVERY_CARD_PENDING')
            _notify_card_repair(lottery, period, repository)
            return period
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
        if draw.get('resultStatus') == 'confirmed' and repair_current_card_if_needed(
            lottery, period, repository,
        ):
            _notify_card_repair(lottery, period, repository)
    return period
