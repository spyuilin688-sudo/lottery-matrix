from typing import Any

import pytest

from app.repositories.analysis_repository import InMemoryAnalysisRepository
from app.services.card_publication import (
    MatrixCardPublisher,
    SupabaseCardStorage,
    matrix_card_paths,
    public_matrix_card_url,
)


class TrackingRepository(InMemoryAnalysisRepository):
    def __init__(self) -> None:
        super().__init__()
        self.history_limits: list[int | None] = []

    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict[str, Any]]:
        self.history_limits.append(limit)
        return super().list_draws(lottery, limit)


class RecordingStorage:
    def __init__(self, fail_at: int | None = None) -> None:
        self.uploads: list[tuple[str, str]] = []
        self.fail_at = fail_at

    def upload_svg(self, path: str, svg: str) -> None:
        self.uploads.append((path, svg))
        if self.fail_at == len(self.uploads):
            raise RuntimeError("upload failed")


def _repository(lottery: str = "今彩539", count: int = 227) -> TrackingRepository:
    repository = TrackingRepository()
    for offset in range(count):
        period = str(3117 - offset).zfill(6)
        repository.upsert_draw({
            "lottery": lottery,
            "period": period,
            "drawDate": f"2026-08-{28 - (offset % 28):02d}",
            "numbers": ["01", "07", "11", "20", "39"],
            "sortedNumbers": ["01", "07", "11", "20", "39"],
            "drawOrderNumbers": ["39", "20", "11", "07", "01"],
        })
    repository.history_limits.clear()
    return repository


def test_matrix_card_paths_use_stable_ascii_lottery_slugs() -> None:
    assert matrix_card_paths("今彩539", "003117") == {
        "draw": "daily539/003117/draw.svg",
        "sorted": "daily539/003117/sorted.svg",
    }
    assert matrix_card_paths("天天樂", "11977")["draw"].startswith("fantasy5/")
    assert matrix_card_paths("六合彩", "2026101")["draw"].startswith("marksix/")
    assert matrix_card_paths("大樂透", "115000101")["draw"].startswith("lotto649/")


def test_public_matrix_card_url_targets_the_public_storage_bucket() -> None:
    assert public_matrix_card_url(
        "https://project.supabase.co/",
        "daily539/003117/draw.svg",
    ) == (
        "https://project.supabase.co/storage/v1/object/public/"
        "matrix-cards/daily539/003117/draw.svg"
    )


def test_publisher_reads_history_once_and_publishes_after_both_uploads() -> None:
    repository = _repository()
    storage = RecordingStorage()

    result = MatrixCardPublisher(repository, storage).publish("今彩539", "003117")

    assert repository.history_limits == [227]
    assert [path for path, _ in storage.uploads] == [
        "daily539/003117/draw.svg",
        "daily539/003117/sorted.svg",
    ]
    assert "539 落球" in storage.uploads[0][1]
    assert "539 順球" in storage.uploads[1][1]
    assert result["period"] == "003117"
    assert repository.get_card_publication("今彩539") == result


def test_publisher_skips_all_history_and_upload_work_for_the_current_period() -> None:
    repository = _repository()
    repository.upsert_card_publication(
        "今彩539",
        "003117",
        "daily539/003117/draw.svg",
        "daily539/003117/sorted.svg",
        "2026-09-02T00:00:00+00:00",
    )
    storage = RecordingStorage()

    result = MatrixCardPublisher(repository, storage).publish("今彩539", "003117")

    assert result["skipped"] is True
    assert repository.history_limits == []
    assert storage.uploads == []


def test_publisher_preserves_previous_pointer_when_second_upload_fails() -> None:
    repository = _repository()
    previous = repository.upsert_card_publication(
        "今彩539",
        "003116",
        "daily539/003116/draw.svg",
        "daily539/003116/sorted.svg",
        "2026-09-01T00:00:00+00:00",
    )

    with pytest.raises(RuntimeError, match="upload failed"):
        MatrixCardPublisher(repository, RecordingStorage(fail_at=2)).publish(
            "今彩539",
            "003117",
        )

    assert repository.get_card_publication("今彩539") == previous


def test_publisher_rejects_a_period_that_is_not_the_latest_history_row() -> None:
    repository = _repository()

    with pytest.raises(ValueError, match="MATRIX_CARD_PERIOD_MISMATCH"):
        MatrixCardPublisher(repository, RecordingStorage()).publish(
            "今彩539",
            "003116",
        )


class FakeBucket:
    def __init__(self) -> None:
        self.uploaded: tuple[str, bytes, dict[str, str]] | None = None

    def upload(self, path: str, file: bytes, file_options: dict[str, str]) -> None:
        self.uploaded = (path, file, file_options)


class FakeStorage:
    def __init__(self, bucket: FakeBucket) -> None:
        self.bucket = bucket
        self.selected = ""

    def from_(self, bucket: str) -> FakeBucket:
        self.selected = bucket
        return self.bucket


def test_supabase_storage_uploads_svg_with_long_lived_cache_metadata() -> None:
    bucket = FakeBucket()
    client = type("Client", (), {"storage": FakeStorage(bucket)})()

    SupabaseCardStorage(client).upload_svg("daily539/003117/draw.svg", "<svg/>")

    assert client.storage.selected == "matrix-cards"
    assert bucket.uploaded == (
        "daily539/003117/draw.svg",
        b"<svg/>",
        {
            "content-type": "image/svg+xml",
            "cache-control": "31536000",
            "upsert": "true",
        },
    )
