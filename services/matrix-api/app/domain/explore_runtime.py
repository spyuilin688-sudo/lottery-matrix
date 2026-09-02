from __future__ import annotations

from hashlib import sha256
from typing import Any, Iterable, Mapping

from .explore_context import (
    CandidateCell,
    ExploreContext,
    ExploreEngineSession,
    LockOccurrence,
    RoadGroup,
    SourceUnit,
    VerificationCell,
)
from .explore_state import (
    FULL_RANGE,
    STANDARD_RANGE,
    AlgorithmError,
    RoadType,
    ScopeClass,
    StreakDecision,
    apply_candidate,
    evaluate_one_code,
    evaluate_two_code,
)
from .tianyan_shared import build_tianyan_unit_artifact


def _range_bundles(
    context: ExploreContext,
    unit: SourceUnit,
    limit: int = 12,
) -> tuple[
    tuple[LockOccurrence, int, dict[tuple[int, int], CandidateCell]], ...
]:
    bundles: list[
        tuple[LockOccurrence, int, dict[tuple[int, int], CandidateCell]]
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
        tuple[LockOccurrence, int, dict[tuple[int, int], CandidateCell]], ...
    ],
    source_cell: VerificationCell,
    road: RoadType,
) -> tuple[RoadGroup, ...]:
    coordinate = (source_cell.relative_offset, source_cell.position)
    groups: list[RoadGroup] = []
    for occurrence, result_index, by_coordinate in bundles:
        candidate = by_coordinate.get(coordinate)
        if candidate is None:
            break
        groups.append(
            RoadGroup(
                occurrence=occurrence,
                reference_cell=candidate.cell,
                result_draw_index=result_index,
                candidate_targets=candidate.targets_for(road),
            )
        )
    return tuple(groups)


