from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Iterable, Mapping, Sequence

SORTED_ORDER = "依號碼由小到大排序"
DRAW_ORDER = "依實際開獎順序排序"
STANDARD_RANGE = "標準範圍"
FULL_RANGE = "完整範圍"


class AlgorithmError(ValueError):
    pass


class ScopeClass(StrEnum):
    STANDARD_AND_FULL = "STANDARD_AND_FULL"
    FULL_ONLY = "FULL_ONLY"


class RoadType(StrEnum):
    ADD = "加減"
    SUM = "合值"
    DRAG = "拖牌"


@dataclass(frozen=True, slots=True)
class LotterySpec:
    name: str
    maximum: int
    position_count: int
    special_position: int | None = None


LOTTERY_SPECS = {
    "今彩539": LotterySpec("今彩539", 39, 5),
    "天天樂": LotterySpec("天天樂", 39, 5),
    "六合彩": LotterySpec("六合彩", 49, 7, 7),
    "大樂透": LotterySpec("大樂透", 49, 7, 7),
}

INVALID_ONE_CODE_MAXIMUM = "鎖定1碼連準達8次以上，整條cell無效，不得截短"
INVALID_ONE_CODE_NOT_EXACT = "鎖定1碼的最高連準規則必須恰好1條"
INVALID_TWO_CODE_MAXIMUM = "鎖定2碼候選pair連準達12次以上，該pair無效，不得截短"
INVALID_MORE_THAN_TWO_LONGEST = "同一cell完整延續後，相同最高連準包含超過2個不同規則，整條cell無效"
INVALID_SINGLE_USE_ENDPOINT = "鎖定2碼單次規則只能位於連準中間，不得只在頭或尾"


@dataclass(frozen=True, slots=True)
class StreakDecision:
    valid: bool
    highest_streak: int
    rules: tuple[int, ...] = ()
    reason: str | None = None
    matched_group_indexes: tuple[int, ...] = ()
    top_rule_sets: tuple[tuple[int, ...], ...] = ()


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


@dataclass(slots=True)
class EngineMetrics:
    occurrence_index_builds: int = 0
    indexed_cells: int = 0
    range_cell_builds: int = 0
    candidate_builds: int = 0
    drag_candidate_builds: int = 0
    scope_decisions: int = 0
    source_units_total: int = 0
    source_units_processed: int = 0
    global_pair_enumerations: int = 0
    max_active_first_states: int = 0
    max_active_second_candidates: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "occurrenceIndexBuilds": self.occurrence_index_builds,
            "indexedCells": self.indexed_cells,
            "rangeCellBuilds": self.range_cell_builds,
            "candidateBuilds": self.candidate_builds,
            "dragCandidateBuilds": self.drag_candidate_builds,
            "scopeDecisions": self.scope_decisions,
            "sourceUnitsTotal": self.source_units_total,
            "sourceUnitsProcessed": self.source_units_processed,
            "globalPairEnumerations": self.global_pair_enumerations,
            "maxActiveFirstStates": self.max_active_first_states,
            "maxActiveSecondCandidates": self.max_active_second_candidates,
        }


def candidate_value(road: RoadType, base: int, target: int, maximum: int) -> int:
    if road is RoadType.SUM:
        return base + target
    return (target - base + maximum) % maximum


def apply_candidate(road: RoadType, base: int, value: int, maximum: int) -> int:
    raw = value - base if road is RoadType.SUM else base + value
    return ((raw - 1) % maximum) + 1


def _candidate_groups(groups: Iterable[Iterable[int]]) -> tuple[frozenset[int], ...]:
    return tuple(frozenset(int(value) for value in group) for group in groups)


def evaluate_one_code(groups: Iterable[Iterable[int]]) -> StreakDecision:
    normalized = _candidate_groups(groups)
    if len(normalized) < 2:
        return StreakDecision(False, 0, reason="準4+至少需要B、C兩個歷史組")
    common = normalized[0] & normalized[1]
    if not common:
        return StreakDecision(False, 0, reason="B、C無共同值，準4+停止")

    scores: dict[int, int] = {}
    for rule in common:
        streak = 0
        for group in normalized[:8]:
            if rule not in group:
                break
            streak += 1
        scores[rule] = streak

    highest = max(scores.values())
    top_rules = tuple(sorted(rule for rule, streak in scores.items() if streak == highest))
    matched = tuple(range(highest))
    if highest >= 8:
        return StreakDecision(False, highest, top_rules, INVALID_ONE_CODE_MAXIMUM, matched)
    if highest not in {4, 5, 6, 7}:
        return StreakDecision(
            False,
            highest,
            top_rules,
            f"準{highest}進{highest + 1}不屬準4+有效層級",
            matched,
        )
    if len(top_rules) != 1:
        return StreakDecision(False, highest, top_rules, INVALID_ONE_CODE_NOT_EXACT, matched)
    return StreakDecision(
        True,
        highest,
        top_rules,
        matched_group_indexes=matched,
        top_rule_sets=((top_rules[0],),),
    )


