from __future__ import annotations

from typing import Any, Iterable, Mapping

from . import explore_runtime as _runtime
from .explore_context import (
    CandidateCell,
    ExploreContext,
    ExploreEngineSession,
    LockKey,
    LockOccurrence,
    RoadGroup,
    SourceUnit,
    VerificationCell,
)
from .explore_state import (
    DRAW_ORDER,
    FULL_RANGE,
    LOTTERY_SPECS,
    SORTED_ORDER,
    STANDARD_RANGE,
    AlgorithmError,
    EngineMetrics,
    INVALID_MORE_THAN_TWO_LONGEST,
    INVALID_ONE_CODE_MAXIMUM,
    INVALID_ONE_CODE_NOT_EXACT,
    INVALID_SINGLE_USE_ENDPOINT,
    INVALID_TWO_CODE_MAXIMUM,
    LotterySpec,
    RoadType,
    ScopeClass,
    StreakDecision,
    apply_candidate,
    candidate_value,
    evaluate_one_code,
    evaluate_two_code,
)
from .tianyan_shared import build_tianyan_unit_artifact


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
    # Keep the downstream Tianyan callable injectable at the public engine seam.
    _runtime.build_tianyan_unit_artifact = build_tianyan_unit_artifact
    return _runtime.run_explore_batch(
        lottery,
        newest_first,
        start,
        limit,
        road_types=road_types,
        session=session,
    )


__all__ = [
    "DRAW_ORDER",
    "FULL_RANGE",
    "LOTTERY_SPECS",
    "SORTED_ORDER",
    "STANDARD_RANGE",
    "AlgorithmError",
    "CandidateCell",
    "EngineMetrics",
    "ExploreContext",
    "ExploreEngineSession",
    "INVALID_MORE_THAN_TWO_LONGEST",
    "INVALID_ONE_CODE_MAXIMUM",
    "INVALID_ONE_CODE_NOT_EXACT",
    "INVALID_SINGLE_USE_ENDPOINT",
    "INVALID_TWO_CODE_MAXIMUM",
    "LockKey",
    "LockOccurrence",
    "LotterySpec",
    "RoadGroup",
    "RoadType",
    "ScopeClass",
    "SourceUnit",
    "StreakDecision",
    "VerificationCell",
    "apply_candidate",
    "build_tianyan_unit_artifact",
    "candidate_value",
    "evaluate_one_code",
    "evaluate_two_code",
    "run_explore_batch",
]
