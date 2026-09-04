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


RULE_CASES = [
    ("ACTIVE-1", "ACTIVE", roads("one-code", 5, ["加減"] * 2)),
    ("ACTIVE-2", "ACTIVE", roads("two-code", 7, ["合值"] * 3)),
    ("FOCUS-1", "FOCUS", roads("one-code", 6, ["加減"] * 5)),
    ("FOCUS-2", "FOCUS", roads("one-code", 5, ["加減", "加減", "拖牌"])),
    ("FOCUS-3", "FOCUS", roads("one-code", 7, ["拖牌"])),
    ("FOCUS-4", "FOCUS", roads("two-code", 8, ["合值"] * 6)),
    ("FOCUS-5", "FOCUS", roads("two-code", 11, ["加減"]) + roads("two-code", 7, ["合值"])),
    ("FOCUS-6", "FOCUS", roads("two-code", 11, ["加減"] * 3) + roads("two-code", 5, ["合值"] * 6)),
    ("RESONANCE-1", "RESONANCE", roads("one-code", 7, ["加減"])),
    ("RESONANCE-2", "RESONANCE", roads("one-code", 5, ["合值"] * 7)),
    ("RESONANCE-3", "RESONANCE", roads("one-code", 6, ["加減"] * 4 + ["拖牌"])),
    ("RESONANCE-4", "RESONANCE", roads("one-code", 7, ["拖牌"]) + roads("one-code", 5, ["加減"])),
    ("RESONANCE-5", "RESONANCE", roads("one-code", 7, ["拖牌"]) + roads("one-code", 6, ["合值"])),
    ("RESONANCE-6", "RESONANCE", roads("two-code", 9, ["加減"] * 8)),
    ("RESONANCE-7", "RESONANCE", roads("two-code", 11, ["加減"]) + roads("two-code", 8, ["合值", "加減"])),
    ("RESONANCE-8", "RESONANCE", roads("two-code", 11, ["加減"] * 6) + roads("two-code", 5, ["合值"] * 8)),
    ("RESONANCE-9", "RESONANCE", roads("two-code", 7, ["拖牌"]) + roads("two-code", 5, ["加減"] * 6)),
    ("RESONANCE-10", "RESONANCE", roads("two-code", 9, ["拖牌"]) + roads("two-code", 6, ["合值"] * 6)),
    ("CRITICAL-1", "CRITICAL", roads("one-code", 7, ["加減", "合值"])),
    ("CRITICAL-2", "CRITICAL", roads("one-code", 7, ["加減", "拖牌"])),
    ("CRITICAL-3", "CRITICAL", roads("one-code", 7, ["拖牌", "拖牌"])),
    ("CRITICAL-4", "CRITICAL", roads("two-code", 11, ["加減", "合值"])),
]


@pytest.mark.parametrize("all_roads,status,card_count", CASES)
def test_chapter15_thresholds(all_roads: list[dict], status: str, card_count: int) -> None:
    summary = evaluate(all_roads)["summary"]
    assert (summary["status"], summary["count"]) == (status, card_count)


@pytest.mark.parametrize("rule_id,status,all_roads", RULE_CASES)
def test_every_rule_is_an_independently_identified_trigger(
    rule_id: str,
    status: str,
    all_roads: list[dict],
) -> None:
    card = next(card for card in evaluate(all_roads)["cards"] if card["ruleId"] == rule_id)
    assert card["status"] == status
    assert card["sameCodeRoadCount"] == len(card["roads"])


def test_priority_duplicate_display_sort_and_dormant() -> None:
    result = evaluate(
        roads("one-code", 5, ["加減"] * 2, ["01"])
        + roads("one-code", 7, ["加減"], ["02"])
        + roads("one-code", 7, ["拖牌", "拖牌"], ["03"])
    )
    assert result["summary"]["status"] == "CRITICAL"
    assert [card["status"] for card in result["cards"]] == ["CRITICAL", "RESONANCE", "ACTIVE"]

    unique = roads("one-code", 5, ["加減"] * 2)
    card = next(
        card for card in evaluate([unique[0], dict(unique[0]), unique[1]])["cards"]
        if card["ruleId"] == "ACTIVE-1"
    )
    assert card["sameCodeRoadCount"] == 2
    assert len(card["roads"]) == 2
    assert evaluate([])["summary"] == {
        "lottery": "今彩539", "drawPeriod": "114000123", "status": "DORMANT",
        "count": 0, "message": "本期尚無符合條件的狀態。",
    }


def test_mixed_or_rule_emits_one_card_with_all_qualifying_actual_roads() -> None:
    cards = evaluate(roads("one-code", 7, ["加減", "合值", "拖牌"]))["cards"]
    mixed = [card for card in cards if card["ruleId"] == "CRITICAL-2"]
    assert len(mixed) == 1
    assert mixed[0]["sameCodeRoadCount"] == 3
    assert [road["algorithmType"] for road in mixed[0]["roads"]] == ["加減", "合值", "拖牌"]


def test_trigger_cards_only_contain_their_own_sorted_witness_roads() -> None:
    all_roads = (
        roads("one-code", 5, ["加減", "加減"])
        + roads("one-code", 5, ["拖牌"])
        + roads("one-code", 7, ["合值"])
    )
    all_roads[0]["predictionDistance"] = 2
    all_roads[1]["predictionDistance"] = 1
    card = next(card for card in evaluate(all_roads)["cards"] if card["ruleId"] == "FOCUS-2")
    assert [
        (road["algorithmType"], road["streak"], road["predictionDistance"])
        for road in card["roads"]
    ] == [("加減", 5, 1), ("加減", 5, 2), ("拖牌", 5, 1)]


def test_two_code_results_are_normalized_as_complete_pairs() -> None:
    pair = roads("two-code", 11, ["加減"], ["22", "08"]) + roads("two-code", 11, ["合值"], ["08", "22"])
    card = next(card for card in evaluate(pair)["cards"] if card["ruleId"] == "CRITICAL-4")
    assert card["result"] == ["08", "22"]
    assert card["sameCodeRoadCount"] == 2
    singles = roads("one-code", 11, ["加減"], ["08"]) + roads("one-code", 11, ["合值"], ["22"])
    assert all(card["hitType"] != "two-code" for card in evaluate(singles)["cards"])
