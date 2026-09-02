from datetime import UTC, datetime
import re
from typing import Any, Protocol
from urllib.parse import quote

from app.card_renderer import card_layout, render_matrix_card
from app.repositories.analysis_repository import AnalysisRepository


MATRIX_CARD_BUCKET = "matrix-cards"
MATRIX_CARD_CACHE_SECONDS = "31536000"
LOTTERY_SLUGS = {
    "今彩539": "daily539",
    "天天樂": "fantasy5",
    "六合彩": "marksix",
    "大樂透": "lotto649",
}
SAFE_PERIOD = re.compile(r"^[A-Za-z0-9_-]+$")


class CardStorage(Protocol):
    def upload_svg(self, path: str, svg: str) -> None: ...


class SupabaseCardStorage:
    def __init__(self, client: Any, bucket: str = MATRIX_CARD_BUCKET) -> None:
        self.client = client
        self.bucket = bucket

    def upload_svg(self, path: str, svg: str) -> None:
        self.client.storage.from_(self.bucket).upload(
            path=path,
            file=svg.encode("utf-8"),
            file_options={
                "content-type": "image/svg+xml",
                "cache-control": MATRIX_CARD_CACHE_SECONDS,
                "upsert": "true",
            },
        )


def matrix_card_paths(lottery: str, period: str) -> dict[str, str]:
    try:
        slug = LOTTERY_SLUGS[lottery]
    except KeyError as error:
        raise ValueError("未知彩種") from error
    normalized_period = str(period).strip()
    if not SAFE_PERIOD.fullmatch(normalized_period):
        raise ValueError("MATRIX_CARD_PERIOD_INVALID")
    prefix = f"{slug}/{normalized_period}"
    return {
        "draw": f"{prefix}/draw.svg",
        "sorted": f"{prefix}/sorted.svg",
    }


def public_matrix_card_url(supabase_url: str, path: str) -> str:
    base = str(supabase_url).strip().rstrip("/")
    if not base:
        raise ValueError("SUPABASE_URL_MISSING")
    encoded_path = quote(path, safe="/")
    return f"{base}/storage/v1/object/public/{MATRIX_CARD_BUCKET}/{encoded_path}"


class MatrixCardPublisher:
    def __init__(
        self,
        repository: AnalysisRepository,
        storage: CardStorage,
    ) -> None:
        self.repository = repository
        self.storage = storage

    def publish(self, lottery: str, period: str) -> dict[str, Any]:
        normalized_period = str(period).strip()
        existing = self.repository.get_card_publication(lottery)
        if existing is not None and existing["period"] == normalized_period:
            return {**existing, "skipped": True}

        row_count = sum(card_layout(lottery)["column_rows"])
        draws = self.repository.list_draws(lottery, row_count)
        if not draws:
            raise ValueError("MATRIX_CARD_HISTORY_MISSING")
        if str(draws[0].get("period") or "") != normalized_period:
            raise ValueError("MATRIX_CARD_PERIOD_MISMATCH")

        paths = matrix_card_paths(lottery, normalized_period)
        svgs = {
            "draw": render_matrix_card(lottery, "draw", draws),
            "sorted": render_matrix_card(lottery, "sorted", draws),
        }
        self.storage.upload_svg(paths["draw"], svgs["draw"])
        self.storage.upload_svg(paths["sorted"], svgs["sorted"])
        return self.repository.upsert_card_publication(
            lottery,
            normalized_period,
            paths["draw"],
            paths["sorted"],
            datetime.now(UTC).isoformat(),
        )


def create_card_publisher(repository: AnalysisRepository) -> MatrixCardPublisher:
    client = getattr(repository, "client", None)
    if client is None:
        raise ValueError("SUPABASE_STORAGE_CLIENT_MISSING")
    return MatrixCardPublisher(repository, SupabaseCardStorage(client))
