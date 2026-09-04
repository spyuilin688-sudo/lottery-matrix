from collections import defaultdict
from collections.abc import Callable


PRIORITY = ["CRITICAL", "RESONANCE", "FOCUS", "ACTIVE", "DORMANT"]
MESSAGES = {
    "ACTIVE": "具備基本參考價值",
    "FOCUS": "具備明顯規律集中性",
    "RESONANCE": "具備強烈共振效應",
    "CRITICAL": "極為罕見版路狀態",
    "DORMANT": "本期尚無符合條件的狀態。",
}
TYPE_ORDER = {"加減": 0, "合值": 1, "拖牌": 2, "複合": 3}


def _normalize_result(values: list[str]) -> list[str]:
    return sorted(
        (str(number).zfill(2) for number in values),
        key=lambda number: (int(number), number),
    )


def _road_key(road: dict) -> tuple:
    return (
        road["id"],
        road["hitType"],
        tuple(_normalize_result(road["result"])),
        road["algorithmType"],
        road.get("numberOrder", ""),
        road["streak"],
        road["predictionDistance"],
        road["position"],
        road["lockedNumber"],
        road["explorePeriods"],
    )


def _displayed_roads(roads: list[dict]) -> list[dict]:
    ordered = sorted(
        roads,
        key=lambda road: (
            TYPE_ORDER[road["algorithmType"]],
            -road["streak"],
            road["predictionDistance"],
            road["position"],
            road["id"],
        ),
    )
    result: list[dict] = []
    seen: set[tuple] = set()
    for road in ordered:
        key = _road_key(road)
        if key in seen:
            continue
        seen.add(key)
        result.append(road)
    return result


def _group_roads(roads: list[dict]) -> list[dict]:
    groups: dict[str, dict] = {}
    for road in roads:
        result = _normalize_result(road["result"])
        key = road["hitType"] + "|" + ",".join(result)
        group = groups.setdefault(
            key,
            {"hitType": road["hitType"], "result": result, "roads": []},
        )
        group["roads"].append({**road, "result": result})
    return [
        {**group, "roads": _displayed_roads(group["roads"])}
        for group in groups.values()
    ]


def _matching(
    roads: list[dict],
    types: set[str],
    minimum: int,
    maximum: int,
) -> list[dict]:
    return _displayed_roads([
        road
        for road in roads
        if road["algorithmType"] in types
        and minimum <= road["streak"] <= maximum
    ])


def _mixed(
    roads: list[dict],
    primary: str,
    minimum: int,
    maximum: int,
) -> list[dict]:
    matched = _matching(roads, {primary, "拖牌"}, minimum, maximum)
    if (
        any(road["algorithmType"] == primary for road in matched)
        and any(road["algorithmType"] == "拖牌" for road in matched)
    ):
        return matched
    return []


def _qualified_mixed(
    roads: list[dict],
    minimum: int,
    maximum: int,
    qualifies: Callable[[int], bool],
) -> list[dict]:
    witnesses: list[dict] = []
    for primary in ("加減", "合值"):
        matched = _mixed(roads, primary, minimum, maximum)
        if qualifies(len(matched)):
            witnesses.extend(matched)
    return _displayed_roads(witnesses)


def _trigger(rule_id: str, status: str, roads: list[dict]) -> dict:
    return {"ruleId": rule_id, "status": status, "roads": _displayed_roads(roads)}


def _first_a(group: dict) -> list[dict]:
    high = _matching(group["roads"], {"加減", "合值"}, 7, 7)
    low = _matching(group["roads"], {"加減", "合值"}, 5, 6)
    triggers: list[dict] = []
    if len(high) == 1:
        triggers.append(_trigger("RESONANCE-1", "RESONANCE", high))
    elif len(high) >= 2:
        triggers.append(_trigger("CRITICAL-1", "CRITICAL", high))
    if 2 <= len(low) <= 4:
        triggers.append(_trigger("ACTIVE-1", "ACTIVE", low))
    elif 5 <= len(low) <= 6:
        triggers.append(_trigger("FOCUS-1", "FOCUS", low))
    elif len(low) >= 7:
        triggers.append(_trigger("RESONANCE-2", "RESONANCE", low))
    return triggers


def _first_b(group: dict) -> list[dict]:
    critical = _qualified_mixed(group["roads"], 7, 7, lambda count: count >= 2)
    focus = _qualified_mixed(group["roads"], 5, 6, lambda count: 3 <= count <= 4)
    resonance = _qualified_mixed(group["roads"], 5, 6, lambda count: count >= 5)
    return [
        *([_trigger("CRITICAL-2", "CRITICAL", critical)] if critical else []),
        *([_trigger("FOCUS-2", "FOCUS", focus)] if focus else []),
        *([_trigger("RESONANCE-3", "RESONANCE", resonance)] if resonance else []),
    ]


