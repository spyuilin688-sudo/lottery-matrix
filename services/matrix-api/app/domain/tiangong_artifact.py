from collections.abc import Callable
from typing import Any

from .tiangong import evaluate_tiangong_candidate


def _stable_id(value: str) -> str:
    hash_value = 2166136261
    for character in value:
        hash_value ^= ord(character)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    parts: list[str] = []
    while hash_value:
        hash_value, remainder = divmod(hash_value, 36)
        parts.append(digits[remainder])
    return f"tiangong-{''.join(reversed(parts)) or '0'}"


def build_tiangong_artifact(
    lottery: str,
    draw_period: str,
    history: list[dict[str, Any]],
    run_candidates: Callable[[str, list[dict[str, Any]]], list[dict[str, Any]]],
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    validations: dict[str, Any] = {}
    seen: set[str] = set()
    for candidate in run_candidates(lottery, history):
        if candidate.get("lottery") != lottery:
            continue
        result = evaluate_tiangong_candidate(candidate)
        if not all((result.get("valid"), result.get("predictedPosition"), result.get("predictionNumber"), result.get("roadType"))):
            continue
        signature = "|".join(str(result[key]) for key in (
            "ruleIdentity", "predictionDistance", "predictedPosition", "predictionNumber", "roadType",
        ))
        if signature in seen:
            continue
        seen.add(signature)
        identifier = _stable_id(signature)
        first = candidate["firstStage"]
        item = {
            "id": identifier, "sourceSequence": candidate["sourceSequence"],
            "eligiblePeriodRange": 50 if max(candidate["sourceSequence"]) <= 50 else 80,
            "interval": result["interval"], "predictionDistance": result["predictionDistance"],
            "predictedPosition": result["predictedPosition"], "predictionNumber": result["predictionNumber"],
            "roadType": result["roadType"], "ruleIdentity": result["ruleIdentity"], "mode": candidate["mode"],
            "hitCondition": candidate["hitCondition"], "exploreDirection": candidate["exploreDirection"],
            "firstStageDirection": first["direction"], "firstRoadType": first["algorithmType"],
        }
        second = candidate.get("secondStage") if candidate["mode"] == "two-stage" else None
        if second:
            item.update({"secondStageDirection": second["direction"], "secondRoadType": second["algorithmType"]})
        items.append(item)
        validations[identifier] = {
            "itemId": identifier, "ruleIdentity": result["ruleIdentity"],
            "validationRows": result["validationRows"],
        }
    items.sort(key=lambda item: (
        item["interval"], item["predictionDistance"], item["predictedPosition"], item["roadType"], item["id"],
    ))
    return {"lottery": lottery, "drawPeriod": draw_period, "items": items, "validationById": validations}