def _record_pair(
    scores: dict[tuple[int, int], int],
    first: int,
    second: int,
    streak: int,
) -> None:
    if first == second or streak <= 0:
        return
    pair = tuple(sorted((first, second)))
    if streak > scores.get(pair, 0):
        scores[pair] = streak


def _incremental_pair_scores(
    groups: tuple[frozenset[int], ...],
    metrics: EngineMetrics | None = None,
) -> dict[tuple[int, int], int]:
    """以B候選建立有限anchor state；禁止預先展開B∪C的全部pair。"""
    bounded = groups[:12]
    if not bounded:
        return {}

    first_rules = tuple(sorted(bounded[0]))
    if metrics:
        metrics.max_active_first_states = max(
            metrics.max_active_first_states,
            len(first_rules),
        )

    scores: dict[tuple[int, int], int] = {}
    for first in first_rules:
        active_seconds: set[int] = set()
        first_has_missed = False
        seen: set[int] = set()

        for index, group in enumerate(bounded):
            seen.update(group)
            if first in group:
                if not first_has_missed:
                    active_seconds.update(seen)
                    active_seconds.discard(first)
            else:
                if not first_has_missed:
                    first_has_missed = True
                    active_seconds.update(group)
                    active_seconds.discard(first)

                for second in active_seconds - group:
                    _record_pair(scores, first, second, index)
                active_seconds.intersection_update(group)
                if not active_seconds:
                    break

            if metrics:
                metrics.max_active_second_candidates = max(
                    metrics.max_active_second_candidates,
                    len(active_seconds),
                )

            if index == len(bounded) - 1:
                for second in active_seconds:
                    _record_pair(scores, first, second, index + 1)

    return scores


def _endpoint_invalid(
    pair: tuple[int, int],
    groups: tuple[frozenset[int], ...],
    highest: int,
) -> bool:
    prefix = groups[:highest]
    for rule in pair:
        positions = tuple(index for index, group in enumerate(prefix) if rule in group)
        if not positions or (
            len(positions) == 1 and positions[0] in {0, highest - 1}
        ):
            return True
    return False


def evaluate_two_code(
    groups: Iterable[Iterable[int]],
    metrics: EngineMetrics | None = None,
) -> StreakDecision:
    normalized = _candidate_groups(groups)
    if len(normalized) < 2:
        return StreakDecision(False, 0, reason="準5+至少需要B、C兩個歷史組")

    scores = _incremental_pair_scores(normalized, metrics)
    if not scores:
        return StreakDecision(False, 0, reason="第二條不同規則未形成或候選路徑中斷")

    raw_highest = max(scores.values())
    eligible_scores = {
        pair: streak
        for pair, streak in scores.items()
        if streak in {5, 6, 7, 9, 11}
        and streak < 12
        and not _endpoint_invalid(pair, normalized, streak)
    }

    if not eligible_scores:
        raw_pairs = tuple(
            sorted(pair for pair, streak in scores.items() if streak == raw_highest)
        )
        raw_rules = tuple(sorted({rule for pair in raw_pairs for rule in pair}))
        matched = tuple(range(raw_highest))
        if raw_highest >= 12:
            return StreakDecision(
                False,
                raw_highest,
                raw_rules,
                INVALID_TWO_CODE_MAXIMUM,
                matched,
                raw_pairs,
            )
        if raw_highest not in {5, 6, 7, 9, 11}:
            return StreakDecision(
                False,
                raw_highest,
                raw_rules,
                f"準{raw_highest}進{raw_highest + 1}不屬準5+有效層級",
                matched,
                raw_pairs,
            )
        return StreakDecision(
            False,
            raw_highest,
            raw_rules,
            INVALID_SINGLE_USE_ENDPOINT,
            matched,
            raw_pairs,
        )

    highest = max(eligible_scores.values())
    top_pairs = tuple(
        sorted(pair for pair, streak in eligible_scores.items() if streak == highest)
    )
    rules = tuple(sorted({rule for pair in top_pairs for rule in pair}))
    matched = tuple(range(highest))
    if len(rules) > 2:
        return StreakDecision(
            False,
            highest,
            rules,
            INVALID_MORE_THAN_TWO_LONGEST,
            matched,
            top_pairs,
        )
    if len(rules) != 2:
        return StreakDecision(
            False,
            highest,
            rules,
            "準5+必須恰好2條不同規則",
            matched,
            top_pairs,
        )
    return StreakDecision(
        True,
        highest,
        rules,
        matched_group_indexes=matched,
        top_rule_sets=(rules,),
    )


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