def _first_c(group: dict) -> list[dict]:
    high = _matching(group["roads"], {"拖牌"}, 7, 7)
    if len(high) == 1:
        return [_trigger("FOCUS-3", "FOCUS", high)]
    if len(high) >= 2:
        return [_trigger("CRITICAL-3", "CRITICAL", high)]
    return []


def _first_special(group: dict) -> list[dict]:
    drag = _matching(group["roads"], {"拖牌"}, 7, 7)
    if not drag:
        return []
    add = _matching(group["roads"], {"加減"}, 5, 6)
    value_sum = _matching(group["roads"], {"合值"}, 5, 6)
    return [
        *([_trigger("RESONANCE-4", "RESONANCE", drag + add)] if add else []),
        *([_trigger("RESONANCE-5", "RESONANCE", drag + value_sum)] if value_sum else []),
    ]


def _second_d(group: dict) -> list[dict]:
    types = {"加減", "合值"}
    high = _matching(group["roads"], types, 11, 11)
    middle = _matching(group["roads"], types, 7, 9)
    broad_high = _matching(group["roads"], types, 7, 11)
    low = _matching(group["roads"], types, 5, 6)
    triggers: list[dict] = []
    if len(high) >= 2:
        triggers.append(_trigger("CRITICAL-4", "CRITICAL", high))
    if 3 <= len(middle) <= 5:
        triggers.append(_trigger("ACTIVE-2", "ACTIVE", middle))
    elif 6 <= len(middle) <= 7:
        triggers.append(_trigger("FOCUS-4", "FOCUS", middle))
    elif len(middle) >= 8:
        triggers.append(_trigger("RESONANCE-6", "RESONANCE", middle))
    if high and len(middle) == 1:
        triggers.append(_trigger("FOCUS-5", "FOCUS", high + middle))
    if high and len(middle) >= 2:
        triggers.append(_trigger("RESONANCE-7", "RESONANCE", high + middle))
    if len(broad_high) >= 3 and 6 <= len(low) <= 7:
        triggers.append(_trigger("FOCUS-6", "FOCUS", broad_high + low))
    if len(broad_high) >= 6 and len(low) >= 8:
        triggers.append(_trigger("RESONANCE-8", "RESONANCE", broad_high + low))
    return triggers


def _second_special(group: dict) -> list[dict]:
    drag = _matching(group["roads"], {"拖牌"}, 7, 9)
    if not drag:
        return []
    add = _matching(group["roads"], {"加減"}, 5, 6)
    value_sum = _matching(group["roads"], {"合值"}, 5, 6)
    return [
        *([_trigger("RESONANCE-9", "RESONANCE", drag + add)] if len(add) >= 6 else []),
        *([_trigger("RESONANCE-10", "RESONANCE", drag + value_sum)] if len(value_sum) >= 6 else []),
    ]


def evaluate_chapter15(source: dict) -> dict:
    cards: list[dict] = []
    for group in _group_roads(source["roads"]):
        if group["hitType"] == "one-code":
            triggers = (
                _first_a(group)
                + _first_b(group)
                + _first_c(group)
                + _first_special(group)
            )
        else:
            triggers = _second_d(group) + _second_special(group)
        for matched in triggers:
            witnesses = _displayed_roads(matched["roads"])
            rule_id = matched["ruleId"]
            cards.append({
                "id": ":".join([
                    group["hitType"],
                    ",".join(group["result"]),
                    rule_id,
                ]),
                "ruleId": rule_id,
                "status": matched["status"],
                "hitType": group["hitType"],
                "result": group["result"],
                "sameCodeRoadCount": len(witnesses),
                "roads": witnesses,
            })
    status_order = {status: index for index, status in enumerate(PRIORITY)}
    cards.sort(
        key=lambda card: (
            status_order[card["status"]],
            -card["sameCodeRoadCount"],
            card["id"],
        )
    )
    counts = defaultdict(int)
    for card in cards:
        counts[card["status"]] += 1
    normalized_counts = {
        status: counts[status]
        for status in ["ACTIVE", "FOCUS", "RESONANCE", "CRITICAL"]
    }
    status = next(
        (item for item in PRIORITY[:-1] if normalized_counts[item] > 0),
        "DORMANT",
    )
    summary = {
        "lottery": source["lottery"],
        "drawPeriod": source["drawPeriod"],
        "status": status,
        "count": 0 if status == "DORMANT" else normalized_counts[status],
        "message": MESSAGES[status],
    }
    return {"summary": summary, "counts": normalized_counts, "cards": cards}
