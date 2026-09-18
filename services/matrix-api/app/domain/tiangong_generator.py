from typing import Any

from .models import lottery_maximum, lottery_position_count, normalize_matrix_number
from .tiangong import enumerate_equal_spacing_sequences, evaluate_tiangong_candidate


def result_position(source_position: int, distance: int) -> int:
    return source_position - distance


def enumerate_position_paths(count: int, group_count: int) -> list[dict[str, Any]]:
    paths = []
    for direction, delta in (("固定", 0), ("依序遞增", 1), ("依序遞減", -1)):
        for start in range(1, count + 1):
            positions = [start + delta * index for index in range(group_count)]
            if all(1 <= position <= count for position in positions):
                paths.append({"startPosition": start, "direction": direction, "positionsOldestToNewest": positions})
    return paths


def _apply_rule(base: int, rule: dict[str, Any], maximum: int) -> int:
    value = rule["value"] - base if rule["algorithmType"] == "合值" else base + rule["value"]
    return normalize_matrix_number(value, maximum)


def derive_tiangong_rules(base: int, target: int, maximum: int) -> list[dict[str, Any]]:
    return [
        {"algorithmType": "加減", "value": (target - base + maximum) % maximum},
        {"algorithmType": "合值", "value": base + target},
    ]


def enumerate_reference_positions(source_position: int, final_distance: int, history_length: int) -> list[int]:
    positions = [source_position + distance for distance in range(1, 15)]
    positions += [source_position]
    positions += [source_position - distance for distance in range(1, final_distance)]
    final_position = result_position(source_position, final_distance)
    return [position for position in positions if 1 <= position <= history_length and position != final_position]


def _reference_offsets(source_positions: list[int], final_distance: int, history_length: int, requested: list[int] | None) -> list[int]:
    allowed = [
        {position - source for position in enumerate_reference_positions(source, final_distance, history_length)}
        for source in source_positions
    ]
    first = requested if requested is not None else list(allowed[0])
    return [offset for offset in first if all(offset in values for values in allowed)]


