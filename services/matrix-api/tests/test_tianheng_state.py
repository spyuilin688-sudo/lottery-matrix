from app.domain.explore_state import evaluate_one_code, evaluate_two_code


def test_tianheng_one_rule_accepts_nine_but_not_eight():
    accepted = evaluate_one_code(
        [{18}] * 9 + [set()],
        eligible_streaks=frozenset({5, 6, 7, 9}),
        invalid_streak=10,
        tier_label="準5+",
    )
    rejected = evaluate_one_code(
        [{18}] * 8 + [set()],
        eligible_streaks=frozenset({5, 6, 7, 9}),
        invalid_streak=10,
        tier_label="準5+",
    )
    assert accepted.valid and accepted.highest_streak == 9
    assert not rejected.valid and rejected.highest_streak == 8


def test_explore_default_still_rejects_eight():
    decision = evaluate_one_code([{18}] * 8)
    assert not decision.valid
    assert decision.highest_streak == 8


def test_tianheng_two_rules_accepts_only_requested_levels():
    decision = evaluate_two_code(
        [{18}, {20}, {18, 20}, {18, 20}, {18, 20}, {18, 20}],
        eligible_streaks=frozenset({6, 7, 9, 11}),
        invalid_streak=12,
        tier_label="準7+",
    )
    assert decision.valid
    assert decision.highest_streak == 6
    assert decision.rules == (18, 20)
