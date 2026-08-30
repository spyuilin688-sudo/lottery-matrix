from .models import lottery_maximum, lottery_position_count, normalize_matrix_number


def enumerate_equal_spacing_sequences(periods: int, hit_condition: str) -> list[list[int]]:
    if periods not in {50, 80}:
        raise ValueError("INVALID_PERIOD_RANGE")
    if hit_condition != "準2進3":
        raise ValueError("INVALID_HIT_CONDITION")
    length = 3
    sequences: list[list[int]] = []
    for first in range(1, periods + 1):
        interval = first
        while first + interval * (length - 1) <= periods:
            sequences.append([first + interval * index for index in range(length)])
            interval += 1
    return sequences


def _valid_source_sequence(sequence: list[int], period_range: int, hit_condition: str) -> bool:
    if hit_condition != "準2進3":
        return False
    if len(sequence) != 3 or any(not isinstance(value, int) or isinstance(value, bool) for value in sequence):
        return False
    if sequence[0] < 1 or sequence[-1] > period_range:
        return False
    interval = sequence[1] - sequence[0]
    return interval > 0 and all(sequence[index] - sequence[index - 1] == interval for index in range(2, len(sequence)))


def _valid_stage(stage: dict, count: int) -> bool:
    position = stage.get("startPosition")
    next_n = stage.get("nextN")
    if not isinstance(position, int) or isinstance(position, bool) or not 1 <= position <= count:
        return False
    if not isinstance(next_n, int) or isinstance(next_n, bool) or next_n < 1:
        return False
    if stage.get("direction") not in {"固定", "依序遞增", "依序遞減"}:
        return False
    rule_value = stage.get("value")
    if not isinstance(rule_value, int) or isinstance(rule_value, bool):
        return False
    if stage.get("algorithmType") == "加減":
        return -49 <= rule_value <= 49
    return stage.get("algorithmType") == "合值" and 1 <= rule_value <= 98


def _apply_stage(value: int, stage: dict, maximum: int) -> int:
    if stage["algorithmType"] == "合值":
        return normalize_matrix_number(stage["value"] - value, maximum)
    return normalize_matrix_number(value + stage["value"], maximum)


def _predicted_position(stage: dict, hit_condition: str, count: int) -> int | None:
    if hit_condition != "準2進3":
        return None
    group = 3
    delta = 1 if stage["direction"] == "依序遞增" else -1 if stage["direction"] == "依序遞減" else 0
    position = stage["startPosition"] + delta * (group - 1)
    return position if 1 <= position <= count else None


def _road(stage: dict) -> str:
    return "拖牌" if stage["algorithmType"] == "加減" and stage["value"] == 0 else stage["algorithmType"]


def _road_type(first: dict, second: dict | None) -> str:
    first_road = _road(first)
    if second is None:
        return f"{first_road}版路"
    second_road = _road(second)
    return f"{first_road}版路" if first_road == second_road else f"{first_road}＋{second_road}"


def _stage_identity(stage: dict) -> str:
    return ":".join(str(stage[key]) for key in ["startPosition", "direction", "algorithmType", "value", "nextN"])


def evaluate_tiangong_candidate(value: dict) -> dict:
    source = value["sourceSequence"]
    stage_count = 2 if value["mode"] == "two-stage" else 1
    second = value.get("secondStage")
    prediction_distance = value["firstStage"]["nextN"] + (second["nextN"] if stage_count == 2 and second else 0) - source[0] + 1
    parts = [
        value["periodRange"], "-".join(map(str, source)), value["mode"], value["hitCondition"],
        value["exploreDirection"], prediction_distance, _stage_identity(value["firstStage"]),
    ]
    if second:
        parts.append(_stage_identity(second))
    base = {
        "valid": False, "ruleIdentity": "|".join(map(str, parts)), "interval": source[1] - source[0],
        "predictionDistance": prediction_distance, "stageCount": stage_count,
        "exploreDirection": value["exploreDirection"], "firstStage": value["firstStage"],
        "validationRows": value["validationRows"],
    }
    if stage_count == 2 and second:
        base["secondStage"] = second
    if value.get("mode") != "two-stage":
        return {**base, "reason": "INVALID_TIANGONG_MODE"}
    if value["periodRange"] not in {50, 80}:
        return {**base, "reason": "INVALID_PERIOD_RANGE"}
    if not _valid_source_sequence(source, value["periodRange"], value["hitCondition"]):
        return {**base, "reason": "INVALID_SOURCE_SEQUENCE"}
    if stage_count == 2 and not second:
        return {**base, "reason": "INVALID_STAGE"}
    count = lottery_position_count(value["lottery"])
    stages = [value["firstStage"]] + ([second] if stage_count == 2 and second else [])
    if any(not _valid_stage(stage, count) for stage in stages):
        return {**base, "reason": "INVALID_RULE"}
    if prediction_distance < 1:
        return {**base, "reason": "PREDICTION_NOT_FUTURE"}
    maximum = lottery_maximum(value["lottery"])
    prediction = value["baseNumber"]
    for stage in stages:
        prediction = _apply_stage(prediction, stage, maximum)
    final_position = _predicted_position(stages[-1], value["hitCondition"], count)
    if final_position is None:
        return {**base, "reason": "INVALID_RULE"}
    return {
        **base, "valid": True, "predictedPosition": final_position,
        "predictionNumber": str(prediction).zfill(2), "roadType": _road_type(value["firstStage"], second if stage_count == 2 else None),
    }


def deduplicate_tiangong_results(results: list[dict]) -> list[dict]:
    unique: list[dict] = []
    seen: set[str] = set()
    for result in results:
        signature = "|".join(str(result.get(key, "")) for key in ["valid", "reason", "ruleIdentity", "predictedPosition", "predictionNumber", "roadType"])
        if signature not in seen:
            seen.add(signature)
            unique.append(result)
    return unique
