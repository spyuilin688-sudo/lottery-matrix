import json
import ssl
from pathlib import Path

from app import worker_all
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


def test_railway_config_runs_scheduled_worker_on_five_minute_grid() -> None:
    root = Path(__file__).parents[1]
    configs = [
        json.loads((root / name).read_text(encoding="utf-8"))
        for name in (
            "railway.json",
            "railway.fantasy5.json",
            "railway.marksix.json",
            "railway.lotto649.json",
        )
    ]

    assert [config["deploy"]["startCommand"] for config in configs] == [
        "uv run python -u -m app.worker --lottery 今彩539 --scheduled",
        "uv run python -u -m app.worker --lottery 天天樂 --scheduled",
        "uv run python -u -m app.worker --lottery 亚洲日韩六合彩 --scheduled".replace("紐西蘭", ""),
        "uv run python -u -m app.worker --lottery 大樂透 --scheduled",
    ]
    assert [config["deploy"]["cronSchedule"] for config in configs] == [
        "3/5 * * * 1-6",
        "3/5 * * * *",
        "3/5 * * * *",
        "3/5 * * * 2,5",
    ]
    assert all(config["deploy"]["restartPolicyType"] == "NEVER" for config in configs)


def test_railway_ssl_context_relaxes_only_python_strict_chain_checks() -> None:
    context = worker_all.create_railway_ssl_context()

    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        assert not context.verify_flags & ssl.VERIFY_X509_STRICT
