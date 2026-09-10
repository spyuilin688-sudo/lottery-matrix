from __future__ import annotations

from hashlib import sha256
from typing import Any, Iterable, Mapping

from .explore_context import CandidateCell, ExploreEngineSession, VerificationCell
from .explore_state import (
    FULL_RANGE,
    STANDARD_RANGE,
    AlgorithmError,
    EngineMetrics,
    RoadType,
    ScopeClass,
    StreakDecision,
    apply_candidate,
    evaluate_one_code,
    evaluate_two_code,
)
from .tianheng_context import (
    TianhengContext,
    TianhengEngineSession,
    TianhengLockOccurrence,
    TianhengRoadGroup,
    TianhengSourceUnit,
)


TIANHENG_ONE_RULE_STREAKS = frozenset({5, 6, 7, 9})
TIANHENG_TWO_RULE_STREAKS = frozenset({6, 7, 9, 11})


def evaluate_tianheng_candidates(
    groups: Iterable[Iterable[int]],
    rule_count: int,
    metrics: EngineMetrics | None = None,
) -> StreakDecision:
    if rule_count == 1:
        return evaluate_one_code(
            groups,
            eligible_streaks=TIANHENG_ONE_RULE_STREAKS,
            invalid_streak=10,
            tier_label="準5+",
            invalid_reason="鎖定1碼連準達10次以上，整條cell無效，不得截短",
        )
    if rule_count == 2:
        return evaluate_two_code(
            groups,
            metrics,
            eligible_streaks=TIANHENG_TWO_RULE_STREAKS,
            invalid_streak=12,
            tier_label="準7+",
        )
    raise AlgorithmError("ruleCount必須是1或2")


def _range_bundles(
    context: TianhengContext,
    unit: TianhengSourceUnit,
    limit: int = 12,
) -> tuple[
    tuple[TianhengLockOccurrence, int, dict[tuple[int, int], CandidateCell]], ...
]:
    bundles: list[
        tuple[TianhengLockOccurrence, int, dict[tuple[int, int], CandidateCell]]
    ] = []
    for occurrence in context.historical_occurrences(unit):
        result_index = occurrence.draw_index - unit.prediction_distance
        if result_index < 0:
            continue
        candidates = context.range_candidate_cells(
            occurrence,
            unit.prediction_distance,
        )
        bundles.append(
            (
                occurrence,
                result_index,
                {
                    (candidate.cell.relative_offset, candidate.cell.position): candidate
                    for candidate in candidates
                },
            )
        )
        if len(bundles) >= limit:
            break
    return tuple(bundles)


def _groups_for_cell(
    bundles: tuple[
        tuple[TianhengLockOccurrence, int, dict[tuple[int, int], CandidateCell]], ...
    ],
    source_cell: VerificationCell,
    road: RoadType,
) -> tuple[TianhengRoadGroup, ...]:
    coordinate = (source_cell.relative_offset, source_cell.position)
    groups: list[TianhengRoadGroup] = []
    for occurrence, result_index, by_coordinate in bundles:
        candidate = by_coordinate.get(coordinate)
        if candidate is None:
            break
        groups.append(
            TianhengRoadGroup(
                occurrence=occurrence,
                reference_cell=candidate.cell,
                result_draw_index=result_index,
                candidate_targets=candidate.targets_for(road),
            )
        )
    return tuple(groups)


def _drag_groups(
    context: TianhengContext,
    unit: TianhengSourceUnit,
    limit: int = 12,
) -> tuple[TianhengRoadGroup, ...]:
    groups: list[TianhengRoadGroup] = []
    for occurrence in context.historical_occurrences(unit):
        result_index = occurrence.draw_index - unit.prediction_distance
        if result_index < 0:
            continue
        groups.append(
            TianhengRoadGroup(
                occurrence=occurrence,
                reference_cell=context.drag_cell(occurrence),
                result_draw_index=result_index,
                candidate_targets=context.drag_candidate_targets(
                    occurrence,
                    unit.prediction_distance,
                ),
            )
        )
        if len(groups) >= limit:
            break
    return tuple(groups)


def _raw_numbers(draw: Mapping[str, object], key: str) -> list[object] | None:
    value = draw.get(key)
    return list(value) if isinstance(value, list) else None


