from collections.abc import Callable
from typing import Any

from app.domain.explore_v2 import run_explore_v2_batch
from app.domain.models import lottery_position_count
from app.domain.status import evaluate_chapter15
from app.domain.tianyan_artifact import build_tianyan_artifact
from app.domain.tiangong_artifact import build_tiangong_artifact
from app.services.explore_batches import build_explore_batch, work_units


ExploreRunner = Callable[[dict[str, Any], list[dict[str, Any]]], dict[str, Any]]
ExploreBatchRunner = Callable[..., dict[str, Any]]


def _work_units(lottery: str, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return work_units(lottery, len(history), lottery_position_count(lottery))


def _append_explore_result(
    artifact: dict[str, Any],
    unit: dict[str, Any],
    response: dict[str, Any],
    history: list[dict[str, Any]],
) -> None:
    tianyan_items = response.get("tianyanItems", [])
    if isinstance(tianyan_items, list):
        artifact.setdefault("tianyanItems", []).extend(
            item for item in tianyan_items if isinstance(item, dict)
        )
    tianyan_validations = response.get("tianyanValidationById", {})
    if isinstance(tianyan_validations, dict):
        target = artifact.setdefault("tianyanValidationById", {})
        for identifier, validation in tianyan_validations.items():
            if identifier in target and target[identifier] != validation:
                raise ValueError("TIANYAN_RESULT_CONFLICT")
            target[identifier] = validation

    for raw in response.get("results", []):
        search = raw.get("searchCondition", {})
        rule_count = int(raw.get("ruleCount", search.get("ruleCount", 0)))
        if rule_count not in {1, 2}:
            continue
        algorithm_type = str(raw.get("algorithmType", search.get("algorithmType", "")))
        if algorithm_type not in {"加減", "合值", "拖牌"}:
            continue
        source_index = unit["lockedSourceIndex"]
        explore_range = str(raw.get("exploreRange", "完整範圍"))
        identifier = "|".join(map(str, [
            explore_range, unit["numberOrder"], source_index, unit["lockedPosition"],
            algorithm_type, rule_count, raw.get("id", ""),
        ]))
        item = {
            "id": identifier, "number": str(raw.get("number", "")),
            "lockedPosition": int(raw.get("lockedPosition", unit["lockedPosition"])),
            "predictionDistance": int(raw.get("predictionDistance", 0)),
            "consecutive": str(raw.get("consecutive", "")), "highestStreak": int(raw.get("highestStreak", 0)),
            "predictionNumbers": [str(value) for value in raw.get("predictionNumbers", [])],
            "algorithmType": algorithm_type, "numberOrder": unit["numberOrder"],
            "exploreDateOffset": 0, "ruleCount": rule_count, "lockedSourceIndex": source_index,
            "lockedSourcePeriod": str(raw.get("lockedSourcePeriod", history[source_index].get("period", ""))),
            "exploreRange": explore_range,
        }
        for key in ("referenceOffset", "referencePosition"):
            if isinstance(search.get(key), int) and not isinstance(search.get(key), bool):
                item[key] = search[key]
        artifact["items"].append(item)
        validation = {
            "itemId": identifier,
            "ruleSets": raw.get("ruleSets", []) if isinstance(raw.get("ruleSets", []), list) else [],
        }
        if isinstance(raw.get("sourceA"), dict):
            validation["sourceA"] = raw["sourceA"]
        artifact["validationById"][identifier] = validation


def build_explore_artifact_chunk(
    lottery: str,
    draw_period: str,
    history: list[dict[str, Any]],
    start: int,
    limit: int,
    runner: ExploreRunner | None = None,
    batch_runner: ExploreBatchRunner = run_explore_v2_batch,
) -> dict[str, Any]:
    if runner is None:
        result = batch_runner(
            lottery=lottery,
            newest_first=history,
            start=start,
            limit=limit,
        )
        if isinstance(result.get("artifact"), dict):
            result["artifact"]["drawPeriod"] = draw_period
        return result
    return build_explore_batch(
        lottery=lottery,
        draw_period=draw_period,
        history=history,
        position_count=lottery_position_count(lottery),
        start=start,
        limit=limit,
        runner=runner,
        append_result=lambda artifact, unit, response: _append_explore_result(artifact, unit, response, history),
    )


def build_explore_artifact(
    lottery: str,
    draw_period: str,
    history: list[dict[str, Any]],
    runner: ExploreRunner | None = None,
    batch_runner: ExploreBatchRunner = run_explore_v2_batch,
) -> dict[str, Any]:
    return build_explore_artifact_chunk(
        lottery,
        draw_period,
        history,
        0,
        len(_work_units(lottery, history)),
        runner,
        batch_runner,
    )["artifact"]


_EXPLORE_STATUS_FIELDS = (
    "id", "number", "lockedPosition", "predictionDistance", "consecutive", "highestStreak",
    "predictionNumbers", "algorithmType", "numberOrder", "exploreDateOffset",
    "ruleCount", "lockedSourceIndex",
)
_TIANYAN_STATUS_FIELDS = (
    "id", "number", "lockedPosition", "predictionDistance", "consecutive", "highestStreak",
    "predictionNumbers", "numberOrder", "explorePeriods", "exploreDateOffset", "lockedSourceIndex",
)


def _compact_status_items(
    items: list[dict[str, Any]],
    fields: tuple[str, ...],
    *,
    derive_full_range: bool = False,
    full_range_only: bool = False,
) -> list[dict[str, Any]]:
    compact = [
        {key: item[key] for key in fields if key in item}
        for item in items
        if item.get("exploreDateOffset") == 0 and item.get("lockedSourceIndex", 99) < 13
        and (not full_range_only or item.get("exploreRange", "完整範圍") == "完整範圍")
    ]
    if derive_full_range:
        for item in compact:
            item["explorePeriods"] = 13
    return compact


def _status_artifact(explore: dict[str, Any], tianyan: dict[str, Any]) -> dict[str, Any]:
    roads = []
    for item in explore["items"]:
        if (
            item["exploreDateOffset"] != 0
            or item["numberOrder"] != "依號碼由小到大排序"
            or item.get("lockedSourceIndex", 99) >= 13
            or item.get("exploreRange", "完整範圍") != "完整範圍"
        ):
            continue
        results = [str(number).zfill(2) for number in item["predictionNumbers"]]
        if item["ruleCount"] == 1:
            result_sets = [[number] for number in results]
            hit_type = "one-code"
        else:
            result_sets = [results]
            hit_type = "two-code"
        for result in result_sets:
            roads.append({
                "id": f'{item["id"]}:{result[0]}' if hit_type == "one-code" else item["id"],
                "hitType": hit_type, "result": result, "algorithmType": item["algorithmType"],
                "numberOrder": item["numberOrder"], "streak": item["highestStreak"],
                "predictionDistance": item["predictionDistance"], "position": item["lockedPosition"],
                "lockedNumber": item["number"], "explorePeriods": 13,
            })
    status = evaluate_chapter15({"lottery": explore["lottery"], "drawPeriod": explore["drawPeriod"], "roads": roads})
    return {
        "lottery": explore["lottery"], "drawPeriod": explore["drawPeriod"],
        "artifactKinds": ["explore", "tianyan"], **status,
        "artifactCounts": {
            "explore": sum(
                item.get("exploreRange", "完整範圍") == "完整範圍"
                for item in explore["items"]
            ),
            "tianyan": len(tianyan["items"]),
        },
        "statusSources": {
            "explore": {
                "lottery": explore["lottery"],
                "drawPeriod": explore["drawPeriod"],
                "items": _compact_status_items(
                    explore["items"],
                    _EXPLORE_STATUS_FIELDS,
                    derive_full_range=True,
                    full_range_only=True,
                ),
            },
            "tianyan": {
                "lottery": tianyan["lottery"],
                "drawPeriod": tianyan["drawPeriod"],
                "items": _compact_status_items(tianyan["items"], _TIANYAN_STATUS_FIELDS),
            },
        },
    }


def create_artifact_builders(
    explore_runner: ExploreRunner | None = None,
    explore_batch_runner: ExploreBatchRunner = run_explore_v2_batch,
) -> dict[str, Callable[[dict[str, Any]], dict[str, Any]]]:
    def explore(context: dict[str, Any]) -> dict[str, Any]:
        draw = context["draw"]
        batch = context.get("exploreBatch")
        if isinstance(batch, dict):
            result = build_explore_artifact_chunk(
                draw["lottery"], draw["period"], context["history"],
                int(batch.get("start", 0)), int(batch.get("limit", 10)),
                explore_runner,
                explore_batch_runner,
            )
            return {
                "artifact": result["artifact"],
                "_checkpoint": {
                    "cursorStart": result.get("cursorStart", int(batch.get("start", 0))),
                    "cursor": result["cursor"],
                    "total": result["total"],
                    "complete": result["complete"],
                },
            }
        return build_explore_artifact(
            draw["lottery"],
            draw["period"],
            context["history"],
            explore_runner,
            explore_batch_runner,
        )

    def tianyan(context: dict[str, Any]) -> dict[str, Any]:
        draw = context["draw"]
        return build_tianyan_artifact(draw["lottery"], draw["period"], context["artifacts"]["explore"])

    def tiangong(context: dict[str, Any]) -> dict[str, Any]:
        draw = context["draw"]
        return build_tiangong_artifact(draw["lottery"], draw["period"], context["history"])

    def status(context: dict[str, Any]) -> dict[str, Any]:
        artifacts = context["artifacts"]
        return _status_artifact(artifacts["explore"], artifacts["tianyan"])

    return {"explore": explore, "tianyan": tianyan, "tiangong": tiangong, "status": status}
