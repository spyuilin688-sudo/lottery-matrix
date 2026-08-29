from typing import Any


PAGE_SIZE = 1000


def _normalize_draw(draw: dict[str, Any]) -> dict[str, Any]:
    return {
        "period": draw["period"],
        "drawDate": draw.get("draw_date"),
        "numbers": draw["numbers"],
        "sortedNumbers": draw.get("sorted_numbers", draw["numbers"]),
        "drawOrderNumbers": draw.get("draw_order_numbers"),
    }


def list_all_draws(repository: Any, lottery: str) -> list[dict[str, Any]]:
    """Return every persisted draw for one lottery, newest first."""
    client = getattr(repository, "client", None)
    if client is None:
        stored = getattr(repository, "draws", {})
        count = sum(1 for key in stored if isinstance(key, tuple) and key[0] == lottery)
        return repository.list_draws(lottery, count)

    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        response = (
            client.table("lottery_draws")
            .select("period,draw_date,numbers,sorted_numbers,draw_order_numbers")
            .eq("lottery", lottery)
            .order("draw_date", desc=True)
            .order("period", desc=True)
            .range(start, start + PAGE_SIZE - 1)
            .execute()
        )
        page = [dict(draw) for draw in (response.data or [])]
        rows.extend(_normalize_draw(draw) for draw in page)
        if len(page) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return rows
