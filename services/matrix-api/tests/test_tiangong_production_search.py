from random import Random

import pytest

from app.domain.tiangong_algorithm import calculate_tiangong


def request(window, lottery="今彩539", maximum=39, ball_count=5):
    rng = Random(1409)
    return {
        "lottery": lottery, "source_window": window, "target_period": "119",
        "draws": [{"period": str(index), "numbers": sorted(rng.sample(range(1, maximum + 1), ball_count))}
                  for index in range(119)],
        "source_position_patterns": ["固定"],
        "stage1_position_patterns": ["固定"],
        "stage2_position_patterns": ["固定"],
        "stage1_route_types": ["加減", "合值"],
        "stage2_route_types": ["加減", "合值"],
    }


@pytest.mark.parametrize("lottery,maximum,ball_count", [
    ("今彩539", 39, 5), ("天天樂", 39, 5), ("六合彩", 49, 7), ("大樂透", 49, 7),
])
def test_production_search_covers_dynamic_gaps_and_preserves_all_fifty_period_results(lottery, maximum, ball_count):
    fifty = calculate_tiangong(request(50, lottery, maximum, ball_count))
    eighty = calculate_tiangong(request(80, lottery, maximum, ball_count))

    # The retired 80-period producer is retained here only as a regression
    # reference: direct 50-period production must preserve its visible results.
    assert {row["item_id"] for row in fifty["results"]} == {
        row["item_id"] for row in eighty["results"] if 50 in row["eligible_windows"]
    }
    old_visible = {row["item_id"]: row for row in eighty["results"]
                   if 50 in row["eligible_windows"]}
    assert {
        row["item_id"]: {key: value for key, value in row.items() if key != "eligible_windows"}
        for row in fifty["results"]
    } == {
        identifier: {key: value for key, value in row.items() if key != "eligible_windows"}
        for identifier, row in old_visible.items()
    }
    assert fifty["evidence"] == {identifier: eighty["evidence"][identifier]
                                  for identifier in old_visible}
    for window, response in ((50, fifty), (80, eighty)):
        assert response["metrics"]["source_stage_pair_count"] == sum(
            (window - 2 * spacing) * (window - 2 * spacing - 1) // 2
            for spacing in range(1, (window - 1) // 2 + 1)
        )
        for dimension in ("source_spacing", "stage1_distance", "stage2_distance"):
            assert max(row[dimension] for row in response["results"]) > 12
        assert len({row["item_id"] for row in response["results"]}) == len(response["results"])
        assert set(response["evidence"]) == {row["item_id"] for row in response["results"]}
        for detail in response["evidence"].values():
            assert [row["group"] for row in detail["rows"]] == ["C", "B", "A"]
            assert all(row["stage1"]["matched"] is True for row in detail["rows"])
            assert all(row["stage2"]["matched"] is True for row in detail["rows"][:2])
            assert detail["rows"][2]["stage2"]["matched"] is None
            assert detail["d_exclusion"]["status"] in {"breaks_at_stage1", "breaks_at_stage2"}
