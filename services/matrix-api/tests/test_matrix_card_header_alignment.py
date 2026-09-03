import re

from app.card_renderer import (
    HEADER_BOTTOM,
    HEADER_TOP,
    _PANELS,
    card_layout,
    render_matrix_card,
)


def test_all_four_lottery_card_titles_are_centered_in_the_existing_header_box() -> None:
    for lottery in ("今彩539", "天天樂", "六合彩", "大樂透"):
        title = card_layout(lottery)["title"]
        for order, mode in (("sorted", "順球"), ("draw", "落球")):
            svg = render_matrix_card(lottery, order, [])
            expected_y = (HEADER_TOP + HEADER_BOTTOM) / 2

            for panel in _PANELS[lottery]:
                expected_x = (panel["numbers"] + panel["right"]) / 2
                pattern = (
                    rf'<text x="{expected_x:.1f}" y="{expected_y:.1f}" '
                    rf'text-anchor="middle" dominant-baseline="central" '
                    rf'[^>]*>{re.escape(title)} {mode}</text>'
                )
                assert re.search(pattern, svg), (
                    f"{lottery} {mode} title is not centered in header box "
                    f"at ({expected_x:.1f}, {expected_y:.1f})"
                )
