import pytest

from app.domain.history_boundaries import draw_order_history


def _marksix(period: str, order: list[str] | None) -> dict:
    return {
        "lottery": "六合彩",
        "period": period,
        "drawDate": "",
        "numbers": ["01", "02", "03", "04", "05", "06", "49"],
        "sortedNumbers": ["01", "02", "03", "04", "05", "06", "49"],
        "drawOrderNumbers": order,
    }


def test_marksix_draw_order_uses_verified_1991_boundary_only() -> None:
    complete = ["06", "05", "04", "03", "02", "01", "49"]
    history = [
        _marksix("091002", complete),
        _marksix("091001", complete),
        _marksix("090002", None),
        _marksix("090001", complete),
        _marksix("076001", None),
    ]

    selected = draw_order_history("六合彩", history, require_boundary=True)

    assert [draw["period"] for draw in selected] == ["091002", "091001"]


def test_draw_order_boundary_fails_closed_when_verified_range_skips_a_period() -> None:
    complete = ["06", "05", "04", "03", "02", "01", "49"]
    history = [
        _marksix("091004", complete),
        _marksix("091002", complete),
        _marksix("091001", complete),
        _marksix("090001", None),
    ]

    with pytest.raises(ValueError, match="DRAW_ORDER_HISTORY_INCOMPLETE"):
        draw_order_history("六合彩", history, require_boundary=True)


def test_draw_order_boundary_fails_closed_when_completed_year_tail_is_truncated() -> None:
    complete = ["06", "05", "04", "03", "02", "01", "49"]
    history = [
        *(
            _marksix(f"092{sequence:03d}", complete)
            for sequence in range(102, 0, -1)
        ),
        *(
            _marksix(f"091{sequence:03d}", complete)
            for sequence in range(98, 0, -1)
        ),
    ]

    with pytest.raises(ValueError, match="DRAW_ORDER_HISTORY_INCOMPLETE"):
        draw_order_history("六合彩", history, require_boundary=True)


def test_draw_order_boundary_rejects_an_incomplete_order_inside_range() -> None:
    complete = ["06", "05", "04", "03", "02", "01", "49"]
    history = [
        _marksix("091002", complete),
        _marksix("091001", None),
        _marksix("090001", None),
    ]

    with pytest.raises(ValueError, match="DRAW_ORDER_HISTORY_INCOMPLETE"):
        draw_order_history("六合彩", history, require_boundary=True)


def test_draw_order_boundary_must_exist_in_strict_production_history() -> None:
    complete = ["06", "05", "04", "03", "02", "01", "49"]

    with pytest.raises(ValueError, match="DRAW_ORDER_HISTORY_INCOMPLETE"):
        draw_order_history(
            "六合彩",
            [_marksix("091002", complete)],
            require_boundary=True,
        )
