from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = SERVICE_ROOT.parents[1]
WORKFLOW_ROOT = REPOSITORY_ROOT / ".github" / "workflows"


def test_fantasy5_railway_service_is_analysis_only() -> None:
    config = (SERVICE_ROOT / "railway.fantasy5.json").read_text(encoding="utf-8")

    assert '"startCommand": "uv run python -u -m app.analysis_worker --lottery 天天樂"' in config
    assert "app.worker --lottery 天天樂" not in config


def test_fantasy5_github_workflow_is_crawler_only() -> None:
    workflow = (WORKFLOW_ROOT / "fantasy5-crawler.yml").read_text(encoding="utf-8")

    assert "uv run python -m app.fantasy5_crawler" in workflow
    assert "secrets.SUPABASE_URL" in workflow
    assert "secrets.SUPABASE_SECRET_KEY" in workflow
    assert "app.worker" not in workflow
    assert "matrix-analysis" not in workflow.lower()


def test_existing_github_analysis_workflow_excludes_fantasy5() -> None:
    workflow = (WORKFLOW_ROOT / "matrix-analysis.yml").read_text(encoding="utf-8")

    assert "id: fantasy5" not in workflow
    assert "lottery: 天天樂" not in workflow
