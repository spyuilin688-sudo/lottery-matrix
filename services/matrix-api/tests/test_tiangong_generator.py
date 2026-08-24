from app.domain.tiangong import evaluate_tiangong_candidate
from app.domain.tiangong_generator import (
    derive_tiangong_rules, enumerate_position_paths, enumerate_reference_positions,
    result_position, run_tiangong_candidates,
)


def _draw(period: int, numbers: list[int]) -> dict:
    return {"period": str(period), "drawDate": "", "numbers": [str(value).zfill(2) for value in numbers]}


def _fixed(position: int, length: int) -> dict:
    return {"startPosition": position, "direction": "固定", "positionsOldestToNewest": [position] * length}


def _one_stage_history() -> list[dict]:
    history = [_draw(114233 - index, [30, 31, 32, 33, 34]) for index in range(20)]
    for position, numbers in [(19, [10, 21, 22, 23, 24]), (14, [20, 15, 22, 23, 24]),
                              (12, [11, 21, 22, 23, 24]), (7, [20, 16, 22, 23, 24]),
                              (5, [12, 21, 22, 23, 24])]:
        history[position - 1] = _draw(114234 - position, numbers)
    return history


def _two_stage_history() -> list[dict]:
    history = [_draw(114233 - index, [1, 2, 3, 4, 5]) for index in range(30)]
    replacements = [(22, [1, 24, 3, 4, 5]), (18, [1, 2, 29, 4, 5]),
                    (14, [1, 2, 3, 28, 5]), (13, [1, 2, 26, 4, 5]),
                    (9, [1, 2, 3, 21, 5]), (5, [1, 2, 3, 4, 22]),
                    (8, [1, 2, 3, 4, 38]), (4, [1, 2, 3, 4, 33])]
    for position, numbers in replacements:
        history[position - 1] = _draw(114234 - position, numbers)
    return history


def _four_source_history() -> list[dict]:
    history = [_draw(114233 - index, [1, 2, 3, 4, 5]) for index in range(24)]
    for position, ball_position, value in [
        (18, 1, 10), (14, 1, 11), (10, 1, 12), (6, 1, 13),
        (15, 2, 15), (11, 2, 16), (7, 2, 17), (3, 2, 18),
        (11, 3, 22), (7, 3, 23), (3, 3, 24),
    ]:
        numbers = [int(number) for number in history[position - 1]["numbers"]]
        numbers[ball_position - 1] = value
        history[position - 1] = _draw(114234 - position, numbers)
    return history


def test_generator_primitives_match_matrix_rules() -> None:
    assert [result_position(value, 5) for value in [19, 12, 5]] == [14, 7, 0]
    assert {"startPosition": 3, "direction": "依序遞增", "positionsOldestToNewest": [3, 4, 5]} in enumerate_position_paths(5, 3)
    assert derive_tiangong_rules(24, 26, 39) == [
        {"algorithmType": "加減", "value": -37}, {"algorithmType": "加減", "value": 2},
        {"algorithmType": "加減", "value": 41}, {"algorithmType": "合值", "value": 11},
        {"algorithmType": "合值", "value": 50}, {"algorithmType": "合值", "value": 89},
    ]
    assert enumerate_reference_positions(5, 5, 20) == [*range(6, 20), 5, 4, 3, 2, 1]


def test_one_stage_search_validates_history_and_predicts_a() -> None:
    options = {
        "periodRanges": [50], "modes": ["one-stage"], "hitConditions": ["準2進3"],
        "sourceSequences": [[5, 12, 19]], "referenceOffsets": [0],
        "explorePaths": [_fixed(1, 3)], "firstStagePaths": [_fixed(2, 3)], "firstStageDistances": [5],
    }
    candidates = run_tiangong_candidates("今彩539", _one_stage_history(), options)
    candidate = next(item for item in candidates if item["firstStage"]["algorithmType"] == "加減" and item["firstStage"]["value"] == 5)
    result = evaluate_tiangong_candidate(candidate)
    assert (result["valid"], result["interval"], result["predictionDistance"], result["predictedPosition"], result["predictionNumber"]) == (True, 7, 1, 2, "17")
    assert [(row["group"], row["role"], row["resultPeriod"]) for row in candidate["validationRows"]] == [
        ("C", "first-stage-evidence", "114220"), ("B", "first-stage-evidence", "114227"), ("A", "prediction", "114234")]
    changed = _one_stage_history()
    changed[6] = _draw(114227, [20, 18, 22, 23, 24])
    assert run_tiangong_candidates("今彩539", changed, options) == []


def test_two_stage_search_keeps_independent_distances() -> None:
    candidates = run_tiangong_candidates("今彩539", _two_stage_history(), {
        "periodRanges": [50], "modes": ["two-stage"], "hitConditions": ["準2進3"],
        "sourceSequences": [[14, 18, 22]], "referenceOffsets": [0],
        "explorePaths": [{"startPosition": 2, "direction": "依序遞增", "positionsOldestToNewest": [2, 3, 4]}],
        "firstStagePaths": [{"startPosition": 3, "direction": "依序遞增", "positionsOldestToNewest": [3, 4, 5]}],
        "secondStagePaths": [_fixed(5, 3)], "firstStageDistances": [9], "secondStageDistances": [5],
    })
    candidate = next(item for item in candidates if item["firstStage"]["algorithmType"] == "合值" and item["firstStage"]["value"] == 50 and item["secondStage"]["algorithmType"] == "加減" and item["secondStage"]["value"] == 12)
    result = evaluate_tiangong_candidate(candidate)
    assert (result["valid"], result["interval"], result["predictionDistance"], result["predictedPosition"], result["predictionNumber"]) == (True, 4, 1, 5, "34")
    roles = [row["role"] for row in candidate["validationRows"]]
    assert roles.count("first-stage-evidence") == 3
    assert roles.count("second-stage-validation") == 2
    assert roles.count("prediction") == 1


def test_four_source_search_requires_all_three_second_stage_validations() -> None:
    options = {
        "periodRanges": [50], "modes": ["two-stage"], "hitConditions": ["準3進4"],
        "sourceSequences": [[6, 10, 14, 18]], "referenceOffsets": [0],
        "explorePaths": [_fixed(1, 4)], "firstStagePaths": [_fixed(2, 4)],
        "secondStagePaths": [_fixed(3, 4)], "firstStageDistances": [3], "secondStageDistances": [4],
    }
    candidates = run_tiangong_candidates("今彩539", _four_source_history(), options)
    candidate = next(item for item in candidates if item["firstStage"]["algorithmType"] == "加減" and item["firstStage"]["value"] == 5 and item["secondStage"]["algorithmType"] == "加減" and item["secondStage"]["value"] == 7)
    roles = [row["role"] for row in candidate["validationRows"]]
    assert roles.count("first-stage-evidence") == 4
    assert roles.count("second-stage-validation") == 3
    assert roles.count("prediction") == 1

    changed = _four_source_history()
    numbers = [int(number) for number in changed[2]["numbers"]]
    numbers[1] = 19
    changed[2] = _draw(114231, numbers)
    assert run_tiangong_candidates("今彩539", changed, options) == []
