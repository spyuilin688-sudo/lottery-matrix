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


def test_railway_config_runs_all_lotteries_every_15_minutes() -> None:
    config = json.loads(
        (Path(__file__).parents[1] / "railway.json").read_text(encoding="utf-8")
    )

    assert config["deploy"]["startCommand"] == "uv run python -u -m app.worker_all"
    assert config["deploy"]["cronSchedule"] == "*/15 * * * *"
    assert config["deploy"]["restartPolicyType"] == "NEVER"


def test_railway_ssl_context_relaxes_only_python_strict_chain_checks() -> None:
    context = worker_all.create_railway_ssl_context()

    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        assert not context.verify_flags & ssl.VERIFY_X509_STRICT
