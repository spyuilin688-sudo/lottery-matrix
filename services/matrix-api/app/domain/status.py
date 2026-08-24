from collections import defaultdict


PRIORITY = ["CRITICAL", "RESONANCE", "FOCUS", "ACTIVE", "DORMANT"]
MESSAGES = {
    "ACTIVE": "具備基本參考價值", "FOCUS": "具備明顯規律集中性", "RESONANCE": "具備強烈共振效應",
    "CRITICAL": "極為罕見版路狀態", "DORMANT": "本期尚無符合條件的狀態。",
}
TYPE_ORDER = {"加減": 0, "合值": 1, "拖牌": 2, "複合": 3}


def _group_roads(roads: list[dict]) -> list[dict]:
    groups: dict[str, dict] = {}
    for road in roads:
        result = [str(number).zfill(2) for number in road["result"]]
        key = f'{road["hitType"]}|{",".join(result)}'
        group = groups.setdefault(key, {"hitType": road["hitType"], "result": result, "roads": []})
        group["roads"].append({**road, "result": result})
    return list(groups.values())


def _count(roads: list[dict], types: set[str], minimum: int, maximum: int) -> int:
    return sum(road["algorithmType"] in types and minimum <= road["streak"] <= maximum for road in roads)


def _mixed_count(roads: list[dict], primary: str, minimum: int, maximum: int) -> int:
    matched = [road for road in roads if road["algorithmType"] in {primary, "拖牌"} and minimum <= road["streak"] <= maximum]
    return len(matched) if any(road["algorithmType"] == primary for road in matched) and any(road["algorithmType"] == "拖牌" for road in matched) else 0


def _first_triggers(group: dict) -> list[tuple[str, str]]:
    roads = group["roads"]
    triggers: list[tuple[str, str]] = []
    high = _count(roads, {"加減", "合值"}, 7, 7)
    low = _count(roads, {"加減", "合值"}, 5, 6)
    if high == 1: triggers.append(("first-a-high-one", "RESONANCE"))
    elif high >= 2: triggers.append(("first-a-high-many", "CRITICAL"))
    if 2 <= low <= 4: triggers.append(("first-a-low-active", "ACTIVE"))
    elif 5 <= low <= 6: triggers.append(("first-a-low-focus", "FOCUS"))
    elif low >= 7: triggers.append(("first-a-low-resonance", "RESONANCE"))
    for primary in ["加減", "合值"]:
        mixed_high = _mixed_count(roads, primary, 7, 7)
        mixed_low = _mixed_count(roads, primary, 5, 6)
        if mixed_high >= 2: triggers.append((f"first-b-{primary}-high", "CRITICAL"))
        if 3 <= mixed_low <= 4: triggers.append((f"first-b-{primary}-focus", "FOCUS"))
        elif mixed_low >= 5: triggers.append((f"first-b-{primary}-resonance", "RESONANCE"))
    drag_high = _count(roads, {"拖牌"}, 7, 7)
    if drag_high == 1: triggers.append(("first-c-one", "FOCUS"))
    elif drag_high >= 2: triggers.append(("first-c-many", "CRITICAL"))
    if drag_high >= 1:
        if _count(roads, {"加減"}, 5, 6) >= 1: triggers.append(("first-special-add-drag", "RESONANCE"))
        if _count(roads, {"合值"}, 5, 6) >= 1: triggers.append(("first-special-sum-drag", "RESONANCE"))
    return triggers


def _second_triggers(group: dict) -> list[tuple[str, str]]:
    roads = group["roads"]
    types = {"加減", "合值"}
    high = _count(roads, types, 11, 11)
    middle = _count(roads, types, 7, 9)
    broad_high = _count(roads, types, 7, 11)
    low = _count(roads, types, 5, 6)
    triggers: list[tuple[str, str]] = []
    if high >= 2: triggers.append(("second-d-1", "CRITICAL"))
    if 3 <= middle <= 5: triggers.append(("second-d-2", "ACTIVE"))
    elif 6 <= middle <= 7: triggers.append(("second-d-3", "FOCUS"))
    elif middle >= 8: triggers.append(("second-d-4", "RESONANCE"))
    if high >= 1 and middle == 1: triggers.append(("second-d-5", "FOCUS"))
    if high >= 1 and middle >= 2: triggers.append(("second-d-6", "RESONANCE"))
    if broad_high >= 3 and 6 <= low <= 7: triggers.append(("second-d-7", "FOCUS"))
    if broad_high >= 6 and low >= 8: triggers.append(("second-d-8", "RESONANCE"))
    if _count(roads, {"拖牌"}, 7, 9) >= 1:
        if _count(roads, {"加減"}, 5, 6) >= 6: triggers.append(("second-special-add-drag", "RESONANCE"))
        if _count(roads, {"合值"}, 5, 6) >= 6: triggers.append(("second-special-sum-drag", "RESONANCE"))
    return triggers


def _displayed_roads(roads: list[dict]) -> list[dict]:
    ordered = sorted(roads, key=lambda road: (
        TYPE_ORDER[road["algorithmType"]], -road["streak"], road["predictionDistance"], road["position"], road["id"],
    ))
    result: list[dict] = []
    seen: set[str] = set()
    for road in ordered:
        key = "|".join(map(str, [road["id"], road["algorithmType"], road["streak"], road["predictionDistance"], road["position"], road["lockedNumber"]]))
        if key not in seen:
            seen.add(key)
            result.append(road)
    return result


def evaluate_chapter15(source: dict) -> dict:
    cards: list[dict] = []
    for group in _group_roads(source["roads"]):
        triggers = _first_triggers(group) if group["hitType"] == "one-code" else _second_triggers(group)
        for key, status in triggers:
            cards.append({
                "id": f'{group["hitType"]}:{",".join(group["result"])}:{key}', "status": status,
                "hitType": group["hitType"], "result": group["result"],
                "sameCodeRoadCount": len(group["roads"]), "roads": _displayed_roads(group["roads"]),
            })
    status_order = {status: index for index, status in enumerate(PRIORITY)}
    cards.sort(key=lambda card: (status_order[card["status"]], -card["sameCodeRoadCount"], card["id"]))
    counts = defaultdict(int)
    for card in cards:
        counts[card["status"]] += 1
    normalized_counts = {status: counts[status] for status in ["ACTIVE", "FOCUS", "RESONANCE", "CRITICAL"]}
    status = next((item for item in PRIORITY[:-1] if normalized_counts[item] > 0), "DORMANT")
    summary = {
        "lottery": source["lottery"], "drawPeriod": source["drawPeriod"], "status": status,
        "count": 0 if status == "DORMANT" else normalized_counts[status], "message": MESSAGES[status],
    }
    return {"summary": summary, "counts": normalized_counts, "cards": cards}
