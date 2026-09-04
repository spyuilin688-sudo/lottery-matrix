from datetime import datetime
import json
import re
import ssl
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app import worker_all
from app.schedule import due_call_cycle
from app.worker_all import LOTTERIES, run_all_workers


TAIPEI = ZoneInfo("Asia/Taipei")


def test_runs_all_three_railway_crawler_lotteries_in_order() -> None:
    calls: list[str] = []

    def run_one(lottery: str) -> dict:
        calls.append(lottery)
        return {"lottery": lottery, "status": "complete"}

    result = run_all_workers(run_one)

    assert LOTTERIES == ("今彩539", "六合彩", "大樂透")
    assert calls == ["今彩539", "六合彩", "大樂透"]
    assert result == {
        "completed": ["今彩539", "六合彩", "大樂透"],
        "failed": {},
    }


def test_one_lottery_failure_does_not_block_the_remaining_lotteries() -> None:
    calls: list[str] = []

    def run_one(lottery: str) -> dict:
        calls.append(lottery)
        if lottery == "六合彩":
            raise RuntimeError("source failed")
        return {"lottery": lottery, "status": "complete"}

    result = run_all_workers(run_one)

    assert calls == list(LOTTERIES)
    assert result["completed"] == ["今彩539", "大樂透"]
    assert result["failed"] == {"六合彩": "source failed"}


def test_primary_railway_config_runs_all_scheduled_workers_on_daily_five_minute_grid() -> None:
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
        "uv run python -u -m app.worker_all",
        "uv run python -u -m app.analysis_worker --lottery 天天樂",
        "uv run python -u -m app.worker --lottery 六合彩 --scheduled",
        "uv run python -u -m app.worker --lottery 大樂透 --scheduled",
    ]
    assert [config["deploy"]["cronSchedule"] for config in configs] == [
        "3/5 * * * *",
        "3/5 * * * *",
        "3/5 * * * *",
        "3/5 * * * *",
    ]
    assert all(config["deploy"]["restartPolicyType"] == "NEVER" for config in configs)


def test_other_automated_worker_entrypoints_use_scheduled_mode() -> None:
    root = Path(__file__).parents[1]
    systemd_service = (root / "deploy" / "matrix-worker.service").read_text(encoding="utf-8")
    workflow = (root.parents[1] / ".github" / "workflows" / "matrix-analysis.yml").read_text(
        encoding="utf-8",
    )

    for lottery in LOTTERIES:
        assert f"app.worker --lottery {lottery} --scheduled" in systemd_service
    assert 'uv run python -m app.worker --lottery "$LOTTERY" --scheduled' in workflow


def test_systemd_timer_covers_the_scheduled_worker_grid() -> None:
    root = Path(__file__).parents[1]
    timer = (root / "deploy" / "matrix-worker.timer").read_text(encoding="utf-8")
    match = re.search(r"^OnCalendar=\*:(\d+)/(\d+)$", timer, flags=re.MULTILINE)

    assert match is not None
    start, interval = (int(value) for value in match.groups())
    timer_minutes = set(range(start, 60, interval))
    scheduled_calls = (
        ("今彩539", datetime(2026, 8, 28, 20, 33, tzinfo=TAIPEI)),
        ("今彩539", datetime(2026, 8, 28, 20, 38, tzinfo=TAIPEI)),
        ("天天樂", datetime(2026, 8, 28, 9, 33, tzinfo=TAIPEI)),
        ("六合彩", datetime(2026, 8, 28, 21, 33, tzinfo=TAIPEI)),
        ("大樂透", datetime(2026, 8, 28, 20, 53, tzinfo=TAIPEI)),
    )

    assert all(due_call_cycle(lottery, now) is not None for lottery, now in scheduled_calls)
    assert {now.minute for _, now in scheduled_calls} <= timer_minutes


def test_batch_worker_invokes_the_scheduled_entrypoint(monkeypatch) -> None:
    settings = SimpleNamespace(supabase_url="https://example.test", supabase_secret_key="secret")
    repository = object()
    source = object()
    calls: list[tuple[str, None, object, object]] = []

    class Client:
        def __enter__(self):
            return object()

        def __exit__(self, *_: object) -> bool:
            return False

    monkeypatch.setattr(worker_all, "load_settings", lambda: settings)
    monkeypatch.setattr(worker_all, "create_supabase_repository", lambda *_: repository)
    monkeypatch.setattr(worker_all, "create_railway_ssl_context", lambda: object())
    monkeypatch.setattr(worker_all.httpx, "Client", lambda **_: Client())
    monkeypatch.setattr(worker_all, "LatestDrawSource", lambda _: source)
    monkeypatch.setattr(
        worker_all,
        "run_scheduled_worker",
        lambda lottery, now, actual_repository, actual_source: (
            calls.append((lottery, now, actual_repository, actual_source))
            or {"lottery": lottery, "status": "not-due"}
        ),
        raising=False,
    )
    assert worker_all.main() == 0
    assert calls == [(lottery, None, repository, source) for lottery in LOTTERIES]


def test_railway_ssl_context_relaxes_only_python_strict_chain_checks() -> None:
    context = worker_all.create_railway_ssl_context()

    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        assert not context.verify_flags & ssl.VERIFY_X509_STRICT
