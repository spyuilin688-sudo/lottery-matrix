from app.domain.explore_context import ExploreEngineSession
from app.domain.explore_state import RoadType, StreakDecision
from app.domain.tianheng_context import TianhengEngineSession
from app.domain.tianheng_runtime import evaluate_tianheng_candidates, run_tianheng_batch


def history_539():
    numbers = ["05", "10", "15", "18", "20"]
    return [
        {
            "period": str(120000 - index),
            "numbers": numbers,
            "sortedNumbers": numbers,
            "drawOrderNumbers": numbers,
        }
        for index in range(30)
    ]


def test_tianheng_rule_count_one_uses_requested_levels():
    decision = evaluate_tianheng_candidates(({18},) * 9 + (frozenset(),), 1)
    assert decision.valid
    assert decision.highest_streak == 9


def test_tianheng_rule_count_two_uses_requested_levels():
    groups = ({18}, {20}, {18, 20}, {18, 20}, {18, 20}, {18, 20})
    decision = evaluate_tianheng_candidates(groups, 2)
    assert decision.valid
    assert decision.highest_streak == 6


def test_artifact_items_keep_both_locks(monkeypatch):
    monkeypatch.setattr(
        "app.domain.tianheng_runtime.evaluate_tianheng_candidates",
        lambda groups, rule_count, metrics=None: StreakDecision(True, 5, (0,)),
    )
    history = history_539()
    session = TianhengEngineSession.from_explore_session(
        ExploreEngineSession.build("今彩539", history),
    )
    response = run_tianheng_batch(
        "今彩539", history, 0, 10,
        road_types=(RoadType.DRAG,), session=session,
    )
    assert response["artifact"]["items"]
    for item in response["artifact"]["items"]:
        assert item["firstLockedPosition"] < item["secondLockedPosition"]
        assert item["firstNumber"] and item["secondNumber"]
        validation = response["artifact"]["validationById"][item["id"]]
        assert validation["sourceA"]["lockedPositions"] == [
            item["firstLockedPosition"], item["secondLockedPosition"],
        ]


def test_drag_summary_data_uses_first_lock_as_reference(monkeypatch):
    monkeypatch.setattr(
        "app.domain.tianheng_runtime.evaluate_tianheng_candidates",
        lambda groups, rule_count, metrics=None: StreakDecision(True, 5, (0,)),
    )
    history = history_539()
    session = TianhengEngineSession.from_explore_session(
        ExploreEngineSession.build("今彩539", history),
    )
    response = run_tianheng_batch(
        "今彩539", history, 0, 10,
        road_types=(RoadType.DRAG,), session=session,
    )
    item = next(
        row for row in response["artifact"]["items"]
        if row["algorithmType"] == "拖牌"
        and row["firstLockedPosition"] == 1
        and row["secondLockedPosition"] == 4
    )
    validation = response["artifact"]["validationById"][item["id"]]
    assert validation["sourceA"]["baseNumber"] == int(item["firstNumber"])
    assert item["referenceOffset"] == 0
    assert item["referencePosition"] == item["firstLockedPosition"]
