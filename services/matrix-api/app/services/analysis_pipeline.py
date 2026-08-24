from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from app.repositories.analysis_repository import ARTIFACT_KINDS, AnalysisRepository


ArtifactBuilder = Callable[[dict[str, Any]], Any]
PHASES = ("explore", "tianyan", "tiangong", "status")


class AnalysisPipeline:
    """Runs one idempotent analysis version and publishes it atomically."""

    def __init__(
        self,
        repository: AnalysisRepository,
        builders: Mapping[str, ArtifactBuilder],
        analysis_version: str = "matrix-python-v1",
    ) -> None:
        if set(builders) != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_BUILDERS_INCOMPLETE")
        self.repository = repository
        self.builders = builders
        self.analysis_version = analysis_version

    def run(self, draw: dict[str, Any], history: Sequence[dict[str, Any]]) -> dict[str, Any]:
        self._validate_draw(draw)
        lottery = draw["lottery"]
        period = draw["period"]
        self.repository.upsert_draw(draw)
        run = self.repository.begin_run(lottery, period, self.analysis_version, datetime.now(UTC).isoformat())
        if run["status"] == "complete":
            return {**run, "skipped": True}

        context = {"draw": draw, "history": list(history)}
        try:
            total = len(PHASES)
            for cursor, phase in enumerate(PHASES):
                self.repository.update_progress(lottery, period, self.analysis_version, phase, cursor, total)
                payload = self.builders[phase](context)
                self.repository.save_artifact(lottery, period, self.analysis_version, phase, payload)
            completed_at = datetime.now(UTC).isoformat()
            self.repository.complete_run(lottery, period, self.analysis_version, completed_at)
            result = self.repository.get_progress(lottery, period)
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
