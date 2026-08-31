from app.repositories.artifact_chunks import materialize_chunks


def test_materialize_explore_chunks_merges_tianyan_sources() -> None:
    chunks = [
        {
            "chunk_index": 0,
            "cursor_start": 0,
            "cursor_end": 1,
            "payload": {
                "items": [{"id": "a"}],
                "validationById": {"a": {"ruleSets": []}},
                "tianyanSources": [{"id": "source-a"}],
            },
        },
        {
            "chunk_index": 1,
            "cursor_start": 1,
            "cursor_end": 2,
            "payload": {
                "items": [{"id": "b"}],
                "validationById": {"b": {"ruleSets": []}},
                "tianyanSources": [{"id": "source-b"}],
            },
        },
    ]

    result = materialize_chunks("今彩539", "115000205", chunks, 2)

    assert result["items"] == [{"id": "a"}, {"id": "b"}]
    assert result["validationById"] == {
        "a": {"ruleSets": []},
        "b": {"ruleSets": []},
    }
    assert result["tianyanSources"] == [{"id": "source-a"}, {"id": "source-b"}]
