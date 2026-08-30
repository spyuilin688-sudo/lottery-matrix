from typing import Any

from .tianyan import evaluate_tianyan_candidate


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


def _source_rules(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for row in (item for item in artifact["items"] if item.get("ruleCount") == 1):
        validation = artifact["validationById"].get(row["id"])
        if not isinstance(validation, dict):
            continue
        for rule_set in validation.get("ruleSets", []):
            rules = rule_set.get("rules", []) if isinstance(rule_set, dict) else []
            if len(rules) != 1 or not isinstance(rules[0], dict):
                continue
            raw_rule = rules[0]
            algorithm_type = str(raw_rule.get("algorithmType", row.get("algorithmType", "")))
            if algorithm_type not in {"加減", "合值", "拖牌"}:
                continue
            predictions = rule_set.get("predictionNumbers") or row.get("predictionNumbers", [])
            prediction_numbers = [int(value) for value in predictions if str(value).isdigit()]
            if not prediction_numbers:
                continue
            source_a = validation.get("sourceA", {})
            sources.append({
                "row": row,
                "rule": {
                    "id": str(raw_rule.get("id", f'{row["id"]}:{algorithm_type}:{raw_rule.get("value", 0)}')),
                    "referenceOffset": int(raw_rule.get("referenceOffset", row.get("referenceOffset", 0))),
                    "referencePosition": int(raw_rule.get("referencePosition", row.get("referencePosition", row["lockedPosition"]))),
                    "algorithmType": algorithm_type,
                    "value": int(raw_rule.get("value", 0)),
                    "currentBaseNumber": int(source_a.get("baseNumber", 1)),
                    "currentPredictionNumbers": prediction_numbers,
                },
                "validationRows": rule_set.get("historicalValidation", []),
            })
    return sources


def _same_search(left: dict[str, Any], right: dict[str, Any]) -> bool:
    keys = (
        "number", "lockedPosition", "predictionDistance", "numberOrder", "exploreDateOffset",
        "lockedSourceIndex", "lockedSourcePeriod",
    )
    return all(left.get(key) == right.get(key) for key in keys)


def _historical_groups(left: dict[str, Any], right: dict[str, Any]) -> list[dict[str, Any]]:
    right_by_period = {str(row.get("predictionPeriod", "")): row for row in right["validationRows"]}
    groups: list[dict[str, Any]] = []
    for left_row in left["validationRows"]:
        prediction_period = str(left_row.get("predictionPeriod", ""))
        right_row = right_by_period.get(prediction_period)
        if not prediction_period or right_row is None:
            continue
        groups.append({
            "id": str(left_row.get("group") or right_row.get("group") or prediction_period),
            "sourcePeriod": str(left_row.get("sourcePeriod") or right_row.get("sourcePeriod") or ""),
            "predictionPeriod": prediction_period,
            "predictionNumbers": [int(value) for value in left_row.get("predictionNumbers", [])],
            "rule1": {
                "baseNumber": int(left_row.get("baseNumber", 0)),
                "predictionNumber": int(left["rule"]["currentPredictionNumbers"][0]),
                "hit": bool(left_row.get("success")),
            },
            "rule2": {
                "baseNumber": int(right_row.get("baseNumber", 0)),
                "predictionNumber": int(right["rule"]["currentPredictionNumbers"][0]),
                "hit": bool(right_row.get("success")),
            },
        })
        if len(groups) == 30:
            break
    return groups


def _rule_identity(rule: dict[str, Any]) -> str:
    return ":".join(str(rule[key]) for key in ("referenceOffset", "referencePosition", "algorithmType", "value"))


def _streak(group_count: int) -> str | None:
    if group_count >= 17:
        return "準17進18+"
    return f"準{group_count}進{group_count + 1}" if group_count in {5, 6, 7, 9, 11, 13, 15} else None


def build_tianyan_artifact(lottery: str, draw_period: str, explore_artifact: dict[str, Any]) -> dict[str, Any]:
    if explore_artifact.get("lottery") != lottery or explore_artifact.get("drawPeriod") != draw_period:
        raise ValueError("INVALID_REQUEST")
    sources = _source_rules(explore_artifact)
    items: list[dict[str, Any]] = []
    validations: dict[str, Any] = {}
    seen: set[str] = set()
    for first, left in enumerate(sources):
        for right in sources[first + 1:]:
            if not _same_search(left["row"], right["row"]):
                continue
            result = evaluate_tianyan_candidate({
                "lottery": lottery, "rules": [left["rule"], right["rule"]],
                "groups": _historical_groups(left, right),
            })
            consecutive = _streak(result["groupCount"])
            if not result["valid"] or consecutive is None:
                continue
            row = left["row"]
            signature = "|".join(map(str, [
                row["number"], row["lockedPosition"], row.get("lockedSourceIndex", ""),
                row.get("lockedSourcePeriod", ""), row["predictionDistance"], row["numberOrder"],
                *sorted([_rule_identity(left["rule"]), _rule_identity(right["rule"])]),
                ",".join(result["predictionNumbers"]),
            ]))
            if signature in seen:
                continue
            seen.add(signature)
            identifier = _stable_id(signature)
            item = {
                "id": identifier, "number": row["number"], "lockedPosition": row["lockedPosition"],
                "predictionDistance": row["predictionDistance"], "consecutive": consecutive,
                "highestStreak": result["groupCount"], "predictionNumbers": result["predictionNumbers"],
                "roadType": "複合", "hitCondition": "準5+（鎖定2碼）", "numberOrder": row["numberOrder"],
                "explorePeriods": 13, "exploreDateOffset": row["exploreDateOffset"],
                "ruleIds": [left["rule"]["id"], right["rule"]["id"]],
            }
            for optional in ("lockedSourceIndex", "lockedSourcePeriod"):
                if optional in row:
                    item[optional] = row[optional]
            items.append(item)
            validations[identifier] = {
                "itemId": identifier, "rules": result["rules"], "groupCount": result["groupCount"],
                "minimumIndependentHits": result["minimumIndependentHits"], "rule1Only": result["rule1Only"],
                "rule2Only": result["rule2Only"], "bothHit": result["bothHit"],
                "historicalValidation": result["groups"],
            }
    items.sort(key=lambda item: (-item["highestStreak"], item["id"]))
    return {"lottery": lottery, "drawPeriod": draw_period, "items": items, "validationById": validations}
