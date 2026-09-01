from dataclasses import dataclass
from enum import StrEnum
from typing import Mapping

from .models import lottery_position_count, normalize_matrix_number


SORTED_ORDER = "依號碼由小到大排序"
DRAW_ORDER = "依實際開獎順序排序"


class ScopeClass(StrEnum):
    STANDARD_AND_FULL = "STANDARD_AND_FULL"
    FULL_ONLY = "FULL_ONLY"


class RoadType(StrEnum):
    ADD = "加減"
    SUM = "合值"
    DRAG = "拖牌"


@dataclass(frozen=True, slots=True)
class LockKey:
    lottery: str
    sort_mode: str
    position: int
    number: int


@dataclass(frozen=True, slots=True)
class LockOccurrence:
    draw_index: int
    period: str
    position: int
    number: int


@dataclass(frozen=True, slots=True)
class VerificationCell:
    occurrence_index: int
    period: str
    relative_offset: int
    position: int
    number: int
    scope_class: ScopeClass


def candidate_value(road: RoadType, base: int, target: int, maximum: int) -> int:
    if road is RoadType.SUM:
        return base + target
    return (target - base + maximum) % maximum


def apply_candidate(road: RoadType, base: int, value: int, maximum: int) -> int:
    if road is RoadType.SUM:
        return normalize_matrix_number(value - base, maximum)
    return normalize_matrix_number(base + value, maximum)


def _complete_int_tuple(values: object, count: int) -> tuple[int, ...]:
    if not isinstance(values, list) or len(values) != count:
        return ()
    try:
        return tuple(int(number) for number in values)
    except (TypeError, ValueError):
        return ()


def ordered_numbers(draw: Mapping[str, object], lottery: str, order: str) -> tuple[int, ...]:
    count = lottery_position_count(lottery)
    if order == DRAW_ORDER:
        return _complete_int_tuple(draw.get("drawOrderNumbers"), count)
    if order != SORTED_ORDER:
        return ()

    sorted_values = _complete_int_tuple(draw.get("sortedNumbers"), count)
    if sorted_values:
        return sorted_values

    values = _complete_int_tuple(draw.get("numbers"), count)
    if not values:
        return ()
    if count == 7:
        return (*sorted(values[:6]), values[6])
    return tuple(sorted(values))
