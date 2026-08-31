from __future__ import annotations

from typing import Any

from .explore import (
    ALLOWED_STREAKS,
    INVALID_STREAK_REASONS,
    INVALID_THREE_RULE_COVERAGE_REASON,
    STREAK_BOUNDS,
    _add_rule,
    _apply_rule,
    _candidate_rule,
    _group_name,
    _highest_rule_sets,
    _history_for_lottery,
    _matching_source_indexes,
    _number_at,
    _ordered_numbers,
    _reference_coordinates,
    _road_identity,
    _rule_label,
    _typed_parts,
    _typed_sort_key,
    _validation,
)
from .models import lottery_maximum, lottery_position_count


TIANYAN_HISTORY_LIMIT = 30


def _base_for_coordinate(
    history: list[dict],
    source_index: int,
    *,
    lottery: str,
    number_order: str,
    locked_position: int,
    reference_offset: int,
    reference_position: int,
    drag: bool,
) -> dict | None:
    reference_index = source_index if drag else source_index + reference_offset
    if reference_index < 0 or reference_index >= len(history):
        return None
    reference = history[reference_index]
    position = locked_position if drag else reference_position
    base_number = _number_at(reference, lottery, number_order, position)
    if base_number is None:
        return None
    return {"reference": reference, "baseNumber": base_number}


def _build_shared_group(
    history: list[dict],
    source_index: int,
    *,
    lottery: str,
    number_order: str,
    locked_position: int,
    prediction_distance: int,
    reference_offset: int,
    reference_position: int,
    algorithm_types: list[str],
    group_name: str,
) -> dict | None:
    prediction_index = source_index + prediction_distance
    if prediction_index < 0 or prediction_index >= len(history):
        return None
    drag = algorithm_types == ["拖牌"]
    base = _base_for_coordinate(
        history,
        source_index,
        lottery=lottery,
        number_order=number_order,
        locked_position=locked_position,
        reference_offset=reference_offset,
        reference_position=reference_position,
        drag=drag,
    )
    if base is None:
        return None
    source = history[source_index]
    locked_base = _number_at(source, lottery, number_order, locked_position)
    if locked_base is None:
        return None
    prediction = history[prediction_index]
    maximum = lottery_maximum(lottery)
    candidate_map: dict[str, list[int]] = {}
    for target in [int(number) for number in prediction["numbers"]]:
        for algorithm_type in algorithm_types:
            base_number = locked_base if algorithm_type == "拖牌" else base["baseNumber"]
            rule = _candidate_rule(algorithm_type, base_number, target, maximum)
            _add_rule(candidate_map, algorithm_type, rule, target)
    return {
        "group": group_name,
        "source": source,
        "reference": base["reference"],
        "prediction": prediction,
        "baseNumber": base["baseNumber"],
        "lockedBaseNumber": locked_base,
        "candidateMap": candidate_map,
    }


def _prepare_coordinate(
    *,
    history: list[dict],
    historical_indexes: list[int],
    a_index: int,
    lottery: str,
    number_order: str,
    locked_position: int,
    prediction_distance: int,
    reference_offset: int,
    reference_position: int,
    algorithm_types: list[str],
) -> dict | None:
    drag = algorithm_types == ["拖牌"]
    a_base = _base_for_coordinate(
        history,
        a_index,
        lottery=lottery,
        number_order=number_order,
        locked_position=locked_position,
        reference_offset=reference_offset,
        reference_position=reference_position,
        drag=drag,
    )
    if a_base is None:
        return None
    groups: list[dict] = []
    for source_index in historical_indexes:
        if source_index + prediction_distance >= len(history):
            continue
        group = _build_shared_group(
            history,
            source_index,
            lottery=lottery,
            number_order=number_order,
            locked_position=locked_position,
            prediction_distance=prediction_distance,
            reference_offset=reference_offset,
            reference_position=reference_position,
            algorithm_types=algorithm_types,
            group_name=_group_name(len(groups)),
        )
        if group is None:
            break
        groups.append(group)
        if len(groups) >= TIANYAN_HISTORY_LIMIT:
            break
    return {
        "referenceOffset": reference_offset,
        "referencePosition": reference_position,
        "algorithmTypes": algorithm_types,
        "aReference": a_base["reference"],
        "aBaseNumber": a_base["baseNumber"],
        "groups": groups,
    }


