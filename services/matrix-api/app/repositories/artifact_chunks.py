import base64
import json
import zlib
from typing import Any, Mapping, Sequence


CHUNK_PAYLOAD_ENCODING = "zlib+base64"
CHUNK_PAYLOAD_INVALID = "ANALYSIS_CHUNK_PAYLOAD_INVALID"


def encode_chunk_payload(payload: Any) -> dict[str, Any]:
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return {
        "encoding": CHUNK_PAYLOAD_ENCODING,
        "schemaVersion": 1,
        "data": base64.b64encode(zlib.compress(serialized)).decode("ascii"),
    }


def decode_chunk_payload(payload: Any) -> Any:
    if not isinstance(payload, Mapping) or payload.get("encoding") != CHUNK_PAYLOAD_ENCODING:
        return payload
    if type(payload.get("schemaVersion")) is not int or payload["schemaVersion"] != 1:
        raise ValueError(CHUNK_PAYLOAD_INVALID)
    data = payload.get("data")
    if not isinstance(data, str):
        raise ValueError(CHUNK_PAYLOAD_INVALID)
    try:
        compressed = base64.b64decode(data, validate=True)
    except ValueError as error:
        raise ValueError(CHUNK_PAYLOAD_INVALID) from error
    if base64.b64encode(compressed).decode("ascii") != data:
        raise ValueError(CHUNK_PAYLOAD_INVALID)
    try:
        decompressor = zlib.decompressobj()
        serialized = decompressor.decompress(compressed) + decompressor.flush()
    except zlib.error as error:
        raise ValueError(CHUNK_PAYLOAD_INVALID) from error
    if not decompressor.eof or decompressor.unused_data or decompressor.unconsumed_tail:
        raise ValueError(CHUNK_PAYLOAD_INVALID)
    try:
        decoded = json.loads(serialized.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(CHUNK_PAYLOAD_INVALID) from error
    if (
        not isinstance(decoded, Mapping)
        or not isinstance(decoded.get("items"), list)
        or not isinstance(decoded.get("validationById"), Mapping)
    ):
        raise ValueError(CHUNK_PAYLOAD_INVALID)
    return decoded


def chunk_manifest(chunk_count: int, cursor: int, total: int, item_count: int) -> dict[str, int | str]:
    return {
        "storage": "chunks",
        "schemaVersion": 1,
        "chunkCount": chunk_count,
        "cursor": cursor,
        "total": total,
        "itemCount": item_count,
    }


def materialize_chunks(
    lottery: str,
    draw_period: str,
    chunks: Sequence[Mapping[str, Any]],
    expected_total: int,
) -> dict[str, Any]:
    ordered = sorted(chunks, key=lambda chunk: chunk["chunk_index"])
    if not ordered or ordered[0]["cursor_start"] != 0:
        raise ValueError("ANALYSIS_CHUNKS_INCOMPLETE")

    items: list[Any] = []
    items_by_id: dict[str, Any] = {}
    validation_by_id: dict[str, Any] = {}
    previous_cursor_end = 0

    for chunk in ordered:
        cursor_start = chunk["cursor_start"]
        cursor_end = chunk["cursor_end"]
        if cursor_start != previous_cursor_end or cursor_end < cursor_start:
            raise ValueError("ANALYSIS_CHUNKS_INCOMPLETE")

        payload = decode_chunk_payload(chunk["payload"])
        for item in payload["items"]:
            identifier = item.get("id") if isinstance(item, Mapping) else None
            if not isinstance(identifier, str):
                items.append(item)
                continue
            if identifier in items_by_id:
                if items_by_id[identifier] != item:
                    raise ValueError("ANALYSIS_CHUNK_CONFLICT")
                continue
            items_by_id[identifier] = item
            items.append(item)
        for identifier, validation in payload["validationById"].items():
            if identifier in validation_by_id and validation_by_id[identifier] != validation:
                raise ValueError("ANALYSIS_CHUNK_CONFLICT")
            validation_by_id[identifier] = validation
        previous_cursor_end = cursor_end

    if previous_cursor_end != expected_total:
        raise ValueError("ANALYSIS_CHUNKS_INCOMPLETE")

    return {
        "lottery": lottery,
        "drawPeriod": draw_period,
        "items": items,
        "validationById": validation_by_id,
    }
