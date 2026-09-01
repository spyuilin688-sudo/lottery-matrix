import pytest

from app.domain.tiangong_artifact import build_tiangong_artifact


def _history() -> list[dict]:
    return [{
        "period": f"{240 - index:09d}",
        "drawDate": "2026-08-24",
        "numbers": ["01", "02", "03", "04", "05"],
        "drawOrderNumbers": ["01", "02", "03", "04", "05"],
    } for index in range(119)]


def _result(identifier: str, *, spacing: int, route: str = "加減＋合值") -> dict:
    return {
        "item_id": identifier,
        "eligible_windows": [50, 80],
        "source_spacing": spacing,
        "route_label": route,
        "source_pattern_label": "固定",
        "stage1_pattern_label": "依序遞增",
        "stage2_pattern_label": "依序遞減",
        "stage1_operation": {"type": "add_sub"},
        "stage2_operation": {"type": "sum"},
        "prediction": {"position": 3, "number": "12"},
    }


def _evidence() -> dict:
    return {
        "rows": [{
            "group": "C",
            "role": "validation",
            "source": {"period": "114000100", "position": 2, "number": "08"},
            "stage1": {"period": "114000109", "position": 3, "calculated_number": "12", "actual_number": "12", "matched": True},
            "stage2": {"period": "114000114", "position": 4, "calculated_number": "16", "actual_number": "16", "matched": True},
        }],
        "d_exclusion": {"status": "breaks_at_stage2"},
    }


def test_maps_attachment_response_and_uses_draw_order_history() -> None:
    received: list[dict] = []

    def calculator(payload: dict) -> dict:
        received.append(payload)
        return {
            "algorithm": "matrix-tiangong",
            "algorithm_version": "v2",
            "results": [_result("item-1", spacing=4)],
            "evidence": {"item-1": _evidence()},
        }

    artifact = build_tiangong_artifact("今彩539", "114000123", _history(), calculator)

    assert received[0]["draws"][0] == {
        "period": "000000122", "numbers": [1, 2, 3, 4, 5], "drawDate": "2026-08-24",
    }
    assert received[0]["draws"][-1]["period"] == "000000240"
    assert received[0]["target_period"] == "000000241"
    assert artifact["algorithmVersion"] == "v2"
    assert artifact["items"] == [{
        "id": "item-1", "eligiblePeriodRange": 50, "interval": 4,
        "predictedPosition": 3, "predictionNumber": "12", "roadType": "加減＋合值",
        "exploreDirection": "固定", "firstStageDirection": "依序遞增", "firstRoadType": "加減",
        "secondStageDirection": "依序遞減", "secondRoadType": "合值",
    }]
    assert artifact["validationById"]["item-1"] == {"itemId": "item-1", "evidence": _evidence()}


def test_preserves_attachment_result_order_and_keeps_evidence_detached() -> None:
    artifact = build_tiangong_artifact("今彩539", "114000123", _history(), lambda _: {
        "algorithm": "matrix-tiangong",
        "algorithm_version": "v2",
        "results": [_result("item-b", spacing=9), _result("item-a", spacing=1)],
        "evidence": {"item-b": _evidence(), "item-a": _evidence()},
    })

    assert [item["id"] for item in artifact["items"]] == ["item-b", "item-a"]
    assert "evidence" not in artifact["items"][0]
    assert artifact["validationById"]["item-a"]["evidence"]["d_exclusion"]["status"] == "breaks_at_stage2"


def test_returns_an_empty_artifact_when_history_cannot_complete_d_exclusion() -> None:
    artifact = build_tiangong_artifact("今彩539", "114000123", _history()[:80])

    assert artifact["items"] == []
    assert artifact["validationById"] == {}


def test_rejects_sorted_numbers_as_a_substitute_for_actual_draw_order() -> None:
    history = _history()
    history[20] = {
        **history[20],
        "drawOrderNumbers": None,
        "numbers": ["01", "02", "03", "04", "05"],
    }

    with pytest.raises(ValueError, match="DRAW_ORDER_HISTORY_INCOMPLETE"):
        build_tiangong_artifact("今彩539", "114000123", history)


def test_marksix_tiangong_ignores_unverified_pre_1991_order_rows() -> None:
    received: list[dict] = []
    history = [
        {
            "period": f"091{sequence:03d}",
            "drawDate": "1991-01-01",
            "numbers": ["01", "02", "03", "04", "05", "06", "49"],
            "drawOrderNumbers": ["06", "05", "04", "03", "02", "01", "49"],
        }
        for sequence in range(119, 0, -1)
    ]
    history.append({
        "period": "090001",
        "drawDate": "1990-01-01",
        "numbers": ["01", "02", "03", "04", "05", "06", "49"],
        "drawOrderNumbers": None,
    })

    def calculator(payload: dict) -> dict:
        received.append(payload)
        return {
            "algorithm": "matrix-tiangong",
            "algorithm_version": "v2",
            "results": [],
            "evidence": {},
        }

    build_tiangong_artifact("六合彩", "091119", history, calculator)

    assert len(received[0]["draws"]) == 119
    assert received[0]["draws"][0]["period"] == "091001"


def test_fantasy5_uses_sorted_numbers_without_requesting_draw_order() -> None:
    received: list[dict] = []
    history = [
        {
            "period": f"{240 - index:06d}",
            "drawDate": "2026-08-24",
            "numbers": ["01", "02", "03", "04", "05"],
            "drawOrderNumbers": None,
        }
        for index in range(119)
    ]

    def calculator(payload: dict) -> dict:
        received.append(payload)
        return {
            "algorithm": "matrix-tiangong",
            "algorithm_version": "v2",
            "results": [],
            "evidence": {},
        }

    artifact = build_tiangong_artifact(
        "天天樂", "026240", history, calculator,
    )

    assert received[0]["draws"][0]["numbers"] == [1, 2, 3, 4, 5]
    assert artifact["algorithmVersion"] == "v2"
