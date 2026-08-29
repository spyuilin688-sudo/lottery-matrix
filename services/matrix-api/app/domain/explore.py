from itertools import combinations
from typing import Any

from .models import lottery_maximum, lottery_position_count, normalize_matrix_number


LOTTERIES = {"今彩539", "天天樂", "六合彩", "大樂透"}
NUMBER_ORDERS = {"依號碼由小到大排序", "依實際開獎順序排序"}
ALGORITHM_TYPES = {"加減", "合值", "拖牌"}
MAX_VALIDATION_STREAK = 13
INVALID_THREE_RULE_COVERAGE_REASON = "規則上限為2條；若必須使用3條（含3條）以上才能覆蓋全部歷史驗證組，整筆版路無效，不得輸出"


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{name}必須為整數")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{name}必須為整數") from error
    if isinstance(value, float) and value != parsed:
        raise ValueError(f"{name}必須為整數")
    return parsed


def _parse_request(value: Any) -> dict:
    if not isinstance(value, dict):
        raise ValueError("請提供完整演算法條件")
    lottery = str(value.get("lottery", ""))
    order_aliases = {"依號碼由小到大": "依號碼由小到大排序", "依實際開獎順序": "依實際開獎順序排序"}
    type_aliases = {"加減版路": "加減", "合值版路": "合值", "拖牌版路": "拖牌"}
    number_order = order_aliases.get(str(value.get("numberOrder", "")), str(value.get("numberOrder", "")))
    algorithm_type = type_aliases.get(str(value.get("algorithmType", "")), str(value.get("algorithmType", "")))
    if lottery not in LOTTERIES: raise ValueError("未知彩種")
    if number_order not in NUMBER_ORDERS: raise ValueError("未知號碼順序")
    if algorithm_type not in ALGORITHM_TYPES: raise ValueError("未知版路類型")
    locked_position = _integer(value.get("lockedPosition"), "鎖定位置")
    locked_number = _integer(value.get("lockedNumber"), "鎖定號碼")
    prediction_distance = _integer(value.get("predictionDistance"), "預測期距離")
    rule_count = _integer(value.get("ruleCount"), "規則數量")
    if not 1 <= locked_position <= lottery_position_count(lottery): raise ValueError("鎖定位置超出彩種位置範圍")
    if not 1 <= locked_number <= lottery_maximum(lottery): raise ValueError("鎖定號碼超出彩種號碼範圍")
    if prediction_distance < 1: raise ValueError("預測期距離必須大於0")
    if rule_count not in {1, 2}: raise ValueError("規則數量只能是一碼或二碼")
    request = {
        "lottery": lottery, "numberOrder": number_order, "lockedPosition": locked_position,
        "lockedNumber": locked_number, "predictionDistance": prediction_distance,
        "ruleCount": rule_count, "algorithmType": algorithm_type,
    }
    if value.get("lockedSourcePeriod") is not None:
        request["lockedSourcePeriod"] = str(value["lockedSourcePeriod"])
    if algorithm_type == "拖牌":
        return request
    reference_offset = _integer(value.get("referenceOffset"), "參照位移")
    reference_position = _integer(value.get("referencePosition"), "參照位置")
    if not 1 <= reference_position <= lottery_position_count(lottery): raise ValueError("參照位置超出彩種位置範圍")
    if reference_offset >= prediction_distance: raise ValueError("參照期不得等於或晚於預測期")
    return {**request, "referenceOffset": reference_offset, "referencePosition": reference_position}


def _ordered_numbers(draw: dict, lottery: str, order: str) -> list[int]:
    count = lottery_position_count(lottery)
    if order == "依實際開獎順序排序":
        values = draw.get("drawOrderNumbers")
        return [int(number) for number in values] if isinstance(values, list) and len(values) == count else []
    sorted_values = draw.get("sortedNumbers")
    if isinstance(sorted_values, list) and len(sorted_values) == count:
        return [int(number) for number in sorted_values]
    values = [int(number) for number in draw["numbers"]]
    return sorted(values[:6]) + [values[6]] if count == 7 else sorted(values)


