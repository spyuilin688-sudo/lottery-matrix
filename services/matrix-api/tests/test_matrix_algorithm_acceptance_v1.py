from itertools import product

import pytest

from app.domain import explore
from app.domain.explore import (
    _apply_rule as apply_explore_rule,
    _build_group,
    _candidate_rule,
    _coverage,
    _matching_source_indexes,
    _ordered_numbers,
    _parse_request,
    _streak,
    run_matrix_automatic_explore_with_history,
    run_matrix_algorithm_with_history,
    run_matrix_explore_group_with_history,
)
from app.domain.models import normalize_matrix_number
from app.domain.tiangong import enumerate_equal_spacing_sequences, evaluate_tiangong_candidate
from app.domain.tiangong_generator import (
    _normalize_history,
    derive_tiangong_rules,
    enumerate_position_paths,
    enumerate_reference_positions,
    run_tiangong_candidates,
)


def draw(period: str, numbers: list[int], *, lottery: str | None = None, draw_order: list[int] | None = None) -> dict:
    value = {
        "period": period,
        "drawDate": "",
        "numbers": numbers,
        "sortedNumbers": sorted(numbers[:-1]) + [numbers[-1]] if len(numbers) == 7 else sorted(numbers),
        "drawOrderNumbers": draw_order if draw_order is not None else numbers,
    }
    if lottery is not None:
        value["lottery"] = lottery
    return value


def explore_request(**overrides: object) -> dict:
    value = {
        "lottery": "今彩539",
        "numberOrder": "依號碼由小到大",
        "lockedPosition": 1,
        "lockedNumber": 10,
        "referenceOffset": 0,
        "referencePosition": 2,
        "predictionDistance": 1,
        "ruleCount": 1,
        "algorithmType": "加減版路",
    }
    value.update(overrides)
    return value


def candidate(**overrides: object) -> dict:
    value = {
        "lottery": "今彩539",
        "periodRange": 50,
        "sourceSequence": [1, 3, 5],
        "mode": "one-stage",
        "hitCondition": "準2進3",
        "exploreDirection": "固定",
        "baseNumber": 10,
        "firstStage": {
            "startPosition": 1,
            "direction": "固定",
            "algorithmType": "加減",
            "value": 5,
            "nextN": 1,
        },
        "validationRows": [],
    }
    value.update(overrides)
    return value


def fixed(position: int, length: int) -> dict:
    return {"startPosition": position, "direction": "固定", "positionsOldestToNewest": [position] * length}


def automatic_options(**overrides: object) -> dict:
    value = {
        "lottery": "今彩539",
        "numberOrder": "依號碼由小到大排序",
        "explorePeriods": 2,
        "algorithmType": "拖牌",
        "ruleCount": 1,
        "exploreDateOffset": 0,
        "exploreRange": "標準範圍",
    }
    value.update(overrides)
    return value


def accept_explore_request(request: dict, _history: list[dict]) -> dict:
    return {
        "valid": True,
        "highestStreak": 5,
        "displayStreak": "準5進6",
        "sourceA": {"sourcePeriod": str(request["lockedNumber"])},
        "results": [{"predictionNumbers": [(request["lockedNumber"] % 39) + 1]}],
    }


def one_stage_history() -> list[dict]:
    history = [draw(str(114233 - index), [30, 31, 32, 33, 34]) for index in range(20)]
    for position, numbers in [
        (19, [10, 21, 22, 23, 24]),
        (14, [20, 15, 22, 23, 24]),
        (12, [11, 21, 22, 23, 24]),
        (7, [20, 16, 22, 23, 24]),
        (5, [12, 21, 22, 23, 24]),
    ]:
        history[position - 1] = draw(str(114234 - position), numbers)
    return history


def one_stage_options() -> dict:
    return {
        "periodRanges": [50],
        "modes": ["one-stage"],
        "hitConditions": ["準2進3"],
        "sourceSequences": [[5, 12, 19]],
        "referenceOffsets": [0],
        "explorePaths": [fixed(1, 3)],
        "firstStagePaths": [fixed(2, 3)],
        "firstStageDistances": [5],
    }


def two_stage_history() -> list[dict]:
    history = [draw(str(114233 - index), [1, 2, 3, 4, 5]) for index in range(30)]
    replacements = [
        (22, [1, 24, 3, 4, 5]),
        (18, [1, 2, 29, 4, 5]),
        (14, [1, 2, 3, 28, 5]),
        (13, [1, 2, 26, 4, 5]),
        (9, [1, 2, 3, 21, 5]),
        (5, [1, 2, 3, 4, 22]),
        (8, [1, 2, 3, 4, 38]),
        (4, [1, 2, 3, 4, 33]),
    ]
    for position, numbers in replacements:
        history[position - 1] = draw(str(114234 - position), numbers)
    return history


def two_stage_options() -> dict:
    return {
        "periodRanges": [50],
        "modes": ["two-stage"],
        "hitConditions": ["準2進3"],
        "sourceSequences": [[14, 18, 22]],
        "referenceOffsets": [0],
        "explorePaths": [{"startPosition": 2, "direction": "依序遞增", "positionsOldestToNewest": [2, 3, 4]}],
        "firstStagePaths": [{"startPosition": 3, "direction": "依序遞增", "positionsOldestToNewest": [3, 4, 5]}],
        "secondStagePaths": [fixed(5, 3)],
        "firstStageDistances": [9],
        "secondStageDistances": [5],
    }


