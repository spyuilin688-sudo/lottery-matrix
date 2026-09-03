from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.repositories.analysis_repository import (
    ANALYSIS_RUN_LEASE_SECONDS,
    ARTIFACT_KINDS,
    AnalysisRepository,
)
from app.repositories.artifact_chunks import chunk_manifest


ArtifactBuilder = Callable[[dict[str, Any]], Any]
PHASES = ("explore", "tianyan", "tiangong", "status")
PHASE_DEPENDENCIES = {
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
    ) -> None:
        if set(builders) != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_BUILDERS_INCOMPLETE")
        self.repository = repository
        self.builders = builders
        self.analysis_version = analysis_version
        self.explore_batch_size = max(1, explore_batch_size)
        self.owner_id = uuid4().hex
        self.lease_seconds = ANALYSIS_RUN_LEASE_SECONDS

    def run(self, draw: dict[str, Any], history: Sequence[dict[str, Any]]) -> dict[str, Any]:
        self._validate_draw(draw)
        lottery = draw["lottery"]
        period = draw["period"]
        self.repository.upsert_draw(draw)
        run = self.repository.begin_run(
            lottery, period, self.analysis_version, datetime.now(UTC).isoformat(),
            owner_id=self.owner_id, lease_seconds=self.lease_seconds,
        )
        if run["status"] == "complete":
            return {**run, "skipped": True}
        if run.get("leaseAcquired") is False:
            return {**run, "skipped": True}

        context = {"draw": draw, "history": list(history), "artifacts": {}}
        try:
            phase_total = len(PHASES)
            resume_phase_index = PHASES.index(run["phase"]) if run.get("phase") in PHASES else 0
            for phase_index, phase in enumerate(PHASES):
                if phase == "explore":
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
                        self._update_progress(
                            lottery, period, self.analysis_version,
                            PHASES[phase_index + 1], phase_index + 1, phase_total,
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
            try:
                self.repository.fail_run(
                    lottery, period, self.analysis_version, str(error),
                    owner_id=self.owner_id,
                )
            except RuntimeError as lease_error:
                if str(lease_error) != "ANALYSIS_RUN_LEASE_LOST":
                    raise
            raise

    def _require_lease(self, lottery: str, period: str) -> None:
        if not self.repository.renew_run_lease(
            lottery, period, self.analysis_version, self.owner_id,
            lease_seconds=self.lease_seconds,
        ):
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def _save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.save_artifact(lottery, draw_period, analysis_version, kind, payload)

    def _save_artifact_chunk(self, lottery: str, draw_period: str, analysis_version: str, kind: str, chunk_index: int, cursor_start: int, cursor_end: int, payload: Any) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.save_artifact_chunk(lottery, draw_period, analysis_version, kind, chunk_index, cursor_start, cursor_end, payload)

    def _save_explore_results(self, lottery: str, draw_period: str, analysis_version: str, payload: Any) -> None:
        self._require_lease(lottery, draw_period)
        self.repository.save_explore_results(lottery, draw_period, analysis_version, payload)

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
