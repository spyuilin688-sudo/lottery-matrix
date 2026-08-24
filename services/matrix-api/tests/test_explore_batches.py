from app.services.explore_batches import build_explore_batch, work_units


def test_work_units_keep_all_390_locked_conditions_for_five_ball_lottery() -> None:
    assert len(work_units('今彩539', history_length=80, position_count=5)) == 390


def test_batch_returns_only_current_delta() -> None:
    calls: list[int] = []

    def runner(unit: dict, history: list[dict]) -> dict:
        calls.append(unit['lockedSourceIndex'])
        return {'results': [{'id': str(len(calls)), 'ruleCount': 1}]}

    result = build_explore_batch(
        lottery='今彩539',
        draw_period='115000205',
        history=[{'period': str(index)} for index in range(13)],
        position_count=5,
        start=10,
        limit=2,
        runner=runner,
        append_result=lambda artifact, unit, response: artifact['items'].append(response['results'][0]),
    )

    assert result['cursorStart'] == 10
    assert result['cursor'] == 12
    assert len(result['artifact']['items']) == 2
    assert result['total'] == 390
    assert result['complete'] is False
