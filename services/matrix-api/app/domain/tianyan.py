from math import ceil

from .models import lottery_maximum, normalize_matrix_number


def calculate_tianyan_prediction(algorithm_type: str, base_number: int, value: int, maximum: int) -> int:
    if algorithm_type == "合值":
        return normalize_matrix_number(value - base_number, maximum)
    return normalize_matrix_number(base_number + value, maximum)


def _group_hit(group: dict, key: str) -> bool:
    validation = group[key]
    if "hit" in validation:
        return bool(validation["hit"])
    return validation["predictionNumber"] in group["predictionNumbers"]


def _predictions_for(rule: dict, maximum: int) -> list[int]:
    if "currentPredictionNumbers" in rule:
        return list(rule["currentPredictionNumbers"])
    return [calculate_tianyan_prediction(
        rule["algorithmType"], rule["currentBaseNumber"], rule["value"], maximum,
    )]


def evaluate_tianyan_candidate(value: dict) -> dict:
    rule1, rule2 = value["rules"]
    maximum = lottery_maximum(value["lottery"])
    predictions = sorted(set(_predictions_for(rule1, maximum) + _predictions_for(rule2, maximum)))
    prediction_numbers = [str(number).zfill(2) for number in predictions]
    groups = []
    stopped_on_miss = False
    for group in value["groups"][:30]:
        rule1_hit = _group_hit(group, "rule1")
        rule2_hit = _group_hit(group, "rule2")
        if not rule1_hit and not rule2_hit:
            stopped_on_miss = True
            break
        hit_type = "bothHit" if rule1_hit and rule2_hit else "rule1Only" if rule1_hit else "rule2Only"
        groups.append({
            **group,
            "rule1Hit": rule1_hit,
            "rule2Hit": rule2_hit,
            "hitType": hit_type,
            "success": True,
        })

    group_count = len(groups)
    minimum = ceil(group_count * 0.3)
    rule1_only = sum(group["hitType"] == "rule1Only" for group in groups)
    rule2_only = sum(group["hitType"] == "rule2Only" for group in groups)
    both_hit = sum(group["hitType"] == "bothHit" for group in groups)
    result = {
        "rules": value["rules"], "predictionNumbers": prediction_numbers,
        "groupCount": group_count, "minimumIndependentHits": minimum,
        "rule1Only": rule1_only, "rule2Only": rule2_only, "bothHit": both_hit,
        "groups": groups,
    }
    if rule1["referencePosition"] == rule2["referencePosition"] and rule1["algorithmType"] == rule2["algorithmType"]:
        return {**result, "valid": False, "reason": "SAME_POSITION_AND_ALGORITHM"}
    if stopped_on_miss and group_count < 5:
        return {**result, "valid": False, "reason": "UNCOVERED_GROUP"}
    if rule1_only < minimum or rule2_only < minimum:
        return {**result, "valid": False, "reason": "INSUFFICIENT_INDEPENDENT_CONTRIBUTION"}
    if len(prediction_numbers) > 2:
        return {**result, "valid": False, "reason": "TOO_MANY_PREDICTIONS"}
    return {**result, "valid": True}
