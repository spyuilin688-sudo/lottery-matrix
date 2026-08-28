from collections.abc import Callable
from typing import Any

from app.domain.explore import run_matrix_explore_group_with_history
from app.domain.models import lottery_position_count
from app.domain.status import evaluate_chapter15
from app.domain.tiangong import enumerate_equal_spacing_sequences
from app.domain.tiangong_artifact import build_tiangong_artifact
from app.domain.tiangong_generator import run_tiangong_candidates
from app.domain.tianyan_artifact import build_tianyan_artifact
from app.services.explore_batches import build_explore_batch, work_units


ExploreRunner = Callable[[dict[str, Any], list[dict[str, Any]]], dict[str, Any]]
TiangongRunner = Callable[[str, list[dict[str, Any]], dict[str, Any]], list[dict[str, Any]]]


def tiangong_work_units() -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    for mode in ("one-stage", "two-stage"):
        for condition in ("準2進3", "準3進4"):
            for sequence in enumerate_equal_spacing_sequences(80, condition):
                units.append({
                    "periodRanges": [80],
                    "modes": [mode],
                    "hitConditions": [condition],
                    "sourceSequences": [sequence],
                })
    return units


def _explore_selections(source_index: int, prediction_distance: int) -> list[tuple[int, int]]:
    selections: list[tuple[int, int]] = []
    for date_offset in (0, 1, 2):
        relative_source_index = source_index - date_offset
        if relative_source_index < 0:
            continue
        if prediction_distance != relative_source_index + 1:
            continue
        for periods in (2, 7, 13):
            if relative_source_index < periods:
                selections.append((periods, date_offset))
    return selections


def _work_units(lottery: str, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return work_units(lottery, len(history), lottery_position_count(lottery))


def _append_explore_result(
    artifact: dict[str, Any],
    unit: dict[str, Any],
    response: dict[str, Any],
    history: list[dict[str, Any]],
) -> None:
    for raw in response.get("results", []):
        search = raw.get("searchCondition", {})
        rule_count = int(raw.get("ruleCount", search.get("ruleCount", 0)))
        if rule_count not in {1, 2}:
            continue
        source_index = unit["lockedSourceIndex"]
        prediction_distance = int(raw.get("predictionDistance", 0))
        for periods, date_offset in _explore_selections(source_index, prediction_distance):
            identifier = "|".join(map(str, [
                unit["numberOrder"], source_index, unit["lockedPosition"],
                date_offset, periods, unit["algorithmType"], rule_count, raw.get("id", ""),
            ]))
            item = {
                "id": identifier, "number": str(raw.get("number", "")),
                "lockedPosition": int(raw.get("lockedPosition", unit["lockedPosition"])),
                "predictionDistance": prediction_distance,
                "consecutive": str(raw.get("consecutive", "")), "highestStreak": int(raw.get("highestStreak", 0)),
                "predictionNumbers": [str(value) for value in raw.get("predictionNumbers", [])],
                "algorithmType": unit["algorithmType"], "numberOrder": unit["numberOrder"],
                "explorePeriods": periods, "exploreDateOffset": date_offset,
                "ruleCount": rule_count, "lockedSourceIndex": source_index,
                "lockedSourcePeriod": str(raw.get("lockedSourcePeriod", history[source_index].get("period", ""))),
            }
            for key in ("referenceOffset", "referencePosition"):
                if isinstance(search.get(key), int) and not isinstance(search.get(key), bool):
                    item[key] = search[key]
            artifact["items"].append(item)
            validation = {"itemId": identifier, "ruleSets": raw.get("ruleSets", []) if isinstance(raw.get("ruleSets", []), list) else []}
            if isinstance(raw.get("sourceA"), dict):
                validation["sourceA"] = raw["sourceA"]
            artifact["validationById"][identifier] = validation


def build_explore_artifact_chunk(
    lottery: str,
    draw_period: str,
    history: list[dict[str, Any]],
    start: int,
    limit: int,
    runner: ExploreRunner = run_matrix_explore_group_with_history,
) -> dict[str, Any]:
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
    runner: ExploreRunner = run_matrix_explore_group_with_history,
) -> dict[str, Any]:
    return build_explore_artifact_chunk(
        lottery, draw_period, history, 0, len(_work_units(lottery, history)), runner,
    )["artifact"]


