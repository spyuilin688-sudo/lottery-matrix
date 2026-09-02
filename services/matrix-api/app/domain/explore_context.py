from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence

from .explore_state import (
    DRAW_ORDER,
    LOTTERY_SPECS,
    SORTED_ORDER,
    AlgorithmError,
    EngineMetrics,
    LotterySpec,
    RoadType,
    ScopeClass,
    candidate_value,
)


@dataclass(frozen=True, slots=True)
class LockKey:
    lottery: str
    number_order: str
    position: int
    number: int


@dataclass(frozen=True, slots=True)
class LockOccurrence:
    draw_index: int
    period: str
    position: int
    number: int


@dataclass(frozen=True, slots=True)
class SourceUnit:
    locked_source_index: int
    prediction_distance: int
    occurrence: LockOccurrence
    lock_key: LockKey


@dataclass(frozen=True, slots=True)
class VerificationCell:
    occurrence_token: int
    draw_index: int
    period: str
    relative_offset: int
    position: int
    number: int
    scope_class: ScopeClass


@dataclass(frozen=True, slots=True)
class CandidateCell:
    cell: VerificationCell
    add_targets: tuple[tuple[int, tuple[int, ...]], ...]
    sum_targets: tuple[tuple[int, tuple[int, ...]], ...]

    def targets_for(self, road: RoadType) -> tuple[tuple[int, tuple[int, ...]], ...]:
        if road is RoadType.ADD:
            return self.add_targets
        if road is RoadType.SUM:
            return self.sum_targets
        return ()


@dataclass(frozen=True, slots=True)
class RoadGroup:
    occurrence: LockOccurrence
    reference_cell: VerificationCell
    result_draw_index: int
    candidate_targets: tuple[tuple[int, tuple[int, ...]], ...]

    @property
    def candidates(self) -> frozenset[int]:
        return frozenset(value for value, _targets in self.candidate_targets)

    def targets_for(self, rule: int) -> tuple[int, ...]:
        for value, targets in self.candidate_targets:
            if value == rule:
                return targets
        return ()


def _int_tuple(value: object, expected: int, field: str) -> tuple[int, ...]:
    if not isinstance(value, (list, tuple)) or len(value) != expected:
        raise AlgorithmError(f"{field}必須包含{expected}個號碼")
    try:
        return tuple(int(item) for item in value)
    except (TypeError, ValueError) as error:
        raise AlgorithmError(f"{field}包含非整數號碼") from error


def _validate_numbers(
    numbers: tuple[int, ...],
    spec: LotterySpec,
    field: str,
) -> None:
    if any(number < 1 or number > spec.maximum for number in numbers):
        raise AlgorithmError(f"{field}號碼超出1～{spec.maximum}")
    if len(set(numbers)) != len(numbers):
        raise AlgorithmError(f"{field}同一期號碼不得重複")


def official_numbers(
    draw: Mapping[str, object],
    spec: LotterySpec,
) -> tuple[int, ...]:
    numbers = _int_tuple(draw.get("numbers"), spec.position_count, "numbers")
    _validate_numbers(numbers, spec, "numbers")
    return numbers


def ordered_numbers(
    draw: Mapping[str, object],
    spec: LotterySpec,
    number_order: str,
) -> tuple[int, ...]:
    if number_order == DRAW_ORDER:
        numbers = _int_tuple(
            draw.get("drawOrderNumbers"),
            spec.position_count,
            "drawOrderNumbers",
        )
        _validate_numbers(numbers, spec, "drawOrderNumbers")
        return numbers
    if number_order != SORTED_ORDER:
        raise AlgorithmError("不支援的號碼順序")

    supplied = draw.get("sortedNumbers")
    if isinstance(supplied, (list, tuple)):
        numbers = _int_tuple(supplied, spec.position_count, "sortedNumbers")
        _validate_numbers(numbers, spec, "sortedNumbers")
        return numbers

    official = official_numbers(draw, spec)
    if spec.special_position is None:
        return tuple(sorted(official))
    return (*sorted(official[:-1]), official[-1])


