import pytest

from app.domain.tiangong import enumerate_equal_spacing_sequences, evaluate_tiangong_candidate
from app.domain.tiangong_generator import (
    derive_tiangong_rules, enumerate_position_paths, enumerate_reference_positions,
    result_position, run_tiangong_candidates,
)


def _draw(period: int, numbers: list[int]) -> dict:
    return {"period": str(period), "drawDate": "", "numbers": [str(value).zfill(2) for value in numbers]}


def _fixed(position: int, length: int) -> dict:
    return {"startPosition": position, "direction": "固定", "positionsOldestToNewest": [position] * length}


def _two_stage_history() -> list[dict]:
    history = [_draw(114233 - index, [1, 2, 3, 4, 5]) for index in range(30)]
    replacements = [(22, [1, 24, 3, 4, 5]), (18, [1, 2, 29, 4, 5]),
                    (14, [1, 2, 3, 28, 5]), (13, [1, 2, 26, 4, 5]),
                    (9, [1, 2, 3, 21, 5]), (5, [1, 2, 3, 4, 22]),
                    (8, [1, 2, 3, 4, 38]), (4, [1, 2, 3, 4, 33])]
    for position, numbers in replacements:
        history[position - 1] = _draw(114234 - position, numbers)
    return history


def test_generator_primitives_match_matrix_rules() -> None:
    assert [result_position(value, 5) for value in [19, 12, 5]] == [14, 7, 0]
    assert {"startPosition": 3, "direction": "依序遞增", "positionsOldestToNewest": [3, 4, 5]} in enumerate_position_paths(5, 3)
    assert derive_tiangong_rules(24, 26, 39) == [
        {"algorithmType": "加減", "value": 2}, {"algorithmType": "合值", "value": 50},
    ]
    assert enumerate_reference_positions(5, 5, 20) == [*range(6, 20), 5, 4, 3, 2, 1]


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


def test_generator_rejects_ready3_to_ready4() -> None:
    with pytest.raises(ValueError, match="INVALID_HIT_CONDITION"):
        run_tiangong_candidates("今彩539", _two_stage_history(), {
            "periodRanges": [50], "modes": ["two-stage"], "hitConditions": ["準3進4"],
        })


def test_tiangong_work_units_only_generate_two_stage_ready2() -> None:
    units = enumerate_equal_spacing_sequences(80, "準2進3")

    assert len(units) == 533


def test_generator_rejects_removed_one_stage_mode() -> None:
    with pytest.raises(ValueError, match="INVALID_TIANGONG_MODE"):
        run_tiangong_candidates("今彩539", _two_stage_history(), {
            "periodRanges": [50], "modes": ["one-stage"],
            "hitConditions": ["準2進3"],
        })


def test_two_stage_ready2_excludes_a_road_that_also_passes_the_previous_group() -> None:
    history = _two_stage_history()
    history[25] = _draw(114208, [20, 2, 3, 4, 5])
    history[16] = _draw(114217, [1, 30, 3, 4, 5])
    history[11] = _draw(114222, [1, 2, 3, 4, 3])
    options = {
        "periodRanges": [50], "modes": ["two-stage"],
        "hitConditions": ["準2進3"],
        "sourceSequences": [[14, 18, 22]], "referenceOffsets": [0],
        "explorePaths": [{
            "startPosition": 2, "direction": "依序遞增",
            "positionsOldestToNewest": [2, 3, 4],
        }],
        "firstStagePaths": [{
            "startPosition": 3, "direction": "依序遞增",
            "positionsOldestToNewest": [3, 4, 5],
        }],
        "secondStagePaths": [_fixed(5, 3)],
        "firstStageDistances": [9], "secondStageDistances": [5],
    }

    assert run_tiangong_candidates("今彩539", history, options) == []


def test_two_stage_ready2_keeps_a_road_when_the_previous_group_fails() -> None:
    history = _two_stage_history()
    history[25] = _draw(114208, [20, 2, 3, 4, 5])
    history[16] = _draw(114217, [1, 30, 3, 4, 5])
    history[11] = _draw(114222, [1, 2, 3, 4, 4])
    options = {
        "periodRanges": [50], "modes": ["two-stage"],
        "hitConditions": ["準2進3"],
        "sourceSequences": [[14, 18, 22]], "referenceOffsets": [0],
        "explorePaths": [{
            "startPosition": 2, "direction": "依序遞增",
            "positionsOldestToNewest": [2, 3, 4],
        }],
        "firstStagePaths": [{
            "startPosition": 3, "direction": "依序遞增",
            "positionsOldestToNewest": [3, 4, 5],
        }],
        "secondStagePaths": [_fixed(5, 3)],
        "firstStageDistances": [9], "secondStageDistances": [5],
    }

    candidates = run_tiangong_candidates("今彩539", history, options)

    assert len(candidates) == 1
    assert candidates[0]["mode"] == "two-stage"


def test_two_stage_ready2_is_kept_when_the_previous_group_fails_first_stage() -> None:
    history = _two_stage_history()
    history[25] = _draw(114208, [20, 2, 3, 4, 5])
    history[16] = _draw(114217, [1, 31, 3, 4, 5])
    history[11] = _draw(114222, [1, 2, 3, 4, 3])
    options = {
        "periodRanges": [50], "modes": ["two-stage"],
        "hitConditions": ["準2進3"],
        "sourceSequences": [[14, 18, 22]], "referenceOffsets": [0],
        "explorePaths": [{
            "startPosition": 2, "direction": "依序遞增",
            "positionsOldestToNewest": [2, 3, 4],
        }],
        "firstStagePaths": [{
            "startPosition": 3, "direction": "依序遞增",
            "positionsOldestToNewest": [3, 4, 5],
        }],
        "secondStagePaths": [_fixed(5, 3)],
        "firstStageDistances": [9], "secondStageDistances": [5],
    }

    candidates = run_tiangong_candidates("今彩539", history, options)

    assert len(candidates) == 1


def test_two_stage_ready2_requires_history_for_the_previous_group_check() -> None:
    options = {
        "periodRanges": [50], "modes": ["two-stage"],
        "hitConditions": ["準2進3"],
        "sourceSequences": [[14, 18, 22]], "referenceOffsets": [0],
        "explorePaths": [{
            "startPosition": 2, "direction": "依序遞增",
            "positionsOldestToNewest": [2, 3, 4],
        }],
        "firstStagePaths": [{
            "startPosition": 3, "direction": "依序遞增",
            "positionsOldestToNewest": [3, 4, 5],
        }],
        "secondStagePaths": [_fixed(5, 3)],
        "firstStageDistances": [9], "secondStageDistances": [5],
    }

    assert run_tiangong_candidates(
        "今彩539", _two_stage_history()[:25], options,
    ) == []