def prepare_shared_explore_unit(value: dict, newest_first: list[dict]) -> dict:
    lottery = value["lottery"]
    newest_first = _history_for_lottery(lottery, newest_first)
    position_count = lottery_position_count(lottery)
    source_index = value["lockedSourceIndex"]
    date_offset = value["exploreDateOffset"]
    prediction_distance = value["predictionDistance"]
    locked_position = value["lockedPosition"]
    number_order = value["numberOrder"]
    if not isinstance(source_index, int) or source_index < 0 or source_index >= min(13, len(newest_first)):
        raise ValueError("鎖定來源期超出探索日期與十三期範圍")
    if source_index - date_offset + 1 != prediction_distance:
        raise ValueError("鎖定來源期與預測期距離不一致")
    if not 1 <= locked_position <= position_count:
        raise ValueError("鎖定位置超出彩種位置範圍")
    if number_order == "依實際開獎順序排序" and any(
        not isinstance(draw.get("drawOrderNumbers"), list)
        or len(draw["drawOrderNumbers"]) != position_count
        for draw in newest_first
    ):
        return {"coordinates": [], "reason": "實際開獎順序（落球）資料不完整，不得以順球資料代替"}

    source = newest_first[source_index]
    locked_number = _number_at(source, lottery, number_order, locked_position)
    if locked_number is None:
        return {"coordinates": [], "reason": "鎖定來源缺少指定球位號碼"}
    history = list(reversed(newest_first))
    source_request = {
        "lottery": lottery,
        "numberOrder": number_order,
        "lockedPosition": locked_position,
        "lockedNumber": locked_number,
    }
    source_indexes = _matching_source_indexes(source_request, history)
    requested_source_index = len(history) - source_index - 1
    if requested_source_index not in source_indexes:
        return {"coordinates": [], "reason": "找不到指定鎖定條件來源期"}
    historical_indexes = list(reversed([index for index in source_indexes if index < requested_source_index]))

    coordinate_specs: list[tuple[int, int, list[str]]] = [
        (0, locked_position, ["拖牌"]),
        *[
            (offset, position, ["加減", "合值"])
            for offset, position in _reference_coordinates(
                "加減", locked_position, position_count, 14, prediction_distance
            )
        ],
    ]
    coordinates: list[dict] = []
    for reference_offset, reference_position, algorithm_types in coordinate_specs:
        coordinate = _prepare_coordinate(
            history=history,
            historical_indexes=historical_indexes,
            a_index=requested_source_index,
            lottery=lottery,
            number_order=number_order,
            locked_position=locked_position,
            prediction_distance=prediction_distance,
            reference_offset=reference_offset,
            reference_position=reference_position,
            algorithm_types=algorithm_types,
        )
        if coordinate is not None:
            coordinates.append(coordinate)
    return {
        "lottery": lottery,
        "numberOrder": number_order,
        "lockedPosition": locked_position,
        "lockedNumber": locked_number,
        "lockedSourceIndex": source_index,
        "lockedSourcePeriod": source["period"],
        "predictionDistance": prediction_distance,
        "exploreDateOffset": date_offset,
        "source": source,
        "history": history,
        "aIndex": requested_source_index,
        "coordinates": coordinates,
    }


def _groups_for_algorithm(groups: list[dict], algorithm_type: str, limit: int | None = None) -> list[dict]:
    selected = groups if limit is None else groups[:limit]
    prefix = f"{algorithm_type}:"
    return [
        {
            **group,
            "candidateMap": {
                key: targets
                for key, targets in group["candidateMap"].items()
                if key.startswith(prefix)
            },
        }
        for group in selected
    ]


def _search_request(prepared: dict, coordinate: dict, algorithm_type: str, rule_count: int) -> dict:
    request = {
        "lottery": prepared["lottery"],
        "numberOrder": prepared["numberOrder"],
        "lockedPosition": prepared["lockedPosition"],
        "lockedNumber": prepared["lockedNumber"],
        "lockedSourcePeriod": prepared["lockedSourcePeriod"],
        "predictionDistance": prepared["predictionDistance"],
        "ruleCount": rule_count,
        "algorithmType": algorithm_type,
    }
    if algorithm_type != "拖牌":
        request.update({
            "referenceOffset": coordinate["referenceOffset"],
            "referencePosition": coordinate["referencePosition"],
        })
    return request