class ExploreContext:
    def __init__(
        self,
        lottery: str,
        number_order: str,
        history: Sequence[Mapping[str, object]],
        metrics: EngineMetrics,
    ) -> None:
        if lottery not in LOTTERY_SPECS:
            raise AlgorithmError("不支援的彩種")
        if lottery == "天天樂" and number_order != SORTED_ORDER:
            raise AlgorithmError("天天樂只允許依號碼由小到大排序")
        if number_order not in {SORTED_ORDER, DRAW_ORDER}:
            raise AlgorithmError("不支援的號碼順序")
        if len(history) < 13:
            raise AlgorithmError("history至少需要13期")

        self.lottery = lottery
        self.number_order = number_order
        self.spec = LOTTERY_SPECS[lottery]
        self.history = tuple(history)
        self.metrics = metrics
        self._ordered = tuple(
            ordered_numbers(draw, self.spec, number_order) for draw in self.history
        )
        self._official = tuple(
            official_numbers(draw, self.spec) for draw in self.history
        )

        mutable_index: dict[LockKey, list[LockOccurrence]] = {}
        for draw_index, (draw, numbers) in enumerate(
            zip(self.history, self._ordered, strict=True)
        ):
            period = str(draw.get("period", "")).strip()
            if not period:
                raise AlgorithmError("每一期history都必須包含period")
            for position, number in enumerate(numbers, start=1):
                key = LockKey(lottery, number_order, position, number)
                mutable_index.setdefault(key, []).append(
                    LockOccurrence(draw_index, period, position, number)
                )
                metrics.indexed_cells += 1

        self._occurrence_index = {
            key: tuple(occurrences)
            for key, occurrences in mutable_index.items()
        }
        metrics.occurrence_index_builds += 1
        self.source_units = tuple(
            SourceUnit(
                locked_source_index=draw_index,
                prediction_distance=draw_index + 1,
                occurrence=LockOccurrence(
                    draw_index,
                    str(self.history[draw_index]["period"]),
                    position,
                    number,
                ),
                lock_key=LockKey(lottery, number_order, position, number),
            )
            for draw_index, numbers in enumerate(self._ordered[:13])
            for position, number in enumerate(numbers, start=1)
        )
        metrics.source_units_total = len(self.source_units)

        self._range_cache: dict[
            tuple[int, int], tuple[VerificationCell, ...]
        ] = {}
        self._candidate_cache: dict[
            tuple[int, int], tuple[CandidateCell, ...]
        ] = {}
        self._drag_cell_cache: dict[int, VerificationCell] = {}
        self._drag_candidate_cache: dict[
            tuple[int, int], tuple[tuple[int, tuple[int, ...]], ...]
        ] = {}

    def draw_at(self, draw_index: int) -> Mapping[str, object]:
        return self.history[draw_index]

    def ordered_at(self, draw_index: int) -> tuple[int, ...]:
        return self._ordered[draw_index]

    def official_at(self, draw_index: int) -> tuple[int, ...]:
        return self._official[draw_index]

    def _token(self, occurrence: LockOccurrence) -> int:
        return (
            occurrence.draw_index * self.spec.position_count
            + occurrence.position
            - 1
        )

    def historical_occurrences(self, unit: SourceUnit) -> tuple[LockOccurrence, ...]:
        return tuple(
            occurrence
            for occurrence in self._occurrence_index.get(unit.lock_key, ())
            if occurrence.draw_index > unit.locked_source_index
        )

    def range_cells(
        self,
        occurrence: LockOccurrence,
        prediction_distance: int,
    ) -> tuple[VerificationCell, ...]:
        if prediction_distance < 1:
            raise AlgorithmError("predictionDistance必須大於0")
        cache_key = (self._token(occurrence), prediction_distance)
        cached = self._range_cache.get(cache_key)
        if cached is not None:
            return cached

        cells: list[VerificationCell] = []
        offsets = (*range(-14, 0), 0, *range(1, prediction_distance))
        for offset in offsets:
            draw_index = occurrence.draw_index - offset
            if not 0 <= draw_index < len(self.history):
                continue
            scope_class = (
                ScopeClass.FULL_ONLY
                if -14 <= offset <= -8
                else ScopeClass.STANDARD_AND_FULL
            )
            for position, number in enumerate(self._ordered[draw_index], start=1):
                if offset == 0 and position == occurrence.position:
                    continue
                cells.append(
                    VerificationCell(
                        occurrence_token=self._token(occurrence),
                        draw_index=draw_index,
                        period=str(self.history[draw_index]["period"]),
                        relative_offset=offset,
                        position=position,
                        number=number,
                        scope_class=scope_class,
                    )
                )

        result = tuple(cells)
        self._range_cache[cache_key] = result
        self.metrics.range_cell_builds += 1
        return result

    def drag_cell(self, occurrence: LockOccurrence) -> VerificationCell:
        token = self._token(occurrence)
        cached = self._drag_cell_cache.get(token)
        if cached is not None:
            return cached
        cell = VerificationCell(
            occurrence_token=token,
            draw_index=occurrence.draw_index,
            period=occurrence.period,
            relative_offset=0,
            position=occurrence.position,
            number=occurrence.number,
            scope_class=ScopeClass.STANDARD_AND_FULL,
        )
        self._drag_cell_cache[token] = cell
        return cell

    @staticmethod
    def _target_map(
        road: RoadType,
        base: int,
        targets: tuple[int, ...],
        maximum: int,
    ) -> tuple[tuple[int, tuple[int, ...]], ...]:
        mapped: dict[int, set[int]] = {}
        for target in targets:
            value = candidate_value(road, base, target, maximum)
            mapped.setdefault(value, set()).add(target)
        return tuple(
            (value, tuple(sorted(hit_numbers)))
            for value, hit_numbers in sorted(mapped.items())
        )

    def range_candidate_cells(
        self,
        occurrence: LockOccurrence,
        prediction_distance: int,
    ) -> tuple[CandidateCell, ...]:
        cache_key = (self._token(occurrence), prediction_distance)
        cached = self._candidate_cache.get(cache_key)
        if cached is not None:
            return cached

        result_index = occurrence.draw_index - prediction_distance
        if result_index < 0:
            result: tuple[CandidateCell, ...] = ()
        else:
            targets = self._official[result_index]
            result = tuple(
                CandidateCell(
                    cell=cell,
                    add_targets=self._target_map(
                        RoadType.ADD,
                        cell.number,
                        targets,
                        self.spec.maximum,
                    ),
                    sum_targets=self._target_map(
                        RoadType.SUM,
                        cell.number,
                        targets,
                        self.spec.maximum,
                    ),
                )
                for cell in self.range_cells(occurrence, prediction_distance)
            )

        self._candidate_cache[cache_key] = result
        self.metrics.candidate_builds += 1
        return result

    def drag_candidate_targets(
        self,
        occurrence: LockOccurrence,
        prediction_distance: int,
    ) -> tuple[tuple[int, tuple[int, ...]], ...]:
        cache_key = (self._token(occurrence), prediction_distance)
        cached = self._drag_candidate_cache.get(cache_key)
        if cached is not None:
            return cached

        result_index = occurrence.draw_index - prediction_distance
        targets = self._official[result_index] if result_index >= 0 else ()
        result = self._target_map(
            RoadType.DRAG,
            occurrence.number,
            targets,
            self.spec.maximum,
        )
        self._drag_candidate_cache[cache_key] = result
        self.metrics.drag_candidate_builds += 1
        return result


