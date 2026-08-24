from fastapi import FastAPI

from app.api.analysis import router as analysis_router
from app.repositories.analysis_repository import AnalysisRepository, create_supabase_repository
from app.settings import load_settings


def create_app(repository: AnalysisRepository | None = None) -> FastAPI:
    application = FastAPI(title="樂彩 Matrix API", version="0.1.0")
    application.state.analysis_repository = repository
    application.include_router(analysis_router)

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


def _configured_repository() -> AnalysisRepository | None:
    settings = load_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        return None
    return create_supabase_repository(settings.supabase_url, settings.supabase_secret_key)


app = create_app(_configured_repository())
