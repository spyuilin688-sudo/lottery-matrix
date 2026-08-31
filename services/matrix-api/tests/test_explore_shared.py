from app.domain.explore_shared import prepare_shared_explore_unit


def draw(period: str, numbers: list[int]) -> dict:
    values = [str(number).zfill(2) for number in numbers]
    return {
        "period": period,
        "drawDate": "",
        "numbers": values,
        "sortedNumbers": values,
        "drawOrderNumbers": values,
    }


def history() -> list[dict]:
    newest_first = [draw("A", [10, 20, 25, 30, 35])]
    for index in range(4, 0, -1):
        newest_first.extend([
            draw(f"P{index}", [1, 2, 3, 4, 25]),
            draw(f"S{index}", [10, 20, 25, 30, 35]),
        ])
    return newest_first


def unit() -> dict:
    return {
        "lottery": "今彩539",
        "numberOrder": "依號碼由小到大排序",
        "lockedSourceIndex": 0,
        "lockedPosition": 1,
        "exploreDateOffset": 0,
        "exploreRange": "完整範圍",
        "predictionDistance": 1,
    }


def test_shared_coordinate_builds_add_and_sum_together() -> None:
    prepared = prepare_shared_explore_unit(unit(), history())
    non_drag = next(
        coordinate
        for coordinate in prepared["coordinates"]
        if coordinate["algorithmTypes"] == ["加減", "合值"]
        and coordinate["referenceOffset"] == 0
        and coordinate["referencePosition"] == 2
    )
    keys = set(non_drag["groups"][0]["candidateMap"])
    assert any(key.startswith("加減:") for key in keys)
    assert any(key.startswith("合值:") for key in keys)


def test_locked_coordinate_is_drag_only() -> None:
    prepared = prepare_shared_explore_unit(unit(), history())
    drag = next(
        coordinate
        for coordinate in prepared["coordinates"]
        if coordinate["algorithmTypes"] == ["拖牌"]
    )
    assert drag["referenceOffset"] == 0
    assert drag["referencePosition"] == 1
    assert drag["groups"]
    assert all(
        key.startswith("拖牌:")
        for group in drag["groups"]
        for key in group["candidateMap"]
    )
