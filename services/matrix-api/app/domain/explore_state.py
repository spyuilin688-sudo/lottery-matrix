from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Iterable

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


def evaluate_one_code(
    groups: Iterable[Iterable[int]],
    *,
    eligible_streaks: frozenset[int] = frozenset({4, 5, 6, 7}),
    invalid_streak: int = 8,
    tier_label: str = "準4+",
    invalid_reason: str = INVALID_ONE_CODE_MAXIMUM,
) -> StreakDecision:
    normalized = _candidate_groups(groups)
    if len(normalized) < 2:
        return StreakDecision(False, 0, reason=f"{tier_label}至少需要B、C兩個歷史組")
    common = normalized[0] & normalized[1]
    if not common:
        return StreakDecision(False, 0, reason=f"B、C無共同值，{tier_label}停止")

    scores: dict[int, int] = {}
    for rule in common:
        streak = 0
        for group in normalized[:invalid_streak]:
            if rule not in group:
                break
            streak += 1
        scores[rule] = streak

    highest = max(scores.values())
    top_rules = tuple(sorted(rule for rule, streak in scores.items() if streak == highest))
    matched = tuple(range(highest))
    if highest >= invalid_streak:
        return StreakDecision(False, highest, top_rules, invalid_reason, matched)
    if highest not in eligible_streaks:
        return StreakDecision(
            False,
            highest,
            top_rules,
            f"準{highest}進{highest + 1}不屬{tier_label}有效層級",
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
    *,
    eligible_streaks: frozenset[int] = frozenset({5, 6, 7, 9, 11}),
    invalid_streak: int = 12,
    tier_label: str = "準5+",
) -> StreakDecision:
    normalized = _candidate_groups(groups)
    if len(normalized) < 2:
        return StreakDecision(False, 0, reason=f"{tier_label}至少需要B、C兩個歷史組")

    scores = _incremental_pair_scores(normalized, metrics)
    if not scores:
        return StreakDecision(False, 0, reason="第二條不同規則未形成或候選路徑中斷")

    raw_highest = max(scores.values())
    eligible_scores = {
        pair: streak
        for pair, streak in scores.items()
        if streak in eligible_streaks
        and streak < invalid_streak
        and not _endpoint_invalid(pair, normalized, streak)
    }

    if not eligible_scores:
        raw_pairs = tuple(
            sorted(pair for pair, streak in scores.items() if streak == raw_highest)
        )
        raw_rules = tuple(sorted({rule for pair in raw_pairs for rule in pair}))
        matched = tuple(range(raw_highest))
        if raw_highest >= invalid_streak:
            return StreakDecision(
                False,
                raw_highest,
                raw_rules,
                INVALID_TWO_CODE_MAXIMUM,
                matched,
                raw_pairs,
            )
        if raw_highest not in eligible_streaks:
            return StreakDecision(
                False,
                raw_highest,
                raw_rules,
                f"準{raw_highest}進{raw_highest + 1}不屬{tier_label}有效層級",
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
            f"{tier_label}必須恰好2條不同規則",
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
