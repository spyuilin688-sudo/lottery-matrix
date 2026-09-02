from app.domain.explore_engine import (
    EngineMetrics,
    INVALID_MORE_THAN_TWO_LONGEST,
    INVALID_ONE_CODE_MAXIMUM,
    INVALID_SINGLE_USE_ENDPOINT,
    INVALID_TWO_CODE_MAXIMUM,
    RoadType,
    apply_candidate,
    candidate_value,
    evaluate_one_code,
    evaluate_two_code,
)


def _repeat(values: set[int], count: int) -> list[set[int]]:
    return [set(values) for _ in range(count)]


def test_add_and_drag_allow_zero_rule_value() -> None:
    assert candidate_value(RoadType.ADD, 12, 12, 39) == 0
    assert candidate_value(RoadType.DRAG, 12, 12, 39) == 0
    assert apply_candidate(RoadType.ADD, 12, 0, 39) == 12
    assert apply_candidate(RoadType.DRAG, 12, 0, 39) == 12


def test_one_code_allows_up_to_two_highest_rules_without_pair_split() -> None:
    decision = evaluate_one_code(_repeat({10, 20}, 4))

    assert decision.valid is True
    assert decision.highest_streak == 4
    assert decision.rules == (10, 20)
    assert decision.reason is None
    assert decision.top_rule_sets == ((10, 20),)


def test_one_code_more_than_two_highest_rules_invalidates_cell() -> None:
    decision = evaluate_one_code(_repeat({10, 20, 30}, 4))

    assert decision.valid is False
    assert decision.highest_streak == 4
    assert decision.rules == (10, 20, 30)
    assert decision.reason == INVALID_MORE_THAN_TWO_LONGEST


def test_one_code_eight_or_more_invalidates_without_truncation() -> None:
    decision = evaluate_one_code(_repeat({10}, 20))

    assert decision.valid is False
    assert decision.highest_streak == 8
    assert decision.reason == INVALID_ONE_CODE_MAXIMUM


def test_two_code_b_c_can_have_no_common_value_and_later_form() -> None:
    decision = evaluate_two_code([{10}, {24}, {10}, {10}, {24}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 5


def test_two_code_second_rule_may_first_form_at_f() -> None:
    decision = evaluate_two_code([{10}, {10}, {10}, {10}, {10, 24}, {10}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 6


def test_two_code_f_may_contain_first_and_second_rule_same_occurrence() -> None:
    decision = evaluate_two_code([{10}, {10}, {10}, {10}, {10, 24}, {10}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 6
    assert decision.matched_group_indexes == (0, 1, 2, 3, 4, 5)


def test_two_code_same_occurrence_two_hits_count_once() -> None:
    decision = evaluate_two_code([{10}, {24}, {10, 24}, {10}, {24}])

    assert decision.valid
    assert decision.highest_streak == 5
    assert decision.matched_group_indexes == (0, 1, 2, 3, 4)


def test_two_code_retains_all_top_pairs_before_over_two_rule_check() -> None:
    decision = evaluate_two_code(_repeat({10, 20, 30}, 5))

    assert decision.valid is False
    assert decision.highest_streak == 5
    assert decision.rules == (10, 20, 30)
    assert decision.reason == INVALID_MORE_THAN_TWO_LONGEST
    assert set(decision.top_rule_sets) == {(10, 20), (10, 30), (20, 30)}


def test_two_code_twelve_or_more_invalidates_pair_without_truncation() -> None:
    groups = [{10} if index % 2 == 0 else {24} for index in range(30)]
    decision = evaluate_two_code(groups)

    assert decision.valid is False
    assert decision.highest_streak == 12
    assert decision.reason == INVALID_TWO_CODE_MAXIMUM


def test_two_code_single_use_rule_only_valid_in_middle() -> None:
    head = evaluate_two_code([{24}, {10}, {10}, {10}, {10}])
    middle = evaluate_two_code([{10}, {24}, {10}, {10}, {10}])
    tail = evaluate_two_code([{10}, {10}, {10}, {10}, {24}])

    assert not head.valid and head.reason == INVALID_SINGLE_USE_ENDPOINT
    assert middle.valid
    assert not tail.valid and tail.reason == INVALID_SINGLE_USE_ENDPOINT


def test_two_code_never_performs_global_pair_enumeration() -> None:
    metrics = EngineMetrics()
    evaluate_two_code(
        [
            {1, 2, 3, 4, 5},
            {6, 7, 8, 9, 10},
            {1, 6},
            {1, 6},
            {1, 6},
        ],
        metrics,
    )

    assert metrics.global_pair_enumerations == 0
    assert metrics.max_active_first_states <= 5


def test_two_distinct_rules_can_predict_the_same_number() -> None:
    assert apply_candidate(RoadType.SUM, 20, 25, 39) == 5
    assert apply_candidate(RoadType.SUM, 20, 64, 39) == 5
