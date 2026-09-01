from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import Any, Iterable, Mapping

from .models import lottery_maximum, lottery_position_count, normalize_matrix_number
from .tianyan_shared import build_tianyan_unit_artifact


SORTED_ORDER = "依號碼由小到大排序"
DRAW_ORDER = "依實際開獎順序排序"


class ScopeClass(StrEnum):
    STANDARD_AND_FULL = "STANDARD_AND_FULL"
    FULL_ONLY = "FULL_ONLY"


class RoadType(StrEnum):
    ADD = "加減"
    SUM = "合值"
    DRAG = "拖牌"


INVALID_MORE_THAN_TWO_LONGEST = (
    "相同最長連準出現超過2條可延續共同值，整條版路無效，不得輸出兩兩組合"
)
INVALID_ONE_CODE_MAXIMUM = "鎖定1碼連準達8次（包含8）以上，整條版路無效，不得截短"
INVALID_TWO_CODE_MAXIMUM = "鎖定2碼連準達12次（包含12）以上，整條版路無效，不得截短"
INVALID_SINGLE_USE_ENDPOINT = "鎖定2碼單次值只能位於連準中間，不得只在頭或尾"


@dataclass(frozen=True, slots=True)
class StreakDecision:
    valid: bool
    highest_streak: int
    rules: tuple[int, ...] = ()
    reason: str | None = None
    matched_group_indexes: tuple[int, ...] = ()
    rule_sets: tuple[tuple[int, ...], ...] = ()


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


@dataclass(frozen=True, slots=True)
class CellCandidates:
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
        return next(
            (targets for value, targets in self.candidate_targets if value == rule),
            (),
        )


def candidate_value(road: RoadType, base: int, target: int, maximum: int) -> int:
    if road is RoadType.SUM:
        return base + target
    return (target - base + maximum) % maximum


def apply_candidate(road: RoadType, base: int, value: int, maximum: int) -> int:
    if road is RoadType.SUM:
        return normalize_matrix_number(value - base, maximum)
    return normalize_matrix_number(base + value, maximum)


def _candidate_groups(groups: Iterable[Iterable[int]]) -> tuple[frozenset[int], ...]:
    return tuple(frozenset(int(value) for value in group) for group in groups)


def evaluate_one_code(groups: Iterable[Iterable[int]]) -> StreakDecision:
    normalized = _candidate_groups(groups)
    if len(normalized) < 2:
        return StreakDecision(False, 0, reason="準4+至少需要B、C兩個驗證組")

    common = normalized[0].intersection(normalized[1])
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
    longest_rules = tuple(sorted(rule for rule, streak in scores.items() if streak == highest))
    matched = tuple(range(highest))
    if highest >= 8:
        return StreakDecision(
            False,
            highest,
            longest_rules,
            INVALID_ONE_CODE_MAXIMUM,
            matched,
        )
    if len(longest_rules) > 2:
        return StreakDecision(
            False,
            highest,
            longest_rules,
            INVALID_MORE_THAN_TWO_LONGEST,
            matched,
        )
    if highest not in {4, 5, 6, 7}:
        return StreakDecision(
            False,
            highest,
            longest_rules,
            f"準{highest}進{highest + 1}不得進入探索與狀態結果",
            matched,
        )

    rule_sets = tuple((rule,) for rule in longest_rules)
    return StreakDecision(
        True,
        highest,
        longest_rules,
        matched_group_indexes=matched,
        rule_sets=rule_sets,
    )


def _remember_pair_score(
    scores: dict[tuple[int, int], int],
    first: int,
    seconds: Iterable[int],
    streak: int,
) -> None:
    for second in seconds:
        if first == second:
            continue
        pair = tuple(sorted((first, second)))
        scores[pair] = max(streak, scores.get(pair, 0))


