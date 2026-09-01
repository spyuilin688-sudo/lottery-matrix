import re
from urllib.parse import quote

from app.api_server import handle_api_request, handle_matrix_card_request
from app.card_renderer import render_matrix_card
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


def test_card_prints_month_markers_sunday_dash_and_future_calendar_rows() -> None:
    svg = render_matrix_card(
        "今彩539",
        "draw",
        [
            {"drawDate": "2026-08-31", "numbers": []},
            {"drawDate": "2026-08-30", "numbers": []},
        ],
    )

    assert ">8</text>" in svg
    assert ">—</text>" in svg
    assert ">01</text>" in svg
    assert ">二</text>" in svg
    assert 'font-family="Microsoft JhengHei, Noto Sans TC, Arial, sans-serif"' in svg


def test_card_uses_measured_reference_grid_edges_and_fixed_row_pitch() -> None:
    svg = render_matrix_card("今彩539", "draw", [])

    assert '<rect x="16.0" y="16.0" width="562.0" height="6.0" fill="#000"/>' in svg
    assert '<rect x="16.0" y="3338.0" width="562.0" height="2.0" fill="#000"/>' in svg
    assert '<rect x="16.0" y="3416.0" width="2244.0" height="6.0" fill="#000"/>' in svg
    assert '<rect x="137.0" y="99.0" width="54.0" height="3240.0" fill="#d3d3d3"/>' in svg
    assert '<line x1="83.0" y1="153.0" x2="577.0" y2="153.0" stroke="#000" stroke-width="2"/>' in svg
    assert '<line x1="83.0" y1="207.0" x2="577.0" y2="207.0" stroke="#000" stroke-width="2"/>' in svg
    assert '<line x1="19.0" y1="3339.0" x2="577.0" y2="3339.0" stroke="#000" stroke-width="2"/>' in svg
    for divider in (267, 345, 421, 499):
        assert (
            f'<line x1="{divider:.1f}" y1="99.0" '
            f'x2="{divider:.1f}" y2="3339.0" '
            'stroke="#000" stroke-width="2"/>'
        ) in svg


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
        ("今彩539", "2026-08-29", "31", "一", 195.0),
        ("天天樂", "2026-08-29", "30", "—", 195.0),
        ("六合彩", "2026-08-29", "01", "二", 195.0),
        ("大樂透", "2026-08-28", "01", "二", 195.0),
    )

    for lottery, draw_date, expected_day, expected_weekday, baseline in cases:
        svg = render_matrix_card(lottery, "draw", [{"drawDate": draw_date, "numbers": []}])
        assert re.search(
            rf'<text x="110.0" y="{baseline:.1f}"[^>]*>{expected_day}</text>',
            svg,
        )
        assert re.search(
            rf'<text x="164.0" y="{baseline:.1f}"[^>]*>{expected_weekday}</text>',
            svg,
        )


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