CORRECTED_HISTORY = [
    draw(period, numbers)
    for period, numbers in [
        ("114233", [2, 10, 13, 28, 32]), ("114232", [4, 22, 23, 35, 39]),
        ("114231", [6, 19, 20, 33, 37]), ("114230", [7, 9, 12, 14, 33]),
        ("114229", [5, 8, 11, 13, 22]), ("114228", [2, 11, 22, 24, 31]),
        ("114227", [5, 12, 14, 23, 33]), ("114226", [4, 6, 7, 12, 38]),
        ("114225", [2, 9, 19, 21, 33]), ("114224", [7, 9, 10, 12, 28]),
        ("114223", [2, 25, 32, 35, 36]), ("114222", [9, 12, 16, 26, 34]),
        ("114221", [6, 18, 26, 28, 36]), ("114220", [12, 14, 16, 28, 39]),
        ("114219", [8, 20, 23, 25, 26]), ("114218", [7, 11, 20, 28, 38]),
        ("114217", [8, 14, 25, 28, 31]), ("114216", [7, 9, 29, 32, 38]),
        ("114215", [6, 7, 24, 27, 34]), ("114214", [14, 15, 20, 21, 23]),
        ("114213", [5, 8, 10, 23, 25]), ("114212", [21, 24, 28, 29, 35]),
        ("114211", [4, 5, 7, 13, 14]), ("114210", [7, 20, 21, 30, 38]),
        ("114209", [5, 7, 21, 23, 29]), ("114208", [3, 5, 28, 30, 32]),
        ("114207", [2, 5, 24, 38, 39]), ("114206", [6, 12, 15, 23, 26]),
        ("114205", [4, 5, 8, 27, 39]), ("114204", [6, 7, 21, 37, 38]),
        ("114203", [16, 27, 28, 29, 33]), ("114202", [15, 18, 29, 31, 39]),
        ("114201", [6, 7, 18, 31, 35]), ("114200", [9, 12, 18, 27, 29]),
        ("114199", [15, 18, 22, 24, 31]), ("114198", [1, 5, 16, 18, 26]),
        ("114197", [10, 12, 14, 31, 35]), ("114196", [11, 23, 26, 32, 34]),
        ("114195", [1, 9, 17, 25, 30]), ("114194", [1, 14, 22, 26, 28]),
        ("114193", [1, 9, 27, 29, 30]), ("114192", [11, 25, 27, 30, 34]),
        ("114191", [10, 20, 28, 30, 37]),
    ]
]


# 共通固定規則 C-01 ～ C-06


def test_c_01_history_is_not_mixed_between_lotteries(monkeypatch: pytest.MonkeyPatch) -> None:
    history = [
        draw("539-1", [10, 11, 12, 13, 14], lottery="今彩539"),
        draw("649-1", [10, 11, 12, 13, 14, 15, 16], lottery="大樂透"),
    ]
    assert _matching_source_indexes(_parse_request(explore_request()), history) == [0]
    monkeypatch.setattr(explore, "_evaluate_prepared", lambda _request, prepared, _indexes: {
        "periods": [item["period"] for item in prepared],
    })
    assert run_matrix_algorithm_with_history(explore_request(), history)["periods"] == ["539-1"]


def test_c_02_sorted_and_draw_order_are_calculated_separately() -> None:
    value = draw("1", [1, 2, 3, 4, 5], draw_order=[5, 1, 4, 2, 3])
    assert _ordered_numbers(value, "今彩539", "依號碼由小到大排序") == [1, 2, 3, 4, 5]
    assert _ordered_numbers(value, "今彩539", "依實際開獎順序排序") == [5, 1, 4, 2, 3]


def test_c_03_add_subtract_wraps_by_each_lottery_maximum() -> None:
    assert normalize_matrix_number(40, 39) == 1
    assert normalize_matrix_number(50, 49) == 1


def test_c_04_zero_from_non_locked_reference_is_an_addition_rule() -> None:
    group = _build_group(
        [draw("S", [10, 20, 30, 35, 39]), draw("P", [10, 1, 2, 3, 4])],
        0,
        _parse_request(explore_request(referencePosition=2)),
        "B",
    )
    assert group is not None
    assert "加減:29" in group["candidateMap"]

    zero_group = _build_group(
        [draw("S", [10, 20, 30, 35, 39]), draw("P", [1, 2, 3, 4, 20])],
        0,
        _parse_request(explore_request(referencePosition=2)),
        "B",
    )
    assert zero_group is not None
    assert "加減:0" in zero_group["candidateMap"]
    assert "拖牌:0" not in zero_group["candidateMap"]


def test_c_05_insufficient_history_does_not_emit_obsolete_message() -> None:
    result = run_matrix_algorithm_with_history(explore_request(), [draw("A", [10, 20, 30, 35, 39])])
    assert "可驗證資料不足" not in str(result)