def _evaluate_coordinate(prepared: dict, coordinate: dict, algorithm_type: str, rule_count: int) -> dict:
    request = _search_request(prepared, coordinate, algorithm_type, rule_count)
    minimum_streak, invalid_streak = STREAK_BOUNDS[rule_count]
    groups = _groups_for_algorithm(coordinate["groups"], algorithm_type, invalid_streak)
    empty = {"valid": False, "searchCondition": request, "results": []}
    if not groups:
        return {**empty, "reason": "沒有可完成歷史驗證的來源組"}
    found = _highest_rule_sets(groups, rule_count)
    if found["highest"] == 0 or not found["sets"]:
        return {**empty, "reason": "找不到成立規則"}
    display = f'準{found["highest"]}進{found["highest"] + 1}'
    if found["invalidMultipleRules"]:
        return {
            **empty,
            "reason": INVALID_THREE_RULE_COVERAGE_REASON,
            "highestStreak": found["highest"],
            "displayStreak": display,
            "conflictingRules": [
                _typed_parts(rule)["value"] for rule in found["conflictingRules"]
            ],
        }
    if found["highest"] >= invalid_streak:
        return {
            **empty,
            "reason": INVALID_STREAK_REASONS[rule_count],
            "highestStreak": found["highest"],
            "displayStreak": display,
        }
    if found["highest"] < minimum_streak:
        return {
            **empty,
            "reason": f"連準次數未達鎖定{rule_count}碼最低{minimum_streak}次",
            "highestStreak": found["highest"],
            "displayStreak": display,
        }
    if found["highest"] not in ALLOWED_STREAKS[rule_count]:
        return {
            **empty,
            "reason": f"{display}不得進入探索與狀態結果",
            "highestStreak": found["highest"],
            "displayStreak": display,
        }

    history = prepared["history"]
    a_index = prepared["aIndex"]
    prediction_index = a_index + prepared["predictionDistance"]
    a_prediction = history[prediction_index] if 0 <= prediction_index < len(history) else None
    source = prepared["source"]
    reference = coordinate["aReference"]
    source_a = {
        "sourcePeriod": source["period"],
        "sourceNumbers": _ordered_numbers(source, prepared["lottery"], prepared["numberOrder"]),
        "sourceSortedNumbers": source.get("sortedNumbers", source["numbers"]),
        "sourceDrawOrderNumbers": source.get("drawOrderNumbers"),
        "referencePeriod": reference["period"],
        "referenceNumbers": _ordered_numbers(reference, prepared["lottery"], prepared["numberOrder"]),
        "referenceSortedNumbers": reference.get("sortedNumbers", reference["numbers"]),
        "referenceDrawOrderNumbers": reference.get("drawOrderNumbers"),
        "baseNumber": coordinate["aBaseNumber"],
        "predictionPeriod": a_prediction["period"] if a_prediction else None,
        "predictionCompleted": bool(a_prediction),
    }
    maximum = lottery_maximum(prepared["lottery"])
    result_sets: list[dict] = []
    for rules in found["sets"]:
        parsed = [_typed_parts(rule) for rule in rules]
        base_number = prepared["lockedNumber"] if algorithm_type == "拖牌" else coordinate["aBaseNumber"]
        predictions = sorted({
            _apply_rule(rule["algorithmType"], base_number, rule["value"], maximum)
            for rule in parsed
        })
        result_sets.append({
            "rules": [
                {**rule, "display": _rule_label(rule["algorithmType"], rule["value"])}
                for rule in parsed
            ],
            "predictionNumbers": predictions,
            "historicalValidation": _validation(groups, rules, request),
        })
    return {
        "valid": True,
        "searchCondition": request,
        "highestStreak": found["highest"],
        "displayStreak": display,
        "sourceA": source_a,
        "results": result_sets,
    }


def _candidate_values(groups: list[dict], algorithm_type: str) -> list[int]:
    prefix = f"{algorithm_type}:"
    values = {
        _typed_parts(key)["value"]
        for group in groups
        for key in group["candidateMap"]
        if key.startswith(prefix)
    }
    return sorted(values)