def _number_at(draw: dict, lottery: str, order: str, position: int) -> int | None:
    values = _ordered_numbers(draw, lottery, order)
    return values[position - 1] if 0 < position <= len(values) else None


def _history_for_lottery(lottery: str, history: list[dict]) -> list[dict]:
    return [draw for draw in history if draw.get("lottery", lottery) == lottery]


def _base_for_source(history: list[dict], source_index: int, request: dict) -> dict | None:
    if request["algorithmType"] == "拖牌":
        base = _number_at(history[source_index], request["lottery"], request["numberOrder"], request["lockedPosition"])
        return None if base is None else {"reference": history[source_index], "baseNumber": base}
    reference_index = source_index + request.get("referenceOffset", 0)
    if reference_index < 0 or reference_index >= len(history):
        return None
    reference = history[reference_index]
    base = _number_at(reference, request["lottery"], request["numberOrder"], request.get("referencePosition", 0))
    return None if base is None else {"reference": reference, "baseNumber": base}


def _candidate_rule(algorithm_type: str, base_number: int, target: int, maximum: int) -> int:
    return base_number + target if algorithm_type == "合值" else (target - base_number + maximum) % maximum


def _apply_rule(algorithm_type: str, base_number: int, rule: int, maximum: int) -> int:
    return normalize_matrix_number(rule - base_number, maximum) if algorithm_type == "合值" else normalize_matrix_number(base_number + rule, maximum)


def _typed_key(algorithm_type: str, value: int) -> str:
    return f"{algorithm_type}:{value}"


def _typed_parts(key: str) -> dict:
    algorithm_type, value = key.split(":", 1)
    return {"algorithmType": algorithm_type, "value": int(value)}


def _add_rule(mapping: dict[str, list[int]], algorithm_type: str, value: int, target: int) -> None:
    targets = mapping.setdefault(_typed_key(algorithm_type, value), [])
    if target not in targets:
        targets.append(target)


def _group_name(index: int) -> str:
    code = 66 + index
    return chr(code) if code <= 90 else f"B{index + 1}"


def _build_group(history: list[dict], source_index: int, request: dict, group_name: str) -> dict | None:
    prediction_index = source_index + request["predictionDistance"]
    if prediction_index < 0 or prediction_index >= len(history):
        return None
    base = _base_for_source(history, source_index, request)
    if base is None:
        return None
    source = history[source_index]
    locked_base = _number_at(source, request["lottery"], request["numberOrder"], request["lockedPosition"])
    if locked_base is None:
        return None
    maximum = lottery_maximum(request["lottery"])
    prediction = history[prediction_index]
    candidate_map: dict[str, list[int]] = {}
    locked_is_reference = request.get("referenceOffset") == 0 and request.get("referencePosition") == request["lockedPosition"]
    for target in [int(number) for number in prediction["numbers"]]:
        drag_rule = _candidate_rule("拖牌", locked_base, target, maximum)
        if request["algorithmType"] == "拖牌":
            _add_rule(candidate_map, "拖牌", drag_rule, target)
        else:
            rule = _candidate_rule(request["algorithmType"], base["baseNumber"], target, maximum)
            if request["algorithmType"] == "加減" and rule == 0:
                _add_rule(candidate_map, "拖牌", 0, target)
            elif not (request["algorithmType"] == "加減" and locked_is_reference):
                _add_rule(candidate_map, request["algorithmType"], rule, target)
    return {
        "group": group_name, "source": source, "reference": base["reference"], "prediction": prediction,
        "baseNumber": base["baseNumber"], "lockedBaseNumber": locked_base, "candidateMap": candidate_map,
    }


def _streak(groups: list[dict], rules: list[str]) -> int:
    count = 0
    for group in groups:
        if not any(rule in group["candidateMap"] for rule in rules):
            break
        count += 1
    return count


def _coverage(groups: list[dict], rules: list[str], streak_length: int) -> dict:
    covered = groups[:streak_length]
    indexes = [[index for index, group in enumerate(covered) if rule in group["candidateMap"]] for rule in rules]
    valid = all(values and (len(values) > 1 or 0 < values[0] < streak_length - 1) for values in indexes)
    return {"valid": valid, "hitCounts": sorted(len(values) for values in indexes)}


