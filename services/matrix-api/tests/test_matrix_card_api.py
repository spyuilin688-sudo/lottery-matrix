import re
import xml.etree.ElementTree as ET

import pytest
from datetime import date
from urllib.parse import quote

from app.api_server import handle_api_request, handle_matrix_card_request
from app.card_renderer import (
    _build_rows,
    _next_card_draw_date,
    card_layout,
    render_matrix_card,
)
from app.repositories.analysis_repository import InMemoryAnalysisRepository


def _repository() -> InMemoryAnalysisRepository:
    repository = InMemoryAnalysisRepository()
    repository.upsert_draw({
        "lottery": "今彩539",
        "period": "003117",
        "drawDate": "2026-08-28",
        "numbers": ["01", "07", "11", "20", "39"],
        "sortedNumbers": ["01", "07", "11", "20", "39"],
        "drawOrderNumbers": ["39", "20", "11", "07", "01"],
    })
    return repository


def test_card_manifest_points_to_the_latest_period_and_both_svg_orders() -> None:
    lottery = quote("今彩539")
    status, payload = handle_api_request(
        "GET", f"/api/matrix/cards/{lottery}", None, _repository(),
    )

    assert status == 200
    assert payload == {
        "lottery": "今彩539",
        "period": "003117",
        "cards": {
            "draw": {"url": f"/api/matrix/cards/{lottery}/draw.svg"},
            "sorted": {"url": f"/api/matrix/cards/{lottery}/sorted.svg"},
        },
    }


def test_card_svg_is_the_fixed_reference_size_and_uses_requested_order() -> None:
    lottery = quote("今彩539")
    status, svg = handle_matrix_card_request(
        f"/api/matrix/cards/{lottery}/draw.svg", _repository(),
    )

    assert status == 200
    assert 'width="2276" height="3438"' in svg
    assert "539 落球" in svg
    assert ">39</text>" in svg


def test_card_preserves_an_actual_539_sunday_draw_from_history() -> None:
    svg = render_matrix_card(
        "今彩539",
        "draw",
        [
            {"drawDate": "2026-08-31", "numbers": []},
            {"drawDate": "2026-08-30", "numbers": ["39", "38", "37", "36", "35"],
             "drawOrderNumbers": ["39", "38", "37", "36", "35"]},
        ],
    )

    assert ">8</text>" in svg
    assert ">日</text>" in svg
    assert ">39</text>" in svg
    assert ">01</text>" in svg
    assert ">二</text>" in svg
    assert 'font-family="Microsoft JhengHei, Noto Sans TC, Arial, sans-serif"' in svg


def test_actual_539_sunday_is_black_and_monday_is_a_red_boxed_one() -> None:
    svg = render_matrix_card(
        "今彩539",
        "draw",
        [
            {"drawDate": "2026-02-16", "numbers": []},
            {"drawDate": "2026-02-15", "numbers": []},
        ],
    )

    assert re.search(
        r'<text x="164\.0" y="140\.0"[^>]*fill="#000">日</text>',
        svg,
    )
    assert re.search(
        r'<text x="164\.0" y="194\.9"[^>]*fill="#ff0000">一</text>',
        svg,
    )

    for x1, y1, x2, y2 in (
        (137.0, 153.9, 191.0, 153.9),
        (137.0, 208.8, 191.0, 208.8),
        (137.0, 153.9, 137.0, 208.8),
        (191.0, 153.9, 191.0, 208.8),
    ):
        assert (
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            'stroke="#ff0000" stroke-width="2"/>'
        ) in svg

def test_daily_monday_uses_a_red_boxed_one() -> None:
    svg = render_matrix_card(
        "天天樂",
        "draw",
        [{"drawDate": "2026-02-16", "numbers": []}],
    )

    assert re.search(
        r'<text x="163\.0" y="140\.0"[^>]*fill="#ff0000">一</text>',
        svg,
    )
    for x1, y1, x2, y2 in (
        (137.0, 99.0, 189.0, 99.0),
        (137.0, 153.9, 189.0, 153.9),
        (137.0, 99.0, 137.0, 153.9),
        (189.0, 99.0, 189.0, 153.9),
    ):
        assert (
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            'stroke="#ff0000" stroke-width="2"/>'
        ) in svg


@pytest.mark.parametrize("order", ["draw", "sorted"])
def test_lotto_monday_is_black_like_the_reference_in_both_orders(order: str) -> None:
    svg = render_matrix_card(
        "大樂透", order,
        [{"drawDate": "2026-02-16", "numbers": ["38", "37", "47", "18", "02", "25", "42"],
          "drawOrderNumbers": ["38", "37", "47", "18", "02", "25", "42"]}],
    )
    root = ET.fromstring(svg)
    text = root.findall("{http://www.w3.org/2000/svg}text")
    mondays = [node for node in text if node.text == "一"]
    assert mondays
    assert all(node.get("fill") == "#000" for node in mondays)
    assert not any(node.get("stroke") == "#ff0000" for node in root)
    special = [node for node in text if node.text == "42" and node.get("font-size") == "48"]
    assert len(special) == 1
    assert special[0].get("fill") == "#0000ff"


