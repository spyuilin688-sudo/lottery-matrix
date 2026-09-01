import pytest

from app.domain.explore_v2 import (
    INVALID_MORE_THAN_TWO_LONGEST,
    INVALID_ONE_CODE_MAXIMUM,
    INVALID_SINGLE_USE_ENDPOINT,
    INVALID_TWO_CODE_MAXIMUM,
    evaluate_one_code,
    evaluate_two_code,
)


def _repeated_groups(values: set[int], length: int) -> list[set[int]]:
    return [set(values) for _ in range(length)]


@pytest.mark.parametrize("length", [4, 5, 6, 7])
def test_one_code_accepts_only_legal_streaks(length: int) -> None:
    decision = evaluate_one_code(_repeated_groups({5}, length))

    assert decision.valid
    assert decision.highest_streak == length
    assert decision.rules == (5,)
    assert decision.matched_group_indexes == tuple(range(length))


def test_one_code_rejects_no_b_c_intersection() -> None:
    decision = evaluate_one_code([{1}, {2}, {1}, {1}])

    assert not decision.valid
    assert decision.highest_streak == 0


def test_one_code_rejects_eight_or_more_without_truncating_to_seven() -> None:
    decision = evaluate_one_code(_repeated_groups({5}, 20))

    assert not decision.valid
    assert decision.highest_streak == 8
    assert decision.reason == INVALID_ONE_CODE_MAXIMUM


def test_one_code_invalidates_more_than_two_true_equal_longest_values() -> None:
    decision = evaluate_one_code(_repeated_groups({1, 2, 3}, 5))

    assert not decision.valid
    assert decision.highest_streak == 5
    assert decision.rules == (1, 2, 3)
    assert decision.reason == INVALID_MORE_THAN_TWO_LONGEST


def test_one_code_waits_for_complete_extension_before_counting_longest_values() -> None:
    decision = evaluate_one_code([{1, 2, 3}, {1, 2, 3}, {1, 2, 3}, {1, 2}, {1}])

    assert decision.valid
    assert decision.highest_streak == 5
    assert decision.rules == (1,)


def test_two_code_accepts_first_common_value_from_b_and_c() -> None:
    decision = evaluate_two_code([{10}, {10}, {10, 24}, {10}, {10}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 5


def test_two_code_keeps_b_and_c_pool_until_d_forms_first_common_value() -> None:
    decision = evaluate_two_code([{10}, {24}, {10}, {10}, {24}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 5


def test_second_rule_may_first_appear_at_f() -> None:
    decision = evaluate_two_code([{10, 24}, {10}, {10}, {10}, {10, 24}, {10}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 6


def test_two_fixed_rules_do_not_expand_a_new_pair_later() -> None:
    decision = evaluate_two_code([{10, 24}, {10}, {10, 24}, {10, 30}, {10}])

    assert decision.valid
    assert decision.rules == (10, 24)
    assert decision.highest_streak == 5


def test_two_code_rejects_when_second_rule_never_forms() -> None:
    decision = evaluate_two_code(_repeated_groups({10}, 11))

    assert not decision.valid
    assert decision.rules == ()


def test_two_hits_in_one_group_count_as_one_streak() -> None:
    decision = evaluate_two_code([{10}, {24}, {10, 24}, {10}, {24}])

    assert decision.valid
    assert decision.highest_streak == 5
    assert decision.matched_group_indexes == (0, 1, 2, 3, 4)


def test_more_than_two_equal_longest_values_invalidates_whole_road() -> None:
    decision = evaluate_two_code(_repeated_groups({10, 15, 20}, 5))

    assert not decision.valid
    assert decision.reason == INVALID_MORE_THAN_TWO_LONGEST
    assert decision.rules == (10, 15, 20)


def test_two_code_does_not_reject_three_temporary_values_before_full_extension() -> None:
    decision = evaluate_two_code([{1, 2, 3}, {1, 2, 3}, {1, 2, 3}, {1}, {2}])

    assert decision.valid
    assert decision.rules == (1, 2)
    assert decision.highest_streak == 5


@pytest.mark.parametrize("length", [5, 6, 7, 9, 11])
def test_two_code_accepts_exact_legal_streaks(length: int) -> None:
    groups = [{10} if index % 2 == 0 else {24} for index in range(length)]

    decision = evaluate_two_code(groups)

    assert decision.valid
    assert decision.highest_streak == length
    assert decision.rules == (10, 24)


@pytest.mark.parametrize("length", [8, 10])
def test_two_code_rejects_disallowed_internal_streaks(length: int) -> None:
    groups = [{10} if index % 2 == 0 else {24} for index in range(length)]

    decision = evaluate_two_code(groups)

    assert not decision.valid
    assert decision.highest_streak == length


def test_two_code_rejects_twelve_or_more_without_truncating_to_eleven() -> None:
    groups = [{10} if index % 2 == 0 else {24} for index in range(30)]

    decision = evaluate_two_code(groups)

    assert not decision.valid
    assert decision.highest_streak == 12
    assert decision.reason == INVALID_TWO_CODE_MAXIMUM


def test_single_use_rule_is_valid_only_in_the_middle() -> None:
    head = evaluate_two_code([{24}, {10}, {10}, {10}, {10}])
    middle = evaluate_two_code([{10}, {24}, {10}, {10}, {10}])
    tail = evaluate_two_code([{10}, {10}, {10}, {10}, {24}])

    assert not head.valid and head.reason == INVALID_SINGLE_USE_ENDPOINT
    assert middle.valid
    assert not tail.valid and tail.reason == INVALID_SINGLE_USE_ENDPOINT