def _drag_groups(
    context: ExploreContext,
    unit: SourceUnit,
    limit: int = 12,
) -> tuple[RoadGroup, ...]:
    groups: list[RoadGroup] = []
    for occurrence in context.historical_occurrences(unit):
        result_index = occurrence.draw_index - unit.prediction_distance
        if result_index < 0:
            continue
        groups.append(
            RoadGroup(
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
    context: ExploreContext,
    draw_index: int,
) -> dict[str, object]:
    draw = context.draw_at(draw_index)
    official = _raw_numbers(draw, "numbers") or []
    return {
        "ordered": list(context.ordered_at(draw_index)),
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


def _historical_validation(
    context: ExploreContext,
    groups: tuple[RoadGroup, ...],
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
                "referencePeriod": group.reference_cell.period,
                "referenceNumbers": reference["ordered"],
                "referenceSortedNumbers": reference["sorted"],
                "referenceDrawOrderNumbers": reference["drawOrder"],
                "baseNumber": group.reference_cell.number,
                "predictionPeriod": str(
                    context.draw_at(group.result_draw_index).get("period", "")
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
    context: ExploreContext,
    unit: SourceUnit,
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
        "referencePeriod": reference_cell.period,
        "referenceNumbers": reference["ordered"],
        "referenceSortedNumbers": reference["sorted"],
        "referenceDrawOrderNumbers": reference["drawOrder"],
        "baseNumber": reference_cell.number,
        "predictionPeriod": (
            str(context.draw_at(prediction_index).get("period", ""))
            if prediction_exists
            else None
        ),
        "predictionCompleted": prediction_exists,
    }


def _result_identifier(
    context: ExploreContext,
    unit: SourceUnit,
    cell: VerificationCell,
    road: RoadType,
    rule_count: int,
    decision: StreakDecision,
    predictions: tuple[int, ...],
    explore_range: str,
) -> str:
    identity = "|".join(
        map(
            str,
            (
                explore_range,
                context.number_order,
                unit.occurrence.period,
                unit.locked_source_index,
                unit.occurrence.position,
                unit.occurrence.number,
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
    context: ExploreContext,
    unit: SourceUnit,
    cell: VerificationCell,
    road: RoadType,
    rule_count: int,
    decision: StreakDecision,
    groups: tuple[RoadGroup, ...],
    explore_range: str,
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
        explore_range,
    )
    item: dict[str, object] = {
        "id": identifier,
        "number": str(unit.occurrence.number).zfill(2),
        "lockedPosition": unit.occurrence.position,
        "predictionDistance": unit.prediction_distance,
        "consecutive": (
            f"準{decision.highest_streak}進{decision.highest_streak + 1}"
        ),
        "highestStreak": decision.highest_streak,
        "predictionNumbers": [str(number).zfill(2) for number in predictions],
        "algorithmType": road.value,
        "numberOrder": context.number_order,
        "exploreDateOffset": 0,
        "exploreRange": explore_range,
        "ruleCount": rule_count,
        "lockedSourceIndex": unit.locked_source_index,
        "lockedSourcePeriod": unit.occurrence.period,
    }
    if road is not RoadType.DRAG:
        item["referenceOffset"] = cell.relative_offset
        item["referencePosition"] = cell.position

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
    context: ExploreContext,
    unit: SourceUnit,
    cell: VerificationCell,
    road: RoadType,
    groups: tuple[RoadGroup, ...],
    applicable_ranges: tuple[str, ...],
) -> None:
    candidate_series = tuple(group.candidates for group in groups)
    for rule_count in (1, 2):
        context.metrics.scope_decisions += 1
        decision = (
            evaluate_one_code(candidate_series)
            if rule_count == 1
            else evaluate_two_code(candidate_series, context.metrics)
        )
        if not decision.valid:
            continue
        for explore_range in applicable_ranges:
            _append_result(
                artifact,
                context,
                unit,
                cell,
                road,
                rule_count,
                decision,
                groups,
                explore_range,
            )


def _group_name(index: int) -> str:
    code = 66 + index
    return chr(code) if code <= 90 else f"B{index + 1}"


def _typed_candidate_map(candidate: CandidateCell) -> dict[str, list[int]]:
    return {
        **{
            f"{RoadType.ADD.value}:{value}": list(targets)
            for value, targets in candidate.add_targets
        },
        **{
            f"{RoadType.SUM.value}:{value}": list(targets)
            for value, targets in candidate.sum_targets
        },
    }


def _tianyan_range_coordinate(
    context: ExploreContext,
    unit: SourceUnit,
    source_cell: VerificationCell,
    bundles: tuple[
        tuple[LockOccurrence, int, dict[tuple[int, int], CandidateCell]], ...
    ],
) -> dict[str, Any]:
    coordinate = (source_cell.relative_offset, source_cell.position)
    groups: list[dict[str, Any]] = []
    for occurrence, result_index, by_coordinate in bundles:
        candidate = by_coordinate.get(coordinate)
        if candidate is None:
            break
        reference_index = occurrence.draw_index - candidate.cell.relative_offset
        groups.append(
            {
                "group": _group_name(len(groups)),
                "source": dict(context.draw_at(occurrence.draw_index)),
                "reference": dict(context.draw_at(reference_index)),
                "prediction": dict(context.draw_at(result_index)),
                "baseNumber": candidate.cell.number,
                "lockedBaseNumber": occurrence.number,
                "candidateMap": _typed_candidate_map(candidate),
            }
        )
    reference_index = unit.locked_source_index - source_cell.relative_offset
    return {
        "referenceOffset": source_cell.relative_offset,
        "referencePosition": source_cell.position,
        "algorithmTypes": [RoadType.ADD.value, RoadType.SUM.value],
        "aReference": dict(context.draw_at(reference_index)),
        "aBaseNumber": source_cell.number,
        "groups": groups,
    }


def _tianyan_drag_coordinate(
    context: ExploreContext,
    unit: SourceUnit,
) -> dict[str, Any]:
    groups = _drag_groups(context, unit, limit=30)
    return {
        "referenceOffset": 0,
        "referencePosition": unit.occurrence.position,
        "algorithmTypes": [RoadType.DRAG.value],
        "aReference": dict(context.draw_at(unit.locked_source_index)),
        "aBaseNumber": unit.occurrence.number,
        "groups": [
            {
                "group": _group_name(index),
                "source": dict(context.draw_at(group.occurrence.draw_index)),
                "reference": dict(context.draw_at(group.occurrence.draw_index)),
                "prediction": dict(context.draw_at(group.result_draw_index)),
                "baseNumber": group.reference_cell.number,
                "lockedBaseNumber": group.occurrence.number,
                "candidateMap": {
                    f"{RoadType.DRAG.value}:{value}": list(targets)
                    for value, targets in group.candidate_targets
                },
            }
            for index, group in enumerate(groups)
        ],
    }


def _append_tianyan_results(
    artifact: dict[str, Any],
    context: ExploreContext,
    unit: SourceUnit,
) -> None:
    source_cells = context.range_cells(unit.occurrence, unit.prediction_distance)
    bundles = _range_bundles(context, unit, limit=30)
    prepared = {
        "lottery": context.lottery,
        "numberOrder": context.number_order,
        "lockedPosition": unit.occurrence.position,
        "lockedNumber": unit.occurrence.number,
        "lockedSourceIndex": unit.locked_source_index,
        "lockedSourcePeriod": unit.occurrence.period,
        "predictionDistance": unit.prediction_distance,
        "exploreDateOffset": 0,
        "source": dict(context.draw_at(unit.locked_source_index)),
        "coordinates": [
            *(
                _tianyan_range_coordinate(
                    context,
                    unit,
                    source_cell,
                    bundles,
                )
                for source_cell in source_cells
            ),
            _tianyan_drag_coordinate(context, unit),
        ],
    }
    tianyan = build_tianyan_unit_artifact(prepared)
    for item in tianyan.get("items", []):
        if not isinstance(item, dict):
            continue
        identifier = str(item.get("id", ""))
        if not identifier:
            continue
        existing = next(
            (
                current
                for current in artifact["tianyanItems"]
                if isinstance(current, dict)
                and current.get("id") == identifier
            ),
            None,
        )
        if existing is not None:
            if existing != item:
                raise AlgorithmError("TIANYAN_RESULT_CONFLICT")
            continue
        artifact["tianyanItems"].append(item)

    for identifier, validation in tianyan.get("validationById", {}).items():
        existing = artifact["tianyanValidationById"].get(identifier)
        if existing is not None and existing != validation:
            raise AlgorithmError("TIANYAN_RESULT_CONFLICT")
        artifact["tianyanValidationById"][identifier] = validation


def _run_unit(
    artifact: dict[str, Any],
    context: ExploreContext,
    unit: SourceUnit,
    road_types: frozenset[RoadType],
    include_tianyan: bool,
) -> None:
    range_roads = tuple(
        road
        for road in (RoadType.ADD, RoadType.SUM)
        if road in road_types
    )
    if range_roads:
        source_cells = context.range_cells(
            unit.occurrence,
            unit.prediction_distance,
        )
        bundles = _range_bundles(context, unit)
        for cell in source_cells:
            applicable_ranges = (
                (STANDARD_RANGE, FULL_RANGE)
                if cell.scope_class is ScopeClass.STANDARD_AND_FULL
                else (FULL_RANGE,)
            )
            for road in range_roads:
                _evaluate_cell(
                    artifact,
                    context,
                    unit,
                    cell,
                    road,
                    _groups_for_cell(bundles, cell, road),
                    applicable_ranges,
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
            (STANDARD_RANGE, FULL_RANGE),
        )

    if include_tianyan:
        _append_tianyan_results(artifact, context, unit)


def _session_metrics(contexts: tuple[ExploreContext, ...]) -> dict[str, int]:
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
        "sourceUnitsTotal": sum(
            context.metrics.source_units_total for context in contexts
        ),
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


def run_explore_batch(
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
    session: ExploreEngineSession | None = None,
) -> dict[str, Any]:
    history = tuple(newest_first)
    if session is None:
        session = ExploreEngineSession.build(lottery, history)
    elif not session.matches(lottery, history):
        raise AlgorithmError("EXPLORE_ENGINE_SESSION_MISMATCH")

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
    all_roads = frozenset((RoadType.ADD, RoadType.SUM, RoadType.DRAG))

    artifact: dict[str, Any] = {
        "lottery": lottery,
        "drawPeriod": str(history[0].get("period", "")) if history else "",
        "items": [],
        "validationById": {},
        "tianyanItems": [],
        "tianyanValidationById": {},
    }

    for context, unit in indexed_units[cursor_start:cursor]:
        context.metrics.source_units_processed += 1
        _run_unit(
            artifact,
            context,
            unit,
            selected_roads,
            selected_roads == all_roads,
        )

    artifact["items"].sort(
        key=lambda item: (
            -int(item["highestStreak"]),
            int(item["predictionDistance"]),
            int(item["lockedPosition"]),
            str(item["algorithmType"]),
            str(item["exploreRange"]),
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
        "metrics": _session_metrics(session.contexts),
    }
