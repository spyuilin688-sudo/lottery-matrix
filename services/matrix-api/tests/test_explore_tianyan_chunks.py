from app.repositories.artifact_chunks import materialize_chunks


def test_materialize_explore_chunks_merges_final_tianyan_results_without_raw_sources() -> None:
    chunks = [
        {
            "chunk_index": 0,
            "cursor_start": 0,
            "cursor_end": 1,
            "payload": {
                "items": [{"id": "a"}],
                "validationById": {"a": {"ruleSets": []}},
                "tianyanItems": [{"id": "tianyan-a"}],
                "tianyanValidationById": {"tianyan-a": {"rules": [{"id": "r1"}, {"id": "r2"}]}},
            },
        },
        {
            "chunk_index": 1,
            "cursor_start": 1,
            "cursor_end": 2,
            "payload": {
                "items": [{"id": "b"}],
                "validationById": {"b": {"ruleSets": []}},
                "tianyanItems": [{"id": "tianyan-b"}],
                "tianyanValidationById": {"tianyan-b": {"rules": [{"id": "r3"}, {"id": "r4"}]}},
            },
        },
    ]

    result = materialize_chunks("今彩539", "115000205", chunks, 2)

    assert result["items"] == [{"id": "a"}, {"id": "b"}]
    assert result["validationById"] == {
        "a": {"ruleSets": []},
        "b": {"ruleSets": []},
    }
    assert result["tianyanItems"] == [{"id": "tianyan-a"}, {"id": "tianyan-b"}]
    assert result["tianyanValidationById"] == {
        "tianyan-a": {"rules": [{"id": "r1"}, {"id": "r2"}]},
        "tianyan-b": {"rules": [{"id": "r3"}, {"id": "r4"}]},
    }
    assert "tianyanSources" not in result