def _tianyan_bundle(prepared: dict, coordinate: dict, algorithm_type: str) -> dict | None:
    groups = _groups_for_algorithm(coordinate["groups"], algorithm_type, TIANYAN_HISTORY_LIMIT)
    candidate_values = _candidate_values(groups, algorithm_type)
    if not groups or not candidate_values:
        return None
    base_number = prepared["lockedNumber"] if algorithm_type == "拖牌" else coordinate["aBaseNumber"]
    return {
        "row": {
            "number": str(prepared["lockedNumber"]).zfill(2),
            "lockedPosition": prepared["lockedPosition"],
            "predictionDistance": prepared["predictionDistance"],
            "numberOrder": prepared["numberOrder"],
            "exploreDateOffset": prepared["exploreDateOffset"],
            "lockedSourceIndex": prepared["lockedSourceIndex"],
            "lockedSourcePeriod": prepared["lockedSourcePeriod"],
        },
        "referenceOffset": coordinate["referenceOffset"],
        "referencePosition": coordinate["referencePosition"],
        "algorithmType": algorithm_type,
        "currentBaseNumber": base_number,
        "candidateValues": candidate_values,
        "groups": [
            {
                "group": group["group"],
                "sourcePeriod": group["source"]["period"],
                "predictionPeriod": group["prediction"]["period"],
                "predictionNumbers": group["prediction"].get("sortedNumbers", group["prediction"]["numbers"]),
                "baseNumber": group["lockedBaseNumber"] if algorithm_type == "拖牌" else group["baseNumber"],
                "candidateValues": sorted(
                    _typed_parts(key)["value"]
                    for key in group["candidateMap"]
                    if key.startswith(f"{algorithm_type}:")
                ),
            }
            for group in groups
        ],
    }


def run_matrix_shared_explore_group_with_history(value: dict, newest_first: list[dict]) -> dict:
    prepared = prepare_shared_explore_unit(value, newest_first)
    if not prepared.get("coordinates"):
        return {"results": [], "tianyanSources": []}
    results: list[dict] = []
    tianyan_sources: list[dict] = []
    seen: set[str] = set()
    source = prepared["source"]
    for coordinate in prepared["coordinates"]:
        for algorithm_type in coordinate["algorithmTypes"]:
            bundle = _tianyan_bundle(prepared, coordinate, algorithm_type)
            if bundle is not None:
                tianyan_sources.append(bundle)
            for rule_count in (1, 2):
                evaluated = _evaluate_coordinate(prepared, coordinate, algorithm_type, rule_count)
                if not evaluated.get("valid"):
                    continue
                for rule_set in evaluated.get("results", []):
                    predictions = sorted({int(number) for number in rule_set.get("predictionNumbers", [])})
                    if rule_count == 1 and len(predictions) != 1:
                        continue
                    if rule_count == 2 and not 1 <= len(predictions) <= 2:
                        continue
                    key = "|".join(map(str, [
                        source["period"],
                        prepared["lockedPosition"],
                        prepared["lockedNumber"],
                        coordinate["referenceOffset"],
                        coordinate["referencePosition"],
                        prepared["predictionDistance"],
                        algorithm_type,
                        rule_count,
                        evaluated["highestStreak"],
                        _road_identity(rule_set),
                        ".".join(map(str, predictions)),
                    ]))
                    if key in seen:
                        continue
                    seen.add(key)
                    results.append({
                        "id": key,
                        "number": str(prepared["lockedNumber"]).zfill(2),
                        "lockedPosition": prepared["lockedPosition"],
                        "lockedSourceIndex": prepared["lockedSourceIndex"],
                        "lockedSourcePeriod": prepared["lockedSourcePeriod"],
                        "predictionDistance": prepared["predictionDistance"],
                        "consecutive": evaluated["displayStreak"],
                        "highestStreak": evaluated["highestStreak"],
                        "predictionNumbers": [str(number).zfill(2) for number in predictions],
                        "algorithmType": algorithm_type,
                        "ruleCount": rule_count,
                        "searchCondition": evaluated["searchCondition"],
                        "sourceA": evaluated.get("sourceA"),
                        "ruleSets": [rule_set],
                    })
    results.sort(key=lambda item: (-item["highestStreak"], item["predictionDistance"], item["lockedPosition"], item["algorithmType"]))
    return {"results": results, "tianyanSources": tianyan_sources}
