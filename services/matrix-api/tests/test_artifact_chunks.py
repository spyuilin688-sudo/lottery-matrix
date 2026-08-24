import base64
import json
import zlib

import pytest

from app.repositories.artifact_chunks import (
    chunk_manifest,
    decode_chunk_payload,
    materialize_chunks,
)


def _compressed_wrapper(serialized: bytes) -> dict[str, object]:
    return {
        "encoding": "zlib+base64",
        "schemaVersion": 1,
        "data": base64.b64encode(zlib.compress(serialized)).decode("ascii"),
    }


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


def test_materialize_chunks_decodes_compressed_payload_alongside_legacy_chunk() -> None:
    compressed_delta = {
        "items": [{"id": "b"}],
        "validationById": {"b": {"ruleSets": []}},
    }
    encoded_delta = base64.b64encode(
        zlib.compress(
            json.dumps(
                compressed_delta,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8"),
        ),
    ).decode("ascii")
    chunks = [
        {
            "chunk_index": 0,
            "cursor_start": 0,
            "cursor_end": 10,
            "payload": {
                "items": [{"id": "a"}],
                "validationById": {"a": {"ruleSets": []}},
            },
        },
        {
            "chunk_index": 1,
            "cursor_start": 10,
            "cursor_end": 20,
            "payload": {
                "encoding": "zlib+base64",
                "schemaVersion": 1,
                "data": encoded_delta,
            },
        },
    ]

    assert materialize_chunks("今彩539", "115000205", chunks, 20) == {
        "lottery": "今彩539",
        "drawPeriod": "115000205",
        "items": [{"id": "a"}, {"id": "b"}],
        "validationById": {
            "a": {"ruleSets": []},
            "b": {"ruleSets": []},
        },
    }


def test_decode_chunk_payload_rejects_missing_schema_version() -> None:
    wrapper = _compressed_wrapper(b'{"items":[],"validationById":{}}')
    del wrapper["schemaVersion"]

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


@pytest.mark.parametrize("schema_version", [0, 2, "1", True])
def test_decode_chunk_payload_rejects_unsupported_schema_version(
    schema_version: object,
) -> None:
    wrapper = _compressed_wrapper(b'{"items":[],"validationById":{}}')
    wrapper["schemaVersion"] = schema_version

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


def test_decode_chunk_payload_rejects_missing_data() -> None:
    wrapper = _compressed_wrapper(b'{"items":[],"validationById":{}}')
    del wrapper["data"]

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


@pytest.mark.parametrize("data", [None, 1, [], {}, b""])
def test_decode_chunk_payload_rejects_non_string_data(data: object) -> None:
    wrapper = _compressed_wrapper(b'{"items":[],"validationById":{}}')
    wrapper["data"] = data

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


@pytest.mark.parametrize(
    "data",
    [
        "not-base64!",
        "eJyrVsosSc0tVrKKjtVRKkvMyUxJLMnMz3Oq9ExRsqqurQUAucALhg==junk",
        "eJyrVsosSc0tVrKKjtVRKkvMyUxJLMnMz3Oq9ExRsqqurQUAucALhh==",
    ],
    ids=["invalid", "appended-junk", "non-canonical-pad-bits"],
)
def test_decode_chunk_payload_rejects_invalid_or_noncanonical_base64(
    data: str,
) -> None:
    wrapper = {
        "encoding": "zlib+base64",
        "schemaVersion": 1,
        "data": data,
    }

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


def test_decode_chunk_payload_rejects_zlib_trailing_bytes() -> None:
    serialized = b'{"items":[],"validationById":{}}'
    wrapper = _compressed_wrapper(serialized)
    wrapper["data"] = base64.b64encode(
        zlib.compress(serialized) + b"trailing-bytes",
    ).decode("ascii")

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


def test_decode_chunk_payload_rejects_incomplete_zlib_stream() -> None:
    serialized = b'{"items":[],"validationById":{}}'
    wrapper = _compressed_wrapper(serialized)
    wrapper["data"] = base64.b64encode(zlib.compress(serialized)[:-1]).decode("ascii")

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


def test_decode_chunk_payload_normalizes_invalid_utf8() -> None:
    wrapper = _compressed_wrapper(b"\xff")

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


def test_decode_chunk_payload_normalizes_invalid_json() -> None:
    wrapper = _compressed_wrapper(b"{")

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


@pytest.mark.parametrize("serialized", [b"[]", b"null", b'"artifact"', b"1"])
def test_decode_chunk_payload_rejects_decoded_non_mapping(
    serialized: bytes,
) -> None:
    wrapper = _compressed_wrapper(serialized)

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


@pytest.mark.parametrize(
    "serialized",
    [
        b"{}",
        b'{"items":[]}',
        b'{"items":{},"validationById":{}}',
        b'{"items":[],"validationById":[]}',
    ],
)
def test_decode_chunk_payload_rejects_mapping_without_artifact_shape(
    serialized: bytes,
) -> None:
    wrapper = _compressed_wrapper(serialized)

    with pytest.raises(ValueError, match="^ANALYSIS_CHUNK_PAYLOAD_INVALID$"):
        decode_chunk_payload(wrapper)


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
