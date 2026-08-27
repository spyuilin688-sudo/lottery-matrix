import argparse
from collections.abc import Mapping
from datetime import UTC, datetime
from os import environ
from typing import Any

import httpx

from app.repositories.analysis_repository import AnalysisRepository, create_supabase_repository
from app.scraping.sources import LatestDrawSource
from app.services.analysis_pipeline import AnalysisPipeline, ArtifactBuilder
from app.services.artifact_builders import create_artifact_builders
from app.services.draw_refresh import DrawRefreshService, DrawSource
from app.settings import load_settings


REQUIRED_HISTORY_DRAWS = 80
EXPLORE_BATCH_SIZE = 10
MAX_CYCLES_PER_INVOCATION = 100
MAX_FAILURES_PER_INVOCATION = 3


def run_worker(
    lottery: str,
    repository: AnalysisRepository,
    source: DrawSource,
    builders: Mapping[str, ArtifactBuilder] | None = None,
) -> dict[str, Any]:
    preparation_error: Exception | None = None
    for _ in range(MAX_FAILURES_PER_INVOCATION):
        try:
            repository.cleanup_expired(datetime.now(UTC))
            refresh = DrawRefreshService(repository, source)
            refresh.ensure_history(lottery, REQUIRED_HISTORY_DRAWS)
            draw = refresh.refresh(lottery)
            history = repository.list_draws(lottery, REQUIRED_HISTORY_DRAWS)
            if len(history) < REQUIRED_HISTORY_DRAWS:
                raise ValueError("DRAW_HISTORY_INCOMPLETE")
            break
        except Exception as error:
            if isinstance(error, ValueError):
                raise
            preparation_error = error
    else:
        assert preparation_error is not None
        raise preparation_error

    version = f'{draw["period"]}:matrix-python-v2'
    pipeline = AnalysisPipeline(
        repository,
        builders or create_artifact_builders(),
        version,
        explore_batch_size=EXPLORE_BATCH_SIZE,
    )
    failures = 0
    result: dict[str, Any] = {}
    for _ in range(MAX_CYCLES_PER_INVOCATION):
        try:
            result = pipeline.run(draw, history)
            failures = 0
        except Exception:
            failures += 1
            if failures >= MAX_FAILURES_PER_INVOCATION:
                raise
            continue
        if result.get("status") != "running":
            return result
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresh and analyze one Matrix lottery")
    lotteries = ["今彩539", "天天樂", "六合彩", "大樂透"]
    parser.add_argument("--lottery", choices=lotteries)
    args = parser.parse_args(argv)
    lottery = args.lottery or environ.get("MATRIX_LOTTERY", "").strip()
    if lottery not in lotteries:
        parser.error("set --lottery or MATRIX_LOTTERY to one supported lottery")
    settings = load_settings()
    repository = create_supabase_repository(settings.supabase_url, settings.supabase_secret_key)
    with httpx.Client() as client:
        result = run_worker(lottery, repository, LatestDrawSource(client))
    print(f'{result["lottery"]} {result["drawPeriod"]} {result["status"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