def _highest_rule_sets(groups: list[dict], rule_count: int) -> dict:
    candidates = sorted({rule for group in groups for rule in group["candidateMap"]})
    highest = best_minimum = best_maximum = 0
    sets: list[list[str]] = []
    candidates_to_check = ([candidate] for candidate in candidates) if rule_count == 1 else combinations(candidates, 2)
    for current_rules in candidates_to_check:
        rules = list(current_rules)
        current = _streak(groups, rules)
        if current == 0:
            continue
        coverage = _coverage(groups, rules, current) if rule_count == 2 else {"valid": True, "hitCounts": [current, current]}
        if not coverage["valid"]:
            continue
        minimum = coverage["hitCounts"][0]
        maximum = coverage["hitCounts"][-1]
        better = current > highest or (current == highest and (minimum > best_minimum or (minimum == best_minimum and maximum > best_maximum)))
        equal = current == highest and minimum == best_minimum and maximum == best_maximum
        if better:
            highest, best_minimum, best_maximum, sets = current, minimum, maximum, [rules]
        elif equal:
            sets.append(rules)
    return {"highest": highest, "sets": sets}


def _rule_label(algorithm_type: str, value: int) -> str:
    return str(value) if algorithm_type == "合值" else f"+{value}"


def _validation(groups: list[dict], rules: list[str], request: dict) -> list[dict]:
    rows = []
    for group in groups:
        matched_keys = [rule for rule in rules if rule in group["candidateMap"]]
        hit_numbers = sorted({number for rule in matched_keys for number in group["candidateMap"].get(rule, [])})
        success = bool(matched_keys)
        candidate_rules = sorted({_typed_parts(rule)["value"] for rule in group["candidateMap"]})
        matched_rules = [{**_typed_parts(rule), "display": _rule_label(_typed_parts(rule)["algorithmType"], _typed_parts(rule)["value"])} for rule in matched_keys]
        source, reference, prediction = group["source"], group["reference"], group["prediction"]
        rows.append({
            "group": group["group"], "sourcePeriod": source["period"],
            "sourceNumbers": _ordered_numbers(source, request["lottery"], request["numberOrder"]),
            "sourceSortedNumbers": source.get("sortedNumbers", source["numbers"]), "sourceDrawOrderNumbers": source.get("drawOrderNumbers"),
            "referencePeriod": reference["period"], "referenceNumbers": _ordered_numbers(reference, request["lottery"], request["numberOrder"]),
            "referenceSortedNumbers": reference.get("sortedNumbers", reference["numbers"]), "referenceDrawOrderNumbers": reference.get("drawOrderNumbers"),
            "baseNumber": group["baseNumber"], "predictionPeriod": prediction["period"],
            "predictionNumbers": prediction.get("sortedNumbers", prediction["numbers"]), "candidateRules": candidate_rules,
            "matchedRules": matched_rules, "hitNumbers": hit_numbers, "success": success,
        })
        if not success:
            break
    return rows


def _matching_source_indexes(request: dict, history: list[dict]) -> list[int]:
    return [
        index for index, draw in enumerate(history)
        if draw.get("lottery", request["lottery"]) == request["lottery"]
        and _number_at(draw, request["lottery"], request["numberOrder"], request["lockedPosition"]) == request["lockedNumber"]
    ]