def _two_code_pair_scores(groups: tuple[frozenset[int], ...]) -> dict[tuple[int, int], int]:
    """Extend compact first-rule states; never materialize a global pair product."""

    scores: dict[tuple[int, int], int] = {}
    first_candidates = groups[0].union(groups[1])
    bounded_groups = groups[:12]

    for first in first_candidates:
        active_seconds: set[int] = set()
        has_uncovered_group = False
        processed = 0

        for group_index, group in enumerate(bounded_groups):
            if first in group:
                if not has_uncovered_group:
                    active_seconds.update(group.difference({first}))
                processed = group_index + 1
                continue

            available = group.difference({first})
            if not has_uncovered_group:
                _remember_pair_score(
                    scores,
                    first,
                    active_seconds.difference(available),
                    group_index,
                )
                active_seconds = set(available)
                has_uncovered_group = True
            else:
                _remember_pair_score(
                    scores,
                    first,
                    active_seconds.difference(available),
                    group_index,
                )
                active_seconds.intersection_update(available)

            if not active_seconds:
                processed = group_index
                break
            processed = group_index + 1
        else:
            processed = len(bounded_groups)

        _remember_pair_score(scores, first, active_seconds, processed)

    return scores


def evaluate_two_code(groups: Iterable[Iterable[int]]) -> StreakDecision:
    normalized = _candidate_groups(groups)
    if len(normalized) < 2:
        return StreakDecision(False, 0, reason="準5+至少需要B、C兩個驗證組")

    scores = _two_code_pair_scores(normalized)
    if not scores:
        return StreakDecision(False, 0, reason="第二條不同規則未形成或所有候選路徑已斷")

    highest = max(scores.values())
    longest_pairs = tuple(sorted(pair for pair, streak in scores.items() if streak == highest))
    longest_rules = tuple(sorted({rule for pair in longest_pairs for rule in pair}))
    matched = tuple(range(highest))

    if highest >= 12:
        return StreakDecision(
            False,
            highest,
            longest_rules,
            INVALID_TWO_CODE_MAXIMUM,
            matched,
            longest_pairs,
        )
    if len(longest_rules) > 2:
        return StreakDecision(
            False,
            highest,
            longest_rules,
            INVALID_MORE_THAN_TWO_LONGEST,
            matched,
            longest_pairs,
        )
    if highest not in {5, 6, 7, 9, 11}:
        return StreakDecision(
            False,
            highest,
            longest_rules,
            f"準{highest}進{highest + 1}不得進入探索與狀態結果",
            matched,
            longest_pairs,
        )

    pair = longest_pairs[0]
    for rule in pair:
        appearances = tuple(
            index for index, group in enumerate(normalized[:highest]) if rule in group
        )
        if len(appearances) == 1 and appearances[0] in {0, highest - 1}:
            return StreakDecision(
                False,
                highest,
                pair,
                INVALID_SINGLE_USE_ENDPOINT,
                matched,
                (pair,),
            )

    return StreakDecision(
        True,
        highest,
        pair,
        matched_group_indexes=matched,
        rule_sets=(pair,),
    )


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
        self._candidate_cache: dict[tuple[int, int], tuple[CellCandidates, ...]] = {}
        self._drag_candidate_cache: dict[
            tuple[int, int], tuple[tuple[int, tuple[int, ...]], ...]
        ] = {}
        self._range_build_counts: dict[tuple[int, int], int] = {}
        self._drag_build_counts: dict[int, int] = {}
        self._candidate_build_counts: dict[tuple[int, int], int] = {}
        self._drag_candidate_build_counts: dict[tuple[int, int], int] = {}
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

    @property
    def candidate_build_counts(self) -> Mapping[tuple[int, int], int]:
        return MappingProxyType(self._candidate_build_counts)

    @property
    def drag_candidate_build_counts(self) -> Mapping[tuple[int, int], int]:
        return MappingProxyType(self._drag_candidate_build_counts)

    def occurrences_for(self, key: LockKey) -> tuple[LockOccurrence, ...]:
        return self._occurrence_index.get(key, ())

    def source_units(self) -> tuple[SourceUnit, ...]:
        return self._source_units

    def draw_at(self, draw_index: int) -> Mapping[str, object]:
        return self._draws[draw_index]

    def ordered_at(self, draw_index: int) -> tuple[int, ...]:
        return self._numbers_by_draw[draw_index]

    def official_at(self, draw_index: int) -> tuple[int, ...]:
        return _complete_int_tuple(
            self._draws[draw_index].get("numbers"),
            self.position_count,
        )

    def historical_occurrences(self, unit: SourceUnit) -> tuple[LockOccurrence, ...]:
        return tuple(
            occurrence
            for occurrence in self.occurrences_for(unit.lock_key)
            if occurrence.draw_index > unit.locked_source_index
        )

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

    @staticmethod
    def _target_map(
        road: RoadType,
        base: int,
        targets: tuple[int, ...],
        maximum: int,
    ) -> tuple[tuple[int, tuple[int, ...]], ...]:
        mutable: dict[int, set[int]] = {}
        for target in targets:
            value = candidate_value(road, base, target, maximum)
            mutable.setdefault(value, set()).add(target)
        return tuple(
            (value, tuple(sorted(hit_numbers)))
            for value, hit_numbers in sorted(mutable.items())
        )

    def range_candidate_cells(
        self,
        occurrence: LockOccurrence,
        prediction_distance: int,
    ) -> tuple[CellCandidates, ...]:
        occurrence_token = self._occurrence_token(occurrence)
        cache_key = (occurrence_token, prediction_distance)
        cached = self._candidate_cache.get(cache_key)
        if cached is not None:
            return cached

        result_draw_index = occurrence.draw_index - prediction_distance
        if result_draw_index < 0:
            result: tuple[CellCandidates, ...] = ()
        else:
            targets = self.official_at(result_draw_index)
            maximum = lottery_maximum(self.lottery)
            result = tuple(
                CellCandidates(
                    cell=cell,
                    add_targets=self._target_map(RoadType.ADD, cell.number, targets, maximum),
                    sum_targets=self._target_map(RoadType.SUM, cell.number, targets, maximum),
                )
                for cell in self.range_cells(occurrence, prediction_distance)
            )
        self._candidate_cache[cache_key] = result
        self._candidate_build_counts[cache_key] = self._candidate_build_counts.get(cache_key, 0) + 1
        return result

    def drag_candidate_targets(
        self,
        occurrence: LockOccurrence,
        prediction_distance: int,
    ) -> tuple[tuple[int, tuple[int, ...]], ...]:
        occurrence_token = self._occurrence_token(occurrence)
        cache_key = (occurrence_token, prediction_distance)
        cached = self._drag_candidate_cache.get(cache_key)
        if cached is not None:
            return cached
        result_draw_index = occurrence.draw_index - prediction_distance
        targets = self.official_at(result_draw_index) if result_draw_index >= 0 else ()
        result = self._target_map(
            RoadType.DRAG,
            self.drag_cell(occurrence).number,
            targets,
            lottery_maximum(self.lottery),
        )
        self._drag_candidate_cache[cache_key] = result
        self._drag_candidate_build_counts[cache_key] = (
            self._drag_candidate_build_counts.get(cache_key, 0) + 1
        )
        return result


