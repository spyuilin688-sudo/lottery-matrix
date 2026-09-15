from dataclasses import dataclass
from os import environ


def _env_bool(name: str, default: bool) -> bool:
    raw = environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    supabase_url: str = ""
    supabase_secret_key: str = ""
    notification_ingest_url: str = ""
    notification_ingest_token: str = ""
    tinyfish_api_key: str = ""
    tinyfish_fetch_fallback_enabled: bool = True
    tinyfish_browser_fallback_enabled: bool = False
    tinyfish_browser_max_duration_seconds: int = 60


def load_settings() -> Settings:
    return Settings(
        supabase_url=environ.get("SUPABASE_URL", "").strip(),
        supabase_secret_key=environ.get("SUPABASE_SECRET_KEY", "").strip(),
        notification_ingest_url=environ.get("MATRIX_NOTIFICATION_INGEST_URL", "").strip(),
        notification_ingest_token=environ.get("MATRIX_NOTIFICATION_INGEST_TOKEN", "").strip(),
        tinyfish_api_key=environ.get("TINYFISH_API_KEY", "").strip(),
        tinyfish_fetch_fallback_enabled=_env_bool(
            "TINYFISH_FETCH_FALLBACK_ENABLED",
            True,
        ),
        tinyfish_browser_fallback_enabled=_env_bool(
            "TINYFISH_BROWSER_FALLBACK_ENABLED",
            False,
        ),
        tinyfish_browser_max_duration_seconds=_env_int(
            "TINYFISH_BROWSER_MAX_DURATION_SECONDS",
            60,
        ),
    )