def test_539_future_calendar_includes_only_the_confirmed_2026_sunday_draws() -> None:
    confirmed_draws = (
        (date(2026, 2, 14), date(2026, 2, 15)),
        (date(2026, 2, 21), date(2026, 2, 22)),
        (date(2026, 2, 28), date(2026, 3, 1)),
    )

    for current, expected in confirmed_draws:
        assert _next_card_draw_date("今彩539", current) == expected

    assert _next_card_draw_date("今彩539", date(2026, 3, 7)) == date(2026, 3, 9)


def test_month_boundary_uses_the_first_visible_draw_of_each_month() -> None:
    rows = _build_rows(
        "今彩539",
        (59,),
        59,
        [
            {"drawDate": "2026-02-02", "numbers": []},
            {"drawDate": "2026-01-31", "numbers": []},
        ],
        "draw",
        False,
    )[0]

    assert (rows[0]["month"], rows[0]["day"], rows[0]["show_month"]) == (
        "1", "31", True,
    )
    assert (rows[1]["month"], rows[1]["day"], rows[1]["show_month"]) == (
        "2", "02", True,
    )
    assert rows[1]["month_boundary"] is True


def test_panel_continuation_does_not_create_a_false_month_boundary() -> None:
    columns = _build_rows(
        "天天樂",
        (2, 2),
        2,
        [
            {"drawDate": "2026-01-04", "numbers": []},
            {"drawDate": "2026-01-03", "numbers": []},
            {"drawDate": "2026-01-02", "numbers": []},
            {"drawDate": "2026-01-01", "numbers": []},
        ],
        "draw",
        False,
    )

    assert columns[1][0]["month_boundary"] is False
    assert columns[1][0]["show_month"] is False


def test_unused_tail_rows_keep_calendar_cells_and_leave_numbers_blank() -> None:
    cases = (
        ("今彩539", (59, 59, 59, 50), 59, False),
        ("天天樂", (59, 59, 59, 50), 59, False),
        ("六合彩", (60, 60, 51), 60, True),
        ("大樂透", (60, 60, 51), 60, True),
    )

    for lottery, capacities, physical_rows, special in cases:
        columns = _build_rows(
            lottery,
            capacities,
            physical_rows,
            [{"drawDate": "2026-09-02", "numbers": [1, 2, 3, 4, 5]}],
            "draw",
            special,
        )
        tail = columns[-1][capacities[-1]:]

        assert len(tail) == 9
        assert all(row["day"] and row["weekday"] for row in tail)
        assert all(row["values"] == [] for row in tail)


def test_month_values_are_blue_and_bold() -> None:
    svg = render_matrix_card(
        "今彩539",
        "draw",
        [{"drawDate": "2026-02-02", "numbers": []}],
    )

    assert re.search(
        r'<text x="51\.0" y="144\.0"[^>]*font-size="45" '
        r'font-weight="700"[^>]*fill="#0000ff">2</text>',
        svg,
    )


def test_card_uses_the_measured_reference_text_metrics() -> None:
    svg = render_matrix_card(
        "今彩539",
        "sorted",
        [{
            "drawDate": "2026-12-09",
            "numbers": ["07", "08", "15", "30", "39"],
            "sortedNumbers": ["07", "08", "15", "30", "39"],
        }],
    )

    assert (
        '<text x="384.0" y="59.0" text-anchor="middle" dominant-baseline="central" '
        'font-family="Microsoft JhengHei, Noto Sans TC, Arial, sans-serif" '
        'font-size="56" font-weight="700" fill="#000">539 順球</text>'
    ) in svg
    assert (
        '<text x="51.0" y="144.0" text-anchor="middle" '
        'font-family="Arial" font-size="45" font-weight="700" '
        'fill="#0000ff">12</text>'
    ) in svg
    assert (
        '<text x="110.0" y="140.0" text-anchor="middle" '
        'font-family="Arial" font-size="39" font-weight="400" fill="#000">09</text>'
    ) in svg
    assert (
        '<text x="229.0" y="145.0" text-anchor="middle" '
        'font-family="Arial" font-size="48" font-weight="700" '
        'textLength="57" lengthAdjust="spacingAndGlyphs" fill="#000">07</text>'
    ) in svg


def test_539_and_daily_card_render_exactly_59_physical_rows() -> None:
    for lottery in ("今彩539", "天天樂"):
        layout = card_layout(lottery)
        svg = render_matrix_card(lottery, "draw", [])

        assert layout["physical_rows"] == 59
        assert layout["column_rows"] == (59, 59, 59, 50)
        assert layout["physical_rows"] - layout["column_rows"][-1] == 9
        assert len(re.findall(
            r'<line x1="83\.0" y1="[\d.]+" x2="577\.0" y2="[\d.]+" '
            r'stroke="#000" stroke-width="2"/>',
            svg,
        )) == 58


