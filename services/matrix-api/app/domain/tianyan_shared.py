from math import ceil
from typing import Any

from .models import lottery_maximum
from .tianyan import calculate_tianyan_prediction


TIANYAN_HISTORY_LIMIT = 30
TIANYAN_MINIMUM_STREAK = 4


def _stable_id(value: str) -> str:
    hash_value = 2166136261
    for character in value:
        hash_value ^= ord(character)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    encoded = "0"
    if hash_value:
        parts: list[str] = []
        while hash_value:
            hash_value, remainder = divmod(hash_value, 36)
            parts.append(digits[remainder])
        encoded = "".join(reversed(parts))
    return f"tianyan-{encoded}"


def _numbers(draw: dict[str, Any], number_order: str) -> list[int]:
    if number_order == "依實際開獎順序排序":
        raw = draw.get("drawOrderNumbers")
    else:
        raw = draw.get("sortedNumbers")
    if not isinstance(raw, list):
        raw = draw.get("numbers", [])
    return [int(value) for value in raw]


def _candidate_values(groups: list[dict[str, Any]], algorithm_type: str) -> list[int]:
    prefix = f"{algorithm_type}:"
    values: set[int] = set()
    for group in groups[:TIANYAN_HISTORY_LIMIT]:
        candidate_map = group.get("candidateMap", {})
        if not isinstance(candidate_map, dict):
            continue
        for key in candidate_map:
            if isinstance(key, str) and key.startswith(prefix):
                try:
                    values.add(int(key.split(":", 1)[1]))
                except (IndexError, ValueError):
                    continue
    return sorted(values)


def _state_identity(prepared: dict[str, Any], coordinate: dict[str, Any], algorithm_type: str, value: int) -> str:
    return "|".join(map(str, [
        prepared.get("lockedNumber", ""),
        prepared.get("lockedPosition", ""),
        prepared.get("predictionDistance", ""),
        prepared.get("numberOrder", ""),
        prepared.get("lockedSourceIndex", ""),
        prepared.get("lockedSourcePeriod", ""),
        coordinate.get("referenceOffset", ""),
        coordinate.get("referencePosition", ""),
        algorithm_type,
        value,
    ]))


def _rule_states(prepared: dict[str, Any]) -> list[dict[str, Any]]:
    maximum = lottery_maximum(prepared["lottery"])
    states: list[dict[str, Any]] = []
    for coordinate in prepared.get("coordinates", []):
        if not isinstance(coordinate, dict):
            continue
        groups = coordinate.get("groups", [])
        algorithm_types = coordinate.get("algorithmTypes", [])
        if not isinstance(groups, list) or not isinstance(algorithm_types, list):
            continue
        limited_groups = groups[:TIANYAN_HISTORY_LIMIT]
        for algorithm_type in algorithm_types:
            if algorithm_type not in {"加減", "合值", "拖牌"}:
                continue
            values = _candidate_values(limited_groups, algorithm_type)
            for value in values:
                typed_key = f"{algorithm_type}:{value}"
                hit_mask = 0
                group_keys: list[tuple[str, str]] = []
                for index, group in enumerate(limited_groups):
                    if typed_key in group.get("candidateMap", {}):
                        hit_mask |= 1 << index
                    group_keys.append((
                        str(group.get("source", {}).get("period", "")),
                        str(group.get("prediction", {}).get("period", "")),
                    ))
                current_base = (
                    int(prepared["lockedNumber"])
                    if algorithm_type == "拖牌"
                    else int(coordinate["aBaseNumber"])
                )
                prediction = calculate_tianyan_prediction(
                    algorithm_type, current_base, value, maximum,
                )
                identity = _state_identity(prepared, coordinate, algorithm_type, value)
                states.append({
                    "id": _stable_id(f"shared-rule|{identity}"),
                    "coordinate": coordinate,
                    "algorithmType": algorithm_type,
                    "value": value,
                    "currentBaseNumber": current_base,
                    "currentPredictionNumber": prediction,
                    "hitMask": hit_mask,
                    "availableCount": len(limited_groups),
                    "groupKeys": tuple(group_keys),
                })
    return states


def _global_group_count(prepared: dict[str, Any]) -> int:
    return min(
        TIANYAN_HISTORY_LIMIT,
        max(
            (
                len(coordinate.get("groups", []))
                for coordinate in prepared.get("coordinates", [])
                if isinstance(coordinate, dict)
            ),
            default=0,
        ),
    )


def _hit_index_bits(states: list[dict[str, Any]], group_count: int) -> list[int]:
    bits = [0] * group_count
    for state_index, state in enumerate(states):
        hit_mask = int(state["hitMask"])
        for group_index in range(group_count):
            if hit_mask & (1 << group_index):
                bits[group_index] |= 1 << state_index
    return bits


def _eligible_bits(states: list[dict[str, Any]], streak: int, global_group_count: int) -> int:
    require_next_miss = streak < global_group_count
    bits = 0
    for index, state in enumerate(states):
        available = int(state["availableCount"])
        if available < streak:
            continue
        if require_next_miss:
            if available <= streak:
                continue
            if int(state["hitMask"]) & (1 << streak):
                continue
        bits |= 1 << index
    return bits


