from __future__ import annotations

from datetime import date, timedelta
from html import escape
from typing import Any


CARD_WIDTH = 2276
CARD_HEIGHT = 3438
WEEKDAYS = ("一", "二", "三", "四", "五", "六", "日")

BLACK = "#000"
MONTH_BLUE = "#0000ff"
WEEKDAY_GREY = "#d3d3d3"
MONDAY_RED = "#ff0000"
MONDAY_BORDER_LOTTERIES = frozenset({"今彩539", "天天樂"})
NUMBER_FONT_FAMILY = "Arial"
CJK_FONT_FAMILY = "Microsoft JhengHei, Noto Sans TC, Arial, sans-serif"

HEADER_TOP = 19
HEADER_BOTTOM = 99
FOOTER_TOP = 3339
FOOTER_BOTTOM = 3419
OUTER_LEFT = 19
OUTER_RIGHT = 2257

_CARD_DRAW_WEEKDAYS = {
    "今彩539": frozenset(range(6)),
    "天天樂": frozenset(range(7)),
    "六合彩": frozenset({1, 3, 5}),
    "大樂透": frozenset({1, 4}),
}

_CARD_DRAW_DATE_EXCEPTIONS = {
    "今彩539": frozenset({
        date(2026, 2, 15),
        date(2026, 2, 22),
        date(2026, 3, 1),
    }),
}


_LAYOUTS = {
    "今彩539": {
        "title": "539", "accent": "#ffff00", "column_rows": (59, 59, 59, 50),
        "physical_rows": 59, "balls": 5, "special": False,
    },
    "天天樂": {
        "title": "天天樂", "accent": "#ccff99", "column_rows": (59, 59, 59, 50),
        "physical_rows": 59, "balls": 5, "special": False,
    },
    "六合彩": {
        "title": "六合彩", "accent": "#ffc0cb", "column_rows": (60, 60, 51),
        "physical_rows": 60, "balls": 7, "special": True,
    },
    "大樂透": {
        "title": "大樂透", "accent": "#87cefa", "column_rows": (60, 60, 51),
        "physical_rows": 60, "balls": 7, "special": True,
    },
}


# The reference cards are a fixed 2276×3438 print layout. These are the
# measured centre lines of each table cell, rather than proportional columns:
# proportional geometry visibly moves the grid at this resolution.
_PANELS_BY_COLUMN_COUNT = {
    4: (
        {"left": 19, "month": 83, "day_week": 137, "numbers": 191,
         "dividers": (267, 345, 421, 499), "right": 577},
        {"left": 581, "month": 643, "day_week": 697, "numbers": 749,
         "dividers": (827, 905, 981, 1059), "right": 1135},
        {"left": 1139, "month": 1203, "day_week": 1255, "numbers": 1309,
         "dividers": (1387, 1463, 1541, 1617), "right": 1695},
        {"left": 1699, "month": 1761, "day_week": 1815, "numbers": 1869,
         "dividers": (1945, 2023, 2101, 2177), "right": 2257},
    ),
    3: (
        {"left": 19, "month": 83, "day_week": 137, "numbers": 191,
         "dividers": (273, 355, 437, 517, 599, 681), "right": 763},
        {"left": 767, "month": 831, "day_week": 885, "numbers": 937,
         "dividers": (1019, 1101, 1183, 1265, 1345, 1427), "right": 1509},
        {"left": 1513, "month": 1577, "day_week": 1631, "numbers": 1683,
         "dividers": (1765, 1847, 1929, 2011, 2091, 2173), "right": 2257},
    ),
}

_PANELS = {
    "今彩539": _PANELS_BY_COLUMN_COUNT[4],
    "天天樂": (
        {**_PANELS_BY_COLUMN_COUNT[4][0], "numbers": 189},
        _PANELS_BY_COLUMN_COUNT[4][1],
        {**_PANELS_BY_COLUMN_COUNT[4][2], "dividers": (1387, 1463, 1541, 1619)},
        {**_PANELS_BY_COLUMN_COUNT[4][3], "dividers": (1947, 2023, 2101, 2177)},
    ),
    "六合彩": _PANELS_BY_COLUMN_COUNT[3],
    "大樂透": (
        _PANELS_BY_COLUMN_COUNT[3][0],
        {**_PANELS_BY_COLUMN_COUNT[3][1], "day_week": 883},
        _PANELS_BY_COLUMN_COUNT[3][2],
    ),
}