def _evaluate_prepared(request: dict, history: list[dict], source_indexes: list[int], requested_source_index: int | None = None) -> dict:
    empty = {"valid": False, "searchCondition": request, "results": []}
    if not source_indexes: return {**empty, "reason": "找不到符合鎖定條件的來源期"}
    exact = requested_source_index if requested_source_index is not None else next((index for index, draw in enumerate(history) if draw["period"] == request.get("lockedSourcePeriod")), -1)
    a_index = exact if request.get("lockedSourcePeriod") else source_indexes[-1]
    if a_index < 0 or a_index not in source_indexes: return {**empty, "reason": "找不到指定鎖定條件來源期"}
    a_base = _base_for_source(history, a_index, request)
    if a_base is None: return {**empty, "reason": "A組找不到完整參照期或參照位置號碼"}
    historical_indexes = list(reversed([index for index in source_indexes if index < a_index]))
    groups: list[dict] = []
    counted: set[str] = set()
    for source_index in historical_indexes:
        if source_index + request["predictionDistance"] >= len(history):
            continue
        group = _build_group(history, source_index, request, _group_name(len(groups)))
        if group is None:
            break
        if request["ruleCount"] == 2 and group["prediction"]["period"] in counted:
            continue
        counted.add(group["prediction"]["period"])
        groups.append(group)
        if len(groups) >= MAX_VALIDATION_STREAK:
            break
    if not groups: return {**empty, "reason": "沒有可完成歷史驗證的來源組"}
    found = _highest_rule_sets(groups, request["ruleCount"])
    if found["highest"] == 0 or not found["sets"]: return {**empty, "reason": "找不到成立規則"}
    maximum = lottery_maximum(request["lottery"])
    prediction_index = a_index + request["predictionDistance"]
    a_prediction = history[prediction_index] if 0 <= prediction_index < len(history) else None
    source = history[a_index]
    reference = a_base["reference"]
    source_a = {
        "sourcePeriod": source["period"], "sourceNumbers": _ordered_numbers(source, request["lottery"], request["numberOrder"]),
        "sourceSortedNumbers": source.get("sortedNumbers", source["numbers"]), "sourceDrawOrderNumbers": source.get("drawOrderNumbers"),
        "referencePeriod": reference["period"], "referenceNumbers": _ordered_numbers(reference, request["lottery"], request["numberOrder"]),
        "referenceSortedNumbers": reference.get("sortedNumbers", reference["numbers"]), "referenceDrawOrderNumbers": reference.get("drawOrderNumbers"),
        "baseNumber": a_base["baseNumber"], "predictionPeriod": a_prediction["period"] if a_prediction else None,
        "predictionCompleted": bool(a_prediction),
    }
    result_sets = []
    for rules in found["sets"]:
        parsed = [_typed_parts(rule) for rule in rules]
        predictions = sorted({_apply_rule(rule["algorithmType"], request["lockedNumber"] if rule["algorithmType"] == "拖牌" else a_base["baseNumber"], rule["value"], maximum) for rule in parsed})
        result_sets.append({
            "rules": [{**rule, "display": _rule_label(rule["algorithmType"], rule["value"])} for rule in parsed],
            "predictionNumbers": predictions, "historicalValidation": _validation(groups, rules, request),
        })
    display = f'準{found["highest"]}進{found["highest"] + 1}'
    if request["ruleCount"] == 2 and len(result_sets) > 1:
        distinct = sorted({rule for rules in found["sets"] for rule in rules})
        merged = sorted({number for result in result_sets for number in result["predictionNumbers"]})
        if len(distinct) > 2 or len(merged) > 2:
            return {**empty, "reason": INVALID_THREE_RULE_COVERAGE_REASON, "highestStreak": found["highest"], "displayStreak": display, "conflictingRules": [_typed_parts(rule)["value"] for rule in distinct]}
        return {"valid": True, "searchCondition": request, "highestStreak": found["highest"], "displayStreak": display, "sourceA": source_a, "predictionNumbers": merged, "ruleSets": result_sets}
    return {"valid": True, "searchCondition": request, "highestStreak": found["highest"], "displayStreak": display, "sourceA": source_a, "results": result_sets}


def run_matrix_algorithm_with_history(value: Any, newest_first: list[dict]) -> dict:
    request = _parse_request(value)
    history = list(reversed(_history_for_lottery(request["lottery"], newest_first)))
    if request["numberOrder"] == "依實際開獎順序排序":
        count = lottery_position_count(request["lottery"])
        missing = [draw for draw in history if not isinstance(draw.get("drawOrderNumbers"), list) or len(draw["drawOrderNumbers"]) != count]
        if missing:
            return {
                "valid": False, "reason": "實際開獎順序（落球）資料不完整，不得以順球資料代替",
                "searchCondition": request, "missingDrawOrderCount": len(missing),
                "missingDrawOrderPeriods": [draw["period"] for draw in missing[-20:]], "results": [],
            }
    return _evaluate_prepared(request, history, _matching_source_indexes(request, history))