def _aligned(left: dict[str, Any], right: dict[str, Any], count: int) -> bool:
    return left["groupKeys"][:count] == right["groupKeys"][:count]


def _find_highest_pairs(prepared: dict[str, Any], states: list[dict[str, Any]]) -> tuple[int, list[tuple[int, int]]]:
    global_group_count = _global_group_count(prepared)
    if global_group_count < TIANYAN_MINIMUM_STREAK or len(states) < 2:
        return 0, []
    hit_index = _hit_index_bits(states, global_group_count)
    same_bucket_bits: dict[tuple[int, str], int] = {}
    for index, state in enumerate(states):
        coordinate = state["coordinate"]
        bucket = (int(coordinate["referencePosition"]), str(state["algorithmType"]))
        same_bucket_bits[bucket] = same_bucket_bits.get(bucket, 0) | (1 << index)

    for streak in range(global_group_count, TIANYAN_MINIMUM_STREAK - 1, -1):
        minimum = ceil(streak * 0.3)
        prefix_mask = (1 << streak) - 1
        eligible = _eligible_bits(states, streak, global_group_count)
        if eligible == 0:
            continue
        cover_cache: dict[int, int] = {}
        pairs: list[tuple[int, int]] = []
        seen_pairs: set[tuple[int, int]] = set()

        for left_index, left in enumerate(states):
            if not (eligible & (1 << left_index)):
                continue
            left_hits = int(left["hitMask"]) & prefix_mask
            left_misses = prefix_mask ^ left_hits
            if left_misses.bit_count() < minimum:
                continue

            partners = cover_cache.get(left_misses)
            if partners is None:
                partners = eligible
                missing = left_misses
                while missing and partners:
                    bit = missing & -missing
                    group_index = bit.bit_length() - 1
                    partners &= hit_index[group_index]
                    missing ^= bit
                cover_cache[left_misses] = partners
            if partners == 0:
                continue

            coordinate = left["coordinate"]
            bucket = (int(coordinate["referencePosition"]), str(left["algorithmType"]))
            partners &= ~same_bucket_bits.get(bucket, 0)
            partners &= ~((1 << (left_index + 1)) - 1)

            while partners:
                bit = partners & -partners
                partners ^= bit
                right_index = bit.bit_length() - 1
                right = states[right_index]
                if not _aligned(left, right, streak):
                    continue
                right_hits = int(right["hitMask"]) & prefix_mask
                left_only = (left_hits & (prefix_mask ^ right_hits)).bit_count()
                if left_only < minimum:
                    continue
                pair = (left_index, right_index)
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    pairs.append(pair)

        if pairs:
            return streak, pairs
    return 0, []


def _rule_descriptor(state: dict[str, Any]) -> dict[str, Any]:
    coordinate = state["coordinate"]
    return {
        "id": state["id"],
        "validationPeriodOffset": int(coordinate["referenceOffset"]),
        "validationPeriod": str(coordinate.get("aReference", {}).get("period", "")),
        "validationPosition": int(coordinate["referencePosition"]),
        "referenceOffset": int(coordinate["referenceOffset"]),
        "referencePosition": int(coordinate["referencePosition"]),
        "algorithmType": state["algorithmType"],
        "value": int(state["value"]),
        "ruleValue": int(state["value"]),
        "currentBaseNumber": int(state["currentBaseNumber"]),
        "currentPredictionNumber": int(state["currentPredictionNumber"]),
    }


def _group_rule_validation(
    state: dict[str, Any],
    group: dict[str, Any],
    *,
    maximum: int,
    hit: bool,
) -> dict[str, Any]:
    algorithm_type = str(state["algorithmType"])
    coordinate = state["coordinate"]
    base_number = (
        int(group["lockedBaseNumber"])
        if algorithm_type == "拖牌"
        else int(group["baseNumber"])
    )
    calculation = calculate_tianyan_prediction(
        algorithm_type, base_number, int(state["value"]), maximum,
    )
    prefix = f"{algorithm_type}:"
    candidate_values = sorted({
        int(key.split(":", 1)[1])
        for key in group.get("candidateMap", {})
        if isinstance(key, str) and key.startswith(prefix)
    })
    return {
        "validationPeriodOffset": int(coordinate["referenceOffset"]),
        "validationPeriod": str(group["reference"].get("period", "")),
        "validationPosition": int(coordinate["referencePosition"]),
        "baseNumber": base_number,
        "algorithmType": algorithm_type,
        "candidateValues": candidate_values,
        "ruleValue": int(state["value"]),
        "calculationResult": calculation,
        "hit": hit,
    }


