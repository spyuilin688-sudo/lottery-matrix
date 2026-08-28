from app.services.explore_batches import build_explore_batch, work_units


def test_work_units_keep_fifteen_sources_for_shifted_thirteen_period_searches() -> None:
    units = work_units('今彩539', history_length=80, position_count=5)
    assert len(units) == 450
    ranges = {
        source_index: {
            (unit['minPredictionDistance'], unit['maxPredictionDistance'])
            for unit in units if unit['lockedSourceIndex'] == source_index
        }
        for source_index in range(15)
    }
    assert ranges == {
        0: {(1, 1)}, 1: {(1, 2)}, 2: {(1, 3)}, 3: {(2, 4)},
        4: {(3, 5)}, 5: {(4, 6)}, 6: {(5, 7)}, 7: {(6, 8)},
        8: {(7, 9)}, 9: {(8, 10)}, 10: {(9, 11)}, 11: {(10, 12)},
        12: {(11, 13)}, 13: {(12, 13)}, 14: {(13, 13)},
    }


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
