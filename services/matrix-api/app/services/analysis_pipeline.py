from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.domain.explore_context import allowed_number_orders
from app.domain.explore_state import DRAW_ORDER
from app.domain.history_boundaries import period_sort_key
from app.repositories.analysis_repository import (
    ANALYSIS_RUN_LEASE_SECONDS,
    ARTIFACT_KINDS,
    AnalysisRepository,
)
from app.repositories.artifact_chunks import chunk_manifest


ArtifactBuilder = Callable[[dict[str, Any]], Any]
PHASES = ("explore", "tianheng", "tianyan", "tiangong", "status")
BATCHED_PHASES = frozenset({"explore", "tianheng"})
PHASE_DEPENDENCIES = {
    "tianheng": (),
    "tianyan": ("explore",),
    "tiangong": (),
    "status": ("explore", "tianyan"),
}


class AnalysisPipeline:
    """Runs one idempotent analysis version and publishes it atomically."""

    def __init__(
        self,
        repository: AnalysisRepository,
        builders: Mapping[str, ArtifactBuilder],
        analysis_version: str,
        explore_batch_size: int = 10,
        *,
        number_orders: tuple[str, ...] | None = None,
    ) -> None:
        if set(builders) != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_BUILDERS_INCOMPLETE")
        self.repository = repository
        self.builders = builders
        self.analysis_version = analysis_version
        self.explore_batch_size = max(1, explore_batch_size)
        self.owner_id = uuid4().hex
        self.lease_seconds = ANALYSIS_RUN_LEASE_SECONDS
        self.number_orders = number_orders
        self._draw_snapshot: dict[str, Any] | None = None
        self._verified_history: tuple[Any, ...] | None = None
        self._run_started_at = ""

    def run(self, draw: dict[str, Any], history: Sequence[dict[str, Any]]) -> dict[str, Any]:
        self._validate_draw(draw)
        lottery = draw["lottery"]
        period = draw["period"]
        self._draw_snapshot = draw
        # Preserve the standalone bootstrap contract; staged workers only analyze
        # rows already acquired by the source and must never write a snapshot back.
        if self.number_orders is None and not self.repository.list_draws(lottery, 1):
            self.repository.upsert_draw(draw)
        self._require_current_draw()
        run = self.repository.begin_run(
            lottery, period, self.analysis_version, datetime.now(UTC).isoformat(),
            owner_id=self.owner_id, lease_seconds=self.lease_seconds,
        )
        if run["status"] == "complete":
            return {**run, "skipped": True}
        if run.get("leaseAcquired") is False:
            return {**run, "skipped": True}
        self._run_started_at = str(run["startedAt"])

        context = {"draw": draw, "history": list(history), "artifacts": {},
                   "numberOrders": allowed_number_orders(lottery, self.number_orders)}
        try:
            self._require_history_snapshot(run, history)
            phase_total = len(PHASES)
            resume_phase_index = PHASES.index(run["phase"]) if run.get("phase") in PHASES else 0
            for phase_index, phase in enumerate(PHASES):
                if phase in BATCHED_PHASES:
                    if phase_index < resume_phase_index:
                        if self.repository.has_artifact(
                            lottery, period, self.analysis_version, phase,
                        ):
                            continue
                    start = int(run.get("cursor", 0)) if run.get("phase") == phase else 0
                    batch_key = f"{phase}Batch"
                    batch_size = self.explore_batch_size
                    context[batch_key] = {
                        "start": start,
                        "limit": batch_size,
                    }
                    self._require_lease(lottery, period)
                    built = self.builders[phase](context)
                    checkpoint = built.get("_checkpoint") if isinstance(built, dict) else None
                    if isinstance(checkpoint, dict) and "artifact" in built:
                        payload = built["artifact"]
                        cursor_start = int(checkpoint.get("cursorStart", start))
                        cursor = int(checkpoint["cursor"])
                        total = int(checkpoint["total"])
                        chunk_index = cursor_start // batch_size
                        if cursor > cursor_start:
                            self._save_artifact_chunk(
                                lottery, period, self.analysis_version, phase,
                                chunk_index, cursor_start, cursor, payload,
                            )
                            if phase == "explore":
                                self._save_explore_results(
                                    lottery, period, self.analysis_version, payload,
                                )
                            elif phase == "tianheng":
                                self._save_tianheng_results(
                                    lottery, period, self.analysis_version, payload,
                                )
                        elif not checkpoint.get("complete"):
                            raise RuntimeError("ANALYSIS_CHECKPOINT_MADE_NO_PROGRESS")
                        self._update_progress(
                            lottery, period, self.analysis_version, phase, cursor, total,
                        )
                        context.pop(batch_key, None)
                        if not checkpoint.get("complete"):
                            result = self.repository.get_progress(
                                lottery, period, self.analysis_version,
                            )
                            return {**(result or {}), "skipped": False}
                        materialized = self.repository.materialize_artifact(
                            lottery, period, self.analysis_version, phase, total,
                        )
                        item_count = len(materialized["items"])
                        expected_chunks = (total + batch_size - 1) // batch_size
                        manifest = chunk_manifest(
                            expected_chunks, cursor, total, item_count,
                        )
                        self._save_artifact(
                            lottery, period, self.analysis_version, phase, manifest,
                        )
                        context["artifacts"][phase] = materialized
                        next_phase = PHASES[phase_index + 1]
                        self._update_progress(
                            lottery, period, self.analysis_version,
                            next_phase,
                            0 if next_phase in BATCHED_PHASES else phase_index + 1,
                            0 if next_phase in BATCHED_PHASES else phase_total,
                        )
                        continue
                    context.pop(batch_key, None)
                    self._update_progress(
                        lottery, period, self.analysis_version, phase, phase_index, phase_total,
                    )
                    self._save_artifact(
                        lottery, period, self.analysis_version, phase, built,
                    )
                    context["artifacts"][phase] = built
                    continue

                if phase_index < resume_phase_index and self.repository.has_artifact(
                    lottery, period, self.analysis_version, phase,
                ):
                    continue
                self._hydrate_dependencies(context, lottery, period, phase)
                self._require_lease(lottery, period)
                built = self.builders[phase](context)
                checkpoint = built.get("_checkpoint") if isinstance(built, dict) else None
                if isinstance(checkpoint, dict) and "artifact" in built:
                    payload = built["artifact"]
                    self._save_artifact(lottery, period, self.analysis_version, phase, payload)
                    self._update_progress(
                        lottery, period, self.analysis_version, phase,
                        int(checkpoint["cursor"]), int(checkpoint["total"]),
                    )
                    context["artifacts"][phase] = payload
                    context.pop("exploreBatch", None)
                    if not checkpoint.get("complete"):
                        result = self.repository.get_progress(
                            lottery, period, self.analysis_version,
                        )
                        return {**(result or {}), "skipped": False}
                    continue
                self._update_progress(lottery, period, self.analysis_version, phase, phase_index, phase_total)
                self._save_artifact(lottery, period, self.analysis_version, phase, built)
                context["artifacts"][phase] = built
            completed_at = datetime.now(UTC).isoformat()
            self._complete_run(lottery, period, self.analysis_version, completed_at)
            result = self.repository.get_progress(
                lottery, period, self.analysis_version,
            )
            return {**(result or {}), "skipped": False}
        except Exception as error:
            if str(error) in {"ANALYSIS_DRAW_CHANGED", "ANALYSIS_RUN_LEASE_LOST"}:
                raise
            try:
                self.repository.fail_run(
                    lottery, period, self.analysis_version, str(error),
                    owner_id=self.owner_id,
                )
            except RuntimeError as lease_error:
                if str(lease_error) != "ANALYSIS_RUN_LEASE_LOST":
                    raise
            raise

    def _history_signature(self, history: Sequence[dict[str, Any]]) -> tuple[Any, ...]:
        lottery = str(self._draw_snapshot["lottery"])
        by_period: dict[str, tuple[Any, ...]] = {}
        for row in history:
            period = str(row.get("period") or "").strip()
            if lottery in {"今彩539", "大樂透"} and len(period) == 8:
                period = period.zfill(9)
            signature = self._snapshot_key({**row, "period": period})
            if period in by_period and by_period[period] != signature:
                raise RuntimeError("ANALYSIS_DRAW_CHANGED")
            by_period[period] = signature
        return tuple(sorted(by_period.items()))

    def _require_history_snapshot(
        self, run: dict[str, Any], history: Sequence[dict[str, Any]],
    ) -> None:
        if not history:
            return
        expected = self._history_signature(history)
        verification = (run["startedAt"], expected)
        if verification == self._verified_history:
            return
        lottery, period = str(run["lottery"]), str(run["drawPeriod"])
        cutoff = period_sort_key(lottery, period)
        current = [
            row for row in self.repository.list_draws(lottery, None)
            if period_sort_key(lottery, row.get("period")) <= cutoff
        ]
        if self._history_signature(current) != expected:
            # A source correction can precede acquisition, leaving this newly
            # acquired lease intact. Release it so a fresh snapshot can retry.
            try:
                self.repository.fail_run(
                    lottery, period, self.analysis_version, "ANALYSIS_DRAW_CHANGED",
                    owner_id=self.owner_id,
                )
            except RuntimeError as error:
                if str(error) != "ANALYSIS_RUN_LEASE_LOST":
                    raise
            raise RuntimeError("ANALYSIS_DRAW_CHANGED")
        self._verified_history = verification

    def _require_current_draw(self) -> None:
        snapshot = self._draw_snapshot
        if snapshot is None:
            return
        current = self.repository.get_draw(str(snapshot["lottery"]), str(snapshot["period"]))
        if current is None or self._snapshot_key(current) != self._snapshot_key(snapshot):
            raise RuntimeError("ANALYSIS_DRAW_CHANGED")

    def _snapshot_key(self, draw: dict[str, Any]) -> tuple[Any, ...]:
        numbers = list(draw.get("sortedNumbers") or draw.get("numbers") or ())
        numbers = sorted(numbers[:-1]) + numbers[-1:] if len(numbers) == 7 else sorted(numbers)
        key = (str(draw.get("period")), str(draw.get("drawDate") or "").replace("/", "-").replace(".", "-")[:10], tuple(numbers))
        if DRAW_ORDER in allowed_number_orders(str(draw.get("lottery") or self._draw_snapshot["lottery"]), self.number_orders):
            key += (tuple(draw.get("drawOrderNumbers") or ()), draw.get("resultStatus", "confirmed"))
        return key

    def _require_lease(self, lottery: str, period: str) -> None:
        self._require_current_draw()
        if not self.repository.renew_run_lease(
            lottery, period, self.analysis_version, self.owner_id,
            lease_seconds=self.lease_seconds,
        ):
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def _save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.save_artifact(
            lottery, draw_period, analysis_version, kind, payload,
            owner_id=self.owner_id, run_started_at=self._run_started_at,
        )

    def _save_artifact_chunk(self, lottery: str, draw_period: str, analysis_version: str, kind: str, chunk_index: int, cursor_start: int, cursor_end: int, payload: Any) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.save_artifact_chunk(
            lottery, draw_period, analysis_version, kind, chunk_index, cursor_start, cursor_end, payload,
            owner_id=self.owner_id, run_started_at=self._run_started_at,
        )

    def _save_explore_results(self, lottery: str, draw_period: str, analysis_version: str, payload: Any) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.save_explore_results(
            lottery, draw_period, analysis_version, payload,
            owner_id=self.owner_id, run_started_at=self._run_started_at,
        )

    def _save_tianheng_results(self, lottery: str, draw_period: str, analysis_version: str, payload: Any) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.save_tianheng_results(
            lottery, draw_period, analysis_version, payload,
            owner_id=self.owner_id, run_started_at=self._run_started_at,
        )

    def _update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.update_progress(
            lottery, draw_period, analysis_version, phase, cursor, total,
            owner_id=self.owner_id,
        )

    def _complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.complete_run(
            lottery, draw_period, analysis_version, completed_at,
            owner_id=self.owner_id,
        )

    def _hydrate_dependencies(
        self,
        context: dict[str, Any],
        lottery: str,
        period: str,
        phase: str,
    ) -> None:
        artifacts = context["artifacts"]
        for dependency in PHASE_DEPENDENCIES.get(phase, ()):
            if dependency in artifacts:
                continue
            artifact = self.repository.read_artifact(
                lottery, period, self.analysis_version, dependency,
            )
            if artifact is None:
                raise RuntimeError(f"ANALYSIS_REQUIRED_ARTIFACT_MISSING:{dependency}")
            artifacts[dependency] = artifact

    @staticmethod
    def _validate_draw(draw: dict[str, Any]) -> None:
        required = ("lottery", "period", "numbers")
        if any(not draw.get(field) for field in required):
            raise ValueError("DRAW_REQUIRED_FIELDS_MISSING")
        lottery_limits = {
            "今彩539": (5, 39),
            "天天樂": (5, 39),
            "六合彩": (7, 49),
            "大樂透": (7, 49),
        }
        if draw["lottery"] not in lottery_limits:
            raise ValueError("LOTTERY_UNSUPPORTED")
        numbers = draw["numbers"]
        expected_count, maximum = lottery_limits[draw["lottery"]]
        if (
            not isinstance(numbers, list)
            or len(numbers) != expected_count
            or len(numbers) != len(set(numbers))
            or any(not isinstance(number, str) or len(number) != 2 or not number.isdigit() for number in numbers)
            or any(not 1 <= int(number) <= maximum for number in numbers)
        ):
            raise ValueError("DRAW_NUMBERS_INVALID")
