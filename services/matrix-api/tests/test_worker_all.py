from app.worker_all import LOTTERIES, run_all_workers


def test_runs_all_four_lotteries_in_order() -> None:
    calls: list[str] = []

    def run_one(lottery: str) -> dict:
        calls.append(lottery)
        return {"lottery": lottery, "status": "complete"}

    result = run_all_workers(run_one)

    assert calls == ["今彩539", "天天樂", "六合彩", "大樂透"]
    assert result == {
        "completed": ["今彩539", "天天樂", "六合彩", "大樂透"],
        "failed": {},
    }


def test_one_lottery_failure_does_not_block_the_remaining_lotteries() -> None:
    calls: list[str] = []

    def run_one(lottery: str) -> dict:
        calls.append(lottery)
        if lottery == "天天樂":
            raise RuntimeError("source failed")
        return {"lottery": lottery, "status": "complete"}

    result = run_all_workers(run_one)

    assert calls == list(LOTTERIES)
    assert result["completed"] == ["今彩539", "六合彩", "大樂透"]
    assert result["failed"] == {"天天樂": "source failed"}
