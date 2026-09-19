from dataclasses import replace

from app.domain.explore_context import ExploreEngineSession
from app.domain.explore_state import RoadType, StreakDecision
from app.domain.tianheng_context import TianhengEngineSession
from app.domain.tianheng_runtime import run_tianheng_batch, run_tianshu_batch


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


def always_valid(_groups, rule_count, metrics=None):
    return StreakDecision(True, 5, (0,))


def test_tianshu_artifact_and_validation_keep_three_locks(monkeypatch):
    monkeypatch.setattr(
        "app.domain.tianheng_runtime.evaluate_tianheng_candidates",
        always_valid,
    )
    draws = history_539()
    session = TianhengEngineSession.from_explore_session(
        ExploreEngineSession.build("今彩539", draws),
        lock_count=3,
    )

    response = run_tianshu_batch(
        "今彩539", draws, 0, 10,
        road_types=(RoadType.DRAG,), session=session,
    )

    assert response["artifact"]["kind"] == "tianshu"
    assert response["artifact"]["items"]
    for item in response["artifact"]["items"]:
        assert item["kind"] == "tianshu"
        assert item["firstLockedPosition"] < item["secondLockedPosition"] < item["thirdLockedPosition"]
        assert item["thirdNumber"]
        validation = response["artifact"]["validationById"][item["id"]]
        assert validation["sourceA"]["lockedPositions"] == [
            item["firstLockedPosition"],
            item["secondLockedPosition"],
            item["thirdLockedPosition"],
        ]
        assert len(validation["sourceA"]["lockedNumbers"]) == 3
        for rule_set in validation["ruleSets"]:
            for row in rule_set["historicalValidation"]:
                assert len(row["lockedPositions"]) == 3
                assert len(row["lockedNumbers"]) == 3


def test_tianshu_result_id_changes_when_only_third_number_changes(monkeypatch):
    monkeypatch.setattr(
        "app.domain.tianheng_runtime.evaluate_tianheng_candidates",
        always_valid,
    )
    draws = history_539()
    session = TianhengEngineSession.from_explore_session(
        ExploreEngineSession.build("今彩539", draws),
        lock_count=3,
    )
    context, original = session.indexed_units[0]
    changed = replace(
        original,
        occurrence=replace(original.occurrence, third_number=19),
    )
    artifact = {"items": [], "validationById": {}}
    from app.domain import tianheng_runtime

    cell = context.drag_cell(original.occurrence)
    decision = StreakDecision(True, 5, (0,))
    original_id = tianheng_runtime._result_identifier(
        context, original, cell, RoadType.DRAG, 1, decision, (5,), cell.scope_class,
    )
    changed_id = tianheng_runtime._result_identifier(
        context, changed, cell, RoadType.DRAG, 1, decision, (5,), cell.scope_class,
    )

    assert original_id != changed_id
    assert artifact == {"items": [], "validationById": {}}


def test_tianheng_default_keeps_existing_two_lock_id(monkeypatch):
    monkeypatch.setattr(
        "app.domain.tianheng_runtime.evaluate_tianheng_candidates",
        always_valid,
    )
    draws = history_539()
    session = TianhengEngineSession.from_explore_session(
        ExploreEngineSession.build("今彩539", draws),
    )

    response = run_tianheng_batch(
        "今彩539", draws, 0, 1,
        road_types=(RoadType.DRAG,), session=session,
    )

    assert {item["id"] for item in response["artifact"]["items"]} == {
        "mx_20268eb032ff7f2845f9288ba89b",
        "mx_5f81f0a3b2194addb9e420c72845",
    }
    assert all("thirdNumber" not in item for item in response["artifact"]["items"])
