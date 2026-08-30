from app.services.explore_batches import build_explore_batch, work_units


def test_work_units_assign_one_prediction_distance_to_each_source_and_date() -> None:
    units = work_units('今彩539', history_length=80, position_count=5)

    assert len(units) == 1170
    assert {
        (unit['exploreDateOffset'], unit['lockedSourceIndex'], unit['predictionDistance'])
        for unit in units
    } == {
        (date_offset, date_offset + relative_source_index, relative_source_index + 1)
        for date_offset in (0, 1, 2)
        for relative_source_index in range(13)
    }
    assert all('minPredictionDistance' not in unit for unit in units)
    assert all('maxPredictionDistance' not in unit for unit in units)


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
    assert result['total'] == 1080
    assert result['complete'] is False
