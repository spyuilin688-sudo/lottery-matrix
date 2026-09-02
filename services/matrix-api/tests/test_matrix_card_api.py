import re
from urllib.parse import quote

from app.api_server import handle_api_request, handle_matrix_card_request
from app.card_renderer import card_layout, render_matrix_card
from app.repositories.analysis_repository import InMemoryAnalysisRepository


class PublicationOnlyRepository(InMemoryAnalysisRepository):
    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict]:
        raise AssertionError("card reads must not load draw history")


def _repository() -> InMemoryAnalysisRepository:
    repository = PublicationOnlyRepository()
    repository.upsert_card_publication(
        "今彩539",
        "003117",
        "daily539/003117/draw.svg",
        "daily539/003117/sorted.svg",
        "2026-09-02T00:00:00+00:00",
    )
    return repository


def test_card_manifest_points_to_the_latest_period_and_both_svg_orders() -> None:
    lottery = quote("今彩539")
    status, payload = handle_api_request(
        "GET", f"/api/matrix/cards/{lottery}", None, _repository(),
        matrix_card_public_base_url="https://project.supabase.co",
    )

    assert status == 200
    assert payload == {
        "lottery": "今彩539",
        "period": "003117",
        "cards": {
            "draw": {"url": (
                "https://project.supabase.co/storage/v1/object/public/"
                "matrix-cards/daily539/003117/draw.svg"
            )},
            "sorted": {"url": (
                "https://project.supabase.co/storage/v1/object/public/"
                "matrix-cards/daily539/003117/sorted.svg"
            )},
        },
    }


def test_legacy_card_svg_route_redirects_without_reading_draw_history() -> None:
    repository = PublicationOnlyRepository()
    repository.upsert_card_publication(
        "今彩539",
        "003117",
        "daily539/003117/draw.svg",
        "daily539/003117/sorted.svg",
        "2026-09-02T00:00:00+00:00",
    )
    lottery = quote("今彩539")
    status, location = handle_matrix_card_request(
        f"/api/matrix/cards/{lottery}/draw.svg",
        repository,
        "https://project.supabase.co",
    )

    assert status == 302
    assert location == (
        "https://project.supabase.co/storage/v1/object/public/"
        "matrix-cards/daily539/003117/draw.svg"
    )


def test_unpublished_card_manifest_has_no_asset_urls() -> None:
    status, payload = handle_api_request(
        "GET",
        f"/api/matrix/cards/{quote('天天樂')}",
        None,
        InMemoryAnalysisRepository(),
        matrix_card_public_base_url="https://project.supabase.co",
    )

    assert status == 200
    assert payload == {
        "lottery": "天天樂",
        "period": None,
        "cards": {"draw": None, "sorted": None},
    }


def test_card_preserves_an_actual_539_sunday_draw_from_history() -> None:
    svg = render_matrix_card(
        "今彩539",
        "draw",
        [
            {"drawDate": "2026-08-31", "numbers": []},
            {"drawDate": "2026-08-30", "numbers": ["39", "38", "37", "36", "35"]},
        ],
    )

    assert ">8</text>" in svg
    assert ">—</text>" in svg
    assert ">39</text>" in svg
    assert ">01</text>" in svg
    assert ">二</text>" in svg
    assert 'font-family="Microsoft JhengHei, Noto Sans TC, Arial, sans-serif"' in svg


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
        '<text x="384.0" y="59.0" text-anchor="middle" dominant-baseline="middle" '
        'font-family="Microsoft JhengHei, Noto Sans TC, Arial, sans-serif" '
        'font-size="56" font-weight="700" fill="#000">539 順球</text>'
    ) in svg
    assert (
        '<text x="51.0" y="144.0" text-anchor="middle" '
        'font-family="Arial" font-size="45" font-weight="400" '
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
        ("今彩539", "2026-08-29", "31", "一", 164.0, 194.9),
        ("天天樂", "2026-08-29", "30", "—", 163.0, 194.9),
        ("六合彩", "2026-08-29", "01", "二", 164.0, 194.0),
        ("大樂透", "2026-08-28", "01", "二", 164.0, 194.0),
    )

    for lottery, draw_date, expected_day, expected_weekday, weekday_x, baseline in cases:
        svg = render_matrix_card(lottery, "draw", [{"drawDate": draw_date, "numbers": []}])
        assert re.search(
            rf'<text x="110.0" y="{baseline:.1f}"[^>]*>{expected_day}</text>',
            svg,
        )
        assert re.search(
            rf'<text x="{weekday_x:.1f}" y="{baseline:.1f}"[^>]*>{expected_weekday}</text>',
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
