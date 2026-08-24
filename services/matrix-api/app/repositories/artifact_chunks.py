from typing import Any, Mapping, Sequence


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
    validation_by_id: dict[str, Any] = {}
    previous_cursor_end = 0

    for chunk in ordered:
        cursor_start = chunk["cursor_start"]
        cursor_end = chunk["cursor_end"]
        if cursor_start != previous_cursor_end or cursor_end < cursor_start:
            raise ValueError("ANALYSIS_CHUNKS_INCOMPLETE")

        payload = chunk["payload"]
        items.extend(payload["items"])
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
