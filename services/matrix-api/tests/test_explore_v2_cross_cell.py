import pytest

import app.domain.explore_v2 as explore_v2
from app.domain.explore_v2 import RoadType


def test_cross_cell_equal_longest_values_are_grouped_per_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    unit = explore_v2.SourceUnit(
        locked_source_index=0,
        prediction_distance=1,
        lock_key=explore_v2.LockKey(
            "今彩539",
            explore_v2.SORTED_ORDER,
            1,
            10,
        ),
        occurrence=explore_v2.LockOccurrence(0, "A", 1, 10),
    )
    source_cells = (
        explore_v2.VerificationCell(
            occurrence_index=1,
            period="R1",
            relative_offset=-1,
            position=1,
            number=20,
            scope_class=explore_v2.ScopeClass.STANDARD_AND_FULL,
        ),
        explore_v2.VerificationCell(
            occurrence_index=2,
            period="R2",
            relative_offset=-2,
            position=2,
            number=21,
            scope_class=explore_v2.ScopeClass.STANDARD_AND_FULL,
        ),
        explore_v2.VerificationCell(
            occurrence_index=3,
            period="R3",
            relative_offset=-8,
            position=3,
            number=22,
            scope_class=explore_v2.ScopeClass.FULL_ONLY,
        ),
    )

    class FakeContext:
        lottery = "今彩539"

        def range_cells(
            self,
            _occurrence: object,
            _prediction_distance: int,
        ) -> tuple[explore_v2.VerificationCell, ...]:
            return source_cells

    rule_by_coordinate = {
        (-1, 1): 10,
        (-2, 2): 15,
        (-8, 3): 20,
    }

    def fake_groups_for_cell(
        _bundles: object,
        cell: explore_v2.VerificationCell,
        _road: RoadType,
    ) -> tuple[explore_v2.RoadGroup, ...]:
        rule = rule_by_coordinate[(cell.relative_offset, cell.position)]
        return tuple(
            explore_v2.RoadGroup(
                occurrence=explore_v2.LockOccurrence(
                    draw_index=20 + index,
                    period=f"H{index}",
                    position=1,
                    number=10,
                ),
                reference_cell=cell,
                result_draw_index=19 + index,
                candidate_targets=((rule, (rule,)),),
            )
            for index in range(5)
        )

    appended: list[tuple[str, int, int, tuple[int, ...]]] = []

    def fake_append_final_results(
        _artifact: dict[str, object],
        _context: object,
        _unit: object,
        reference_cell: explore_v2.VerificationCell,
        _road: RoadType,
        _rule_count: int,
        decision: explore_v2.StreakDecision,
        _groups: tuple[explore_v2.RoadGroup, ...],
        explore_range: str,
    ) -> None:
        appended.append(
            (
                explore_range,
                reference_cell.relative_offset,
                reference_cell.position,
                decision.rules,
            )
        )

    monkeypatch.setattr(explore_v2, "_range_bundles", lambda *_args, **_kwargs: ())
    monkeypatch.setattr(explore_v2, "_groups_for_cell", fake_groups_for_cell)
    monkeypatch.setattr(explore_v2, "_append_final_results", fake_append_final_results)

    artifact: dict[str, object] = {"items": [], "validationById": {}}
    metrics = {"scopeDecisions": 0}
    explore_v2._run_explore_v2_unit(
        artifact,
        FakeContext(),  # type: ignore[arg-type]
        unit,
        frozenset({RoadType.ADD}),
        metrics,
        include_tianyan=False,
    )

    assert [entry for entry in appended if entry[0] == "標準範圍"] == [
        ("標準範圍", -1, 1, (10,)),
        ("標準範圍", -2, 2, (15,)),
    ]
    assert [entry for entry in appended if entry[0] == "完整範圍"] == []