def test_card_uses_measured_reference_grid_edges_and_lottery_row_pitch() -> None:
    svg = render_matrix_card("今彩539", "draw", [])

    assert '<rect x="16.0" y="16.0" width="562.0" height="6.0" fill="#000"/>' in svg
    assert '<rect x="16.0" y="3338.0" width="562.0" height="2.0" fill="#000"/>' in svg
    assert '<rect x="16.0" y="3416.0" width="2244.0" height="6.0" fill="#000"/>' in svg
    assert '<rect x="137.0" y="99.0" width="54.0" height="3240.0" fill="#d3d3d3"/>' in svg
    assert '<line x1="83.0" y1="153.9" x2="577.0" y2="153.9" stroke="#000" stroke-width="2"/>' in svg
    assert '<line x1="83.0" y1="208.8" x2="577.0" y2="208.8" stroke="#000" stroke-width="2"/>' in svg
    assert '<line x1="19.0" y1="3339.0" x2="577.0" y2="3339.0" stroke="#000" stroke-width="2"/>' in svg
    for divider in (267, 345, 421, 499):
        assert (
            f'<line x1="{divider:.1f}" y1="99.0" '
            f'x2="{divider:.1f}" y2="3339.0" '
            'stroke="#000" stroke-width="2"/>'
        ) in svg

    for lottery in ("六合彩", "大樂透"):
        lotto = render_matrix_card(lottery, "draw", [])
        assert card_layout(lottery)["physical_rows"] == 60
        assert '<line x1="83.0" y1="153.0" x2="681.0" y2="153.0" stroke="#000" stroke-width="2"/>' in lotto


def test_card_footer_uses_the_requested_copy_and_is_vertically_centred() -> None:
    svg = render_matrix_card("今彩539", "draw", [])

    assert (
        '<text x="1138.0" y="3379.0" text-anchor="middle" dominant-baseline="middle" '
        'font-family="Microsoft JhengHei, Noto Sans TC, Arial, sans-serif" '
        'font-size="36" font-weight="700" fill="#000">'
        '快速探索版路，發現更多可能 | 樂彩 Matrix 網址：https://matrixlottery.idv.tw</text>'
    ) in svg


def test_each_lottery_uses_its_own_measured_reference_grid_edges() -> None:
    daily = render_matrix_card("天天樂", "draw", [])
    assert (
        '<line x1="189.0" y1="99.0" x2="189.0" y2="3339.0" '
        'stroke="#000" stroke-width="2"/>'
    ) in daily
    assert (
        '<line x1="1619.0" y1="99.0" x2="1619.0" y2="3339.0" '
        'stroke="#000" stroke-width="2"/>'
    ) in daily
    assert (
        '<line x1="1947.0" y1="99.0" x2="1947.0" y2="3339.0" '
        'stroke="#000" stroke-width="2"/>'
    ) in daily

    lotto = render_matrix_card("大樂透", "draw", [])
    assert (
        '<line x1="883.0" y1="99.0" x2="883.0" y2="3339.0" '
        'stroke="#000" stroke-width="2"/>'
    ) in lotto


def test_card_uses_the_reference_accent_colours() -> None:
    expected = {
        "今彩539": "#ffff00",
        "天天樂": "#ccff99",
        "六合彩": "#ffc0cb",
        "大樂透": "#87cefa",
    }

    for lottery, colour in expected.items():
        assert f'fill="{colour}"' in render_matrix_card(lottery, "draw", [])


def test_future_rows_follow_each_lottery_draw_calendar() -> None:
    cases = (
        ("今彩539", "2026-08-29", "31", "一", 164.0, 194.9, "#ff0000"),
        ("天天樂", "2026-08-29", "30", "日", 163.0, 194.9, "#000"),
        ("六合彩", "2026-08-29", "01", "二", 164.0, 194.0),
        ("大樂透", "2026-08-28", "01", "二", 164.0, 194.0),
    )

    for case in cases:
        lottery, draw_date, expected_day, expected_weekday, weekday_x, baseline, *fill = case
        svg = render_matrix_card(lottery, "draw", [{"drawDate": draw_date, "numbers": []}])
        assert re.search(
            rf'<text x="110.0" y="{baseline:.1f}"[^>]*>{expected_day}</text>',
            svg,
        )
        weekday_pattern = (
            rf'<text x="{weekday_x:.1f}" y="{baseline:.1f}"[^>]*'
            rf'fill="{fill[0]}">{expected_weekday}</text>'
            if fill else
            rf'<text x="{weekday_x:.1f}" y="{baseline:.1f}"[^>]*>{expected_weekday}</text>'
        )
        assert re.search(weekday_pattern, svg)


def test_special_number_column_uses_black_divider_and_blue_horizontal_rules() -> None:
    for lottery in ("六合彩", "大樂透"):
        svg = render_matrix_card(lottery, "draw", [])
        assert (
            '<line x1="681.0" y1="99.0" x2="681.0" y2="3339.0" '
            'stroke="#000" stroke-width="2"/>'
        ) in svg
        assert (
            '<line x1="681.0" y1="153.0" x2="763.0" y2="153.0" '
            'stroke="#0000ff" stroke-width="2"/>'
        ) in svg
