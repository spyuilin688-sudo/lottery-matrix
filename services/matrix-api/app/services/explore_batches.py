from __future__ import annotations

from collections.abc import Callable
from typing import Any


def work_units(lottery: str, history_length: int, position_count: int) -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    number_orders = (
        ('依號碼由小到大排序',)
        if lottery == '天天樂'
        else ('依號碼由小到大排序', '依實際開獎順序排序')
    )
    for number_order in number_orders:
        for source_index in range(min(13, max(0, history_length))):
            for position in range(1, position_count + 1):
                units.append({
                    'lottery': lottery,
                    'numberOrder': number_order,
                    'lockedSourceIndex': source_index,
                    'lockedPosition': position,
                    'exploreDateOffset': 0,
                    'exploreRange': '完整範圍',
                    'predictionDistance': source_index + 1,
                })
    return units


def build_explore_batch(
    *,
    lottery: str,
    draw_period: str,
    history: list[dict[str, Any]],
    position_count: int,
    start: int,
    limit: int,
    runner: Callable[[dict[str, Any], list[dict[str, Any]]], dict[str, Any]],
    append_result: Callable[[dict[str, Any], dict[str, Any], dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    units = work_units(lottery, len(history), position_count)
    cursor = min(max(0, start), len(units))
    stop = min(len(units), cursor + max(1, limit))
    artifact = {
        'lottery': lottery,
        'drawPeriod': draw_period,
        'items': [],
        'validationById': {},
        'tianyanSources': [],
    }
    for unit in units[cursor:stop]:
        raw = runner(unit, history)
        if append_result is not None:
            append_result(artifact, unit, raw)
    return {
        'artifact': artifact,
        'cursorStart': cursor,
        'cursor': stop,
        'total': len(units),
        'complete': stop >= len(units),
    }