def _normalize_history(lottery: str, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    count = lottery_position_count(lottery)
    normalized = []
    for draw in history:
        order = draw.get("drawOrderNumbers")
        values = order if isinstance(order, list) and len(order) == count else draw.get("numbers", [])
        if len(values) != count:
            raise ValueError("INVALID_MATRIX_DRAW")
        try:
            numbers = [int(value) for value in values]
        except (TypeError, ValueError) as error:
            raise ValueError("INVALID_MATRIX_DRAW") from error
        normalized.append({"period": draw["period"], "numbers": numbers})
    return normalized


def _future_period(latest_period: str, distance: int) -> str:
    return str(int(latest_period) + distance).zfill(len(latest_period)) if latest_period.isdigit() else f"下{distance}期"


def _stage_evidence(stage: dict[str, Any], position: int, input_number: int, output_number: int, actual: int | None = None) -> dict[str, Any]:
    value = {
        "distance": stage["nextN"], "position": position, "algorithmType": stage["algorithmType"],
        "value": stage["value"], "inputNumber": input_number, "outputNumber": output_number,
    }
    if actual is not None:
        value.update({"actualNumber": actual, "hit": output_number == actual})
    return value


def _group_name(source_index: int) -> str:
    return ("A", "B", "C", "D")[source_index]


def _two_stage_evidence(history: list[dict[str, Any]], sequence: list[int], offset: int, explore: dict[str, Any], first_path: dict[str, Any], second_path: dict[str, Any], first_stage: dict[str, Any], second_stage: dict[str, Any], first_rule: dict[str, Any], second_rule: dict[str, Any], maximum: int) -> list[dict[str, Any]]:
    first_rows, second_rows = [], []
    prediction_row = None
    source_positions = list(reversed(sequence))
    length = len(sequence)
    for traversal, source_position in enumerate(source_positions):
        source_index = length - traversal - 1
        source = history[source_position - 1]
        reference_position = source_position + offset
        reference = history[reference_position - 1]
        reference_ball = explore["positionsOldestToNewest"][traversal]
        base = reference["numbers"][reference_ball - 1]
        first_output = _apply_rule(base, first_rule, maximum)
        first_result = history[result_position(source_position, first_stage["nextN"]) - 1]
        first_ball = first_path["positionsOldestToNewest"][traversal]
        common = {
            "group": _group_name(source_index), "sourcePosition": source_position, "sourcePeriod": source["period"],
            "sourceNumbers": source["numbers"], "referenceOffset": offset, "referencePosition": reference_position,
            "referencePeriod": reference["period"], "referenceBallPosition": reference_ball, "baseNumber": base,
            "firstStage": _stage_evidence(first_stage, first_ball, base, first_output, first_result["numbers"][first_ball - 1]),
        }
        first_rows.append({**common, "role": "first-stage-evidence", "resultPeriod": first_result["period"], "resultNumbers": first_result["numbers"]})
        final_position = result_position(source_position, first_stage["nextN"] + second_stage["nextN"])
        second_ball = second_path["positionsOldestToNewest"][traversal]
        second_output = _apply_rule(first_output, second_rule, maximum)
        if source_index == 0:
            distance = 1 - final_position
            prediction_row = {**common, "role": "prediction", "secondStage": _stage_evidence(second_stage, second_ball, first_output, second_output), "resultPeriod": _future_period(history[0]["period"], distance), "predictionDistance": distance}
        else:
            final_result = history[final_position - 1]
            second_rows.append({**common, "role": "second-stage-validation", "secondStage": _stage_evidence(second_stage, second_ball, first_output, second_output, final_result["numbers"][second_ball - 1]), "resultPeriod": final_result["period"], "resultNumbers": final_result["numbers"]})
    return first_rows + second_rows + ([prediction_row] if prediction_row else [])


def _previous_path_position(path: dict[str, Any], count: int) -> int | None:
    delta = 1 if path["direction"] == "依序遞增" else -1 if path["direction"] == "依序遞減" else 0
    position = path["positionsOldestToNewest"][0] - delta
    return position if 1 <= position <= count else None


def _previous_group_passes_two_stages(
    history: list[dict[str, Any]], sequence: list[int], offset: int,
    explore: dict[str, Any], first_path: dict[str, Any], second_path: dict[str, Any],
    n1: int, final_distance: int, first_rule: dict[str, Any],
    second_rule: dict[str, Any], maximum: int, count: int,
) -> bool | None:
    interval = sequence[1] - sequence[0]
    source_position = sequence[-1] + interval
    reference_position = source_position + offset
    first_result_position = result_position(source_position, n1)
    final_position = result_position(source_position, final_distance)
    required_positions = (
        source_position, reference_position, first_result_position, final_position,
    )
    if any(position < 1 or position > len(history) for position in required_positions):
        return None

    explore_position = _previous_path_position(explore, count)
    first_position = _previous_path_position(first_path, count)
    second_position = _previous_path_position(second_path, count)
    if None in {explore_position, first_position, second_position}:
        return False

    base = history[reference_position - 1]["numbers"][explore_position - 1]
    first_output = _apply_rule(base, first_rule, maximum)
    first_actual = history[first_result_position - 1]["numbers"][first_position - 1]
    if first_output != first_actual:
        return False
    second_output = _apply_rule(first_output, second_rule, maximum)
    second_actual = history[final_position - 1]["numbers"][second_position - 1]
    return second_output == second_actual


def _two_stage_candidates(lottery: str, history: list[dict[str, Any]], period_range: int, hit_condition: str, options: dict[str, Any]) -> list[dict[str, Any]]:
    length = 3 if hit_condition == "準2進3" else 4
    maximum, count = lottery_maximum(lottery), lottery_position_count(lottery)
    sequences = options.get("sourceSequences") or enumerate_equal_spacing_sequences(period_range, hit_condition)
    sequences = [sequence for sequence in sequences if len(sequence) == length and sequence[-1] <= period_range]
    explore_paths = options.get("explorePaths") or enumerate_position_paths(count, length)
    first_paths = options.get("firstStagePaths") or enumerate_position_paths(count, length)
    second_paths = options.get("secondStagePaths") or enumerate_position_paths(count, length)
    candidates = []
    for sequence in sequences:
        if sequence[-1] > len(history):
            continue
        a, interval = sequence[0], sequence[1] - sequence[0]
        first_distances = options.get("firstStageDistances") or list(range(1, a))
        source_positions = list(reversed(sequence))
        for n1 in first_distances:
            if not isinstance(n1, int) or not 1 <= n1 < a:
                continue
            first_result_positions = [result_position(position, n1) for position in source_positions]
            if any(position < 1 or position > len(history) for position in first_result_positions):
                continue
            start_n2 = max(a, n1 + 1) - n1
            second_distances = options.get("secondStageDistances") or list(range(start_n2, a + interval - n1))
            for n2 in second_distances:
                final_distance = n1 + n2
                if not isinstance(n2, int) or n2 < 1 or not a <= final_distance < a + interval:
                    continue
                final_positions = [result_position(position, final_distance) for position in source_positions[:-1]]
                if any(position < 1 or position > len(history) for position in final_positions):
                    continue
                offsets = _reference_offsets(source_positions, final_distance, len(history), options.get("referenceOffsets"))
                for explore in explore_paths:
                    for first_path in first_paths:
                        if len(explore["positionsOldestToNewest"]) != length or len(first_path["positionsOldestToNewest"]) != length:
                            continue
                        for offset in offsets:
                            first_pairs = []
                            for index, source_position in enumerate(source_positions):
                                reference = history[source_position + offset - 1]
                                result = history[first_result_positions[index] - 1]
                                first_pairs.append((reference["numbers"][explore["positionsOldestToNewest"][index] - 1], result["numbers"][first_path["positionsOldestToNewest"][index] - 1]))
                            first_rules = [rule for rule in derive_tiangong_rules(*first_pairs[0], maximum) if all(_apply_rule(base, rule, maximum) == target for base, target in first_pairs[1:])]
                            for first_rule in first_rules:
                                first_outputs = [_apply_rule(base, first_rule, maximum) for base, _ in first_pairs]
                                for second_path in second_paths:
                                    if len(second_path["positionsOldestToNewest"]) != length:
                                        continue
                                    second_pairs = [(first_outputs[index], history[final_positions[index] - 1]["numbers"][second_path["positionsOldestToNewest"][index] - 1]) for index in range(length - 1)]
                                    second_rules = [rule for rule in derive_tiangong_rules(*second_pairs[0], maximum) if all(_apply_rule(base, rule, maximum) == target for base, target in second_pairs[1:])]
                                    for second_rule in second_rules:
                                        previous_group_passes = _previous_group_passes_two_stages(
                                            history, sequence, offset, explore, first_path,
                                            second_path, n1, final_distance, first_rule,
                                            second_rule, maximum, count,
                                        )
                                        if previous_group_passes is not False:
                                            continue
                                        first_stage = {"startPosition": first_path["startPosition"], "direction": first_path["direction"], "algorithmType": first_rule["algorithmType"], "value": first_rule["value"], "nextN": n1}
                                        second_stage = {"startPosition": second_path["startPosition"], "direction": second_path["direction"], "algorithmType": second_rule["algorithmType"], "value": second_rule["value"], "nextN": n2}
                                        rows = _two_stage_evidence(history, sequence, offset, explore, first_path, second_path, first_stage, second_stage, first_rule, second_rule, maximum)
                                        candidates.append({"lottery": lottery, "periodRange": period_range, "sourceSequence": sequence, "mode": "two-stage", "hitCondition": hit_condition, "exploreDirection": explore["direction"], "baseNumber": first_pairs[-1][0], "firstStage": first_stage, "secondStage": second_stage, "validationRows": rows})
    return candidates


def run_tiangong_candidates(lottery: str, matrix_history: list[dict[str, Any]], options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    options = options or {}
    history = _normalize_history(lottery, matrix_history)
    period_ranges = options.get("periodRanges", [80])
    modes = options.get("modes", ["two-stage"])
    conditions = options.get("hitConditions", ["準2進3"])
    if any(mode != "two-stage" for mode in modes):
        raise ValueError("INVALID_TIANGONG_MODE")
    if any(condition != "準2進3" for condition in conditions):
        raise ValueError("INVALID_HIT_CONDITION")
    candidates = []
    for mode in modes:
        for period_range in period_ranges:
            for condition in conditions:
                candidates.extend(
                    _two_stage_candidates(lottery, history, period_range, condition, options)
                )
    unique, seen = [], set()
    for candidate in candidates:
        result = evaluate_tiangong_candidate(candidate)
        signature = "|".join(str(result.get(key, "")) for key in ("ruleIdentity", "predictionDistance", "predictedPosition", "predictionNumber", "roadType"))
        if signature not in seen:
            seen.add(signature)
            unique.append(candidate)
    return unique
