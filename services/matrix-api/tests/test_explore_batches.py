from app.services.explore_batches import build_explore_batch, work_units


def test_work_units_assign_one_prediction_distance_to_each_today_source() -> None:
    units = work_units('今彩539', history_length=80, position_count=5)

    assert len(units) == 130
    assert {unit['exploreDateOffset'] for unit in units} == {0}
    assert {
        (unit['lockedSourceIndex'], unit['predictionDistance'])
        for unit in units
    } == {
        (relative_source_index, relative_source_index + 1)
        for relative_source_index in range(13)
    }
    assert all('algorithmType' not in unit for unit in units)
    assert all('minPredictionDistance' not in unit for unit in units)
    assert all('maxPredictionDistance' not in unit for unit in units)


def test_fantasy5_work_units_only_use_sorted_order() -> None:
    units = work_units('天天樂', history_length=80, position_count=5)

    assert len(units) == 65
    assert {unit['numberOrder'] for unit in units} == {'依號碼由小到大排序'}
    assert all('algorithmType' not in unit for unit in units)


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
    assert result['total'] == 130
    assert result['complete'] is False
