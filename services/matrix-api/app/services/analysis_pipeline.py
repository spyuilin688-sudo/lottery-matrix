from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from app.repositories.analysis_repository import ARTIFACT_KINDS, AnalysisRepository
from app.repositories.artifact_chunks import chunk_manifest


ArtifactBuilder = Callable[[dict[str, Any]], Any]
PHASES = ("explore", "tianyan", "tiangong", "status")


class AnalysisPipeline:
    """Runs one idempotent analysis version and publishes it atomically."""

    def __init__(
        self,
        repository: AnalysisRepository,
        builders: Mapping[str, ArtifactBuilder],
        analysis_version: str,
        explore_batch_size: int = 10,
        tiangong_batch_size: int = 1,
    ) -> None:
        if set(builders) != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_BUILDERS_INCOMPLETE")
        self.repository = repository
        self.builders = builders
        self.analysis_version = analysis_version
        self.explore_batch_size = max(1, explore_batch_size)
        self.tiangong_batch_size = max(1, tiangong_batch_size)

    def run(self, draw: dict[str, Any], history: Sequence[dict[str, Any]]) -> dict[str, Any]:
        self._validate_draw(draw)
        lottery = draw["lottery"]
        period = draw["period"]
        self.repository.upsert_draw(draw)
        run = self.repository.begin_run(lottery, period, self.analysis_version, datetime.now(UTC).isoformat())
        if run["status"] == "complete":
            return {**run, "skipped": True}

        context = {"draw": draw, "history": list(history), "artifacts": {}}
        try:
            phase_total = len(PHASES)
            resume_phase_index = PHASES.index(run["phase"]) if run.get("phase") in PHASES else 0
            for phase_index, phase in enumerate(PHASES):
                if phase in {"explore", "tiangong"}:
                    if phase_index < resume_phase_index:
                        existing = self.repository.read_artifact(
                            lottery, period, self.analysis_version, phase,
                        )
                        if existing is not None:
                            context["artifacts"][phase] = existing
                            continue
                    start = int(run.get("cursor", 0)) if run.get("phase") == phase else 0
                    batch_key = f"{phase}Batch"
                    batch_size = self.explore_batch_size if phase == "explore" else self.tiangong_batch_size
                    context[batch_key] = {
                        "start": start,
                        "limit": batch_size,
                    }
                    built = self.builders[phase](context)
                    checkpoint = built.get("_checkpoint") if isinstance(built, dict) else None
                    if isinstance(checkpoint, dict) and "artifact" in built:
                        payload = built["artifact"]
                        cursor_start = int(checkpoint.get("cursorStart", start))
                        cursor = int(checkpoint["cursor"])
                        total = int(checkpoint["total"])
                        chunk_index = cursor_start // batch_size
                        self.repository.save_artifact_chunk(
                            lottery, period, self.analysis_version, phase,
                            chunk_index, cursor_start, cursor, payload,
                        )
                        if phase == "explore":
                            self.repository.save_explore_results(
                                lottery, period, self.analysis_version, payload,
                            )
                        self.repository.update_progress(
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
                        manifest = chunk_manifest(
                            chunk_index + 1, cursor, total, len(materialized["items"]),
                        )
                        self.repository.save_artifact(
                            lottery, period, self.analysis_version, phase, manifest,
                        )
                        context["artifacts"][phase] = materialized
                        self.repository.update_progress(
                            lottery, period, self.analysis_version,
                            PHASES[phase_index + 1], phase_index + 1, phase_total,
                        )
                        continue
                    context.pop(batch_key, None)
                    self.repository.update_progress(
                        lottery, period, self.analysis_version, phase, phase_index, phase_total,
                    )
                    self.repository.save_artifact(
                        lottery, period, self.analysis_version, phase, built,
                    )
                    context["artifacts"][phase] = built
                    continue

                existing = self.repository.read_artifact(lottery, period, self.analysis_version, phase)
                if phase_index < resume_phase_index and existing is not None:
                    context["artifacts"][phase] = existing
                    continue
                built = self.builders[phase](context)
                checkpoint = built.get("_checkpoint") if isinstance(built, dict) else None
                if isinstance(checkpoint, dict) and "artifact" in built:
                    payload = built["artifact"]
                    self.repository.save_artifact(lottery, period, self.analysis_version, phase, payload)
                    self.repository.update_progress(
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
                self.repository.update_progress(lottery, period, self.analysis_version, phase, phase_index, phase_total)
                self.repository.save_artifact(lottery, period, self.analysis_version, phase, built)
                context["artifacts"][phase] = built
            completed_at = datetime.now(UTC).isoformat()
            self.repository.complete_run(lottery, period, self.analysis_version, completed_at)
            result = self.repository.get_progress(
                lottery, period, self.analysis_version,
            )
            return {**(result or {}), "skipped": False}
        except Exception as error:
            self.repository.fail_run(lottery, period, self.analysis_version, str(error))
            raise

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
