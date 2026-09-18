import pytest

from app.domain.explore_state import DRAW_ORDER, SORTED_ORDER
from app.services import artifact_builders


def history():
    return [{
        "period": str(120000 - index),
        "numbers": ["05", "10", "15", "18", "20"],
        "sortedNumbers": ["05", "10", "15", "18", "20"],
        "drawOrderNumbers": ["20", "18", "15", "10", "05"],
    } for index in range(13)]


def context(draws, order=SORTED_ORDER, start=0):
    return {
        "draw": {"lottery": "今彩539", "period": draws[0]["period"]},
        "history": draws,
        "numberOrders": (order,),
        "tianhengBatch": {"start": start, "limit": 10},
    }


def capture_sessions(monkeypatch):
    sessions = []

    def batch(lottery, draws, start, limit, *, session):
        sessions.append(session)
        return {
            "artifact": {"items": [], "validationById": {}},
            "cursorStart": start, "cursor": start + limit,
            "total": len(session.indexed_units), "complete": False,
        }

    monkeypatch.setattr(artifact_builders, "run_tianheng_batch", batch)
    return sessions


def test_tianheng_batches_reuse_the_same_full_history_pair_index(monkeypatch):
    sessions = capture_sessions(monkeypatch)
    build = artifact_builders.create_artifact_builders()["tianheng"]
    draws = history()

    first = build(context(draws))
    second = build(context(list(draws), start=10))

    assert sessions[1] is sessions[0]
    assert sessions[1].contexts[0] is sessions[0].contexts[0]
    assert first["_checkpoint"]["cursor"] == 10
    assert second["_checkpoint"]["cursor"] == 20


def test_tianheng_pair_index_is_replaced_when_history_changes(monkeypatch):
    sessions = capture_sessions(monkeypatch)
    build = artifact_builders.create_artifact_builders()["tianheng"]
    draws = history()
    corrected = [*draws[:-1], {**draws[-1],
        "numbers": ["06", "10", "15", "18", "20"],
        "sortedNumbers": ["06", "10", "15", "18", "20"],
        "drawOrderNumbers": ["20", "18", "15", "10", "06"],
    }]

    build(context(draws))
    build(context(corrected))

    assert sessions[1] is not sessions[0]
    assert sessions[1].contexts[0].explore.ordered_at(12)[0] == 6


def test_tianheng_pair_indexes_stay_separate_for_each_number_order(monkeypatch):
    sessions = capture_sessions(monkeypatch)
    build = artifact_builders.create_artifact_builders()["tianheng"]
    draws = history()

    build(context(draws, SORTED_ORDER))
    build(context(draws, DRAW_ORDER))
    build(context(draws, SORTED_ORDER, start=10))

    assert sessions[0].contexts[0].source_units[0].occurrence.first_number == 5
    assert sessions[1].contexts[0].source_units[0].occurrence.first_number == 20
    assert sessions[2] is sessions[0]


@pytest.mark.parametrize("fails", [False, True])
def test_tianheng_builder_releases_transient_caches_after_each_batch(monkeypatch, fails):
    sessions = []
    run_batch = artifact_builders.run_tianheng_batch

    def capture(lottery, draws, start, limit, *, session):
        sessions.append(session)
        result = run_batch(lottery, draws, start, limit, session=session)
        assert any(context._candidate_cache for context in session.contexts)
        if fails:
            raise RuntimeError("batch interrupted")
        return result

    monkeypatch.setattr(artifact_builders, "run_tianheng_batch", capture)
    build = artifact_builders.create_artifact_builders()["tianheng"]
    if fails:
        with pytest.raises(RuntimeError, match="batch interrupted"):
            build(context(history()))
    else:
        build(context(history()))

    for indexed in sessions[0].contexts:
        assert indexed._occurrence_index
        assert not indexed._range_cache
        assert not indexed._candidate_cache
        assert not indexed._drag_cell_cache
        assert not indexed._drag_candidate_cache


def test_reused_tianheng_index_preserves_real_results_and_validation():
    draws = history()
    # Repeated dual locks have five hits for 18 and a verified sixth miss.
    targets = ([1, 2, 3, 4, 18], [6, 7, 8, 9, 18], [11, 12, 13, 14, 18],
               [16, 17, 18, 19, 21], [18, 22, 23, 24, 25], [26, 27, 28, 29, 30])
    for index, numbers in enumerate(targets, start=1):
        values = [str(number).zfill(2) for number in numbers]
        draws[2 * index - 1] = {**draws[2 * index - 1],
            "numbers": values, "sortedNumbers": values, "drawOrderNumbers": values}
    build = artifact_builders.create_artifact_builders()["tianheng"]
    first = build(context(draws))
    second = build(context(draws, start=1))
    fresh = artifact_builders.create_artifact_builders()["tianheng"](context(draws, start=1))

    assert first["artifact"]["items"]
    assert second["artifact"]["items"]
    assert second == fresh