def _official_numbers(draw: Mapping[str, object], spec: LotterySpec) -> tuple[int, ...]:
    numbers = _int_tuple(draw.get("numbers"), spec.position_count, "numbers")
    _validate_numbers(numbers, spec, "numbers")
    return numbers


def _ordered_numbers(
    draw: Mapping[str, object],
    spec: LotterySpec,
    order: str,
) -> tuple[int, ...]:
    if order == DRAW_ORDER:
        numbers = _int_tuple(
            draw.get("drawOrderNumbers"),
            spec.position_count,
            "drawOrderNumbers",
        )
        _validate_numbers(numbers, spec, "drawOrderNumbers")
        return numbers
    if order != SORTED_ORDER:
        raise AlgorithmError("不支援的號碼順序")

    supplied = draw.get("sortedNumbers")
    if isinstance(supplied, (list, tuple)):
        numbers = _int_tuple(supplied, spec.position_count, "sortedNumbers")
        _validate_numbers(numbers, spec, "sortedNumbers")
        return numbers

    official = _official_numbers(draw, spec)
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
            _ordered_numbers(draw, self.spec, number_order) for draw in self.history
        )
        self._official = tuple(
            _official_numbers(draw, self.spec) for draw in self.history
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
        self._drag_candidate_cache: dict[
            tuple[int, int], tuple[tuple[int, tuple[int, ...]], ...]
        ] = {}

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
        for order in orders:
            selected_history: Sequence[Mapping[str, object]] = history
            if order == DRAW_ORDER:
                from .history_boundaries import draw_order_history

                try:
                    selected_history = draw_order_history(lottery, history)
                except ValueError as error:
                    raise AlgorithmError(str(error)) from error
            contexts.append(
                ExploreContext(
                    lottery,
                    order,
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


def _session_metrics(contexts: tuple[ExploreContext, ...]) -> dict[str, int]:
    return {
        "occurrenceIndexBuilds": sum(
            context.metrics.occurrence_index_builds for context in contexts
        ),
        "indexedCells": sum(context.metrics.indexed_cells for context in contexts),
        "rangeCellBuilds": sum(
            context.metrics.range_cell_builds for context in contexts
        ),
        "candidateBuilds": sum(
            context.metrics.candidate_builds for context in contexts
        ),
        "dragCandidateBuilds": sum(
            context.metrics.drag_candidate_builds for context in contexts
        ),
        "scopeDecisions": sum(
            context.metrics.scope_decisions for context in contexts
        ),
        "sourceUnitsTotal": sum(
            context.metrics.source_units_total for context in contexts
        ),
        "sourceUnitsProcessed": sum(
            context.metrics.source_units_processed for context in contexts
        ),
        "globalPairEnumerations": sum(
            context.metrics.global_pair_enumerations for context in contexts
        ),
        "maxActiveFirstStates": max(
            (context.metrics.max_active_first_states for context in contexts),
            default=0,
        ),
        "maxActiveSecondCandidates": max(
            (
                context.metrics.max_active_second_candidates
                for context in contexts
            ),
            default=0,
        ),
    }


def run_explore_batch(
    lottery: str,
    newest_first: Iterable[Mapping[str, object]],
    start: int,
    limit: int,
    *,
    road_types: Iterable[RoadType] = (
        RoadType.ADD,
        RoadType.SUM,
        RoadType.DRAG,
    ),
    session: ExploreEngineSession | None = None,
) -> dict[str, Any]:
    history = tuple(newest_first)
    if session is None:
        session = ExploreEngineSession.build(lottery, history)
    elif not session.matches(lottery, history):
        raise AlgorithmError("EXPLORE_ENGINE_SESSION_MISMATCH")

    indexed_units = session.indexed_units
    cursor_start = min(max(0, int(start)), len(indexed_units))
    cursor = min(
        len(indexed_units),
        cursor_start + max(1, int(limit)),
    )
    selected_roads = frozenset(
        road if isinstance(road, RoadType) else RoadType(str(road))
        for road in road_types
    )

    artifact: dict[str, Any] = {
        "lottery": lottery,
        "drawPeriod": str(history[0].get("period", "")) if history else "",
        "items": [],
        "validationById": {},
        "tianyanItems": [],
        "tianyanValidationById": {},
    }

    for context, unit in indexed_units[cursor_start:cursor]:
        context.metrics.source_units_processed += 1
        if RoadType.DRAG in selected_roads:
            for occurrence in context.historical_occurrences(unit)[:12]:
                if occurrence.draw_index - unit.prediction_distance < 0:
                    continue
                context.drag_candidate_targets(
                    occurrence,
                    unit.prediction_distance,
                )

    return {
        "artifact": artifact,
        "cursorStart": cursor_start,
        "cursor": cursor,
        "total": len(indexed_units),
        "complete": cursor >= len(indexed_units),
        "metrics": _session_metrics(session.contexts),
    }
