from collections import defaultdict
import json
from pathlib import Path


RULES = json.loads(Path(__file__).with_name("status-rules.json").read_text(encoding="utf-8"))


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


def _matching_row(roads: list[dict], row: dict) -> list[dict]:
    witnesses: list[dict] = []
    for types in row.get("roadTypeAlternatives", [row["roadTypes"]]):
        matched = _displayed_roads([
            road for road in roads
            if road["algorithmType"] in types
            and row["consecutiveMin"] <= road["streak"] <= row["consecutiveMax"]
            and road.get("numberOrder", "依號碼由小到大排序") == row["numberOrder"]
        ])
        if row["roadRelation"] == "all" and not all(
            any(road["algorithmType"] == road_type for road in matched)
            for road_type in types
        ):
            continue
        if len(matched) < row["sameCodeMin"]:
            continue
        if row["sameCodeMax"] is not None and len(matched) > row["sameCodeMax"]:
            continue
        witnesses.extend(matched)
    return _displayed_roads(witnesses)


def _matching_group(roads: list[dict], rows: list[dict]) -> list[dict]:
    evidence = [_matching_row(roads, row) for row in rows]
    if not evidence or not all(evidence):
        return []
    return _displayed_roads([road for matched in evidence for road in matched])


def evaluate_chapter15(source: dict) -> dict:
    cards: list[dict] = []
    for group in _group_roads(source["roads"]):
        triggers = []
        for rule in RULES:
            if rule["hitType"] != group["hitType"]:
                continue
            witnesses = _matching_group(group["roads"], rule["rows"])
            if witnesses:
                triggers.append({
                    "ruleId": rule["ruleId"], "status": rule["status"], "roads": witnesses,
                })
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