def test_c_06_valid_result_contains_every_confirmed_output_field() -> None:
    history = [draw("A", [10, 20, 30, 35, 39])]
    predictions = {
        4: [14, 15, 16, 17, 25],
        3: [9, 11, 12, 13, 25],
        2: [5, 6, 7, 8, 25],
        1: [1, 2, 3, 4, 25],
    }
    for index in range(4, 0, -1):
        history.extend([
            draw(f"P{index}", predictions[index]),
            draw(f"S{index}", [10, 20, 30, 35, 39]),
        ])
    result = run_matrix_explore_group_with_history({
        "lottery": "今彩539", "numberOrder": "依號碼由小到大排序",
        "lockedSourceIndex": 0, "lockedPosition": 1,
        "exploreDateOffset": 0, "predictionDistance": 1,
        "exploreRange": "完整範圍",
        "algorithmType": "加減",
    }, history)
    item = next(value for value in result["results"] if value["ruleSets"][0]["rules"][0]["value"] == 5)
    assert {"lockedPosition", "number", "predictionDistance", "consecutive", "predictionNumbers", "algorithmType", "ruleSets"} <= item.keys()
    assert item["ruleSets"][0]["historicalValidation"]


# Matrix 探索 E-01 ～ E-30


def test_e_01_today_two_period_sources_are_latest_two_opened_draws(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(explore, "run_matrix_algorithm_with_history", accept_explore_request)
    history = [
        draw("latest", [1, 2, 3, 4, 5]),
        draw("previous", [6, 7, 8, 9, 10]),
    ]
    result = run_matrix_automatic_explore_with_history(automatic_options(explorePeriods=2), history)
    assert {item["number"] for item in result["results"]} == {str(value).zfill(2) for value in range(1, 11)}


@pytest.mark.parametrize(
    ("case_id", "lottery", "periods", "expected"),
    [
        ("E-02", "今彩539", 2, 10),
        ("E-03", "天天樂", 7, 35),
        ("E-04", "今彩539", 13, 65),
        ("E-05", "六合彩", 2, 14),
        ("E-06", "大樂透", 7, 49),
        ("E-07", "六合彩", 13, 91),
    ],
)
def test_e_02_to_e_07_lock_condition_counts(
    monkeypatch: pytest.MonkeyPatch, case_id: str, lottery: str, periods: int, expected: int,
) -> None:
    monkeypatch.setattr(explore, "run_matrix_algorithm_with_history", accept_explore_request)
    count = 5 if lottery in {"今彩539", "天天樂"} else 7
    history = [
        draw(str(index), list(range(index * count + 1, index * count + count + 1)))
        for index in range(periods + 1)
    ]
    result = run_matrix_automatic_explore_with_history(automatic_options(
        lottery=lottery, explorePeriods=periods,
    ), history)
    assert result["resultCount"] == expected, case_id


def test_e_08_yesterday_and_day_before_follow_draw_sequence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(explore, "run_matrix_algorithm_with_history", accept_explore_request)
    history = [
        draw("本日", [1, 2, 3, 4, 5]), draw("昨日", [6, 7, 8, 9, 10]),
        draw("昨日之前1期", [11, 12, 13, 14, 15]), draw("昨日之前2期", [16, 17, 18, 19, 20]),
    ]
    result = run_matrix_automatic_explore_with_history(automatic_options(
        exploreDateOffset=1, explorePeriods=2,
    ), history)
    assert {item["number"] for item in result["results"]} == {str(value).zfill(2) for value in range(6, 16)}
    day_before = run_matrix_automatic_explore_with_history(automatic_options(
        exploreDateOffset=2, explorePeriods=1,
    ), history)
    assert {item["number"] for item in day_before["results"]} == {str(value).zfill(2) for value in range(11, 16)}


def test_e_09_latest_matching_source_is_a_then_older_sources_are_b_c() -> None:
    history = [
        draw("A", [10, 20, 30, 35, 39]), draw("P2", [1, 2, 3, 4, 25]),
        draw("S2", [10, 20, 30, 35, 39]), draw("P1", [1, 2, 3, 4, 25]),
        draw("S1", [10, 20, 30, 35, 39]), draw("P0", [1, 2, 3, 4, 25]),
        draw("S0", [10, 20, 30, 35, 39]), draw("P-1", [1, 2, 3, 4, 25]),
        draw("S-1", [10, 20, 30, 35, 39]),
    ]
    result = run_matrix_algorithm_with_history(explore_request(), history)
    rows = result["results"][0]["historicalValidation"]
    assert result["sourceA"]["sourcePeriod"] == "A"
    assert [(row["group"], row["sourcePeriod"]) for row in rows[:2]] == [("B", "S2"), ("C", "S1")]


def test_e_10_source_a_is_not_counted_in_historical_streak() -> None:
    history = [draw("A", [10, 20, 30, 35, 39])]
    for index in range(4, 0, -1):
        history.extend([
            draw(f"P{index}", [1, 2, 3, 4, 25]),
            draw(f"S{index}", [10, 20, 30, 35, 39]),
        ])
    result = run_matrix_algorithm_with_history(explore_request(), history)
    periods = [row["sourcePeriod"] for row in result["results"][0]["historicalValidation"]]
    assert "A" not in periods


def test_e_11_each_source_uses_its_fixed_prediction_distance(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(explore, "run_matrix_algorithm_with_history", accept_explore_request)
    history = [draw("latest", [1, 2, 3, 4, 5]), draw("previous", [6, 7, 8, 9, 10])]
    result = run_matrix_automatic_explore_with_history(
        automatic_options(explorePeriods=2), history,
    )
    assert {
        (item["number"], item["predictionDistance"])
        for item in result["results"]
    } == {
        *((str(value).zfill(2), 1) for value in range(1, 6)),
        *((str(value).zfill(2), 2) for value in range(6, 11)),
    }


def test_e_12_prediction_hit_can_be_at_any_legal_position() -> None:
    group = _build_group(
        [draw("S", [10, 20, 30, 35, 39]), draw("P", [1, 2, 3, 4, 25])],
        0,
        _parse_request(explore_request()),
        "B",
    )
    assert group is not None and group["candidateMap"]["加減:5"] == [25]


def test_e_13_special_number_is_a_legal_prediction_hit() -> None:
    group = _build_group(
        [draw("S", [10, 20, 30, 35, 40, 45, 49]), draw("P", [1, 2, 3, 4, 5, 6, 25])],
        0,
        _parse_request(explore_request(lottery="大樂透")),
        "B",
    )
    assert group is not None and group["candidateMap"]["加減:5"] == [25]


@pytest.mark.parametrize(("algorithm_type", "distance", "expected_count"), [
    ("加減", 1, 74),
    ("合值", 2, 79),
])
def test_e_14_to_e_15_full_reference_range_excludes_locked_condition(
    monkeypatch: pytest.MonkeyPatch,
    algorithm_type: str,
    distance: int,
    expected_count: int,
) -> None:
    captured: list[dict] = []

    def capture(request: dict, *_args: object) -> dict:
        captured.append(request)
        return {"valid": False, "results": []}

    monkeypatch.setattr(explore, "_evaluate_prepared", capture)
    run_matrix_explore_group_with_history({
        "lottery": "今彩539",
        "numberOrder": "依號碼由小到大排序",
        "algorithmType": algorithm_type,
        "lockedSourceIndex": distance - 1,
        "lockedPosition": 1,
        "exploreDateOffset": 0,
        "predictionDistance": distance,
        "exploreRange": "完整範圍",
    }, [
        draw("latest", [1, 2, 3, 4, 5]),
        draw("previous", [6, 7, 8, 9, 10]),
    ])

    coordinates = {
        (request["referenceOffset"], request["referencePosition"])
        for request in captured
    }
    assert len(coordinates) == expected_count
    assert (0, 1) not in coordinates


@pytest.mark.parametrize("algorithm_type", ["加減版路", "合值版路"])
def test_e_16_locked_condition_is_not_an_arithmetic_reference(algorithm_type: str) -> None:
    with pytest.raises(ValueError, match="鎖定條件本身不屬於加減或合值驗證範圍"):
        _parse_request(explore_request(
            algorithmType=algorithm_type,
            referenceOffset=0,
            referencePosition=1,
        ))


def test_e_16_reference_at_or_after_result_is_invalid() -> None:
    with pytest.raises(ValueError, match="參照期不得等於或晚於預測期"):
        _parse_request(explore_request(referenceOffset=3, predictionDistance=3))


def test_e_17_same_complete_addition_rule_accumulates_streak() -> None:
    groups = [{"candidateMap": {"加減:8": [4]}} for _ in range(4)]
    assert _streak(groups, ["加減:8"]) == 4


def test_e_18_fantasy5_35_plus_8_wraps_to_04() -> None:
    assert apply_explore_rule("加減", 35, 8, 39) == 4


def test_e_19_fantasy5_39_plus_1_wraps_to_01() -> None:
    assert apply_explore_rule("加減", 39, 1, 39) == 1


def test_e_20_49_number_lottery_49_plus_1_wraps_to_01() -> None:
    assert apply_explore_rule("加減", 49, 1, 49) == 1


def test_e_21_sum_road_uses_direct_source_plus_result() -> None:
    assert _candidate_rule("合值", 20, 25, 39) == 45
    assert apply_explore_rule("合值", 20, 45, 39) == 25


def test_e_22_sum_road_is_not_reduced_to_digit_sum() -> None:
    assert _candidate_rule("合值", 31, 19, 39) == 50


def test_e_23_zero_addition_from_non_locked_reference_is_not_drag() -> None:
    group = _build_group(
        [draw("S", [10, 20, 30, 35, 39]), draw("P", [1, 2, 3, 4, 20])],
        0,
        _parse_request(explore_request(referencePosition=2)),
        "B",
    )
    assert group is not None
    assert set(key for key in group["candidateMap"] if key.endswith(":0")) == {"加減:0"}


@pytest.mark.parametrize("algorithm_type", ["加減", "拖牌"])
@pytest.mark.parametrize("maximum", [39, 49])
def test_e_23_addition_and_drag_both_accept_and_display_zero(
    algorithm_type: str,
    maximum: int,
) -> None:
    assert _candidate_rule(algorithm_type, 7, 7, maximum) == 0
    assert apply_explore_rule(algorithm_type, 7, 0, maximum) == 7
    assert explore._rule_label(algorithm_type, 0) == "+0"


def test_e_24_ready4_locked_one_number_allows_one_rule_only() -> None:
    options = automatic_options(hitCondition="準4+（鎖定1碼）")
    options.pop("ruleCount")
    result = run_matrix_automatic_explore_with_history(options, [])
    assert result["searchCondition"]["ruleCount"] == 1
    conflicting = run_matrix_automatic_explore_with_history(automatic_options(
        hitCondition="準4+（鎖定1碼）", ruleCount=2,
    ), [])
    assert conflicting["searchCondition"]["ruleCount"] == 1


def test_e_25_ready5_locked_two_numbers_allows_two_rules_only() -> None:
    options = automatic_options(hitCondition="準5+（鎖定2碼）")
    options.pop("ruleCount")
    result = run_matrix_automatic_explore_with_history(options, [])
    assert result["searchCondition"]["ruleCount"] == 2
    conflicting = run_matrix_automatic_explore_with_history(automatic_options(
        hitCondition="準5+（鎖定2碼）", ruleCount=1,
    ), [])
    assert conflicting["searchCondition"]["ruleCount"] == 2


def test_e_26_three_or_more_rules_covering_same_level_invalidates_result() -> None:
    history = [
        draw("A", [10, 23, 32, 33, 34]), draw("P3", [1, 2, 3, 11, 12]),
        draw("S3", [10, 22, 32, 33, 34]), draw("P2", [4, 5, 6, 11, 12]),
        draw("S2", [10, 21, 32, 33, 34]), draw("P1", [7, 8, 9, 11, 12]),
        draw("S1", [10, 20, 32, 33, 34]),
    ]
    result = run_matrix_algorithm_with_history(explore_request(ruleCount=2), history)
    assert result["valid"] is False
    assert len(result["conflictingRules"]) > 2


def test_e_26_locked_one_code_starts_only_from_b_c_intersection() -> None:
    groups = [
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:2": [2]}},
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:2": [2]}},
    ]

    found = explore._highest_rule_sets(groups, 1)

    assert found["highest"] == 0
    assert found["sets"] == []


def test_e_26_locked_two_code_can_add_a_single_middle_value_after_common_b_c_value() -> None:
    groups = [
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:1": [1], "加減:2": [2]}},
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:1": [1]}},
    ]

    found = explore._highest_rule_sets(groups, 2)

    assert found["highest"] == 5
    assert found["sets"] == [["加減:1", "加減:2"]]


def test_e_26_locked_two_code_pool_can_extend_disjoint_b_c_values() -> None:
    groups = [
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:2": [2]}},
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:2": [2]}},
        {"candidateMap": {"加減:1": [1]}},
    ]

    found = explore._highest_rule_sets(groups, 2)

    assert found["highest"] == 5
    assert found["sets"] == [["加減:1", "加減:2"]]


def test_e_26_locked_two_code_values_are_sorted_numerically() -> None:
    groups = [
        {"candidateMap": {"加減:2": [2], "加減:10": [10]}},
        {"candidateMap": {"加減:2": [2], "加減:10": [10]}},
        {"candidateMap": {"加減:2": [2], "加減:10": [10]}},
        {"candidateMap": {"加減:2": [2], "加減:10": [10]}},
        {"candidateMap": {"加減:2": [2], "加減:10": [10]}},
    ]

    found = explore._highest_rule_sets(groups, 2)

    assert found["sets"] == [["加減:2", "加減:10"]]


@pytest.mark.parametrize("algorithm_type", ["加減", "合值", "拖牌"])
def test_e_26_more_than_two_intermediate_pairs_can_finish_as_two_valid_results(
    algorithm_type: str,
) -> None:
    key = lambda value: f"{algorithm_type}:{value}"
    groups = [
        {"candidateMap": {key(1): [1], key(2): [2], key(4): [4]}},
        {"candidateMap": {key(3): [3]}},
        {"candidateMap": {key(1): [1], key(2): [2]}},
        {"candidateMap": {key(3): [3]}},
        {"candidateMap": {key(1): [1], key(2): [2]}},
    ]

    found = explore._highest_rule_sets(groups, 2)

    assert found["highest"] == 5
    assert found["sets"] == [[key(1), key(3)], [key(2), key(3)]]
    assert found["invalidMultipleRules"] is False


@pytest.mark.parametrize("algorithm_type", ["加減", "合值", "拖牌"])
def test_e_26_three_final_pairs_at_same_longest_streak_invalidate_whole_road(
    algorithm_type: str,
) -> None:
    key = lambda value: f"{algorithm_type}:{value}"
    groups = [
        {"candidateMap": {key(1): [1], key(2): [2], key(4): [4]}},
        {"candidateMap": {key(3): [3]}},
        {"candidateMap": {key(1): [1], key(2): [2], key(4): [4]}},
        {"candidateMap": {key(3): [3]}},
        {"candidateMap": {key(1): [1], key(2): [2], key(4): [4]}},
    ]

    found = explore._highest_rule_sets(groups, 2)

    assert found["highest"] == 5
    assert found["sets"] == [
        [key(1), key(3)],
        [key(2), key(3)],
        [key(3), key(4)],
    ]
    assert found["invalidMultipleRules"] is True


def test_e_26_each_locked_one_code_rule_is_a_separate_result(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def evaluated(request: dict, *_args: object) -> dict:
        if request["ruleCount"] == 2:
            return {"valid": False, "results": []}
        return {
            "valid": True,
            "highestStreak": 4,
            "displayStreak": "準4進5",
            "sourceA": {"baseNumber": 1},
            "results": [
                {
                    "rules": [{"algorithmType": "拖牌", "value": 1, "display": "+1"}],
                    "predictionNumbers": [2],
                    "historicalValidation": [],
                },
                {
                    "rules": [{"algorithmType": "拖牌", "value": 2, "display": "+2"}],
                    "predictionNumbers": [3],
                    "historicalValidation": [],
                },
            ],
        }

    monkeypatch.setattr(explore, "_evaluate_prepared", evaluated)
    result = run_matrix_explore_group_with_history({
        "lottery": "今彩539",
        "numberOrder": "依號碼由小到大排序",
        "algorithmType": "拖牌",
        "lockedSourceIndex": 0,
        "lockedPosition": 1,
        "exploreDateOffset": 0,
        "predictionDistance": 1,
        "exploreRange": "完整範圍",
    }, [draw("latest", [1, 2, 3, 4, 5])])

    assert len(result["results"]) == 2
    assert {tuple(item["predictionNumbers"]) for item in result["results"]} == {("02",), ("03",)}
    assert all(len(item["ruleSets"]) == 1 for item in result["results"])


def test_e_27_rule_with_one_middle_hit_can_form_two_rule_result() -> None:
    groups = [
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:1": [1], "加減:2": [2]}},
        {"candidateMap": {"加減:1": [1]}},
    ]
    assert _coverage(groups, ["加減:1", "加減:2"], 3)["valid"] is True


def test_e_28_rule_with_only_edge_hit_cannot_form_two_rule_result() -> None:
    groups = [
        {"candidateMap": {"加減:1": [1], "加減:2": [2]}},
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:1": [1]}},
    ]
    assert _coverage(groups, ["加減:1", "加減:2"], 3)["valid"] is False


def test_e_29_streak_stops_at_first_failed_group() -> None:
    groups = [
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {}},
        {"candidateMap": {"加減:1": [1]}},
        {"candidateMap": {"加減:1": [1]}},
    ]
    assert _streak(groups, ["加減:1"]) == 2


def test_e_30_opened_prediction_for_a_stays_out_of_historical_streak() -> None:
    history = [draw("A_RESULT", [1, 2, 3, 4, 25]), draw("A", [10, 20, 30, 35, 39])]
    for index in range(4, 0, -1):
        history.extend([
            draw(f"P{index}", [1, 2, 3, 4, 25]),
            draw(f"S{index}", [10, 20, 30, 35, 39]),
        ])
    result = run_matrix_algorithm_with_history(explore_request(), history)
    periods = [row["predictionPeriod"] for row in result["results"][0]["historicalValidation"]]
    assert result["sourceA"]["predictionPeriod"] == "A_RESULT"
    assert "A_RESULT" not in periods


# Matrix 天工 T-01 ～ T-28


def test_t_01_fifty_period_range_limits_equal_spacing_sources() -> None:
    sequences = enumerate_equal_spacing_sequences(50, "準2進3")
    assert sequences and max(max(sequence) for sequence in sequences) <= 50
    assert [1, 25, 49] in sequences


def test_t_02_eighty_period_range_limits_equal_spacing_sources() -> None:
    sequences = enumerate_equal_spacing_sequences(80, "準2進3")
    assert sequences and max(max(sequence) for sequence in sequences) <= 80
    assert [1, 40, 79] in sequences


def test_t_03_source_range_does_not_truncate_other_history_references() -> None:
    positions = enumerate_reference_positions(50, 5, 100)
    assert 64 in positions


def test_t_04_source_interval_and_prediction_distance_are_independent() -> None:
    result = evaluate_tiangong_candidate(candidate(
        sourceSequence=[5, 12, 19],
        firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 2, "nextN": 5},
    ))
    assert (result["valid"], result["interval"], result["predictionDistance"]) == (True, 7, 1)


def test_t_05_large_valid_next_n_uses_prediction_position_not_a_fixed_short_limit() -> None:
    history = [draw(str(200 - index), [1, 2, 3, 4, 5]) for index in range(80)]
    candidates = run_tiangong_candidates("今彩539", history, {
        "periodRanges": [50], "modes": ["one-stage"], "hitConditions": ["準2進3"],
        "sourceSequences": [[40, 45, 50]], "referenceOffsets": [0],
        "explorePaths": [fixed(1, 3)], "firstStagePaths": [fixed(1, 3)],
        "firstStageDistances": [44],
    })
    assert candidates
    assert {item["firstStage"]["nextN"] for item in candidates} == {44}
    assert {evaluate_tiangong_candidate(item)["predictionDistance"] for item in candidates} == {5}


def test_t_06_one_stage_ready2_validates_two_groups_and_predicts_third() -> None:
    candidates = run_tiangong_candidates("今彩539", one_stage_history(), one_stage_options())
    item = next(value for value in candidates if value["firstStage"]["algorithmType"] == "加減" and value["firstStage"]["value"] == 5)
    assert [row["role"] for row in item["validationRows"]] == ["first-stage-evidence", "first-stage-evidence", "prediction"]


def test_t_07_ready3_to_ready4_is_rejected_everywhere() -> None:
    with pytest.raises(ValueError, match="INVALID_HIT_CONDITION"):
        enumerate_equal_spacing_sequences(50, "準3進4")
    assert evaluate_tiangong_candidate(candidate(
        sourceSequence=[1, 3, 5, 7], hitCondition="準3進4",
    ))["valid"] is False
    assert evaluate_tiangong_candidate(candidate(
        sourceSequence=[1, 3, 5], hitCondition="準3進4",
    ))["valid"] is False
    generator_options = one_stage_options()
    generator_options.pop("hitConditions")
    default_results = run_tiangong_candidates("今彩539", one_stage_history(), generator_options)
    assert default_results
    assert all(item["hitCondition"] == "準2進3" for item in default_results)
    try:
        explicit_results = run_tiangong_candidates(
            "今彩539", one_stage_history(), {**generator_options, "hitConditions": ["準3進4"]},
        )
    except ValueError as error:
        assert "INVALID_HIT_CONDITION" in str(error)
    else:
        assert explicit_results == []


def test_t_08_any_failed_one_stage_validation_rejects_candidate() -> None:
    changed = one_stage_history()
    changed[6] = draw("114227", [20, 18, 22, 23, 24])
    assert run_tiangong_candidates("今彩539", changed, one_stage_options()) == []


def test_t_09_two_stage_first_stage_validates_all_three_groups() -> None:
    item = run_tiangong_candidates("今彩539", two_stage_history(), two_stage_options())[0]
    assert [row["role"] for row in item["validationRows"]].count("first-stage-evidence") == 3


def test_t_10_two_stage_second_stage_validates_two_then_predicts_third() -> None:
    item = run_tiangong_candidates("今彩539", two_stage_history(), two_stage_options())[0]
    roles = [row["role"] for row in item["validationRows"]]
    assert roles.count("second-stage-validation") == 2
    assert roles.count("prediction") == 1


def test_t_11_failed_first_stage_group_rejects_entire_two_stage_candidate() -> None:
    changed = two_stage_history()
    changed[17] = draw("114216", [1, 2, 30, 4, 5])
    assert run_tiangong_candidates("今彩539", changed, two_stage_options()) == []


def test_t_12_failed_second_stage_validation_prevents_prediction() -> None:
    changed = two_stage_history()
    changed[7] = draw("114226", [1, 2, 3, 4, 37])
    assert run_tiangong_candidates("今彩539", changed, two_stage_options()) == []


def test_t_13_fixed_position_path_uses_same_position_for_every_group() -> None:
    assert fixed(3, 3) in enumerate_position_paths(5, 3)


def test_t_14_increasing_position_path_adds_one_each_group() -> None:
    assert {"startPosition": 2, "direction": "依序遞增", "positionsOldestToNewest": [2, 3, 4]} in enumerate_position_paths(5, 3)


def test_t_15_decreasing_position_path_subtracts_one_each_group() -> None:
    assert {"startPosition": 4, "direction": "依序遞減", "positionsOldestToNewest": [4, 3, 2]} in enumerate_position_paths(5, 3)


def test_t_16_one_stage_has_nine_direction_combinations() -> None:
    paths = [
        fixed(1, 3),
        {"startPosition": 1, "direction": "依序遞增", "positionsOldestToNewest": [1, 2, 3]},
        {"startPosition": 3, "direction": "依序遞減", "positionsOldestToNewest": [3, 2, 1]},
    ]
    candidates = run_tiangong_candidates("今彩539", [draw(str(100 - index), [1, 1, 1, 1, 1]) for index in range(30)], {
        "periodRanges": [50], "modes": ["one-stage"], "hitConditions": ["準2進3"],
        "sourceSequences": [[5, 12, 19]], "referenceOffsets": [0],
        "explorePaths": paths, "firstStagePaths": paths, "firstStageDistances": [5],
    })
    variants = {(item["exploreDirection"], item["firstStage"]["direction"]) for item in candidates}
    assert len(variants) == 9


def test_t_17_two_stage_has_twenty_seven_direction_combinations() -> None:
    paths = [
        fixed(1, 3),
        {"startPosition": 1, "direction": "依序遞增", "positionsOldestToNewest": [1, 2, 3]},
        {"startPosition": 3, "direction": "依序遞減", "positionsOldestToNewest": [3, 2, 1]},
    ]
    candidates = run_tiangong_candidates("今彩539", [draw(str(100 - index), [1, 1, 1, 1, 1]) for index in range(30)], {
        "periodRanges": [50], "modes": ["two-stage"], "hitConditions": ["準2進3"],
        "sourceSequences": [[14, 18, 22]], "referenceOffsets": [0],
        "explorePaths": paths, "firstStagePaths": paths, "secondStagePaths": paths,
        "firstStageDistances": [9], "secondStageDistances": [5],
    })
    variants = {
        (item["exploreDirection"], item["firstStage"]["direction"], item["secondStage"]["direction"])
        for item in candidates
    }
    assert len(variants) == 27


def test_t_18_out_of_range_position_paths_are_not_enumerated() -> None:
    paths = enumerate_position_paths(5, 3)
    assert all(all(1 <= position <= 5 for position in path["positionsOldestToNewest"]) for path in paths)


def test_t_19_tiangong_uses_draw_order_only_and_never_resorts() -> None:
    normalized = _normalize_history("今彩539", [draw("1", [1, 2, 3, 4, 5], draw_order=[5, 1, 4, 2, 3])])
    assert normalized[0]["numbers"] == [5, 1, 4, 2, 3]


def test_t_20_same_addition_rule_is_used_across_stage_validations() -> None:
    candidates = run_tiangong_candidates("今彩539", one_stage_history(), one_stage_options())
    item = next(value for value in candidates if value["firstStage"]["algorithmType"] == "加減" and value["firstStage"]["value"] == 5)
    assert {row["firstStage"]["value"] for row in item["validationRows"]} == {5}


def test_t_21_tiangong_zero_addition_can_be_valid() -> None:
    result = evaluate_tiangong_candidate(candidate(
        firstStage={"startPosition": 1, "direction": "固定", "algorithmType": "加減", "value": 0, "nextN": 1},
    ))
    assert result["valid"] is True


def test_t_22_plus32_and_minus7_are_one_rule_not_duplicates() -> None:
    add_rules = [rule for rule in derive_tiangong_rules(23, 16, 39) if rule["algorithmType"] == "加減"]
    assert len(add_rules) == len({rule["value"] % 39 for rule in add_rules}) == 1


def test_t_23_sum_rule_is_direct_and_is_not_cycled() -> None:
    sum_rules = [rule["value"] for rule in derive_tiangong_rules(23, 12, 39) if rule["algorithmType"] == "合值"]
    assert sum_rules == [35]


def test_t_24_one_stage_accepts_addition_or_sum_road() -> None:
    roads = set()
    for algorithm, value in [("加減", 5), ("合值", 25)]:
        result = evaluate_tiangong_candidate(candidate(
            firstStage={"startPosition": 1, "direction": "固定", "algorithmType": algorithm, "value": value, "nextN": 1},
        ))
        assert result["valid"] is True
        roads.add(result["roadType"])
    assert roads == {"加減版路", "合值版路"}


def test_t_25_each_two_stage_road_can_independently_be_addition_or_sum() -> None:
    road_types = set()
    for first, second in product([("加減", 5), ("合值", 25)], repeat=2):
        result = evaluate_tiangong_candidate(candidate(
            mode="two-stage",
            firstStage={"startPosition": 1, "direction": "固定", "algorithmType": first[0], "value": first[1], "nextN": 1},
            secondStage={"startPosition": 1, "direction": "固定", "algorithmType": second[0], "value": second[1], "nextN": 1},
        ))
        assert result["valid"] is True
        road_types.add(result["roadType"])
    assert road_types == {"加減版路", "加減＋合值", "合值＋加減", "合值版路"}


def test_t_26_example_seven_uses_114225_second_ball_09() -> None:
    options = {
        "periodRanges": [50], "modes": ["one-stage"], "hitConditions": ["準2進3"],
        "sourceSequences": [[13, 22, 31]], "referenceOffsets": [0],
        "explorePaths": [fixed(3, 3)], "firstStagePaths": [fixed(2, 3)], "firstStageDistances": [13],
    }
    candidates = run_tiangong_candidates("今彩539", CORRECTED_HISTORY, options)
    item = next(value for value in candidates if value["firstStage"]["algorithmType"] == "加減" and value["firstStage"]["value"] == 20)
    row = next(value for value in item["validationRows"] if value["resultPeriod"] == "114225")
    assert (row["firstStage"]["position"], row["firstStage"]["actualNumber"], row["firstStage"]["value"]) == (2, 9, 20)


def test_t_27_example_nine_third_group_uses_sum_35() -> None:
    options = {
        "periodRanges": [50], "modes": ["one-stage"], "hitConditions": ["準2進3"],
        "sourceSequences": [[17, 21, 25]], "referenceOffsets": [0],
        "explorePaths": [fixed(4, 3)],
        "firstStagePaths": [{"startPosition": 4, "direction": "依序遞減", "positionsOldestToNewest": [4, 3, 2]}],
        "firstStageDistances": [17],
    }
    candidates = run_tiangong_candidates("今彩539", CORRECTED_HISTORY, options)
    item = next(value for value in candidates if value["firstStage"]["algorithmType"] == "合值" and value["firstStage"]["value"] == 35)
    row = next(value for value in item["validationRows"] if value["resultPeriod"] == "114230")
    assert (row["firstStage"]["position"], row["firstStage"]["actualNumber"], row["firstStage"]["value"]) == (3, 12, 35)


def test_t_28_example_twelve_third_group_uses_plus11() -> None:
    options = {
        "periodRanges": [50], "modes": ["one-stage"], "hitConditions": ["準2進3"],
        "sourceSequences": [[6, 11, 16]], "referenceOffsets": [0],
        "explorePaths": [fixed(5, 3)],
        "firstStagePaths": [{"startPosition": 3, "direction": "依序遞減", "positionsOldestToNewest": [3, 2, 1]}],
        "firstStageDistances": [6],
    }
    candidates = run_tiangong_candidates("今彩539", CORRECTED_HISTORY, options)
    item = next(value for value in candidates if value["firstStage"]["algorithmType"] == "加減" and value["firstStage"]["value"] == 11)
    row = next(value for value in item["validationRows"] if value["resultPeriod"] == "114229")
    assert (row["firstStage"]["position"], row["firstStage"]["actualNumber"], row["firstStage"]["value"]) == (2, 8, 11)
