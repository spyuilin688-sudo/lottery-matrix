import argparse
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

import httpx

from app.repositories.analysis_repository import AnalysisRepository, create_supabase_repository
from app.scraping.sources import LatestDrawSource
from app.services.analysis_pipeline import AnalysisPipeline, ArtifactBuilder
from app.services.artifact_builders import create_artifact_builders
from app.services.draw_refresh import DrawRefreshService, DrawSource
from app.settings import load_settings


REQUIRED_HISTORY_DRAWS = 80


def run_worker(
    lottery: str,
    repository: AnalysisRepository,
    source: DrawSource,
    builders: Mapping[str, ArtifactBuilder] | None = None,
) -> dict[str, Any]:
    repository.cleanup_expired(datetime.now(UTC))
    refresh = DrawRefreshService(repository, source)
    refresh.ensure_history(lottery, REQUIRED_HISTORY_DRAWS)
    draw = refresh.refresh(lottery)
    history = repository.list_draws(lottery, REQUIRED_HISTORY_DRAWS)
    if len(history) < REQUIRED_HISTORY_DRAWS:
        raise ValueError("DRAW_HISTORY_INCOMPLETE")
    version = f'{draw["period"]}:matrix-python-v1'
    return AnalysisPipeline(repository, builders or create_artifact_builders(), version, explore_batch_size=10).run(draw, history)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresh and analyze one Matrix lottery")
    parser.add_argument("--lottery", required=True, choices=["今彩539", "天天樂", "六合彩", "大樂透"])
    args = parser.parse_args(argv)
    settings = load_settings()
    repository = create_supabase_repository(settings.supabase_url, settings.supabase_secret_key)
    with httpx.Client() as client:
        result = run_worker(args.lottery, repository, LatestDrawSource(client))
    print(f'{result["lottery"]} {result["drawPeriod"]} {result["status"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