def build_tiangong_artifact_chunk(
    lottery: str,
    draw_period: str,
    history: list[dict[str, Any]],
    start: int,
    limit: int,
    runner: TiangongRunner = run_tiangong_candidates,
) -> dict[str, Any]:
    units = tiangong_work_units()
    cursor_start = min(max(0, start), len(units))
    cursor = min(len(units), cursor_start + max(1, limit))
    candidates: list[dict[str, Any]] = []
    for options in units[cursor_start:cursor]:
        candidates.extend(runner(lottery, history, options))
    artifact = build_tiangong_artifact(
        lottery, draw_period, history, lambda *_: candidates,
    )
    return {
        "artifact": artifact,
        "cursorStart": cursor_start,
        "cursor": cursor,
        "total": len(units),
        "complete": cursor == len(units),
    }


def _status_artifact(explore: dict[str, Any], tianyan: dict[str, Any], tiangong: dict[str, Any]) -> dict[str, Any]:
    roads = []
    for item in explore["items"]:
        if item["exploreDateOffset"] != 0 or item["numberOrder"] != "依號碼由小到大排序" or item.get("lockedSourceIndex", 99) >= 13:
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
                "lockedNumber": item["number"], "explorePeriods": item["explorePeriods"],
            })
    status = evaluate_chapter15({"lottery": explore["lottery"], "drawPeriod": explore["drawPeriod"], "roads": roads})
    return {
        "lottery": explore["lottery"], "drawPeriod": explore["drawPeriod"],
        "artifactKinds": ["explore", "tianyan", "tiangong"], **status,
        "artifactCounts": {"explore": len(explore["items"]), "tianyan": len(tianyan["items"]), "tiangong": len(tiangong["items"])},
    }


def create_artifact_builders(
    explore_runner: ExploreRunner = run_matrix_explore_group_with_history,
    tiangong_runner: TiangongRunner = run_tiangong_candidates,
) -> dict[str, Callable[[dict[str, Any]], dict[str, Any]]]:
    def explore(context: dict[str, Any]) -> dict[str, Any]:
        draw = context["draw"]
        batch = context.get("exploreBatch")
        if isinstance(batch, dict):
            result = build_explore_artifact_chunk(
                draw["lottery"], draw["period"], context["history"],
                int(batch.get("start", 0)), int(batch.get("limit", 10)),
                explore_runner,
            )
            return {
                "artifact": result["artifact"],
                "_checkpoint": {
                    "cursor": result["cursor"],
                    "total": result["total"],
                    "complete": result["complete"],
                },
            }
        return build_explore_artifact(draw["lottery"], draw["period"], context["history"], explore_runner)

    def tianyan(context: dict[str, Any]) -> dict[str, Any]:
        draw = context["draw"]
        return build_tianyan_artifact(draw["lottery"], draw["period"], context["artifacts"]["explore"])

    def tiangong(context: dict[str, Any]) -> dict[str, Any]:
        draw = context["draw"]
        batch = context.get("tiangongBatch")
        if isinstance(batch, dict):
            result = build_tiangong_artifact_chunk(
                draw["lottery"], draw["period"], context["history"],
                int(batch.get("start", 0)), int(batch.get("limit", 1)), tiangong_runner,
            )
            return {
                "artifact": result["artifact"],
                "_checkpoint": {
                    "cursorStart": result["cursorStart"],
                    "cursor": result["cursor"],
                    "total": result["total"],
                    "complete": result["complete"],
                },
            }
        return build_tiangong_artifact(
            draw["lottery"], draw["period"], context["history"],
            lambda lottery, history: tiangong_runner(lottery, history, {}),
        )

    def status(context: dict[str, Any]) -> dict[str, Any]:
        artifacts = context["artifacts"]
        return _status_artifact(artifacts["explore"], artifacts["tianyan"], artifacts["tiangong"])

    return {"explore": explore, "tianyan": tianyan, "tiangong": tiangong, "status": status}
