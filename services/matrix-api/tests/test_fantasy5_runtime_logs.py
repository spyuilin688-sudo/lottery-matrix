from contextlib import nullcontext
from datetime import datetime
import json
from types import SimpleNamespace

import pytest

from app import analysis_worker, fantasy5_crawler, fantasy5_railway_job


def records(capsys):
    return [json.loads(line) for line in capsys.readouterr().out.splitlines()
            if line.startswith("{")]


@pytest.fixture
def analysis_cli(monkeypatch):
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "test-version")
    monkeypatch.setattr(analysis_worker, "load_settings", lambda: SimpleNamespace(
        supabase_url="https://example.test", supabase_secret_key="test-only"))
    monkeypatch.setattr(analysis_worker, "create_supabase_repository", lambda *_: object())
    monkeypatch.setattr(analysis_worker, "notification_emitter_context", lambda _: nullcontext())


@pytest.mark.parametrize(("status", "period", "outcome"), [
    ("already-analyzed", "12004", "already-analyzed"),
    ("complete", "12004", "analysis-completed"),
    ("waiting-draw", "", "no-new-draw"),
    ("running", "12004", "running"),
])
def test_analysis_cli_emits_inspector_fields(analysis_cli, monkeypatch, capsys, status, period, outcome):
    monkeypatch.setattr(analysis_worker, "run_analysis_only_worker", lambda *_: {
        "lottery": "天天樂", "drawPeriod": period, "status": status})

    assert analysis_worker.main(["--lottery", "天天樂"]) == 0
    logs = records(capsys)
    assert len(logs) == 1
    record = logs[0]
    assert record["lottery"] == "天天樂"
    assert record["period"] == (period or None)
    assert record["outcome"] == outcome
    assert record["executionVersion"] == "test-version"
    assert record["durationMs"] >= 0
    assert datetime.fromisoformat(record["finishedAt"]) >= datetime.fromisoformat(record["startedAt"])


def test_analysis_cli_logs_failure_and_preserves_exception(analysis_cli, monkeypatch, capsys):
    error = RuntimeError("private-token-do-not-log")

    def fail(*_):
        raise error

    monkeypatch.setattr(analysis_worker, "run_analysis_only_worker", fail)
    with pytest.raises(RuntimeError) as raised:
        analysis_worker.main(["--lottery", "天天樂"])
    assert raised.value is error
    logs = records(capsys)
    assert len(logs) == 1
    assert logs[0]["outcome"] == "failed"
    assert logs[0]["period"] is None
    assert logs[0]["errorType"] == "RuntimeError"
    assert "private-token" not in json.dumps(logs)


def test_analysis_cli_records_worker_stage_timings(analysis_cli, monkeypatch, capsys):
    monkeypatch.setattr(analysis_worker, "run_analysis_only_worker", lambda *_: {
        "lottery": "天天樂",
        "drawPeriod": "12004",
        "status": "complete",
        "stageTimingsMs": {
            "history": 2.5,
            "explore": 10.25,
            "write": 4.75,
            "notification": 1.0,
        },
    })

    assert analysis_worker.main(["--lottery", "天天樂"]) == 0
    assert records(capsys)[0]["stageTimingsMs"] == {
        "history": 2.5,
        "explore": 10.25,
        "write": 4.75,
        "notification": 1.0,
    }


def test_analysis_cli_records_setup_failure(analysis_cli, monkeypatch, capsys):
    def fail():
        raise ValueError("invalid configuration")

    monkeypatch.setattr(analysis_worker, "load_settings", fail)
    with pytest.raises(ValueError):
        analysis_worker.main(["--lottery", "天天樂"])
    assert records(capsys)[0]["outcome"] == "failed"


@pytest.fixture
def crawler_cli(monkeypatch):
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "test-version")
    monkeypatch.setenv("FANTASY5_MAX_ATTEMPTS", "3")
    monkeypatch.setattr(fantasy5_railway_job, "is_active_slot", lambda _: True)


def test_crawler_logs_each_attempt_without_changing_retry_behavior(crawler_cli, monkeypatch, capsys):
    outcomes = iter(["not-acquired", "acquired"])
    calls = []
    sleeps = []

    def run_once():
        calls.append(True)
        return {"lottery": "天天樂", "drawPeriod": "12005", "status": next(outcomes)}

    retry = fantasy5_railway_job.run_retry_loop
    monkeypatch.setattr(fantasy5_crawler, "run_fantasy5_crawler_once", run_once)
    monkeypatch.setattr(fantasy5_railway_job, "run_retry_loop",
                        lambda fn, **kw: retry(fn, sleeper=sleeps.append, **kw))

    assert fantasy5_railway_job.main() == 0
    logs = records(capsys)
    assert len(calls) == 2
    assert sleeps == [600]
    assert [r["outcome"] for r in logs] == ["not-acquired", "complete"]
    assert all(r["period"] == "12005" and r["executionVersion"] == "test-version" for r in logs)
    assert all(r["durationMs"] >= 0 for r in logs)


def test_crawler_logs_failure_without_retrying_exception(crawler_cli, monkeypatch, capsys):
    calls = []

    def fail():
        calls.append(True)
        raise TimeoutError("source unavailable")

    monkeypatch.setattr(fantasy5_crawler, "run_fantasy5_crawler_once", fail)
    with pytest.raises(TimeoutError):
        fantasy5_railway_job.main()
    assert len(calls) == 1
    assert records(capsys)[0]["outcome"] == "failed"


def test_inactive_seasonal_slot_logs_no_work(crawler_cli, monkeypatch, capsys):
    monkeypatch.setattr(fantasy5_railway_job, "is_active_slot", lambda _: False)
    monkeypatch.setattr(fantasy5_crawler, "run_fantasy5_crawler_once",
                        lambda: pytest.fail("inactive slot must not crawl"))
    assert fantasy5_railway_job.main() == 0
    logs = records(capsys)
    assert len(logs) == 1
    assert logs[0]["outcome"] == "not-due"
    assert logs[0]["period"] is None