def card_layout(lottery: str) -> dict[str, Any]:
    try:
        return dict(_LAYOUTS[lottery])
    except KeyError as error:
        raise ValueError("未知彩種") from error


def _number(value: Any) -> str:
    return str(int(str(value))).zfill(2)


def _numbers(draw: dict[str, Any], order: str, special: bool) -> list[str]:
    if order not in {"draw", "sorted"}:
        raise ValueError("未知牌單順序")
    raw = draw.get("drawOrderNumbers") if order == "draw" else draw.get("sortedNumbers")
    values = [_number(value) for value in (raw or draw.get("numbers") or [])]
    if order == "sorted":
        normal = values[:-1] if special and len(values) == 7 else values
        normal = sorted(normal, key=int)
        return normal + (values[-1:] if special and len(values) == 7 else [])
    return values


def _date_value(draw_date: Any) -> date | None:
    text = str(draw_date or "").strip().replace("/", "-").replace(".", "-")
    try:
        year, month, day = (int(part) for part in text[:10].split("-"))
        return date(year, month, day)
    except (TypeError, ValueError):
        return None


def _calendar(value: date | None) -> tuple[str, str, str]:
    if value is None:
        return "", "", ""
    return str(value.month), f"{value.day:02d}", WEEKDAYS[value.weekday()]


def _next_card_draw_date(lottery: str, current: date) -> date:
    draw_weekdays = _CARD_DRAW_WEEKDAYS[lottery]
    draw_date_exceptions = _CARD_DRAW_DATE_EXCEPTIONS.get(lottery, frozenset())
    for offset in range(1, 8):
        candidate = current + timedelta(days=offset)
        if candidate.weekday() in draw_weekdays or candidate in draw_date_exceptions:
            return candidate
    raise RuntimeError("NEXT_CARD_DRAW_DATE_NOT_FOUND")


def _line(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    *,
    stroke: str = BLACK,
    width: int = 2,
) -> str:
    return (
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" '
        f'x2="{x2:.1f}" y2="{y2:.1f}" '
        f'stroke="{stroke}" stroke-width="{width}"/>'
    )


def _rect(x: float, y: float, width: float, height: float, *, fill: str) -> str:
    return (
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" '
        f'height="{height:.1f}" fill="{fill}"/>'
    )


def _text(
    x: float,
    y: float,
    value: str,
    size: int,
    *,
    fill: str = BLACK,
    weight: int = 400,
    anchor: str = "middle",
    dominant_baseline: str | None = None,
    text_length: int | None = None,
    font_family: str = NUMBER_FONT_FAMILY,
) -> str:
    text_length_attributes = (
        f' textLength="{text_length}" lengthAdjust="spacingAndGlyphs"'
        if text_length is not None else ""
    )
    dominant_baseline_attribute = (
        f'dominant-baseline="{dominant_baseline}" '
        if dominant_baseline is not None else ""
    )
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" '
        f'{dominant_baseline_attribute}'
        f'font-family="{font_family}" '
        f'font-size="{size}" font-weight="{weight}"{text_length_attributes} '
        f'fill="{fill}">{escape(value)}</text>'
    )


def _append_horizontal_rule(
    output: list[str],
    panel: dict[str, Any],
    y: float,
    *,
    special: bool,
    include_month: bool,
) -> None:
    start = panel["left"] if include_month else panel["month"]
    if special:
        special_start = panel["dividers"][-1]
        # Draw blue first so the black divider stays crisp at the join.
        output.append(_line(special_start, y, panel["right"], y, stroke=MONTH_BLUE))
        output.append(_line(start, y, special_start, y))
        return
    output.append(_line(start, y, panel["right"], y))


def _visible_span(panel: dict[str, Any], index: int, total: int) -> tuple[int, int]:
    left = panel["left"] - (3 if index == 0 else 1)
    right = panel["right"] + (3 if index == total - 1 else 1)
    return left, right