def _prediction_numbers(evaluated: dict) -> list[int]:
    if evaluated.get("predictionNumbers") is not None:
        return sorted({int(number) for number in evaluated["predictionNumbers"]})
    return sorted({int(number) for item in evaluated.get("results", []) for number in item["predictionNumbers"]})


def run_matrix_automatic_explore_with_history(value: dict, newest_first: list[dict]) -> dict:
    lottery = value["lottery"]
    newest_first = _history_for_lottery(lottery, newest_first)
    order_aliases = {"依號碼由小到大": "依號碼由小到大排序", "依實際開獎順序": "依實際開獎順序排序"}
    type_aliases = {"加減版路": "加減", "合值版路": "合值", "拖牌版路": "拖牌"}
    order = order_aliases.get(value.get("numberOrder"), value.get("numberOrder"))
    algorithm_type = type_aliases.get(value.get("algorithmType", value.get("roadType")), value.get("algorithmType", value.get("roadType")))
    period_digits = "".join(character for character in str(value.get("explorePeriods", value.get("period", ""))) if character.isdigit())
    periods = int(period_digits)
    hit_text = str(value.get("hitCondition", value.get("hit", "")))
    rule_count = 2 if "鎖定2碼" in hit_text else 1 if "鎖定1碼" in hit_text else int(value.get("ruleCount", 1))
    date_text = str(value.get("exploreDate", "本日"))
    date_offset = int(value.get("exploreDateOffset", 2 if "前日" in date_text else 1 if "昨日" in date_text else 0))
    explore_range = value.get("exploreRange", "標準範圍")
    minimum = _integer(value.get("minPredictionDistance"), "最小預測期距離")
    maximum = _integer(value.get("maxPredictionDistance"), "最大預測期距離")
    explore = {"lottery": lottery, "numberOrder": order, "explorePeriods": periods, "algorithmType": algorithm_type, "ruleCount": rule_count, "exploreDateOffset": date_offset, "exploreRange": explore_range, "minPredictionDistance": minimum, "maxPredictionDistance": maximum}
    anchor = newest_first[date_offset:]
    sources = anchor[1:periods + 1]
    count = lottery_position_count(lottery)
    reference_back = 14 if explore_range == "完整範圍" else 7
    results: list[dict] = []
    seen: set[str] = set()
    for locked_position in range(1, count + 1):
        for source in sources:
            locked_number = _number_at(source, lottery, order, locked_position)
            if locked_number is None: continue
            for distance in range(minimum, maximum + 1):
                offsets = [0] if algorithm_type == "拖牌" else list(range(-reference_back, distance))
                positions = [locked_position] if algorithm_type == "拖牌" else list(range(1, count + 1))
                for offset in offsets:
                    for position in positions:
                        request = {"lottery": lottery, "numberOrder": order, "lockedPosition": locked_position, "lockedNumber": locked_number, "lockedSourcePeriod": source["period"], "predictionDistance": distance, "ruleCount": rule_count, "algorithmType": algorithm_type}
                        if algorithm_type != "拖牌": request.update({"referenceOffset": offset, "referencePosition": position})
                        evaluated = run_matrix_algorithm_with_history(request, anchor)
                        if not evaluated.get("valid") or not evaluated.get("highestStreak") or evaluated["highestStreak"] < (4 if rule_count == 1 else 5): continue
                        predictions = _prediction_numbers(evaluated)
                        if not 1 <= len(predictions) <= 2: continue
                        key = "|".join(map(str, [locked_position, locked_number, offset, position, distance, algorithm_type, rule_count, evaluated["highestStreak"], ".".join(map(str, predictions))]))
                        if key in seen: continue
                        seen.add(key)
                        results.append({"id": key, "number": str(locked_number).zfill(2), "lockedPosition": locked_position, "predictionDistance": distance, "consecutive": evaluated["displayStreak"], "highestStreak": evaluated["highestStreak"], "predictionNumbers": [str(number).zfill(2) for number in predictions], "algorithmType": algorithm_type, "searchCondition": request, "sourceA": evaluated.get("sourceA"), "ruleSets": evaluated.get("results", evaluated.get("ruleSets", []))})
    results.sort(key=lambda item: (-item["highestStreak"], item["predictionDistance"], item["lockedPosition"]))
    duplicate: dict[str, int] = {}
    for result in results:
        for number in result["predictionNumbers"]: duplicate[number] = duplicate.get(number, 0) + 1
    duplicate_stats = [{"number": number, "count": count_value} for number, count_value in sorted(duplicate.items(), key=lambda item: (-item[1], int(item[0])))]
    return {"searchCondition": explore, "resultCount": len(results), "duplicateStats": duplicate_stats, "results": results}


