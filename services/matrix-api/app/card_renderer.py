from __future__ import annotations

from datetime import date
from html import escape
from typing import Any


CARD_WIDTH = 2276
CARD_HEIGHT = 3438
WEEKDAYS = ("一", "二", "三", "四", "五", "六", "日")


_LAYOUTS = {
    "今彩539": {
        "title": "539", "accent": "#fff200", "column_rows": (59, 59, 59, 50),
        "balls": 5, "special": False,
    },
    "天天樂": {
        "title": "天天樂", "accent": "#cbf99d", "column_rows": (59, 59, 59, 50),
        "balls": 5, "special": False,
    },
    "六合彩": {
        "title": "六合彩", "accent": "#ffc1ce", "column_rows": (60, 60, 51),
        "balls": 7, "special": True,
    },
    "大樂透": {
        "title": "大樂透", "accent": "#80c7ef", "column_rows": (60, 60, 51),
        "balls": 7, "special": True,
    },
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


def _calendar(draw_date: Any) -> tuple[str, str, str]:
    text = str(draw_date or "").strip().replace("/", "-").replace(".", "-")
    try:
        year, month, day = (int(part) for part in text[:10].split("-"))
        value = date(year, month, day)
        return str(value.month), f"{value.day:02d}", WEEKDAYS[value.weekday()]
    except (TypeError, ValueError):
        return "", "", ""


def _text(
    x: float,
    y: float,
    value: str,
    size: int,
    *,
    fill: str = "#141414",
    weight: int = 400,
    anchor: str = "middle",
) -> str:
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}" '
        f'font-family="Noto Sans TC, Microsoft JhengHei, Arial, sans-serif" '
        f'font-size="{size}" font-weight="{weight}" fill="{fill}">{escape(value)}</text>'
    )


def render_matrix_card(lottery: str, order: str, draws: list[dict[str, Any]]) -> str:
    layout = card_layout(lottery)
    mode = "落球" if order == "draw" else "順球" if order == "sorted" else None
    if mode is None:
        raise ValueError("未知牌單順序")
    capacities = tuple(layout["column_rows"])
    max_rows = sum(capacities)
    entries = list(reversed(draws[:max_rows]))
    margin = 14
    header = 104
    footer = 70
    column_width = (CARD_WIDTH - margin * 2) / len(capacities)
    body_height = CARD_HEIGHT - header - footer
    output = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CARD_WIDTH}" height="{CARD_HEIGHT}" viewBox="0 0 {CARD_WIDTH} {CARD_HEIGHT}">',
        '<rect width="2276" height="3438" fill="#ffffff"/>',
        '<rect x="8" y="8" width="2260" height="3422" fill="none" stroke="#111" stroke-width="6"/>',
    ]
    cursor = 0
    for column, capacity in enumerate(capacities):
        x = margin + column * column_width
        row_height = body_height / capacity
        meta_width = 172 if layout["balls"] == 5 else 186
        number_width = column_width - meta_width
        output.extend([
            f'<rect x="{x:.1f}" y="8" width="{column_width:.1f}" height="{header - 8}" fill="{layout["accent"]}" stroke="#111" stroke-width="3"/>',
            _text(x + 28, 62, "月", 31),
            _text(x + 82, 62, "日", 31),
            _text(x + (meta_width + column_width) / 2, 67, f'{layout["title"]} {mode}', 58, weight=700),
            f'<line x1="{x + 54:.1f}" y1="8" x2="{x + 54:.1f}" y2="{header:.1f}" stroke="#111" stroke-width="2"/>',
            f'<line x1="{x + 108:.1f}" y1="8" x2="{x + 108:.1f}" y2="{header:.1f}" stroke="#111" stroke-width="2"/>',
            f'<line x1="{x + meta_width:.1f}" y1="8" x2="{x + meta_width:.1f}" y2="{header:.1f}" stroke="#111" stroke-width="2"/>',
            f'<rect x="{x:.1f}" y="{header:.1f}" width="{column_width:.1f}" height="{body_height:.1f}" fill="#fff" stroke="#111" stroke-width="2"/>',
            f'<line x1="{x + 54:.1f}" y1="{header:.1f}" x2="{x + 54:.1f}" y2="{CARD_HEIGHT - footer:.1f}" stroke="#777" stroke-width="1"/>',
            f'<line x1="{x + 108:.1f}" y1="{header:.1f}" x2="{x + 108:.1f}" y2="{CARD_HEIGHT - footer:.1f}" stroke="#777" stroke-width="1"/>',
            f'<line x1="{x + meta_width:.1f}" y1="{header:.1f}" x2="{x + meta_width:.1f}" y2="{CARD_HEIGHT - footer:.1f}" stroke="#111" stroke-width="2"/>',
        ])
        for row in range(capacity):
            y = header + row * row_height
            output.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x + column_width:.1f}" y2="{y:.1f}" stroke="#777" stroke-width="1"/>')
            if cursor >= len(entries):
                continue
            draw = entries[cursor]
            cursor += 1
            month, day, weekday = _calendar(draw.get("drawDate") or draw.get("date"))
            baseline = y + row_height * 0.73
            if day == "01":
                output.append(_text(x + 27, baseline, month, 35, fill="#0b35ea", weight=700))
            output.append(_text(x + 80, baseline, day, 31))
            output.append(_text(x + 136, baseline, weekday, 31, fill="#d81e25" if weekday == "日" else "#333"))
            values = _numbers(draw, order, bool(layout["special"]))
            cell_width = number_width / layout["balls"]
            for index, value in enumerate(values[: layout["balls"]]):
                fill = "#0047ff" if layout["special"] and index == layout["balls"] - 1 else "#111"
                output.append(_text(x + meta_width + cell_width * (index + 0.5), baseline, value, 39, fill=fill, weight=700))
        output.append(f'<line x1="{x:.1f}" y1="{CARD_HEIGHT - footer:.1f}" x2="{x + column_width:.1f}" y2="{CARD_HEIGHT - footer:.1f}" stroke="#111" stroke-width="2"/>')
    output.extend([
        f'<rect x="8" y="{CARD_HEIGHT - footer:.1f}" width="2260" height="62" fill="{layout["accent"]}" stroke="#111" stroke-width="3"/>',
        _text(CARD_WIDTH / 2, CARD_HEIGHT - 25, "樂彩 Matrix 牌單", 29, weight=700),
        "</svg>",
    ])
    return "".join(output)