def _historical_validation(
    prepared: dict[str, Any],
    left: dict[str, Any],
    right: dict[str, Any],
    streak: int,
) -> list[dict[str, Any]]:
    maximum = lottery_maximum(prepared["lottery"])
    rows: list[dict[str, Any]] = []
    left_groups = left["coordinate"]["groups"]
    right_groups = right["coordinate"]["groups"]
    for index in range(streak):
        left_group = left_groups[index]
        right_group = right_groups[index]
        left_hit = bool(int(left["hitMask"]) & (1 << index))
        right_hit = bool(int(right["hitMask"]) & (1 << index))
        hit_type = "bothHit" if left_hit and right_hit else "rule1Only" if left_hit else "rule2Only"
        left_validation = _group_rule_validation(left, left_group, maximum=maximum, hit=left_hit)
        right_validation = _group_rule_validation(right, right_group, maximum=maximum, hit=right_hit)
        hit_numbers = sorted({
            validation["calculationResult"]
            for validation in (left_validation, right_validation)
            if validation["hit"]
        })
        source = left_group["source"]
        prediction = left_group["prediction"]
        rows.append({
            "group": str(left_group.get("group", index + 1)),
            "sourcePeriod": str(source.get("period", "")),
            "sourceNumbers": _numbers(source, prepared["numberOrder"]),
            "lockedPosition": int(prepared["lockedPosition"]),
            "lockedNumber": int(prepared["lockedNumber"]),
            "predictionPeriod": str(prediction.get("period", "")),
            "predictionNumbers": _numbers(prediction, prepared["numberOrder"]),
            "rule1": left_validation,
            "rule2": right_validation,
            "hitType": hit_type,
            "hitNumbers": hit_numbers,
            "success": True,
        })
    return rows


def build_tianyan_unit_artifact(prepared: dict[str, Any]) -> dict[str, Any]:
    states = _rule_states(prepared)
    streak, pairs = _find_highest_pairs(prepared, states)
    empty = {"items": [], "validationById": {}}
    if streak < TIANYAN_MINIMUM_STREAK or not pairs:
        return empty

    merged_predictions = sorted({
        str(states[index]["currentPredictionNumber"]).zfill(2)
        for pair in pairs
        for index in pair
    })
    if len(merged_predictions) > 2:
        return empty

    minimum = ceil(streak * 0.3)
    prefix_mask = (1 << streak) - 1
    items: list[dict[str, Any]] = []
    validations: dict[str, Any] = {}
    for left_index, right_index in pairs:
        left = states[left_index]
        right = states[right_index]
        left_hits = int(left["hitMask"]) & prefix_mask
        right_hits = int(right["hitMask"]) & prefix_mask
        rule1_only = (left_hits & (prefix_mask ^ right_hits)).bit_count()
        rule2_only = (right_hits & (prefix_mask ^ left_hits)).bit_count()
        both_hit = (left_hits & right_hits).bit_count()
        predictions = sorted({
            str(left["currentPredictionNumber"]).zfill(2),
            str(right["currentPredictionNumber"]).zfill(2),
        })
        signature = "|".join(map(str, [
            prepared["lockedNumber"], prepared["lockedPosition"],
            prepared.get("lockedSourceIndex", ""), prepared.get("lockedSourcePeriod", ""),
            prepared["predictionDistance"], prepared["numberOrder"],
            *sorted([left["id"], right["id"]]),
            ",".join(predictions),
        ]))
        identifier = _stable_id(signature)
        item = {
            "id": identifier,
            "number": str(prepared["lockedNumber"]).zfill(2),
            "lockedPosition": int(prepared["lockedPosition"]),
            "predictionDistance": int(prepared["predictionDistance"]),
            "consecutive": f"準{streak}進{streak + 1}",
            "highestStreak": streak,
            "predictionNumbers": predictions,
            "roadType": "複合",
            "hitCondition": "準5+（鎖定2碼）",
            "numberOrder": prepared["numberOrder"],
            "explorePeriods": 13,
            "exploreDateOffset": int(prepared["exploreDateOffset"]),
            "ruleIds": [left["id"], right["id"]],
        }
        for optional in ("lockedSourceIndex", "lockedSourcePeriod"):
            if optional in prepared:
                item[optional] = prepared[optional]
        items.append(item)
        validations[identifier] = {
            "itemId": identifier,
            "sourceA": {
                "sourcePeriod": str(prepared["source"].get("period", "")),
                "sourceNumbers": _numbers(prepared["source"], prepared["numberOrder"]),
                "lockedPosition": int(prepared["lockedPosition"]),
                "lockedNumber": int(prepared["lockedNumber"]),
                "predictionDistance": int(prepared["predictionDistance"]),
            },
            "rules": [_rule_descriptor(left), _rule_descriptor(right)],
            "groupCount": streak,
            "minimumIndependentHits": minimum,
            "rule1Only": rule1_only,
            "rule2Only": rule2_only,
            "bothHit": both_hit,
            "mergedSearchPredictionNumbers": merged_predictions,
            "historicalValidation": _historical_validation(prepared, left, right, streak),
        }

    items.sort(key=lambda item: item["id"])
    return {"items": items, "validationById": validations}
