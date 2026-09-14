from collections.abc import Callable
from typing import Any

from .models import lottery_position_count
from .tiangong_algorithm import calculate_tiangong, required_history_length


Calculator = Callable[[dict[str, Any]], dict[str, Any]]


def _next_period(period: str) -> str:
    return str(int(period) + 1).zfill(len(period)) if period.isdigit() else f"{period}-next"


def build_tiangong_artifact(lottery: str, draw_period: str, history: list[dict[str, Any]], calculator: Calculator = calculate_tiangong) -> dict[str, Any]:
    draws = []
    count = lottery_position_count(lottery)
    for draw in reversed(history):
        raw = draw.get("numbers")
        if not isinstance(raw, list) or len(raw) != count:
            raise ValueError("INVALID_MATRIX_DRAW")
        numbers = [int(number) for number in raw]
        numbers = sorted(numbers[:6]) + numbers[6:] if count == 7 else sorted(numbers)
        draws.append({"period": str(draw["period"]), "numbers": numbers, "drawDate": draw.get("drawDate")})
    if not draws:
        raise ValueError("TIANGONG_HISTORY_REQUIRED")
    source_window = 50
    if len(draws) < required_history_length(source_window):
        return {
            "numberOrder": "依號碼由小到大排序",
            "algorithm": "matrix-tiangong",
            "algorithmVersion": None,
            "lottery": lottery,
            "drawPeriod": draw_period,
            "items": [],
            "validationById": {},
        }
    response = calculator({"lottery": lottery, "draws": draws, "target_period": _next_period(draws[-1]["period"]), "source_window": source_window, "mode": "二段式", "hit_rule": "準2進3", "source_position_patterns": ["固定", "依序遞增", "依序遞減"], "stage1_position_patterns": ["固定", "依序遞增", "依序遞減"], "stage1_route_types": ["加減", "合值"], "stage2_position_patterns": ["固定", "依序遞增", "依序遞減"], "stage2_route_types": ["加減", "合值"], "strict_history": True})
    results, evidence = response.get("results"), response.get("evidence")
    if not isinstance(results, list) or not isinstance(evidence, dict):
        raise ValueError("TIANGONG_RESULT_INVALID")
    items, validations = [], {}
    numbers_by_period = {draw["period"]: draw["numbers"] for draw in draws}
    for result in results:
        identifier = str(result["item_id"])
        first, second, prediction = result["stage1_operation"], result["stage2_operation"], result["prediction"]
        items.append({"id": identifier, "eligiblePeriodRange": source_window, "interval": int(result["source_spacing"]), "predictedPosition": int(prediction["position"]), "predictionNumber": str(prediction["number"]), "roadType": str(result["route_label"]), "exploreDirection": str(result["source_pattern_label"]), "firstStageDirection": str(result["stage1_pattern_label"]), "firstRoadType": "加減" if first["type"] == "add_sub" else "合值", "secondStageDirection": str(result["stage2_pattern_label"]), "secondRoadType": "加減" if second["type"] == "add_sub" else "合值"})
        detail = evidence[identifier]
        for row in [*detail.get("rows", []), detail.get("d_exclusion", {})]:
            for key in ("source", "stage1", "stage2"):
                if isinstance(row.get(key), dict):
                    row[key]["numbers"] = numbers_by_period.get(row[key]["period"], [])
        detail["stage1_distance"] = result.get("stage1_distance")
        detail["stage2_distance"] = result.get("stage2_distance")
        detail["stage1_operation"] = first
        detail["stage2_operation"] = second
        validations[identifier] = {"itemId": identifier, "evidence": detail}
    return {"numberOrder": "依號碼由小到大排序", "algorithm": response.get("algorithm"), "algorithmVersion": response.get("algorithm_version"), "lottery": lottery, "drawPeriod": draw_period, "items": items, "validationById": validations}
