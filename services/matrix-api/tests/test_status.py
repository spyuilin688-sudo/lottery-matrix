from itertools import count

import pytest

from app.domain.status import evaluate_chapter15


sequence = count()


def roads(hit_type: str, streak: int, types: list[str], result: list[str] | None = None) -> list[dict]:
    result = result or (["08"] if hit_type == "one-code" else ["08", "22"])
    return [
        {
            "id": f"road-{next(sequence)}-{index}", "hitType": hit_type, "result": result,
            "algorithmType": algorithm, "streak": streak, "predictionDistance": index + 1,
            "position": index + 1, "lockedNumber": str(index + 1).zfill(2), "explorePeriods": 13,
        }
        for index, algorithm in enumerate(types)
    ]


def evaluate(all_roads: list[dict]) -> dict:
    return evaluate_chapter15({"lottery": "今彩539", "drawPeriod": "114000123", "roads": all_roads})


CASES = [
    (roads("one-code", 7, ["加減"]), "RESONANCE", 1),
    (roads("one-code", 7, ["加減", "合值"]), "CRITICAL", 1),
    (roads("one-code", 5, ["加減"]), "DORMANT", 0),
    (roads("one-code", 5, ["加減"] * 2), "ACTIVE", 1),
    (roads("one-code", 6, ["合值"] * 5), "FOCUS", 1),
    (roads("one-code", 5, ["加減"] * 7), "RESONANCE", 1),
    (roads("one-code", 5, ["加減", "拖牌"]), "DORMANT", 0),
    (roads("one-code", 5, ["加減", "加減", "拖牌"]), "FOCUS", 1),
    (roads("one-code", 7, ["加減", "拖牌"]), "CRITICAL", 1),
    (roads("one-code", 7, ["拖牌"]), "FOCUS", 1),
    (roads("one-code", 7, ["拖牌", "拖牌"]), "CRITICAL", 1),
    (roads("one-code", 7, ["拖牌"]) + roads("one-code", 5, ["加減"]), "RESONANCE", 1),
    (roads("two-code", 11, ["加減", "合值"]), "CRITICAL", 1),
    (roads("two-code", 7, ["加減"] * 3), "ACTIVE", 1),
    (roads("two-code", 8, ["加減"] * 6), "FOCUS", 1),
    (roads("two-code", 9, ["加減"] * 8), "RESONANCE", 1),
    (roads("two-code", 11, ["加減"]) + roads("two-code", 7, ["合值"]), "FOCUS", 1),
    (roads("two-code", 11, ["加減"]) + roads("two-code", 8, ["合值", "加減"]), "RESONANCE", 1),
    (roads("two-code", 7, ["拖牌"]) + roads("two-code", 5, ["加減"] * 6), "RESONANCE", 1),
]


@pytest.mark.parametrize("all_roads,status,card_count", CASES)
def test_chapter15_thresholds(all_roads: list[dict], status: str, card_count: int) -> None:
    summary = evaluate(all_roads)["summary"]
    assert (summary["status"], summary["count"]) == (status, card_count)


def test_priority_duplicate_display_sort_and_dormant() -> None:
    result = evaluate(
        roads("one-code", 5, ["加減"] * 2, ["01"])
        + roads("one-code", 7, ["加減"], ["02"])
        + roads("one-code", 7, ["拖牌", "拖牌"], ["03"])
    )
    assert result["summary"]["status"] == "CRITICAL"
    assert [card["status"] for card in result["cards"]] == ["CRITICAL", "RESONANCE", "ACTIVE"]

    duplicate = roads("one-code", 5, ["加減"] * 2)
    duplicate[1] = dict(duplicate[0])
    card = evaluate(duplicate)["cards"][0]
    assert card["sameCodeRoadCount"] == 2
    assert len(card["roads"]) == 1
    assert evaluate([])["summary"] == {
        "lottery": "今彩539", "drawPeriod": "114000123", "status": "DORMANT",
        "count": 0, "message": "本期尚無符合條件的狀態。",
    }