EXPLORE_RANGES = ("標準範圍", "完整範圍")


def _raw_numbers(draw: Mapping[str, object], key: str) -> list[object] | None:
    values = draw.get(key)
    return list(values) if isinstance(values, list) else None


def _draw_numbers_for_validation(
    context: ExploreV2Context,
    draw_index: int,
) -> dict[str, object]:
    draw = context.draw_at(draw_index)
    official = _raw_numbers(draw, "numbers") or []
    return {
        "ordered": list(context.ordered_at(draw_index)),
        "sorted": _raw_numbers(draw, "sortedNumbers") or official,
        "drawOrder": _raw_numbers(draw, "drawOrderNumbers"),
        "official": official,
    }


def _rule_display(road: RoadType, value: int) -> str:
    return str(value) if road is RoadType.SUM else f"+{value}"


def _rule_payload(road: RoadType, value: int) -> dict[str, object]:
    return {
        "value": value,
        "display": _rule_display(road, value),
        "algorithmType": road.value,
    }


def _historical_validation(
    context: ExploreV2Context,
    groups: tuple[RoadGroup, ...],
    road: RoadType,
    rules: tuple[int, ...],
    highest_streak: int,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for group_index, group in enumerate(groups[:highest_streak]):
        source_index = group.occurrence.draw_index
        reference_index = source_index - group.reference_cell.relative_offset
        source = _draw_numbers_for_validation(context, source_index)
        reference = _draw_numbers_for_validation(context, reference_index)
        prediction = _draw_numbers_for_validation(context, group.result_draw_index)
        matched = tuple(rule for rule in rules if rule in group.candidates)
        rows.append(
            {
                "group": chr(66 + group_index),
                "sourcePeriod": group.occurrence.period,
                "sourceNumbers": source["ordered"],
                "sourceSortedNumbers": source["sorted"],
                "sourceDrawOrderNumbers": source["drawOrder"],
                "referencePeriod": group.reference_cell.period,
                "referenceNumbers": reference["ordered"],
                "referenceSortedNumbers": reference["sorted"],
                "referenceDrawOrderNumbers": reference["drawOrder"],
                "baseNumber": group.reference_cell.number,
                "predictionPeriod": str(
                    context.draw_at(group.result_draw_index).get("period", "")
                ),
                "predictionNumbers": prediction["official"],
                "candidateRules": sorted(group.candidates),
                "matchedRules": [_rule_payload(road, rule) for rule in matched],
                "hitNumbers": sorted(
                    {
                        number
                        for rule in matched
                        for number in group.targets_for(rule)
                    }
                ),
                "success": bool(matched),
            }
        )
    return rows


def _source_a_validation(
    context: ExploreV2Context,
    unit: SourceUnit,
    reference_cell: VerificationCell,
) -> dict[str, object]:
    source_index = unit.locked_source_index
    reference_index = source_index - reference_cell.relative_offset
    prediction_index = source_index - unit.prediction_distance
    source = _draw_numbers_for_validation(context, source_index)
    reference = _draw_numbers_for_validation(context, reference_index)
    prediction_exists = 0 <= prediction_index < len(context._draws)
    return {
        "sourcePeriod": unit.locked_source_period,
        "sourceNumbers": source["ordered"],
        "sourceSortedNumbers": source["sorted"],
        "sourceDrawOrderNumbers": source["drawOrder"],
        "referencePeriod": reference_cell.period,
        "referenceNumbers": reference["ordered"],
        "referenceSortedNumbers": reference["sorted"],
        "referenceDrawOrderNumbers": reference["drawOrder"],
        "baseNumber": reference_cell.number,
        "predictionPeriod": (
            str(context.draw_at(prediction_index).get("period", ""))
            if prediction_exists
            else None
        ),
        "predictionCompleted": prediction_exists,
    }


def _result_identifier(
    context: ExploreV2Context,
    unit: SourceUnit,
    reference_cell: VerificationCell,
    road: RoadType,
    rule_count: int,
    highest_streak: int,
    rules: tuple[int, ...],
    predictions: tuple[int, ...],
    explore_range: str,
) -> str:
    return "|".join(
        map(
            str,
            (
                explore_range,
                context.number_order,
                unit.locked_source_period,
                unit.locked_source_index,
                unit.occurrence.position,
                unit.occurrence.number,
                reference_cell.relative_offset,
                reference_cell.position,
                unit.prediction_distance,
                road.value,
                rule_count,
                highest_streak,
                ".".join(map(str, rules)),
                ".".join(map(str, predictions)),
            ),
        )
    )


def _append_final_results(
    artifact: dict[str, Any],
    context: ExploreV2Context,
    unit: SourceUnit,
    reference_cell: VerificationCell,
    road: RoadType,
    rule_count: int,
    decision: StreakDecision,
    groups: tuple[RoadGroup, ...],
    explore_range: str,
) -> None:
    maximum = lottery_maximum(context.lottery)
    for rules in decision.rule_sets:
        ordered_rules = tuple(sorted(rules))
        predictions = tuple(
            sorted(
                {
                    apply_candidate(road, reference_cell.number, rule, maximum)
                    for rule in ordered_rules
                }
            )
        )
        if rule_count == 1 and len(predictions) != 1:
            continue
        if rule_count == 2 and not 1 <= len(predictions) <= 2:
            continue
        identifier = _result_identifier(
            context,
            unit,
            reference_cell,
            road,
            rule_count,
            decision.highest_streak,
            ordered_rules,
            predictions,
            explore_range,
        )
        item: dict[str, object] = {
            "id": identifier,
            "number": str(unit.occurrence.number).zfill(2),
            "lockedPosition": unit.occurrence.position,
            "predictionDistance": unit.prediction_distance,
            "consecutive": f"準{decision.highest_streak}進{decision.highest_streak + 1}",
            "highestStreak": decision.highest_streak,
            "predictionNumbers": [str(number).zfill(2) for number in predictions],
            "algorithmType": road.value,
            "numberOrder": context.number_order,
            "exploreDateOffset": 0,
            "exploreRange": explore_range,
            "ruleCount": rule_count,
            "lockedSourceIndex": unit.locked_source_index,
            "lockedSourcePeriod": unit.locked_source_period,
        }
        if road is not RoadType.DRAG:
            item.update(
                {
                    "referenceOffset": reference_cell.relative_offset,
                    "referencePosition": reference_cell.position,
                }
            )
        validation = {
            "itemId": identifier,
            "sourceA": _source_a_validation(context, unit, reference_cell),
            "ruleSets": [
                {
                    "rules": [_rule_payload(road, rule) for rule in ordered_rules],
                    "predictionNumbers": list(predictions),
                    "historicalValidation": _historical_validation(
                        context,
                        groups,
                        road,
                        ordered_rules,
                        decision.highest_streak,
                    ),
                }
            ],
        }
        existing = artifact["validationById"].get(identifier)
        if existing is not None:
            if existing != validation:
                raise ValueError("EXPLORE_V2_RESULT_CONFLICT")
            continue
        artifact["items"].append(item)
        artifact["validationById"][identifier] = validation


def _evaluate_groups(
    artifact: dict[str, Any],
    context: ExploreV2Context,
    unit: SourceUnit,
    reference_cell: VerificationCell,
    road: RoadType,
    groups: tuple[RoadGroup, ...],
    explore_range: str,
    metrics: dict[str, int],
) -> None:
    candidate_sets = tuple(group.candidates for group in groups)
    for rule_count, evaluator in ((1, evaluate_one_code), (2, evaluate_two_code)):
        metrics["scopeDecisions"] += 1
        decision = evaluator(candidate_sets)
        if not decision.valid:
            continue
        _append_final_results(
            artifact,
            context,
            unit,
            reference_cell,
            road,
            rule_count,
            decision,
            groups,
            explore_range,
        )


def _range_bundles(
    context: ExploreV2Context,
    unit: SourceUnit,
    limit: int = 12,
) -> tuple[
    tuple[LockOccurrence, int, dict[tuple[int, int], CellCandidates]],
    ...,
]:
    bundles: list[tuple[LockOccurrence, int, dict[tuple[int, int], CellCandidates]]] = []
    for occurrence in context.historical_occurrences(unit):
        result_index = occurrence.draw_index - unit.prediction_distance
        if result_index < 0:
            continue
        candidates = context.range_candidate_cells(occurrence, unit.prediction_distance)
        bundles.append(
            (
                occurrence,
                result_index,
                {
                    (candidate.cell.relative_offset, candidate.cell.position): candidate
                    for candidate in candidates
                },
            )
        )
        if len(bundles) >= limit:
            break
    return tuple(bundles)


def _groups_for_cell(
    bundles: tuple[
        tuple[LockOccurrence, int, dict[tuple[int, int], CellCandidates]],
        ...,
    ],
    cell: VerificationCell,
    road: RoadType,
) -> tuple[RoadGroup, ...]:
    coordinate = (cell.relative_offset, cell.position)
    groups: list[RoadGroup] = []
    for occurrence, result_index, by_coordinate in bundles:
        candidate = by_coordinate.get(coordinate)
        if candidate is None:
            break
        groups.append(
            RoadGroup(
                occurrence=occurrence,
                reference_cell=candidate.cell,
                result_draw_index=result_index,
                candidate_targets=candidate.targets_for(road),
            )
        )
    return tuple(groups)


def _drag_groups(
    context: ExploreV2Context,
    unit: SourceUnit,
    limit: int = 12,
) -> tuple[RoadGroup, ...]:
    groups: list[RoadGroup] = []
    for occurrence in context.historical_occurrences(unit):
        result_index = occurrence.draw_index - unit.prediction_distance
        if result_index < 0:
            continue
        groups.append(
            RoadGroup(
                occurrence=occurrence,
                reference_cell=context.drag_cell(occurrence),
                result_draw_index=result_index,
                candidate_targets=context.drag_candidate_targets(
                    occurrence,
                    unit.prediction_distance,
                ),
            )
        )
        if len(groups) >= limit:
            break
    return tuple(groups)


def _group_name(index: int) -> str:
    code = 66 + index
    return chr(code) if code <= 90 else f"B{index + 1}"


def _typed_candidate_map(candidate: CellCandidates) -> dict[str, list[int]]:
    return {
        **{
            f"{RoadType.ADD.value}:{value}": list(targets)
            for value, targets in candidate.add_targets
        },
        **{
            f"{RoadType.SUM.value}:{value}": list(targets)
            for value, targets in candidate.sum_targets
        },
    }


def _tianyan_range_coordinate(
    context: ExploreV2Context,
    unit: SourceUnit,
    source_cell: VerificationCell,
    bundles: tuple[
        tuple[LockOccurrence, int, dict[tuple[int, int], CellCandidates]],
        ...,
    ],
) -> dict[str, Any]:
    coordinate = (source_cell.relative_offset, source_cell.position)
    groups: list[dict[str, Any]] = []
    for occurrence, result_index, by_coordinate in bundles:
        candidate = by_coordinate.get(coordinate)
        if candidate is None:
            break
        reference_index = occurrence.draw_index - candidate.cell.relative_offset
        groups.append(
            {
                "group": _group_name(len(groups)),
                "source": dict(context.draw_at(occurrence.draw_index)),
                "reference": dict(context.draw_at(reference_index)),
                "prediction": dict(context.draw_at(result_index)),
                "baseNumber": candidate.cell.number,
                "lockedBaseNumber": occurrence.number,
                "candidateMap": _typed_candidate_map(candidate),
            }
        )
    reference_index = unit.locked_source_index - source_cell.relative_offset
    return {
        "referenceOffset": source_cell.relative_offset,
        "referencePosition": source_cell.position,
        "algorithmTypes": [RoadType.ADD.value, RoadType.SUM.value],
        "aReference": dict(context.draw_at(reference_index)),
        "aBaseNumber": source_cell.number,
        "groups": groups,
    }


def _tianyan_drag_coordinate(
    context: ExploreV2Context,
    unit: SourceUnit,
) -> dict[str, Any]:
    groups = _drag_groups(context, unit, limit=30)
    return {
        "referenceOffset": 0,
        "referencePosition": unit.occurrence.position,
        "algorithmTypes": [RoadType.DRAG.value],
        "aReference": dict(context.draw_at(unit.locked_source_index)),
        "aBaseNumber": unit.occurrence.number,
        "groups": [
            {
                "group": _group_name(index),
                "source": dict(context.draw_at(group.occurrence.draw_index)),
                "reference": dict(context.draw_at(group.occurrence.draw_index)),
                "prediction": dict(context.draw_at(group.result_draw_index)),
                "baseNumber": group.reference_cell.number,
                "lockedBaseNumber": group.occurrence.number,
                "candidateMap": {
                    f"{RoadType.DRAG.value}:{value}": list(targets)
                    for value, targets in group.candidate_targets
                },
            }
            for index, group in enumerate(groups)
        ],
    }


def _append_tianyan_results(
    artifact: dict[str, Any],
    context: ExploreV2Context,
    unit: SourceUnit,
) -> None:
    source_cells = context.range_cells(unit.occurrence, unit.prediction_distance)
    bundles = _range_bundles(context, unit, limit=30)
    prepared = {
        "lottery": context.lottery,
        "numberOrder": context.number_order,
        "lockedPosition": unit.occurrence.position,
        "lockedNumber": unit.occurrence.number,
        "lockedSourceIndex": unit.locked_source_index,
        "lockedSourcePeriod": unit.locked_source_period,
        "predictionDistance": unit.prediction_distance,
        "exploreDateOffset": 0,
        "source": dict(context.draw_at(unit.locked_source_index)),
        "coordinates": [
            *(
                _tianyan_range_coordinate(context, unit, source_cell, bundles)
                for source_cell in source_cells
            ),
            _tianyan_drag_coordinate(context, unit),
        ],
    }
    tianyan = build_tianyan_unit_artifact(prepared)
    for item in tianyan.get("items", []):
        identifier = str(item.get("id", "")) if isinstance(item, dict) else ""
        if not identifier:
            continue
        existing = next(
            (
                current
                for current in artifact["tianyanItems"]
                if isinstance(current, dict) and current.get("id") == identifier
            ),
            None,
        )
        if existing is not None:
            if existing != item:
                raise ValueError("TIANYAN_RESULT_CONFLICT")
            continue
        artifact["tianyanItems"].append(item)
    for identifier, validation in tianyan.get("validationById", {}).items():
        existing = artifact["tianyanValidationById"].get(identifier)
        if existing is not None and existing != validation:
            raise ValueError("TIANYAN_RESULT_CONFLICT")
        artifact["tianyanValidationById"][identifier] = validation


def _run_explore_v2_unit(
    artifact: dict[str, Any],
    context: ExploreV2Context,
    unit: SourceUnit,
    road_types: frozenset[RoadType],
    metrics: dict[str, int],
    include_tianyan: bool,
) -> None:
    range_roads = tuple(road for road in (RoadType.ADD, RoadType.SUM) if road in road_types)
    if range_roads:
        source_cells = context.range_cells(unit.occurrence, unit.prediction_distance)
        bundles = _range_bundles(context, unit)
        for explore_range in EXPLORE_RANGES:
            for source_cell in source_cells:
                if (
                    explore_range == "標準範圍"
                    and source_cell.scope_class is ScopeClass.FULL_ONLY
                ):
                    continue
                for road in range_roads:
                    groups = _groups_for_cell(bundles, source_cell, road)
                    _evaluate_groups(
                        artifact,
                        context,
                        unit,
                        source_cell,
                        road,
                        groups,
                        explore_range,
                        metrics,
                    )

    if RoadType.DRAG in road_types:
        source_cell = context.drag_cell(unit.occurrence)
        groups = _drag_groups(context, unit)
        for explore_range in EXPLORE_RANGES:
            _evaluate_groups(
                artifact,
                context,
                unit,
                source_cell,
                RoadType.DRAG,
                groups,
                explore_range,
                metrics,
            )
    if include_tianyan:
        _append_tianyan_results(artifact, context, unit)


def _context_metrics(
    contexts: tuple[ExploreV2Context, ...],
    scope_decisions: int,
) -> dict[str, int]:
    return {
        "occurrenceIndexBuilds": sum(
            context.occurrence_index_build_count for context in contexts
        ),
        "indexedCells": sum(context.indexed_cell_count for context in contexts),
        "rangeCellBuilds": sum(
            sum(context.range_build_counts.values()) for context in contexts
        ),
        "uniqueRangeKeys": sum(len(context.range_build_counts) for context in contexts),
        "candidateBuilds": sum(
            sum(context.candidate_build_counts.values()) for context in contexts
        ),
        "uniqueCandidateKeys": sum(
            len(context.candidate_build_counts) for context in contexts
        ),
        "dragCandidateBuilds": sum(
            sum(context.drag_candidate_build_counts.values()) for context in contexts
        ),
        "uniqueDragCandidateKeys": sum(
            len(context.drag_candidate_build_counts) for context in contexts
        ),
        "scopeDecisions": scope_decisions,
    }


def run_explore_v2_batch(
    lottery: str,
    newest_first: Iterable[Mapping[str, object]],
    start: int,
    limit: int,
    *,
    road_types: Iterable[RoadType] = (RoadType.ADD, RoadType.SUM, RoadType.DRAG),
) -> dict[str, Any]:
    history = tuple(newest_first)
    orders = (SORTED_ORDER,) if lottery == "天天樂" else (SORTED_ORDER, DRAW_ORDER)
    contexts = tuple(ExploreV2Context.build(lottery, order, history) for order in orders)
    indexed_units = tuple(
        (context, unit)
        for context in contexts
        for unit in context.source_units()
    )
    cursor_start = min(max(0, int(start)), len(indexed_units))
    cursor = min(len(indexed_units), cursor_start + max(1, int(limit)))
    selected_roads = frozenset(
        road if isinstance(road, RoadType) else RoadType(str(road))
        for road in road_types
    )
    all_roads = frozenset((RoadType.ADD, RoadType.SUM, RoadType.DRAG))
    artifact: dict[str, Any] = {
        "lottery": lottery,
        "drawPeriod": str(history[0].get("period", "")) if history else "",
        "items": [],
        "validationById": {},
        "tianyanItems": [],
        "tianyanValidationById": {},
    }
    working_metrics = {"scopeDecisions": 0}
    for context, unit in indexed_units[cursor_start:cursor]:
        _run_explore_v2_unit(
            artifact,
            context,
            unit,
            selected_roads,
            working_metrics,
            include_tianyan=selected_roads == all_roads,
        )

    artifact["items"].sort(
        key=lambda item: (
            -int(item["highestStreak"]),
            int(item["predictionDistance"]),
            int(item["lockedPosition"]),
            str(item["algorithmType"]),
            str(item["exploreRange"]),
            str(item["id"]),
        )
    )
    return {
        "artifact": artifact,
        "cursorStart": cursor_start,
        "cursor": cursor,
        "total": len(indexed_units),
        "complete": cursor >= len(indexed_units),
        "metrics": _context_metrics(contexts, working_metrics["scopeDecisions"]),
    }
