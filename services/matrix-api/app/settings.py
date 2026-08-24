from dataclasses import dataclass
from os import environ


@dataclass(frozen=True)
class Settings:
    supabase_url: str = ""
    supabase_secret_key: str = ""


def load_settings() -> Settings:
    return Settings(
        supabase_url=environ.get("SUPABASE_URL", "").strip(),
        supabase_secret_key=environ.get("SUPABASE_SECRET_KEY", "").strip(),
    )