def _append_footer_top_border(
    output: list[str],
    panel: dict[str, Any],
    index: int,
    total: int,
    *,
    special: bool,
) -> None:
    left, right = _visible_span(panel, index, total)
    if not special:
        output.append(_rect(left, FOOTER_TOP - 1, right - left, 2, fill=BLACK))
        return

    special_start = panel["dividers"][-1]
    right_border_left = panel["right"] - (3 if index == total - 1 else 1)
    output.extend([
        _rect(left, FOOTER_TOP - 1, special_start + 1 - left, 2, fill=BLACK),
        _rect(special_start + 1, FOOTER_TOP - 1, right_border_left - special_start - 1, 2, fill=MONTH_BLUE),
        _rect(right_border_left, FOOTER_TOP - 1, right - right_border_left, 2, fill=BLACK),
    ])


def _build_rows(
    lottery: str,
    capacities: tuple[int, ...],
    physical_rows: int,
    draws: list[dict[str, Any]],
    order: str,
    special: bool,
) -> list[list[dict[str, Any]]]:
    entries = list(reversed(draws[:sum(capacities)]))
    cursor = 0
    visible_date: date | None = None
    previous_visible_date: date | None = None
    columns: list[list[dict[str, Any]]] = []

    for column, capacity in enumerate(capacities):
        rows: list[dict[str, Any]] = []
        for row in range(physical_rows):
            values: list[str] = []
            if row < capacity:
                if cursor < len(entries):
                    draw = entries[cursor]
                    cursor += 1
                    visible_date = _date_value(draw.get("drawDate") or draw.get("date"))
                    values = _numbers(draw, order, special)
                elif visible_date is not None:
                    visible_date = _next_card_draw_date(lottery, visible_date)
            elif visible_date is not None:
                visible_date = _next_card_draw_date(lottery, visible_date)

            month, day, weekday = _calendar(visible_date)
            month_boundary = bool(visible_date) and (
                previous_visible_date is None
                or (visible_date.year, visible_date.month) != (
                    previous_visible_date.year,
                    previous_visible_date.month,
                )
            )
            rows.append({
                "month": month,
                "day": day,
                "weekday": weekday,
                "values": values,
                "month_boundary": month_boundary,
                "show_month": month_boundary,
            })
            if visible_date is not None:
                previous_visible_date = visible_date
        columns.append(rows)
    return columns