@dataclass(frozen=True, slots=True)
class ExploreEngineSession:
    lottery: str
    history: tuple[Mapping[str, object], ...]
    contexts: tuple[ExploreContext, ...]
    indexed_units: tuple[tuple[ExploreContext, SourceUnit], ...]

    @classmethod
    def build(
        cls,
        lottery: str,
        newest_first: Iterable[Mapping[str, object]],
    ) -> "ExploreEngineSession":
        history = tuple(newest_first)
        orders = (
            (SORTED_ORDER,)
            if lottery == "天天樂"
            else (SORTED_ORDER, DRAW_ORDER)
        )
        contexts: list[ExploreContext] = []
        for number_order in orders:
            selected_history: Sequence[Mapping[str, object]] = history
            if number_order == DRAW_ORDER:
                from .history_boundaries import draw_order_history

                try:
                    selected_history = draw_order_history(lottery, history)
                except ValueError as error:
                    raise AlgorithmError(str(error)) from error
            contexts.append(
                ExploreContext(
                    lottery,
                    number_order,
                    selected_history,
                    EngineMetrics(),
                )
            )

        context_tuple = tuple(contexts)
        indexed_units = tuple(
            (context, unit)
            for context in context_tuple
            for unit in context.source_units
        )
        return cls(lottery, history, context_tuple, indexed_units)

    def matches(
        self,
        lottery: str,
        newest_first: Iterable[Mapping[str, object]],
    ) -> bool:
        return self.lottery == lottery and self.history == tuple(newest_first)
