import argparse
from collections.abc import Mapping
from datetime import UTC, datetime
from os import environ
from typing import Any

from app.repositories.analysis_repository import (
    AnalysisRepository,
    create_supabase_repository,
)
from app.services.analysis_pipeline import ArtifactBuilder
from app.services.draw_refresh import recent_history_window, require_complete_history
from app.settings import load_settings
from app.worker import ANALYSIS_VERSION, _draw_from_history, _run_analysis


FANTASY5 = "天天樂"


def _restore_completed_explore_results(
    repository: AnalysisRepository,
    lottery: str,
    period: str,
    analysis_version: str,
) -> None:
    if repository.has_explore_results(lottery, period, analysis_version):
        return
    artifact = repository.read_artifact(
        lottery,
        period,
        analysis_version,
        "explore",
    )
    if artifact is not None:
        repository.save_explore_results(
            lottery,
            period,
            analysis_version,
            artifact,
        )


def run_analysis_only_worker(
    lottery: str,
    repository: AnalysisRepository,
    builders: Mapping[str, ArtifactBuilder] | None = None,
) -> dict[str, Any]:
    if lottery != FANTASY5:
        raise ValueError("ANALYSIS_ONLY_LOTTERY_UNSUPPORTED")

    latest = repository.list_draws(lottery, 1)
    if not latest:
        return {
            "lottery": lottery,
            "drawPeriod": "",
            "status": "waiting-draw",
        }

    period = str(latest[0]["period"])
    analysis_version = f"{period}:{ANALYSIS_VERSION}"
    progress = repository.get_progress(lottery, period, analysis_version)
    if progress is not None and progress.get("status") == "complete":
        _restore_completed_explore_results(
            repository,
            lottery,
            period,
            analysis_version,
        )
        return {
            "lottery": lottery,
            "drawPeriod": period,
            "analysisVersion": analysis_version,
            "status": "already-analyzed",
        }

    repository.cleanup_expired(datetime.now(UTC))
    history = repository.list_draws(lottery, None)
    require_complete_history(
        lottery,
        recent_history_window(history),
        period,
    )
    draw = _draw_from_history(lottery, period, history)
    return _run_analysis(repository, draw, history, builders)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Analyze the newest stored Fantasy5 draw without crawling",
    )
    parser.add_argument("--lottery", choices=[FANTASY5])
    args = parser.parse_args(argv)
    lottery = args.lottery or environ.get("MATRIX_LOTTERY", "").strip()
    if lottery != FANTASY5:
        parser.error("set --lottery or MATRIX_LOTTERY to 天天樂")

    settings = load_settings()
    repository = create_supabase_repository(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
    result = run_analysis_only_worker(lottery, repository)
    print(f'{result["lottery"]} {result["drawPeriod"] or "-"} {result["status"]}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
