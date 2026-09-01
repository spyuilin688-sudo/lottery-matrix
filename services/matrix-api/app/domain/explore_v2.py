from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import Iterable, Mapping

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


@dataclass(frozen=True, slots=True)
class SourceUnit:
    locked_source_index: int
    prediction_distance: int
    lock_key: LockKey
    occurrence: LockOccurrence

    @property
    def locked_source_period(self) -> str:
        return self.occurrence.period


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


class ExploreV2Context:
    """One indexed, newest-first history shared by every Explore v2 road."""

    def __init__(
        self,
        lottery: str,
        number_order: str,
        draws: tuple[Mapping[str, object], ...],
        numbers_by_draw: tuple[tuple[int, ...], ...],
        occurrence_index: dict[LockKey, tuple[LockOccurrence, ...]],
        source_units: tuple[SourceUnit, ...],
        indexed_cell_count: int,
    ) -> None:
        self.lottery = lottery
        self.number_order = number_order
        self.position_count = lottery_position_count(lottery)
        self._draws = draws
        self._numbers_by_draw = numbers_by_draw
        self._occurrence_index = occurrence_index
        self._source_units = source_units
        self._range_cache: dict[tuple[int, int], tuple[VerificationCell, ...]] = {}
        self._drag_cache: dict[int, VerificationCell] = {}
        self._range_build_counts: dict[tuple[int, int], int] = {}
        self._drag_build_counts: dict[int, int] = {}
        self.occurrence_index_build_count = 1
        self.indexed_cell_count = indexed_cell_count

    @classmethod
    def build(
        cls,
        lottery: str,
        number_order: str,
        newest_first: Iterable[Mapping[str, object]],
    ) -> "ExploreV2Context":
        if lottery == "天天樂" and number_order != SORTED_ORDER:
            raise ValueError("天天樂只使用依號碼由小到大排序")
        if number_order not in {SORTED_ORDER, DRAW_ORDER}:
            raise ValueError("未知號碼順序")

        draws = tuple(draw for draw in newest_first if draw.get("lottery", lottery) == lottery)
        numbers_by_draw = tuple(ordered_numbers(draw, lottery, number_order) for draw in draws)
        mutable_index: dict[LockKey, list[LockOccurrence]] = {}
        indexed_cell_count = 0

        for draw_index, (draw, numbers) in enumerate(zip(draws, numbers_by_draw, strict=True)):
            period = str(draw.get("period", ""))
            for position, number in enumerate(numbers, start=1):
                key = LockKey(lottery, number_order, position, number)
                mutable_index.setdefault(key, []).append(
                    LockOccurrence(draw_index, period, position, number)
                )
                indexed_cell_count += 1

        occurrence_index = {
            key: tuple(occurrences) for key, occurrences in mutable_index.items()
        }
        source_units = tuple(
            SourceUnit(
                locked_source_index=draw_index,
                prediction_distance=draw_index + 1,
                lock_key=LockKey(lottery, number_order, position, number),
                occurrence=LockOccurrence(
                    draw_index=draw_index,
                    period=str(draws[draw_index].get("period", "")),
                    position=position,
                    number=number,
                ),
            )
            for draw_index, numbers in enumerate(numbers_by_draw[:13])
            for position, number in enumerate(numbers, start=1)
        )
        return cls(
            lottery=lottery,
            number_order=number_order,
            draws=draws,
            numbers_by_draw=numbers_by_draw,
            occurrence_index=occurrence_index,
            source_units=source_units,
            indexed_cell_count=indexed_cell_count,
        )

    @property
    def occurrence_index(self) -> Mapping[LockKey, tuple[LockOccurrence, ...]]:
        return MappingProxyType(self._occurrence_index)

    @property
    def range_build_counts(self) -> Mapping[tuple[int, int], int]:
        return MappingProxyType(self._range_build_counts)

    @property
    def drag_build_counts(self) -> Mapping[int, int]:
        return MappingProxyType(self._drag_build_counts)

    def occurrences_for(self, key: LockKey) -> tuple[LockOccurrence, ...]:
        return self._occurrence_index.get(key, ())

    def source_units(self) -> tuple[SourceUnit, ...]:
        return self._source_units

    def _occurrence_token(self, occurrence: LockOccurrence) -> int:
        if not 0 <= occurrence.draw_index < len(self._draws):
            raise ValueError("occurrence 不在目前歷史資料內")
        if not 1 <= occurrence.position <= self.position_count:
            raise ValueError("occurrence 位置超出彩種範圍")
        numbers = self._numbers_by_draw[occurrence.draw_index]
        if (
            len(numbers) != self.position_count
            or numbers[occurrence.position - 1] != occurrence.number
            or str(self._draws[occurrence.draw_index].get("period", "")) != occurrence.period
        ):
            raise ValueError("occurrence 與目前歷史資料不一致")
        return occurrence.draw_index * self.position_count + occurrence.position - 1

    def range_cells(
        self,
        occurrence: LockOccurrence,
        prediction_distance: int,
    ) -> tuple[VerificationCell, ...]:
        if prediction_distance < 1:
            raise ValueError("預測期距離必須大於0")
        occurrence_token = self._occurrence_token(occurrence)
        cache_key = (occurrence_token, prediction_distance)
        cached = self._range_cache.get(cache_key)
        if cached is not None:
            return cached

        cells: list[VerificationCell] = []
        relative_offsets = (*range(-14, 0), 0, *range(1, prediction_distance))
        for relative_offset in relative_offsets:
            draw_index = occurrence.draw_index - relative_offset
            if not 0 <= draw_index < len(self._draws):
                continue
            numbers = self._numbers_by_draw[draw_index]
            period = str(self._draws[draw_index].get("period", ""))
            scope_class = (
                ScopeClass.FULL_ONLY
                if -14 <= relative_offset <= -8
                else ScopeClass.STANDARD_AND_FULL
            )
            for position, number in enumerate(numbers, start=1):
                if relative_offset == 0 and position == occurrence.position:
                    continue
                cells.append(
                    VerificationCell(
                        occurrence_index=occurrence_token,
                        period=period,
                        relative_offset=relative_offset,
                        position=position,
                        number=number,
                        scope_class=scope_class,
                    )
                )

        result = tuple(cells)
        self._range_cache[cache_key] = result
        self._range_build_counts[cache_key] = self._range_build_counts.get(cache_key, 0) + 1
        return result

    def drag_cell(self, occurrence: LockOccurrence) -> VerificationCell:
        occurrence_token = self._occurrence_token(occurrence)
        cached = self._drag_cache.get(occurrence_token)
        if cached is not None:
            return cached
        cell = VerificationCell(
            occurrence_index=occurrence_token,
            period=occurrence.period,
            relative_offset=0,
            position=occurrence.position,
            number=occurrence.number,
            scope_class=ScopeClass.STANDARD_AND_FULL,
        )
        self._drag_cache[occurrence_token] = cell
        self._drag_build_counts[occurrence_token] = self._drag_build_counts.get(occurrence_token, 0) + 1
        return cell