def run_matrix_explore_group_with_history(value: dict, newest_first: list[dict]) -> dict:
    newest_first = _history_for_lottery(value["lottery"], newest_first)
    count = lottery_position_count(value["lottery"])
    source_index = value["lockedSourceIndex"]
    if not isinstance(source_index, int) or source_index < 0 or source_index >= min(15, len(newest_first)): raise ValueError("鎖定來源期超出探索日期與十三期範圍")
    if not 1 <= value["lockedPosition"] <= count: raise ValueError("鎖定位置超出彩種位置範圍")
    source = newest_first[source_index]
    locked_number = _number_at(source, value["lottery"], value["numberOrder"], value["lockedPosition"])
    if locked_number is None: return {"results": []}
    history = list(reversed(newest_first))
    if value["numberOrder"] == "依實際開獎順序排序" and any(not isinstance(draw.get("drawOrderNumbers"), list) or len(draw["drawOrderNumbers"]) != count for draw in history): return {"results": []}
    source_request = {"lottery": value["lottery"], "numberOrder": value["numberOrder"], "lockedPosition": value["lockedPosition"], "lockedNumber": locked_number}
    source_indexes = _matching_source_indexes(source_request, history)
    requested_source_index = len(history) - source_index - 1
    results: list[dict] = []
    seen: set[str] = set()
    for rule_count in [1, 2]:
        for distance in range(value["minPredictionDistance"], value["maxPredictionDistance"] + 1):
            offsets = [0] if value["algorithmType"] == "拖牌" else list(range(-14, distance))
            positions = [value["lockedPosition"]] if value["algorithmType"] == "拖牌" else list(range(1, count + 1))
            for offset in offsets:
                for position in positions:
                    request = {"lottery": value["lottery"], "numberOrder": value["numberOrder"], "lockedPosition": value["lockedPosition"], "lockedNumber": locked_number, "lockedSourcePeriod": source["period"], "predictionDistance": distance, "ruleCount": rule_count, "algorithmType": value["algorithmType"]}
                    if value["algorithmType"] != "拖牌": request.update({"referenceOffset": offset, "referencePosition": position})
                    evaluated = _evaluate_prepared(request, history, source_indexes, requested_source_index)
                    if not evaluated.get("valid") or not evaluated.get("highestStreak") or evaluated["highestStreak"] < (4 if rule_count == 1 else 5): continue
                    predictions = _prediction_numbers(evaluated)
                    if not 1 <= len(predictions) <= 2: continue
                    key = "|".join(map(str, [source["period"], value["lockedPosition"], locked_number, offset, position, distance, value["algorithmType"], rule_count, evaluated["highestStreak"], ".".join(map(str, predictions))]))
                    if key in seen: continue
                    seen.add(key)
                    results.append({"id": key, "number": str(locked_number).zfill(2), "lockedPosition": value["lockedPosition"], "lockedSourceIndex": source_index, "lockedSourcePeriod": source["period"], "predictionDistance": distance, "consecutive": evaluated["displayStreak"], "highestStreak": evaluated["highestStreak"], "predictionNumbers": [str(number).zfill(2) for number in predictions], "algorithmType": value["algorithmType"], "ruleCount": rule_count, "searchCondition": request, "sourceA": evaluated.get("sourceA"), "ruleSets": evaluated.get("results", evaluated.get("ruleSets", []))})
    return {"results": results}