def _draw_numbers_for_validation(
    context: TianhengContext,
    draw_index: int,
) -> dict[str, object]:
    draw = context.explore.draw_at(draw_index)
    official = _raw_numbers(draw, "numbers") or []
    return {
        "ordered": list(context.explore.ordered_at(draw_index)),
        "sorted": _raw_numbers(draw, "sortedNumbers") or official,
        "drawOrder": _raw_numbers(draw, "drawOrderNumbers"),
        "official": official,
    }


def _rule_display(road: RoadType, value: int) -> str:
    return str(value) if road is RoadType.SUM else f"+{value}"


def _rule_payload(road: RoadType, value: int) -> dict[str, object]:
    return {
        "value": value,
        "display": _rule_display(road, value),
        "algorithmType": road.value,
    }


def _lock_payload(occurrence: TianhengLockOccurrence) -> dict[str, object]:
    return {
        "lockedPositions": [
            occurrence.first_position,
            occurrence.second_position,
        ],
        "lockedNumbers": [
            str(occurrence.first_number).zfill(2),
            str(occurrence.second_number).zfill(2),
        ],
    }


def _historical_validation(
    context: TianhengContext,
    groups: tuple[TianhengRoadGroup, ...],
    road: RoadType,
    rules: tuple[int, ...],
    highest_streak: int,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for group_index, group in enumerate(groups[:highest_streak]):
        source_index = group.occurrence.draw_index
        reference_index = source_index - group.reference_cell.relative_offset
        source = _draw_numbers_for_validation(context, source_index)
        reference = _draw_numbers_for_validation(context, reference_index)
        prediction = _draw_numbers_for_validation(context, group.result_draw_index)
        matched = tuple(rule for rule in rules if rule in group.candidates)
        rows.append(
            {
                "group": chr(66 + group_index),
                "sourcePeriod": group.occurrence.period,
                "sourceNumbers": source["ordered"],
                "sourceSortedNumbers": source["sorted"],
                "sourceDrawOrderNumbers": source["drawOrder"],
                **_lock_payload(group.occurrence),
                "referencePeriod": group.reference_cell.period,
                "referenceNumbers": reference["ordered"],
                "referenceSortedNumbers": reference["sorted"],
                "referenceDrawOrderNumbers": reference["drawOrder"],
                "baseNumber": group.reference_cell.number,
                "predictionPeriod": str(
                    context.explore.draw_at(group.result_draw_index).get("period", "")
                ),
                "predictionNumbers": prediction["official"],
                "candidateRules": sorted(group.candidates),
                "matchedRules": [_rule_payload(road, rule) for rule in matched],
                "hitNumbers": sorted(
                    {
                        number
                        for rule in matched
                        for number in group.targets_for(rule)
                    }
                ),
                "success": bool(matched),
            }
        )
    return rows


def _source_a_validation(
    context: TianhengContext,
    unit: TianhengSourceUnit,
    reference_cell: VerificationCell,
) -> dict[str, object]:
    source_index = unit.locked_source_index
    reference_index = source_index - reference_cell.relative_offset
    prediction_index = source_index - unit.prediction_distance
    source = _draw_numbers_for_validation(context, source_index)
    reference = _draw_numbers_for_validation(context, reference_index)
    prediction_exists = 0 <= prediction_index < len(context.history)
    return {
        "sourcePeriod": unit.occurrence.period,
        "sourceNumbers": source["ordered"],
        "sourceSortedNumbers": source["sorted"],
        "sourceDrawOrderNumbers": source["drawOrder"],
        **_lock_payload(unit.occurrence),
        "referencePeriod": reference_cell.period,
        "referenceNumbers": reference["ordered"],
        "referenceSortedNumbers": reference["sorted"],
        "referenceDrawOrderNumbers": reference["drawOrder"],
        "baseNumber": reference_cell.number,
        "predictionPeriod": (
            str(context.explore.draw_at(prediction_index).get("period", ""))
            if prediction_exists
            else None
        ),
        "predictionCompleted": prediction_exists,
    }


def _result_identifier(
    context: TianhengContext,
    unit: TianhengSourceUnit,
    cell: VerificationCell,
    road: RoadType,
    rule_count: int,
    decision: StreakDecision,
    predictions: tuple[int, ...],
    scope_class: ScopeClass,
) -> str:
    occurrence = unit.occurrence
    identity = "|".join(
        map(
            str,
            (
                scope_class.value,
                context.number_order,
                occurrence.period,
                unit.locked_source_index,
                occurrence.first_position,
                occurrence.first_number,
                occurrence.second_position,
                occurrence.second_number,
                cell.relative_offset,
                cell.position,
                unit.prediction_distance,
                road.value,
                rule_count,
                decision.highest_streak,
                ".".join(map(str, decision.rules)),
                ".".join(map(str, predictions)),
            ),
        )
    )
    return "mx_" + sha256(identity.encode()).hexdigest()[:28]


def _append_result(
    artifact: dict[str, Any],
    context: TianhengContext,
    unit: TianhengSourceUnit,
    cell: VerificationCell,
    road: RoadType,
    rule_count: int,
    decision: StreakDecision,
    groups: tuple[TianhengRoadGroup, ...],
    scope_class: ScopeClass,
) -> None:
    predictions = tuple(
        sorted(
            {
                apply_candidate(
                    road,
                    cell.number,
                    rule,
                    context.spec.maximum,
                )
                for rule in decision.rules
            }
        )
    )
    if rule_count == 1 and len(predictions) != 1:
        return
    if rule_count == 2 and not 1 <= len(predictions) <= 2:
        return

    identifier = _result_identifier(
        context,
        unit,
        cell,
        road,
        rule_count,
        decision,
        predictions,
        scope_class,
    )
    occurrence = unit.occurrence
    item: dict[str, object] = {
        "id": identifier,
        "firstNumber": str(occurrence.first_number).zfill(2),
        "firstLockedPosition": occurrence.first_position,
        "secondNumber": str(occurrence.second_number).zfill(2),
        "secondLockedPosition": occurrence.second_position,
        "predictionDistance": unit.prediction_distance,
        "consecutive": (
            f"準{decision.highest_streak}進{decision.highest_streak + 1}"
        ),
        "highestStreak": decision.highest_streak,
        "predictionNumbers": [str(number).zfill(2) for number in predictions],
        "algorithmType": road.value,
        "numberOrder": context.number_order,
        "exploreDateOffset": 0,
        "exploreRange": (
            STANDARD_RANGE
            if scope_class is ScopeClass.STANDARD_AND_FULL
            else FULL_RANGE
        ),
        "scopeClass": scope_class.value,
        "ruleCount": rule_count,
        "lockedSourceIndex": unit.locked_source_index,
        "lockedSourcePeriod": occurrence.period,
        "referenceOffset": cell.relative_offset,
        "referencePosition": cell.position,
    }

    validation = {
        "itemId": identifier,
        "sourceA": _source_a_validation(context, unit, cell),
        "ruleSets": [
            {
                "rules": [_rule_payload(road, rule) for rule in decision.rules],
                "predictionNumbers": list(predictions),
                "historicalValidation": _historical_validation(
                    context,
                    groups,
                    road,
                    decision.rules,
                    decision.highest_streak,
                ),
            }
        ],
    }
    existing = artifact["validationById"].get(identifier)
    if existing is not None:
        if existing != validation:
            raise AlgorithmError("RESULT_ID_CONFLICT")
        return
    artifact["items"].append(item)
    artifact["validationById"][identifier] = validation


def _evaluate_cell(
    artifact: dict[str, Any],
    context: TianhengContext,
    unit: TianhengSourceUnit,
    cell: VerificationCell,
    road: RoadType,
    groups: tuple[TianhengRoadGroup, ...],
    scope_class: ScopeClass,
) -> None:
    candidate_series = tuple(group.candidates for group in groups)
    for rule_count in (1, 2):
        context.metrics.scope_decisions += 1
        decision = evaluate_tianheng_candidates(
            candidate_series,
            rule_count,
            context.metrics,
        )
        if not decision.valid:
            continue
        _append_result(
            artifact,
            context,
            unit,
            cell,
            road,
            rule_count,
            decision,
            groups,
            scope_class,
        )


def _run_unit(
    artifact: dict[str, Any],
    context: TianhengContext,
    unit: TianhengSourceUnit,
    road_types: frozenset[RoadType],
) -> None:
    range_roads = tuple(
        road for road in (RoadType.ADD, RoadType.SUM) if road in road_types
    )
    if range_roads:
        source_cells = context.range_cells(
            unit.occurrence,
            unit.prediction_distance,
        )
        bundles = _range_bundles(context, unit)
        for cell in source_cells:
            for road in range_roads:
                _evaluate_cell(
                    artifact,
                    context,
                    unit,
                    cell,
                    road,
                    _groups_for_cell(bundles, cell, road),
                    cell.scope_class,
                )

    if RoadType.DRAG in road_types:
        cell = context.drag_cell(unit.occurrence)
        _evaluate_cell(
            artifact,
            context,
            unit,
            cell,
            RoadType.DRAG,
            _drag_groups(context, unit),
            ScopeClass.STANDARD_AND_FULL,
        )


def _session_metrics(
    contexts: tuple[TianhengContext, ...],
    source_units_total: int,
) -> dict[str, int]:
    return {
        "occurrenceIndexBuilds": sum(
            context.metrics.occurrence_index_builds for context in contexts
        ),
        "indexedCells": sum(context.metrics.indexed_cells for context in contexts),
        "rangeCellBuilds": sum(
            context.metrics.range_cell_builds for context in contexts
        ),
        "candidateBuilds": sum(
            context.metrics.candidate_builds for context in contexts
        ),
        "dragCandidateBuilds": sum(
            context.metrics.drag_candidate_builds for context in contexts
        ),
        "scopeDecisions": sum(
            context.metrics.scope_decisions for context in contexts
        ),
        "sourceUnitsTotal": source_units_total,
        "sourceUnitsProcessed": sum(
            context.metrics.source_units_processed for context in contexts
        ),
        "globalPairEnumerations": sum(
            context.metrics.global_pair_enumerations for context in contexts
        ),
        "maxActiveFirstStates": max(
            (context.metrics.max_active_first_states for context in contexts),
            default=0,
        ),
        "maxActiveSecondCandidates": max(
            (
                context.metrics.max_active_second_candidates
                for context in contexts
            ),
            default=0,
        ),
    }


def run_tianheng_batch(
    lottery: str,
    newest_first: Iterable[Mapping[str, object]],
    start: int,
    limit: int,
    *,
    road_types: Iterable[RoadType] = (
        RoadType.ADD,
        RoadType.SUM,
        RoadType.DRAG,
    ),
    session: TianhengEngineSession | None = None,
) -> dict[str, Any]:
    history = tuple(newest_first)
    if session is None:
        session = TianhengEngineSession.from_explore_session(
            ExploreEngineSession.build(lottery, history),
        )
    elif session.lottery != lottery or session.history != history:
        raise AlgorithmError("TIANHENG_ENGINE_SESSION_MISMATCH")

    indexed_units = session.indexed_units
    cursor_start = min(max(0, int(start)), len(indexed_units))
    cursor = min(
        len(indexed_units),
        cursor_start + max(1, int(limit)),
    )
    selected_roads = frozenset(
        road if isinstance(road, RoadType) else RoadType(str(road))
        for road in road_types
    )

    artifact: dict[str, Any] = {
        "lottery": lottery,
        "drawPeriod": str(history[0].get("period", "")) if history else "",
        "items": [],
        "validationById": {},
    }

    for context, unit in indexed_units[cursor_start:cursor]:
        context.metrics.source_units_processed += 1
        _run_unit(artifact, context, unit, selected_roads)

    artifact["items"].sort(
        key=lambda item: (
            -int(item["highestStreak"]),
            int(item["predictionDistance"]),
            int(item["firstLockedPosition"]),
            int(item["secondLockedPosition"]),
            str(item["algorithmType"]),
            str(item["scopeClass"]),
            int(item.get("referenceOffset", 0)),
            int(item.get("referencePosition", 0)),
            str(item["id"]),
        )
    )
    return {
        "artifact": artifact,
        "cursorStart": cursor_start,
        "cursor": cursor,
        "total": len(indexed_units),
        "complete": cursor >= len(indexed_units),
        "metrics": _session_metrics(session.contexts, len(indexed_units)),
    }
