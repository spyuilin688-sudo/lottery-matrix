import pytest

from app.repositories.artifact_chunks import chunk_manifest, materialize_chunks


def test_chunk_manifest_returns_storage_metadata() -> None:
    assert chunk_manifest(2, 10, 20, 10) == {
        "storage": "chunks",
        "schemaVersion": 1,
        "chunkCount": 2,
        "cursor": 10,
        "total": 20,
        "itemCount": 10,
    }


def test_materialize_chunks_restores_legacy_shape() -> None:
    chunks = [
        {"chunk_index": 1, "cursor_start": 10, "cursor_end": 20,
         "payload": {"items": [{"id": "b"}], "validationById": {"b": {"ruleSets": []}}}},
        {"chunk_index": 0, "cursor_start": 0, "cursor_end": 10,
         "payload": {"items": [{"id": "a"}], "validationById": {"a": {"ruleSets": []}}}},
    ]
    assert materialize_chunks("今彩539", "115000205", chunks, 20) == {
        "lottery": "今彩539",
        "drawPeriod": "115000205",
        "items": [{"id": "a"}, {"id": "b"}],
        "validationById": {"a": {"ruleSets": []}, "b": {"ruleSets": []}},
    }


def test_materialize_chunks_rejects_cursor_gap() -> None:
    with pytest.raises(ValueError, match="ANALYSIS_CHUNKS_INCOMPLETE"):
        materialize_chunks(
            "今彩539", "115000205",
            [{"chunk_index": 1, "cursor_start": 10, "cursor_end": 20,
              "payload": {"items": [], "validationById": {}}}],
            20,
        )


def test_materialize_chunks_rejects_conflicting_validation() -> None:
    chunks = [
        {"chunk_index": 0, "cursor_start": 0, "cursor_end": 10,
         "payload": {"items": [], "validationById": {"a": {"ruleSets": [1]}}}},
        {"chunk_index": 1, "cursor_start": 10, "cursor_end": 20,
         "payload": {"items": [], "validationById": {"a": {"ruleSets": [2]}}}},
    ]
    with pytest.raises(ValueError, match="ANALYSIS_CHUNK_CONFLICT"):
        materialize_chunks("今彩539", "115000205", chunks, 20)