def render_matrix_card(lottery: str, order: str, draws: list[dict[str, Any]]) -> str:
    layout = card_layout(lottery)
    mode = "落球" if order == "draw" else "順球" if order == "sorted" else None
    if mode is None:
        raise ValueError("未知牌單順序")

    capacities = tuple(layout["column_rows"])
    physical_rows = int(layout["physical_rows"])
    row_height = (FOOTER_TOP - HEADER_BOTTOM) / physical_rows
    panels = _PANELS[lottery]
    special = bool(layout["special"])
    rows_by_panel = _build_rows(
        lottery, capacities, physical_rows, draws, order, special,
    )
    output = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CARD_WIDTH}" height="{CARD_HEIGHT}" viewBox="0 0 {CARD_WIDTH} {CARD_HEIGHT}">',
        '<rect width="2276" height="3438" fill="#ffffff"/>',
    ]

    for panel in panels:
        output.extend([
            _rect(
                panel["left"], HEADER_TOP, panel["right"] - panel["left"],
                HEADER_BOTTOM - HEADER_TOP, fill=layout["accent"],
            ),
            _rect(
                panel["day_week"], HEADER_BOTTOM,
                panel["numbers"] - panel["day_week"], FOOTER_TOP - HEADER_BOTTOM,
                fill=WEEKDAY_GREY,
            ),
        ])

    output.append(_rect(
        OUTER_LEFT, FOOTER_TOP, OUTER_RIGHT - OUTER_LEFT,
        FOOTER_BOTTOM - FOOTER_TOP, fill=layout["accent"],
    ))

    for index, (panel, rows) in enumerate(zip(panels, rows_by_panel, strict=True)):
        top_left, top_right = _visible_span(panel, index, len(panels))
        output.append(_rect(top_left, HEADER_TOP - 3, top_right - top_left, 6, fill=BLACK))
        output.extend([
            _line(panel["left"], HEADER_BOTTOM, panel["right"], HEADER_BOTTOM),
            _line(panel["left"], HEADER_TOP, panel["left"], FOOTER_TOP),
            _line(panel["right"], HEADER_TOP, panel["right"], FOOTER_TOP),
            _line(panel["month"], HEADER_TOP, panel["month"], HEADER_BOTTOM),
            _line(panel["numbers"], HEADER_TOP, panel["numbers"], HEADER_BOTTOM),
        ])

        for row in range(1, physical_rows):
            y = HEADER_BOTTOM + row_height * row
            _append_horizontal_rule(output, panel, y, special=special, include_month=False)
            if rows[row]["month_boundary"]:
                output.append(_line(panel["left"], y, panel["month"], y))
        _append_horizontal_rule(output, panel, FOOTER_TOP, special=special, include_month=True)

        for edge in (panel["month"], panel["day_week"], panel["numbers"], *panel["dividers"]):
            output.append(_line(edge, HEADER_BOTTOM, edge, FOOTER_TOP))
        for row, value in enumerate(rows):
            if not value["month_boundary"]:
                continue
            top = HEADER_BOTTOM + row_height * row
            output.append(_line(
                panel["month"], top, panel["month"], top + row_height,
                stroke=MONTH_BLUE,
            ))

        _append_footer_top_border(output, panel, index, len(panels), special=special)

        output.extend([
            _text(
                (panel["left"] + panel["month"]) / 2, 74, "月", 40,
                font_family=CJK_FONT_FAMILY,
            ),
            _text(
                (panel["month"] + panel["numbers"]) / 2, 74, "日", 40,
                font_family=CJK_FONT_FAMILY,
            ),
            _text(
                (panel["numbers"] + panel["right"]) / 2,
                (HEADER_TOP + HEADER_BOTTOM) / 2,
                f'{layout["title"]} {mode}', 56, weight=700,
                dominant_baseline="central",
                font_family=CJK_FONT_FAMILY,
            ),
        ])

        edges = (panel["numbers"], *panel["dividers"], panel["right"])
        for row, value in enumerate(rows):
            if not value["day"]:
                continue
            top = HEADER_BOTTOM + row_height * row
            if value["show_month"]:
                output.append(_text(
                    (panel["left"] + panel["month"]) / 2, top + 45,
                    value["month"], 45, fill=MONTH_BLUE, weight=700,
                ))
            if lottery in MONDAY_BORDER_LOTTERIES and value["weekday"] == "一":
                output.extend([
                    _line(panel["day_week"], top, panel["numbers"], top, stroke=MONDAY_RED),
                    _line(panel["day_week"], top + row_height, panel["numbers"], top + row_height, stroke=MONDAY_RED),
                    _line(panel["day_week"], top, panel["day_week"], top + row_height, stroke=MONDAY_RED),
                    _line(panel["numbers"], top, panel["numbers"], top + row_height, stroke=MONDAY_RED),
                ])
            output.extend([
                _text((panel["month"] + panel["day_week"]) / 2, top + 41, value["day"], 39),
                _text(
                    (panel["day_week"] + panel["numbers"]) / 2, top + 41,
                    value["weekday"],
                    39, fill=MONDAY_RED if value["weekday"] == "一" and lottery != "大樂透" else BLACK,
                    font_family=CJK_FONT_FAMILY,
                ),
            ])
            for index, number in enumerate(value["values"][: layout["balls"]]):
                output.append(_text(
                    (edges[index] + edges[index + 1]) / 2, top + 46, number, 48,
                    fill=MONTH_BLUE if special and index == layout["balls"] - 1 else BLACK,
                    weight=700, text_length=57,
                ))

    output.extend([
        _rect(16, 16, 6, 3406, fill=BLACK),
        _rect(2254, 16, 6, 3406, fill=BLACK),
        _rect(16, 3416, 2244, 6, fill=BLACK),
        _text(
            CARD_WIDTH / 2, (FOOTER_TOP + FOOTER_BOTTOM) / 2,
            "快速探索版路，發現更多可能 | 樂彩 Matrix 網址：https://matrixlottery.idv.tw",
            36, weight=700, dominant_baseline="middle",
            font_family=CJK_FONT_FAMILY,
        ),
        "</svg>",
    ])
    return "".join(output)
