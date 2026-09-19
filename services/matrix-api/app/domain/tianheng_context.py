from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from typing import Mapping

from .explore_context import (
    CandidateCell,
    ExploreContext,
    ExploreEngineSession,
    VerificationCell,
)
from .explore_state import AlgorithmError, RoadType, ScopeClass, candidate_value


@dataclass(frozen=True, slots=True)
class TianhengLockKey:
    lottery: str
    number_order: str
    first_position: int
    first_number: int
    second_position: int
    second_number: int
    third_position: int | None = None
    third_number: int | None = None


@dataclass(frozen=True, slots=True)
class TianhengLockOccurrence:
    draw_index: int
    period: str
    first_position: int
    first_number: int
    second_position: int
    second_number: int
    third_position: int | None = None
    third_number: int | None = None


@dataclass(frozen=True, slots=True)
class TianhengSourceUnit:
    locked_source_index: int
    prediction_distance: int
    occurrence: TianhengLockOccurrence
    lock_key: TianhengLockKey


@dataclass(frozen=True, slots=True)
class TianhengRoadGroup:
    occurrence: TianhengLockOccurrence
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


class TianhengContext:
    def __init__(self, explore: ExploreContext, lock_count: int = 2) -> None:
        if lock_count not in {2, 3}:
            raise AlgorithmError("lockCount必須是2或3")
        self.explore = explore
        self.lock_count = lock_count
        self.lottery = explore.lottery
        self.number_order = explore.number_order
        self.spec = explore.spec
        self.history = explore.history
        self.metrics = explore.metrics

        mutable_index: dict[TianhengLockKey, list[TianhengLockOccurrence]] = {}
        for draw_index, draw in enumerate(explore.history):
            numbers = explore.ordered_at(draw_index)
            for positions in combinations(range(len(numbers)), lock_count):
                occurrence = self._occurrence(draw_index, str(draw["period"]), numbers, positions)
                key = self.key_for(occurrence)
                mutable_index.setdefault(key, []).append(occurrence)
        self._occurrence_index = {
            key: tuple(value) for key, value in mutable_index.items()
        }

        self.source_units = tuple(
            TianhengSourceUnit(
                locked_source_index=draw_index,
                prediction_distance=draw_index + 1,
                occurrence=occurrence,
                lock_key=self.key_for(occurrence),
            )
            for draw_index in range(13)
            for occurrence in self._occurrences_at(draw_index)
        )

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

    def clear_work_caches(self) -> None:
        """Retain the history index while releasing each batch's derived cells."""
        self._range_cache.clear()
        self._candidate_cache.clear()
        self._drag_cell_cache.clear()
        self._drag_candidate_cache.clear()

    def _occurrences_at(
        self,
        draw_index: int,
    ) -> tuple[TianhengLockOccurrence, ...]:
        numbers = self.explore.ordered_at(draw_index)
        period = str(self.history[draw_index]["period"])
        return tuple(
            self._occurrence(draw_index, period, numbers, positions)
            for positions in combinations(range(len(numbers)), self.lock_count)
        )

    def _occurrence(
        self,
        draw_index: int,
        period: str,
        numbers: tuple[int, ...],
        positions: tuple[int, ...],
    ) -> TianhengLockOccurrence:
        third_index = positions[2] if self.lock_count == 3 else None
        return TianhengLockOccurrence(
            draw_index,
            period,
            positions[0] + 1,
            numbers[positions[0]],
            positions[1] + 1,
            numbers[positions[1]],
            third_index + 1 if third_index is not None else None,
            numbers[third_index] if third_index is not None else None,
        )

    def key_for(self, occurrence: TianhengLockOccurrence) -> TianhengLockKey:
        return TianhengLockKey(
            self.lottery,
            self.number_order,
            occurrence.first_position,
            occurrence.first_number,
            occurrence.second_position,
            occurrence.second_number,
            occurrence.third_position,
            occurrence.third_number,
        )

    def _token(self, occurrence: TianhengLockOccurrence) -> int:
        if occurrence.third_position is not None:
            return (
                occurrence.draw_index * self.spec.position_count**3
                + (occurrence.first_position - 1) * self.spec.position_count**2
                + (occurrence.second_position - 1) * self.spec.position_count
                + occurrence.third_position
                - 1
            )
        return (
            occurrence.draw_index * self.spec.position_count**2
            + (occurrence.first_position - 1) * self.spec.position_count
            + occurrence.second_position
            - 1
        )

    def historical_occurrences(
        self,
        unit: TianhengSourceUnit,
    ) -> tuple[TianhengLockOccurrence, ...]:
        return tuple(
            occurrence
            for occurrence in self._occurrence_index.get(unit.lock_key, ())
            if occurrence.draw_index > unit.locked_source_index
        )

    def range_cells(
        self,
        occurrence: TianhengLockOccurrence,
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
            for position, number in enumerate(
                self.explore.ordered_at(draw_index),
                start=1,
            ):
                locked_positions = {
                    occurrence.first_position,
                    occurrence.second_position,
                }
                if occurrence.third_position is not None:
                    locked_positions.add(occurrence.third_position)
                if offset == 0 and position in locked_positions:
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
        return result

    def drag_cell(self, occurrence: TianhengLockOccurrence) -> VerificationCell:
        token = self._token(occurrence)
        cached = self._drag_cell_cache.get(token)
        if cached is not None:
            return cached
        cell = VerificationCell(
            occurrence_token=token,
            draw_index=occurrence.draw_index,
            period=occurrence.period,
            relative_offset=0,
            position=occurrence.first_position,
            number=occurrence.first_number,
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
        occurrence: TianhengLockOccurrence,
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
            targets = self.explore.official_at(result_index)
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
        return result

    def drag_candidate_targets(
        self,
        occurrence: TianhengLockOccurrence,
        prediction_distance: int,
    ) -> tuple[tuple[int, tuple[int, ...]], ...]:
        cache_key = (self._token(occurrence), prediction_distance)
        cached = self._drag_candidate_cache.get(cache_key)
        if cached is not None:
            return cached

        result_index = occurrence.draw_index - prediction_distance
        targets = self.explore.official_at(result_index) if result_index >= 0 else ()
        result = self._target_map(
            RoadType.DRAG,
            occurrence.first_number,
            targets,
            self.spec.maximum,
        )
        self._drag_candidate_cache[cache_key] = result
        return result


@dataclass(frozen=True, slots=True)
class TianhengEngineSession:
    lottery: str
    history: tuple[Mapping[str, object], ...]
    contexts: tuple[TianhengContext, ...]
    indexed_units: tuple[tuple[TianhengContext, TianhengSourceUnit], ...]
    lock_count: int = 2

    @classmethod
    def from_explore_session(
        cls,
        session: ExploreEngineSession,
        lock_count: int = 2,
    ) -> "TianhengEngineSession":
        contexts = tuple(TianhengContext(context, lock_count) for context in session.contexts)
        indexed_units = tuple(
            (context, unit)
            for context in contexts
            for unit in context.source_units
        )
        return cls(session.lottery, session.history, contexts, indexed_units, lock_count)
