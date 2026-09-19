from app.domain.explore_state import SORTED_ORDER
from app.services import artifact_builders


def history():
    return [{
        "period": str(120000 - index),
        "numbers": ["05", "10", "15", "18", "20"],
        "sortedNumbers": ["05", "10", "15", "18", "20"],
        "drawOrderNumbers": ["20", "18", "15", "10", "05"],
    } for index in range(13)]


def context(draws, start=0):
    return {
        "draw": {"lottery": "今彩539", "period": draws[0]["period"]},
        "history": draws,
        "numberOrders": (SORTED_ORDER,),
        "tianhengBatch": {"start": start, "limit": 10},
        "tianshuBatch": {"start": start, "limit": 10},
    }


def test_tianheng_and_tianshu_keep_independent_cached_indexes(monkeypatch):
    sessions = {"tianheng": [], "tianshu": []}

    def capture(kind):
        def batch(lottery, draws, start, limit, *, session):
            sessions[kind].append(session)
            return {
                "artifact": {"items": [], "validationById": {}},
                "cursorStart": start,
                "cursor": start + limit,
                "total": len(session.indexed_units),
                "complete": False,
            }
        return batch

    monkeypatch.setattr(artifact_builders, "run_tianheng_batch", capture("tianheng"))
    monkeypatch.setattr(artifact_builders, "run_tianshu_batch", capture("tianshu"))
    builders = artifact_builders.create_artifact_builders()
    draws = history()

    builders["tianheng"](context(draws))
    builders["tianshu"](context(draws))
    builders["tianheng"](context(list(draws), 10))
    builders["tianshu"](context(list(draws), 10))

    assert sessions["tianheng"][0] is sessions["tianheng"][1]
    assert sessions["tianshu"][0] is sessions["tianshu"][1]
    assert sessions["tianheng"][0] is not sessions["tianshu"][0]
    assert sessions["tianheng"][0].lock_count == 2
    assert sessions["tianshu"][0].lock_count == 3
