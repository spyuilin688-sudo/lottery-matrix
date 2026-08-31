from __future__ import annotations

from .explore import _road_identity
from .explore_shared import _evaluate_coordinate, prepare_shared_explore_unit
from .tianyan_shared import build_tianyan_unit_artifact


def run_matrix_shared_explore_group_with_history(value: dict, newest_first: list[dict]) -> dict:
    prepared = prepare_shared_explore_unit(value, newest_first)
    if not prepared.get("coordinates"):
        return {
            "results": [],
            "tianyanItems": [],
            "tianyanValidationById": {},
        }

    tianyan = build_tianyan_unit_artifact(prepared)
    results: list[dict] = []
    seen: set[str] = set()
    source = prepared["source"]

    for coordinate in prepared["coordinates"]:
        for algorithm_type in coordinate["algorithmTypes"]:
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

    results.sort(
        key=lambda item: (
            -item["highestStreak"],
            item["predictionDistance"],
            item["lockedPosition"],
            item["algorithmType"],
        )
    )
    return {
        "results": results,
        "tianyanItems": tianyan["items"],
        "tianyanValidationById": tianyan["validationById"],
    }
