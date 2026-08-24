from app.services.explore_batches import build_explore_batch, work_units


def test_work_units_keep_all_390_locked_conditions_for_five_ball_lottery() -> None:
    assert len(work_units('今彩539', history_length=80, position_count=5)) == 390


def test_explore_batch_resumes_without_recomputing_completed_units() -> None:
    calls: list[int] = []
    existing = {
        'lottery': '今彩539', 'drawPeriod': '115000205',
        'items': [{'id': 'existing'}],
        'validationById': {'existing': {'itemId': 'existing', 'ruleSets': []}},
    }

    def runner(unit: dict, _: list[dict]) -> dict:
        calls.append(unit['lockedSourceIndex'])
        return {'results': []}

    result = build_explore_batch(
        lottery='今彩539', draw_period='115000205',
        history=[{'period': str(index)} for index in range(80)],
        position_count=5, start=10, limit=3, existing=existing, runner=runner,
    )

    assert len(calls) == 3
    assert result['cursor'] == 13
    assert result['total'] == 390
    assert result['complete'] is False
    assert result['artifact']['items'] == [{'id': 'existing'}]
