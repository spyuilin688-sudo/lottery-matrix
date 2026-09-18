from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from httpx import Client as HttpClient, HTTPError
from postgrest.exceptions import APIError

from app.repositories.artifact_chunks import (
    encode_chunk_payload,
    materialize_chunks,
    summarize_chunks,
)


ARTIFACT_KINDS = {"explore", "tianheng", "tianyan", "tiangong", "status"}
JOB_NAME_BY_LOTTERY = {
    "今彩539": "matrix-539-refresh-v2",
    "天天樂": "matrix-fantasy5-refresh-v2",
    "六合彩": "matrix-marksix-refresh-v2",
    "大樂透": "matrix-649-refresh-v2",
}
RETENTION = timedelta(days=3)
DRAW_PAGE_SIZE = 1000
DRAW_SNAPSHOT_MAX_ATTEMPTS = 3
ARTIFACT_CHUNK_PAGE_SIZE = 2
EXPLORE_RESULT_UPSERT_BATCH_SIZE = 100
TIANHENG_RESULT_UPSERT_BATCH_SIZE = 100
ANALYSIS_RUN_LEASE_SECONDS = 300


class AnalysisRepository(Protocol):
    def health_check(self) -> None: ...
    def list_job_statuses(self) -> list[dict[str, Any]]: ...
    def start_job(self, job_name: str, lottery: str, started_at: str) -> None: ...
    def finish_job(
        self,
        job_name: str,
        status: str,
        finished_at: str,
        error: str | None = None,
        *,
        source_period: str | None = None,
        database_period: str | None = None,
        written_period: str | None = None,
    ) -> None: ...
    def upsert_draw(self, draw: dict[str, Any]) -> dict[str, Any]: ...
    def upsert_draws(self, draws: list[dict[str, Any]]) -> list[dict[str, Any]]: ...
    def get_draw(self, lottery: str, period: str) -> dict[str, Any] | None: ...
    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict[str, Any]]: ...
    def list_draws_since(self, lottery: str, since_date: str) -> list[dict[str, Any]]: ...
    def begin_run(self, lottery: str, draw_period: str, analysis_version: str, started_at: str, *, owner_id: str | None = None, lease_seconds: int = ANALYSIS_RUN_LEASE_SECONDS) -> dict[str, Any]: ...
    def renew_run_lease(self, lottery: str, draw_period: str, analysis_version: str, owner_id: str, lease_seconds: int = ANALYSIS_RUN_LEASE_SECONDS) -> bool: ...
    def update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int, *, owner_id: str | None = None) -> None: ...
    def save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any, *, owner_id: str, run_started_at: str) -> None: ...
    def save_artifact_chunk(self, lottery: str, draw_period: str, analysis_version: str, kind: str, chunk_index: int, cursor_start: int, cursor_end: int, payload: Any, *, owner_id: str, run_started_at: str) -> None: ...
    def save_explore_results(self, lottery: str, draw_period: str, analysis_version: str, payload: Any, *, owner_id: str, run_started_at: str) -> None: ...
    def restore_completed_results(self, lottery: str, draw_period: str, analysis_version: str, kind: str) -> None: ...
    def has_explore_results(self, lottery: str, draw_period: str, analysis_version: str) -> bool: ...
    def save_tianheng_results(self, lottery: str, draw_period: str, analysis_version: str, payload: Any, *, owner_id: str, run_started_at: str) -> None: ...
    def has_tianheng_results(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        expected_count: int | None = None,
    ) -> bool: ...
    def read_artifact_chunks(self, lottery: str, draw_period: str, analysis_version: str, kind: str) -> list[dict[str, Any]]: ...
    def materialize_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, expected_total: int) -> dict[str, Any]: ...
    def summarize_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, expected_total: int) -> int: ...
    def has_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str) -> bool: ...
    def read_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str) -> Any | None: ...
    def complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str, *, owner_id: str | None = None) -> None: ...
    def fail_run(self, lottery: str, draw_period: str, analysis_version: str, error: str, *, owner_id: str | None = None) -> None: ...
    def get_progress(self, lottery: str, draw_period: str, analysis_version: str | None = None) -> dict[str, Any] | None: ...
    def list_progress_for_periods(self, lottery: str, draw_periods: list[str], analysis_name: str) -> dict[str, dict[str, Any]]: ...
    def read_completed_artifact(self, lottery: str, draw_period: str, kind: str) -> Any | None: ...
    def cleanup_expired(self, now: datetime) -> int: ...


class InMemoryAnalysisRepository:
    def __init__(self) -> None:
        self.draws: dict[tuple[str, str], dict[str, Any]] = {}
        self.runs: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.active_versions: dict[tuple[str, str, str], str] = {}
        self.artifacts: dict[tuple[str, str, str, str], dict[str, Any]] = {}
        self.artifact_chunks: dict[tuple[str, str, str, str, int], dict[str, Any]] = {}
        self.explore_results: dict[tuple[str, str, str, str], dict[str, Any]] = {}
        self.tianheng_results: dict[tuple[str, str, str, str], dict[str, Any]] = {}
        self.job_statuses: dict[str, dict[str, Any]] = {}

    def health_check(self) -> None:
        return None

    def start_job(self, job_name: str, lottery: str, started_at: str) -> None:
        self.job_statuses[job_name] = {
            "jobName": job_name,
            "lottery": lottery,
            "status": "running",
            "startedAt": started_at,
            "finishedAt": None,
            "error": None,
            "sourcePeriod": None,
            "databasePeriod": None,
            "writtenPeriod": None,
            "updatedAt": started_at,
        }

    def finish_job(
        self,
        job_name: str,
        status: str,
        finished_at: str,
        error: str | None = None,
        *,
        source_period: str | None = None,
        database_period: str | None = None,
        written_period: str | None = None,
    ) -> None:
        self.job_statuses[job_name].update({
            "status": status,
            "finishedAt": finished_at,
            "error": error,
            "sourcePeriod": source_period,
            "databasePeriod": database_period,
            "writtenPeriod": written_period,
            "updatedAt": finished_at,
        })

    def list_job_statuses(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for lottery, job_name in JOB_NAME_BY_LOTTERY.items():
            latest_draws = self.list_draws(lottery, 1)
            latest_draw = latest_draws[0] if latest_draws else None
            runs = [dict(run) for key, run in self.runs.items() if key[0] == lottery]
            latest_analysis = max(runs, key=lambda run: str(run.get("startedAt", ""))) if runs else None
            job = self.job_statuses.get(job_name)
            items.append({
                "lottery": lottery,
                "jobName": job_name,
                "job": None if job is None else {
                    "jobName": job["jobName"],
                    "lottery": job["lottery"],
                    "status": job["status"],
                    "startedAt": job["startedAt"],
                    "finishedAt": job.get("finishedAt"),
                    "error": "WORKER_FAILED" if job.get("error") else None,
                    "sourcePeriod": job.get("sourcePeriod"),
                    "databasePeriod": job.get("databasePeriod"),
                    "writtenPeriod": job.get("writtenPeriod"),
                    "updatedAt": job["updatedAt"],
                },
                "latestDraw": None if latest_draw is None else {
                    "period": latest_draw["period"],
                    "drawDate": latest_draw.get("drawDate"),
                },
                "latestAnalysis": None if latest_analysis is None else {
                    "drawPeriod": latest_analysis["drawPeriod"],
                    "status": latest_analysis["status"],
                    "phase": latest_analysis["phase"],
                    "startedAt": latest_analysis["startedAt"],
                    "completedAt": latest_analysis.get("completedAt"),
                    "error": "ANALYSIS_FAILED" if latest_analysis.get("error") else None,
                },
            })
        return items

    def upsert_draw(self, draw: dict[str, Any]) -> dict[str, Any]:
        stored = dict(draw)
        stored.setdefault("resultStatus", "confirmed")
        lottery, period = stored["lottery"], stored["period"]
        rebased_periods: set[str] = set()
        period_match = self.draws.get((lottery, period))
        previous = period_match
        if previous is not None and previous.get("resultStatus") == "preliminary" and previous.get("drawDate") != stored.get("drawDate"):
            previous = None
        for key, candidate in list(self.draws.items()):
            if key[0] != lottery or not stored.get("drawDate") or candidate.get("drawDate") != stored["drawDate"]:
                continue
            if stored["resultStatus"] == "preliminary" and candidate.get("resultStatus", "confirmed") == "confirmed":
                return dict(candidate)
            if candidate.get("resultStatus") == "preliminary":
                previous = candidate
                break
        if previous is not None and previous.get("resultStatus", "confirmed") == "confirmed":
            if stored["resultStatus"] == "preliminary":
                return dict(previous)
            if previous.get("drawDate") and stored.get("drawDate") and previous["drawDate"] != stored["drawDate"]:
                raise ValueError("DRAW_PERIOD_DATE_CONFLICT")
        if period_match is not None and period_match is not previous:
            if (stored["resultStatus"] != "confirmed" or period_match.get("resultStatus", "confirmed") != "preliminary"
                    or not stored.get("drawDate") or not period_match.get("drawDate")
                    or period_match["drawDate"] <= stored["drawDate"]):
                raise ValueError("DRAW_PERIOD_DATE_CONFLICT")
        if stored["resultStatus"] == "confirmed" and (
            (previous is not None and previous.get("resultStatus") == "preliminary" and previous["period"] != period)
            or (period_match is not None and period_match is not previous)
        ):
            anchor = period
            pending: list[tuple[tuple[str, str], dict[str, Any]]] = []
            later = sorted((row for (name, _), row in self.draws.items() if name == lottery
                            and str(row.get("drawDate") or "") > str(stored.get("drawDate") or "")),
                           key=lambda row: str(row["drawDate"]))
            for row in later:
                if row.get("resultStatus", "confirmed") == "confirmed":
                    anchor = row["period"]
                else:
                    estimate = str(int(anchor) + 1).zfill(max(len(anchor), len(row["period"])))
                    pending.append(((lottery, row["period"]), {**row, "period": estimate}))
                    anchor = estimate
            pending_keys = {key for key, _ in pending}
            assigned_periods = {period}
            for _, row in pending:
                key = (lottery, row["period"])
                if row["period"] in assigned_periods or (key in self.draws and key not in pending_keys
                        and (previous is None or key != (lottery, previous["period"]))):
                    raise ValueError("DRAW_PERIOD_DATE_CONFLICT")
                assigned_periods.add(row["period"])
            for key, _ in pending:
                del self.draws[key]
                rebased_periods.add(key[1])
            for _, row in pending:
                self.draws[(lottery, row["period"])] = row
        sorted_changed = previous is None or any(previous.get(field) != stored.get(field) for field in ("period", "drawDate", "numbers"))
        sorted_changed = sorted_changed or previous.get("sortedNumbers", previous["numbers"]) != stored.get("sortedNumbers", stored["numbers"])
        actual_changed = previous is None or previous.get("drawOrderNumbers") != stored.get("drawOrderNumbers") or previous.get("resultStatus") != stored.get("resultStatus")
        if sorted_changed or actual_changed:
            dates = [str(value).replace("/", "-").replace(".", "-") for value in (stored.get("drawDate"), (previous or stored).get("drawDate")) if value]
            cutoff = min(dates) if len(dates) == 2 else ""
            affected = rebased_periods | ({previous["period"]} if previous else set()) | {
                row["period"] for (name, _), row in self.draws.items() if name == lottery
                and (not cutoff or str(row.get("drawDate") or "").replace("/", "-").replace(".", "-") >= cutoff)
            }
            removed_runs = set()
            for records in (self.runs, self.artifacts, self.artifact_chunks, self.explore_results, self.tianheng_results):
                for key in list(records):
                    if key[0] == lottery and key[1] in affected and (sorted_changed or not key[2].endswith("-sorted")):
                        if records is self.runs:
                            removed_runs.add(key)
                        del records[key]
            # Mirror the active-version foreign key's ON DELETE CASCADE.
            for key, version in list(self.active_versions.items()):
                if (*key[:2], version) in removed_runs:
                    del self.active_versions[key]
        if previous is not None and previous["period"] != period and self.draws.get((lottery, previous["period"])) is previous:
            self.draws.pop((lottery, previous["period"]), None)
        self.draws[(stored["lottery"], stored["period"])] = stored
        return stored

    def upsert_draws(self, draws: list[dict[str, Any]]) -> list[dict[str, Any]]:
        records = (self.draws, self.runs, self.artifacts, self.artifact_chunks, self.explore_results, self.tianheng_results, self.active_versions)
        snapshots = [(items, dict(items)) for items in records]
        ordered = sorted(draws, key=lambda draw: (draw["lottery"], draw.get("drawDate") is None,
                                                str(draw.get("drawDate") or ""), draw["period"]))
        try:
            return [self.upsert_draw(draw) for draw in ordered]
        except Exception:
            for items, snapshot in snapshots:
                items.clear()
                items.update(snapshot)
            raise

    def get_draw(self, lottery: str, period: str) -> dict[str, Any] | None:
        draw = self.draws.get((lottery, period))
        return dict(draw) if draw is not None else None

    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict[str, Any]]:
        matches = [draw for (name, _), draw in self.draws.items() if name == lottery]
        ordered = sorted(
            matches,
            key=lambda draw: (
                bool(str(draw.get("drawDate") or "").strip()),
                str(draw.get("drawDate") or ""),
                str(draw["period"]),
            ),
            reverse=True,
        )
        newest = ordered if limit is None else ordered[: max(0, limit)]
        return [
            {
                "period": draw["period"],
                "drawDate": draw.get("drawDate"),
                "numbers": draw["numbers"],
                "sortedNumbers": draw.get("sortedNumbers", draw["numbers"]),
                "drawOrderNumbers": draw.get("drawOrderNumbers"),
                "resultStatus": draw.get("resultStatus", "confirmed"),
            }
            for draw in newest
        ]

    def list_draws_since(self, lottery: str, since_date: str) -> list[dict[str, Any]]:
        matches = [
            draw
            for (name, _), draw in self.draws.items()
            if name == lottery
            and str(draw.get("drawDate") or "").replace("/", "-").replace(".", "-") >= since_date
        ]
        ordered = sorted(
            matches,
            key=lambda draw: (
                str(draw.get("drawDate") or ""),
                str(draw["period"]),
            ),
            reverse=True,
        )
        return [
            {
                "period": draw["period"],
                "drawDate": draw.get("drawDate"),
                "numbers": draw["numbers"],
                "sortedNumbers": draw.get("sortedNumbers", draw["numbers"]),
                "drawOrderNumbers": draw.get("drawOrderNumbers"),
                "resultStatus": draw.get("resultStatus", "confirmed"),
            }
            for draw in ordered
        ]

    @staticmethod
    def _lease_datetime(value: str) -> datetime:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)

    def _require_run_owner(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        owner_id: str | None,
    ) -> None:
        if owner_id is None:
            return
        run = self.runs.get((lottery, draw_period, analysis_version))
        if run is None:
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")
        expires_at = run.get("leaseExpiresAt")
        if (
            run.get("leaseOwner") != owner_id
            or not expires_at
            or self._lease_datetime(str(expires_at)) <= datetime.now(UTC)
        ):
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def begin_run(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        started_at: str,
        *,
        owner_id: str | None = None,
        lease_seconds: int = ANALYSIS_RUN_LEASE_SECONDS,
    ) -> dict[str, Any]:
        key = (lottery, draw_period, analysis_version)
        if owner_id is None:
            if key not in self.runs:
                self.runs[key] = {
                    "lottery": lottery, "drawPeriod": draw_period, "analysisVersion": analysis_version,
                    "phase": "explore", "cursor": 0, "total": 0, "status": "running",
                    "startedAt": started_at, "completedAt": None, "error": None,
                }
            return dict(self.runs[key])
        if not owner_id.strip():
            raise ValueError("ANALYSIS_RUN_OWNER_REQUIRED")
        if not 30 <= lease_seconds <= 3600:
            raise ValueError("ANALYSIS_RUN_LEASE_SECONDS_INVALID")

        now = self._lease_datetime(started_at)
        lease_expires_at = (now + timedelta(seconds=lease_seconds)).isoformat()
        if key not in self.runs:
            self.runs[key] = {
                "lottery": lottery, "drawPeriod": draw_period, "analysisVersion": analysis_version,
                "phase": "explore", "cursor": 0, "total": 0, "status": "running",
                "startedAt": started_at, "completedAt": None, "error": None,
                "leaseOwner": owner_id, "leaseExpiresAt": lease_expires_at,
            }
            return {**self.runs[key], "leaseAcquired": True}

        run = self.runs[key]
        rebuild_missing_artifact = run.get("status") == "complete" and not self.has_artifact(
            lottery, draw_period, analysis_version, "explore",
        )
        if run.get("status") == "complete" and not rebuild_missing_artifact:
            return {**run, "leaseAcquired": False}
        current_expiry_raw = run.get("leaseExpiresAt")
        current_expiry = (
            self._lease_datetime(str(current_expiry_raw))
            if current_expiry_raw else None
        )
        can_acquire = (
            rebuild_missing_artifact
            or run.get("status") == "failed"
            or not run.get("leaseOwner")
            or run.get("leaseOwner") == owner_id
            or current_expiry is None
            or current_expiry <= now
        )
        if can_acquire:
            if rebuild_missing_artifact:
                run.update({"phase": "explore", "cursor": 0, "total": 0})
            run.update({
                "status": "running",
                "completedAt": None,
                "error": None,
                "leaseOwner": owner_id,
                "leaseExpiresAt": lease_expires_at,
            })
        return {**run, "leaseAcquired": can_acquire}

    def renew_run_lease(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        owner_id: str,
        lease_seconds: int = ANALYSIS_RUN_LEASE_SECONDS,
    ) -> bool:
        if not 30 <= lease_seconds <= 3600:
            raise ValueError("ANALYSIS_RUN_LEASE_SECONDS_INVALID")
        run = self.runs.get((lottery, draw_period, analysis_version))
        if run is None or run.get("status") != "running" or run.get("leaseOwner") != owner_id:
            return False
        expires_at = run.get("leaseExpiresAt")
        now = datetime.now(UTC)
        if not expires_at or self._lease_datetime(str(expires_at)) <= now:
            return False
        run["leaseExpiresAt"] = (now + timedelta(seconds=lease_seconds)).isoformat()
        return True

    def update_progress(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        phase: str,
        cursor: int,
        total: int,
        *,
        owner_id: str | None = None,
    ) -> None:
        self._require_run_owner(lottery, draw_period, analysis_version, owner_id)
        self.runs[(lottery, draw_period, analysis_version)].update({"phase": phase, "cursor": cursor, "total": total, "status": "running", "completedAt": None, "error": None})

    def _require_child_write_owner(
        self, lottery: str, draw_period: str, analysis_version: str,
        owner_id: str | None, run_started_at: str | None,
    ) -> None:
        run = self.runs.get((lottery, draw_period, analysis_version))
        # Ownerless in-memory fixtures remain supported only outside leased work.
        if owner_id is None and (run is None or not run.get("leaseOwner")):
            return
        self._require_run_owner(lottery, draw_period, analysis_version, owner_id)
        if (
            owner_id is None or run is None or run.get("status") != "running"
            or not run_started_at
            or self._lease_datetime(run_started_at) != self._lease_datetime(run["startedAt"])
        ):
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any, *, owner_id: str | None = None, run_started_at: str | None = None) -> None:
        self._require_child_write_owner(lottery, draw_period, analysis_version, owner_id, run_started_at)
        if kind not in ARTIFACT_KINDS:
            raise ValueError("UNKNOWN_ARTIFACT_KIND")
        self.artifacts[(lottery, draw_period, analysis_version, kind)] = {
            "payload": payload, "expiresAt": datetime.now(UTC) + RETENTION,
        }

    def save_artifact_chunk(self, lottery: str, draw_period: str, analysis_version: str, kind: str, chunk_index: int, cursor_start: int, cursor_end: int, payload: Any, *, owner_id: str | None = None, run_started_at: str | None = None) -> None:
        self._require_child_write_owner(lottery, draw_period, analysis_version, owner_id, run_started_at)
        if kind not in ARTIFACT_KINDS:
            raise ValueError("UNKNOWN_ARTIFACT_KIND")
        self.artifact_chunks[(lottery, draw_period, analysis_version, kind, chunk_index)] = {
            "cursor_start": cursor_start,
            "cursor_end": cursor_end,
            "payload": encode_chunk_payload(payload),
            "expiresAt": datetime.now(UTC) + RETENTION,
        }

    def save_explore_results(
        self, lottery: str, draw_period: str, analysis_version: str, payload: Any,
        *, owner_id: str | None = None, run_started_at: str | None = None,
    ) -> None:
        self._require_child_write_owner(lottery, draw_period, analysis_version, owner_id, run_started_at)
        expires_at = datetime.now(UTC) + RETENTION
        for record in _explore_result_records(
            lottery, draw_period, analysis_version, payload, expires_at.isoformat(),
        ):
            record["expiresAt"] = expires_at
            key = (lottery, draw_period, analysis_version, record["item_id"])
            self.explore_results[key] = record

    def restore_completed_results(
        self, lottery: str, draw_period: str, analysis_version: str, kind: str,
    ) -> None:
        started_at, artifact = _completed_result_snapshot(self, lottery, draw_period, analysis_version, kind)
        if kind == "explore" and self.has_explore_results(lottery, draw_period, analysis_version):
            return
        if kind == "tianheng" and self.has_tianheng_results(lottery, draw_period, analysis_version, len(artifact.get("items", []))):
            return
        expires_at = datetime.now(UTC) + RETENTION
        records = _result_records(kind, lottery, draw_period, analysis_version, artifact, expires_at.isoformat())
        run = self.runs.get((lottery, draw_period, analysis_version))
        if run is None or run["status"] != "complete" or run["startedAt"] != started_at:
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")
        if not self.has_artifact(lottery, draw_period, analysis_version, kind):
            raise RuntimeError("ANALYSIS_REQUIRED_ARTIFACT_MISSING:" + kind)
        results = self.explore_results if kind == "explore" else self.tianheng_results
        for record in records:
            record["expiresAt"] = expires_at
            results[(lottery, draw_period, analysis_version, record["item_id"])] = record

    def has_explore_results(
        self, lottery: str, draw_period: str, analysis_version: str,
    ) -> bool:
        return any(key[:3] == (lottery, draw_period, analysis_version) for key in self.explore_results)

    def read_artifact_chunks(self, lottery: str, draw_period: str, analysis_version: str, kind: str) -> list[dict[str, Any]]:
        chunks = [
            {"chunk_index": key[4], "cursor_start": record["cursor_start"], "cursor_end": record["cursor_end"], "payload": record["payload"]}
            for key, record in self.artifact_chunks.items()
            if key[:4] == (lottery, draw_period, analysis_version, kind)
        ]
        return sorted(chunks, key=lambda chunk: chunk["chunk_index"])

    def save_tianheng_results(
        self, lottery: str, draw_period: str, analysis_version: str, payload: Any,
        *, owner_id: str | None = None, run_started_at: str | None = None,
    ) -> None:
        self._require_child_write_owner(lottery, draw_period, analysis_version, owner_id, run_started_at)
        expires_at = datetime.now(UTC) + RETENTION
        for record in _tianheng_result_records(
            lottery, draw_period, analysis_version, payload, expires_at.isoformat(),
        ):
            record["expiresAt"] = expires_at
            key = (lottery, draw_period, analysis_version, record["item_id"])
            self.tianheng_results[key] = record

    def has_tianheng_results(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        expected_count: int | None = None,
    ) -> bool:
        count = sum(
            key[:3] == (lottery, draw_period, analysis_version)
            for key in self.tianheng_results
        )
        return count == expected_count if expected_count is not None else count > 0

    def materialize_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, expected_total: int) -> dict[str, Any]:
        return materialize_chunks(
            lottery, draw_period,
            self.read_artifact_chunks(lottery, draw_period, analysis_version, kind),
            expected_total,
            deduplicate_by_id=kind == "tiangong",
        )

    def summarize_artifact(
        self, lottery: str, draw_period: str, analysis_version: str,
        kind: str, expected_total: int,
    ) -> int:
        return summarize_chunks(
            self.read_artifact_chunks(lottery, draw_period, analysis_version, kind),
            expected_total,
            deduplicate_by_id=kind == "tiangong",
        )

    def has_artifact(
        self, lottery: str, draw_period: str, analysis_version: str, kind: str,
    ) -> bool:
        return (lottery, draw_period, analysis_version, kind) in self.artifacts

    def read_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str) -> Any | None:
        record = self.artifacts.get((lottery, draw_period, analysis_version, kind))
        if record is None:
            return None
        payload = record["payload"]
        if isinstance(payload, dict) and payload.get("storage") == "chunks":
            return self.materialize_artifact(lottery, draw_period, analysis_version, kind, payload["total"])
        return payload

    def complete_run(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        completed_at: str,
        *,
        owner_id: str | None = None,
    ) -> None:
        key = (lottery, draw_period, analysis_version)
        run = self.runs.get(key)
        if run is None:
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")
        # Legacy ownerless fixtures are supported only when the run is unowned.
        # Omitting the owner must never bypass a live worker's lease.
        if owner_id is not None or run.get("leaseOwner") is not None:
            if not owner_id or not owner_id.strip() or run.get("status") != "running":
                raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")
            self._require_run_owner(lottery, draw_period, analysis_version, owner_id)
        number_order = "sorted" if analysis_version.endswith("-sorted") else "draw" if analysis_version.endswith("-draw") else None
        if number_order == "draw" and not self._draw_order_eligible(lottery, draw_period):
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")
        available = {artifact_key[3] for artifact_key in self.artifacts if artifact_key[:3] == key}
        if available != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_ARTIFACTS_INCOMPLETE")
        # Recheck expiry immediately before publishing completion and activation.
        self._require_run_owner(lottery, draw_period, analysis_version, owner_id)
        update = {"phase": "complete", "status": "complete", "completedAt": completed_at, "error": None}
        if owner_id is not None:
            update.update({"leaseOwner": None, "leaseExpiresAt": None})
        run.update(update)
        if number_order is not None:
            self.active_versions[(lottery, draw_period, number_order)] = analysis_version

    def _draw_order_eligible(self, lottery: str, draw_period: str) -> bool:
        # Test-double equivalent of private.matrix_analysis_draw_order_eligible.
        draw = self.draws.get((lottery, draw_period))
        if lottery == "天天樂" or draw is None or draw.get("resultStatus", "confirmed") != "confirmed":
            return False
        numbers, ordered = draw.get("numbers"), draw.get("drawOrderNumbers")
        expected = 5 if lottery == "今彩539" else 7
        return (
            isinstance(numbers, list) and isinstance(ordered, list)
            and len(numbers) == len(ordered) == expected
            and all(number in ordered for number in numbers)
            and all(number in numbers for number in ordered)
            and all(number not in ordered[:index] for index, number in enumerate(ordered))
            and (lottery == "今彩539" or ordered[-1] == numbers[-1])
        )

    def fail_run(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        error: str,
        *,
        owner_id: str | None = None,
    ) -> None:
        self._require_run_owner(lottery, draw_period, analysis_version, owner_id)
        update = {"status": "failed", "error": error[:1000]}
        if owner_id is not None:
            update.update({"leaseOwner": None, "leaseExpiresAt": None})
        self.runs[(lottery, draw_period, analysis_version)].update(update)

    def get_progress(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str | None = None,
    ) -> dict[str, Any] | None:
        matches = [
            run
            for key, run in self.runs.items()
            if key[:2] == (lottery, draw_period)
            and (analysis_version is None or key[2] == analysis_version)
        ]
        return dict(max(matches, key=lambda run: run["startedAt"])) if matches else None

    def list_progress_for_periods(
        self,
        lottery: str,
        draw_periods: list[str],
        analysis_name: str,
    ) -> dict[str, dict[str, Any]]:
        progress: dict[str, dict[str, Any]] = {}
        for period in draw_periods:
            run = self.get_progress(
                lottery,
                period,
                f"{period}:{analysis_name}",
            )
            if run is not None:
                progress[period] = run
        return progress

    def read_completed_artifact(self, lottery: str, draw_period: str, kind: str) -> Any | None:
        complete = [run for key, run in self.runs.items() if key[:2] == (lottery, draw_period) and run["status"] == "complete"]
        if not complete:
            return None
        run = max(complete, key=lambda item: item["completedAt"] or "")
        return self.read_artifact(lottery, draw_period, run["analysisVersion"], kind)

    def cleanup_expired(self, now: datetime) -> int:
        # Test-double equivalent of the enabled SQL core. Production predicates
        # live only in private.matrix_analysis_retained_versions().
        cutoff = min(now, datetime.now(UTC))
        completed_periods: dict[str, set[str]] = {}
        running = set()
        for key, run in self.runs.items():
            if run["status"] == "complete":
                completed_periods.setdefault(key[0], set()).add(key[1])
            elif run["status"] == "running":
                running.add(key)
        retained_periods = set()
        for lottery, periods in completed_periods.items():
            ordered = sorted(
                periods,
                key=lambda period: (
                    str(self.draws.get((lottery, period), {}).get("drawDate") or ""),
                    period,
                ),
                reverse=True,
            )
            retained_periods.update((lottery, period) for period in ordered[:3])
        retained_runs = running | {
            (lottery, period, version)
            for (lottery, period, _order), version in self.active_versions.items()
            if (lottery, period) in retained_periods
        }

        # The SQL core fails closed if any required recent slot is damaged.
        for lottery, period in retained_periods:
            orders = ["sorted", "draw"] if self._draw_order_eligible(lottery, period) else ["sorted"]
            for order in orders:
                version = self.active_versions.get((lottery, period, order))
                key = (lottery, period, version)
                if (
                    self.runs.get(key, {}).get("status") != "complete"
                    or any((*key, kind) not in self.artifacts for kind in ARTIFACT_KINDS)
                ):
                    return 0

        removed = 0
        removed_versions = set()
        for collection, batch_size in (
            (self.explore_results, 5000), (self.tianheng_results, 5000),
            (self.artifact_chunks, 2000), (self.artifacts, 500),
        ):
            expired = [
                key for key, record in collection.items()
                if record["expiresAt"] < cutoff
                and key[:3] not in retained_runs
            ][:batch_size]
            for key in expired:
                del collection[key]
                removed_versions.add(key[:3])
            removed += len(expired)
        for key, version in list(self.active_versions.items()):
            if (*key[:2], version) in removed_versions:
                del self.active_versions[key]
        return removed


class SupabaseAnalysisRepository:
    def __init__(self, client: Any) -> None:
        self.client = client

    @staticmethod
    def _one(response: Any) -> dict[str, Any]:
        data = response.data
        return dict(data[0] if isinstance(data, list) else data)

    @staticmethod
    def _normalize_run(run: dict[str, Any]) -> dict[str, Any]:
        normalized = {
            "lottery": run["lottery"],
            "drawPeriod": run["draw_period"],
            "analysisVersion": run["analysis_version"],
            "phase": run["phase"],
            "cursor": run["cursor"],
            "total": run["total"],
            "status": run["status"],
            "startedAt": run["started_at"],
            "completedAt": run.get("completed_at"),
            "error": run.get("error"),
        }
        if "lease_owner" in run:
            normalized["leaseOwner"] = run.get("lease_owner")
        if "lease_expires_at" in run:
            normalized["leaseExpiresAt"] = run.get("lease_expires_at")
        if "lease_acquired" in run:
            normalized["leaseAcquired"] = bool(run.get("lease_acquired"))
        return normalized

    @staticmethod
    def _normalize_draw(draw: dict[str, Any]) -> dict[str, Any]:
        return {
            "period": draw["period"],
            "drawDate": draw.get("draw_date"),
            "numbers": draw["numbers"],
            "sortedNumbers": draw.get("sorted_numbers", draw["numbers"]),
            "drawOrderNumbers": draw.get("draw_order_numbers"),
            "resultStatus": draw.get("result_status", "confirmed"),
        }

    @staticmethod
    def _draw_record(draw: dict[str, Any]) -> dict[str, Any]:
        return {
            "lottery": draw["lottery"], "period": draw["period"],
            "draw_date": draw.get("drawDate") or None,
            "numbers": draw["numbers"],
            "sorted_numbers": draw.get("sortedNumbers", draw["numbers"]),
            "draw_order_numbers": draw.get("drawOrderNumbers"),
            "source_id": draw.get("sourceId"),
            "result_status": draw.get("resultStatus", "confirmed"),
        }

    @staticmethod
    def _normalize_job_status(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "jobName": row["job_name"],
            "lottery": row["lottery"],
            "status": row["status"],
            "startedAt": row["started_at"],
            "finishedAt": row.get("finished_at"),
            "error": "WORKER_FAILED" if row.get("error") else None,
            "sourcePeriod": row.get("source_period"),
            "databasePeriod": row.get("database_period"),
            "writtenPeriod": row.get("written_period"),
            "updatedAt": row["updated_at"],
        }

    @staticmethod
    def _normalize_latest_draw_status(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "period": row["period"],
            "drawDate": row.get("draw_date"),
        }

    @staticmethod
    def _normalize_latest_analysis_status(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "drawPeriod": row["draw_period"],
            "status": row["status"],
            "phase": row["phase"],
            "startedAt": row["started_at"],
            "completedAt": row.get("completed_at"),
            "error": "ANALYSIS_FAILED" if row.get("error") else None,
        }

    def health_check(self) -> None:
        self.client.table("lottery_draws").select("id").limit(1).execute()

    def start_job(self, job_name: str, lottery: str, started_at: str) -> None:
        self.client.table("system_job_status").upsert({
            "job_name": job_name,
            "lottery": lottery,
            "status": "running",
            "started_at": started_at,
            "finished_at": None,
            "error": None,
            "source_period": None,
            "database_period": None,
            "written_period": None,
            "updated_at": started_at,
        }, on_conflict="job_name").execute()

    def finish_job(
        self,
        job_name: str,
        status: str,
        finished_at: str,
        error: str | None = None,
        *,
        source_period: str | None = None,
        database_period: str | None = None,
        written_period: str | None = None,
    ) -> None:
        self.client.table("system_job_status").update({
            "status": status,
            "finished_at": finished_at,
            "error": error,
            "source_period": source_period,
            "database_period": database_period,
            "written_period": written_period,
            "updated_at": finished_at,
        }).eq("job_name", job_name).execute()

    def list_job_statuses(self) -> list[dict[str, Any]]:
        job_response = self.client.table("system_job_status").select(
            "job_name,lottery,status,started_at,finished_at,error,"
            "source_period,database_period,written_period,updated_at"
        ).execute()
        jobs = {str(row["job_name"]): dict(row) for row in job_response.data}
        items: list[dict[str, Any]] = []
        for lottery, job_name in JOB_NAME_BY_LOTTERY.items():
            draw_response = (
                self.client.table("lottery_draws")
                .select("period,draw_date")
                .eq("lottery", lottery)
                .order("draw_date", desc=True, nullsfirst=False)
                .order("period", desc=True)
                .limit(1)
                .execute()
            )
            analysis_response = (
                self.client.table("matrix_analysis_runs")
                .select("draw_period,status,phase,started_at,completed_at,error")
                .eq("lottery", lottery)
                .order("started_at", desc=True)
                .limit(1)
                .execute()
            )
            job = jobs.get(job_name)
            latest_draw = dict(draw_response.data[0]) if draw_response.data else None
            latest_analysis = dict(analysis_response.data[0]) if analysis_response.data else None
            items.append({
                "lottery": lottery,
                "jobName": job_name,
                "job": None if job is None else self._normalize_job_status(job),
                "latestDraw": None if latest_draw is None else self._normalize_latest_draw_status(latest_draw),
                "latestAnalysis": None if latest_analysis is None else self._normalize_latest_analysis_status(latest_analysis),
            })
        return items

    def upsert_draw(self, draw: dict[str, Any]) -> dict[str, Any]:
        stored = self.upsert_draws([draw])[0]
        return {"lottery": stored["lottery"], **self._normalize_draw(stored), "sourceId": stored.get("source_id")}

    def upsert_draws(self, draws: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not draws:
            return []
        records = [self._draw_record(draw) for draw in draws]
        response = self.client.rpc("matrix_upsert_draws", {"p_draws": records}).execute()
        return [dict(record) for record in response.data]

    def get_draw(self, lottery: str, period: str) -> dict[str, Any] | None:
        response = self.client.table("lottery_draws").select(
            "period,draw_date,numbers,sorted_numbers,draw_order_numbers,result_status"
        ).eq("lottery", lottery).eq("period", period).limit(1).execute()
        return self._normalize_draw(response.data[0]) if response.data else None

    def list_draws(self, lottery: str, limit: int | None = None) -> list[dict[str, Any]]:
        if limit is not None and limit <= 0:
            return []

        for _ in range(DRAW_SNAPSHOT_MAX_ATTEMPTS):
            draws = self._list_draw_rows(lottery, limit)
            if not self._has_duplicate_draw_periods(draws):
                return [self._normalize_draw(draw) for draw in draws]
        raise ValueError("DRAW_HISTORY_UNSTABLE")

    def _list_draw_rows(
        self,
        lottery: str,
        limit: int | None,
        since_date: str | None = None,
    ) -> list[dict[str, Any]]:
        draws: list[dict[str, Any]] = []
        offset = 0
        while limit is None or len(draws) < limit:
            page_size = DRAW_PAGE_SIZE if limit is None else min(DRAW_PAGE_SIZE, limit - len(draws))
            query = (
                self.client.table("lottery_draws")
                .select("period,draw_date,numbers,sorted_numbers,draw_order_numbers,result_status")
                .eq("lottery", lottery)
                .order("draw_date", desc=True, nullsfirst=False)
                .order("period", desc=True)
                .range(offset, offset + page_size - 1)
            )
            if since_date is not None:
                query = query.gte("draw_date", since_date)
            response = query.execute()
            page = [dict(draw) for draw in response.data]
            draws.extend(page)
            # A server-side row cap may be smaller than the requested range.
            if not page:
                break
            offset += len(page)

        return draws

    @classmethod
    def _has_duplicate_draw_periods(cls, draws: list[dict[str, Any]]) -> bool:
        payload_by_period: dict[str, tuple[Any, ...]] = {}
        duplicate_found = False
        for raw in draws:
            draw = cls._normalize_draw(raw)
            period = str(draw.get("period") or "").strip()
            payload = (
                str(draw.get("drawDate") or "")
                .strip()
                .replace("/", "-")
                .replace(".", "-")[:10],
                tuple(draw.get("numbers") or ()),
                tuple(draw.get("sortedNumbers") or draw.get("numbers") or ()),
                None
                if draw.get("drawOrderNumbers") is None
                else tuple(draw["drawOrderNumbers"]),
            )
            existing = payload_by_period.get(period)
            if existing is None:
                payload_by_period[period] = payload
                continue
            if existing != payload:
                raise ValueError("DRAW_HISTORY_CONFLICT")
            duplicate_found = True
        return duplicate_found

    def list_draws_since(self, lottery: str, since_date: str) -> list[dict[str, Any]]:
        for _ in range(DRAW_SNAPSHOT_MAX_ATTEMPTS):
            draws = self._list_draw_rows(lottery, None, since_date)
            if not self._has_duplicate_draw_periods(draws):
                return [self._normalize_draw(draw) for draw in draws]
        raise ValueError("DRAW_HISTORY_UNSTABLE")

    def begin_run(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        started_at: str,
        *,
        owner_id: str | None = None,
        lease_seconds: int = ANALYSIS_RUN_LEASE_SECONDS,
    ) -> dict[str, Any]:
        if owner_id is not None:
            response = self.client.rpc("matrix_analysis_acquire_run", {
                "p_lottery": lottery,
                "p_draw_period": draw_period,
                "p_analysis_version": analysis_version,
                "p_owner_id": owner_id,
                "p_started_at": started_at,
                "p_lease_seconds": lease_seconds,
            }).execute()
            return self._normalize_run(self._one(response))
        record = {"lottery": lottery, "draw_period": draw_period, "analysis_version": analysis_version, "phase": "explore", "cursor": 0, "total": 0, "status": "running", "started_at": started_at, "error": None}
        response = self.client.table("matrix_analysis_runs").upsert(record, on_conflict="lottery,draw_period,analysis_version", ignore_duplicates=True).execute()
        if response.data:
            return self._normalize_run(self._one(response))
        existing = self.client.table("matrix_analysis_runs").select("*").eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).single().execute()
        return self._normalize_run(self._one(existing))

    def renew_run_lease(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        owner_id: str,
        lease_seconds: int = ANALYSIS_RUN_LEASE_SECONDS,
    ) -> bool:
        response = self.client.rpc("matrix_analysis_renew_lease", {
            "p_lottery": lottery,
            "p_draw_period": draw_period,
            "p_analysis_version": analysis_version,
            "p_owner_id": owner_id,
            "p_lease_seconds": lease_seconds,
        }).execute()
        data = response.data
        if isinstance(data, list):
            return bool(data[0]) if data else False
        return bool(data)

    def update_progress(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        phase: str,
        cursor: int,
        total: int,
        *,
        owner_id: str | None = None,
    ) -> None:
        query = self.client.table("matrix_analysis_runs").update({"phase": phase, "cursor": cursor, "total": total, "status": "running", "completed_at": None, "error": None}).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version)
        if owner_id is not None:
            query = query.eq("lease_owner", owner_id).gt("lease_expires_at", datetime.now(UTC).isoformat())
        response = query.execute()
        if owner_id is not None and not response.data:
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def _write_owned(
        self, lottery: str, draw_period: str, analysis_version: str,
        owner_id: str, run_started_at: str, target: str, records: list[dict[str, Any]],
    ) -> None:
        if not owner_id or not owner_id.strip() or not run_started_at:
            raise ValueError("ANALYSIS_RUN_OWNER_REQUIRED")
        response = self.client.rpc("matrix_analysis_write_owned", {
            "p_lottery": lottery,
            "p_draw_period": draw_period,
            "p_analysis_version": analysis_version,
            "p_owner_id": owner_id,
            "p_started_at": run_started_at,
            "p_target": target,
            "p_records": records,
        }).execute()
        if response.data is not True:
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any, *, owner_id: str, run_started_at: str) -> None:
        if kind not in ARTIFACT_KINDS:
            raise ValueError("UNKNOWN_ARTIFACT_KIND")
        now = datetime.now(UTC)
        record = {"lottery": lottery, "draw_period": draw_period, "analysis_version": analysis_version, "kind": kind, "payload": payload, "completed_at": now.isoformat(), "expires_at": (now + RETENTION).isoformat()}
        self._write_owned(
            lottery, draw_period, analysis_version, owner_id, run_started_at,
            "matrix_analysis_artifacts", [record],
        )

    def save_artifact_chunk(self, lottery: str, draw_period: str, analysis_version: str, kind: str, chunk_index: int, cursor_start: int, cursor_end: int, payload: Any, *, owner_id: str, run_started_at: str) -> None:
        if kind not in ARTIFACT_KINDS:
            raise ValueError("UNKNOWN_ARTIFACT_KIND")
        now = datetime.now(UTC)
        record = {
            "lottery": lottery, "draw_period": draw_period, "analysis_version": analysis_version,
            "kind": kind, "chunk_index": chunk_index, "cursor_start": cursor_start,
            "cursor_end": cursor_end, "payload": encode_chunk_payload(payload),
            "expires_at": (now + RETENTION).isoformat(),
        }
        self._write_owned(
            lottery, draw_period, analysis_version, owner_id, run_started_at,
            "matrix_analysis_artifact_chunks", [record],
        )

    def save_explore_results(
        self, lottery: str, draw_period: str, analysis_version: str, payload: Any,
        *, owner_id: str, run_started_at: str,
    ) -> None:
        expires_at = (datetime.now(UTC) + RETENTION).isoformat()
        records = _explore_result_records(
            lottery, draw_period, analysis_version, payload, expires_at,
        )
        if not records:
            return
        for start in range(0, len(records), EXPLORE_RESULT_UPSERT_BATCH_SIZE):
            self._write_owned(
                lottery, draw_period, analysis_version, owner_id, run_started_at,
                "matrix_explore_results", records[start:start + EXPLORE_RESULT_UPSERT_BATCH_SIZE],
            )

    def restore_completed_results(
        self, lottery: str, draw_period: str, analysis_version: str, kind: str,
    ) -> None:
        # Capture the completed generation before reading/materializing its saved
        # artifact. The RPC rejects that snapshot if correction recreated the run.
        started_at, artifact = _completed_result_snapshot(self, lottery, draw_period, analysis_version, kind)
        if kind == "explore" and self.has_explore_results(lottery, draw_period, analysis_version):
            return
        if kind == "tianheng" and self.has_tianheng_results(lottery, draw_period, analysis_version, len(artifact.get("items", []))):
            return
        records = _result_records(
            kind, lottery, draw_period, analysis_version, artifact,
            (datetime.now(UTC) + RETENTION).isoformat(),
        )
        batch_size = EXPLORE_RESULT_UPSERT_BATCH_SIZE if kind == "explore" else TIANHENG_RESULT_UPSERT_BATCH_SIZE
        for start in range(0, len(records), batch_size):
            response = self.client.rpc("matrix_analysis_restore_results", {
                "p_lottery": lottery,
                "p_draw_period": draw_period,
                "p_analysis_version": analysis_version,
                "p_started_at": started_at,
                "p_kind": kind,
                "p_records": records[start:start + batch_size],
            }).execute()
            if response.data is not True:
                raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def has_explore_results(
        self, lottery: str, draw_period: str, analysis_version: str,
    ) -> bool:
        response = (
            self.client.table("matrix_explore_results")
            .select("item_id")
            .eq("lottery", lottery)
            .eq("draw_period", draw_period)
            .eq("analysis_version", analysis_version)
            .range(0, 0)
            .execute()
        )
        return bool(response.data)

    def save_tianheng_results(
        self, lottery: str, draw_period: str, analysis_version: str, payload: Any,
        *, owner_id: str, run_started_at: str,
    ) -> None:
        expires_at = (datetime.now(UTC) + RETENTION).isoformat()
        records = _tianheng_result_records(
            lottery, draw_period, analysis_version, payload, expires_at,
        )
        for start in range(0, len(records), TIANHENG_RESULT_UPSERT_BATCH_SIZE):
            self._write_owned(
                lottery, draw_period, analysis_version, owner_id, run_started_at,
                "matrix_tianheng_results", records[start:start + TIANHENG_RESULT_UPSERT_BATCH_SIZE],
            )

    def has_tianheng_results(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        expected_count: int | None = None,
    ) -> bool:
        response = (
            self.client.table("matrix_tianheng_results")
            .select("item_id", count="exact")
            .eq("lottery", lottery)
            .eq("draw_period", draw_period)
            .eq("analysis_version", analysis_version)
            .range(0, 0)
            .execute()
        )
        if expected_count is not None:
            return response.count == expected_count
        return bool(response.data)

    def _iter_artifact_chunks(
        self, lottery: str, draw_period: str, analysis_version: str, kind: str,
    ) -> Iterator[dict[str, Any]]:
        last_chunk_index: int | None = None
        while True:
            query = (
                self.client.table("matrix_analysis_artifact_chunks")
                .select("chunk_index,cursor_start,cursor_end,payload")
                .eq("lottery", lottery)
                .eq("draw_period", draw_period)
                .eq("analysis_version", analysis_version)
                .eq("kind", kind)
                .order("chunk_index")
                .limit(ARTIFACT_CHUNK_PAGE_SIZE)
            )
            if last_chunk_index is not None:
                query = query.gt("chunk_index", last_chunk_index)
            response = query.execute()
            page = [dict(chunk) for chunk in response.data]
            if not page:
                break
            next_chunk_index = int(page[-1]["chunk_index"])
            if last_chunk_index is not None and next_chunk_index <= last_chunk_index:
                raise ValueError("ANALYSIS_CHUNK_PAGINATION_STALLED")
            yield from page
            last_chunk_index = next_chunk_index

    def read_artifact_chunks(self, lottery: str, draw_period: str, analysis_version: str, kind: str) -> list[dict[str, Any]]:
        return list(self._iter_artifact_chunks(
            lottery, draw_period, analysis_version, kind,
        ))

    def materialize_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, expected_total: int) -> dict[str, Any]:
        return materialize_chunks(
            lottery, draw_period,
            self.read_artifact_chunks(lottery, draw_period, analysis_version, kind),
            expected_total,
            deduplicate_by_id=kind == "tiangong",
        )

    def summarize_artifact(
        self, lottery: str, draw_period: str, analysis_version: str,
        kind: str, expected_total: int,
    ) -> int:
        return summarize_chunks(
            self._iter_artifact_chunks(
                lottery, draw_period, analysis_version, kind,
            ),
            expected_total,
            deduplicate_by_id=kind == "tiangong",
        )

    def has_artifact(
        self, lottery: str, draw_period: str, analysis_version: str, kind: str,
    ) -> bool:
        response = (
            self.client.table("matrix_analysis_artifacts")
            .select("kind")
            .eq("lottery", lottery)
            .eq("draw_period", draw_period)
            .eq("analysis_version", analysis_version)
            .eq("kind", kind)
            .range(0, 0)
            .execute()
        )
        return bool(response.data)

    def read_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str) -> Any | None:
        artifact = self.client.table("matrix_analysis_artifacts").select("payload").eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).eq("kind", kind).limit(1).execute()
        if not artifact.data:
            return None
        payload = artifact.data[0]["payload"]
        if isinstance(payload, dict) and payload.get("storage") == "chunks":
            return self.materialize_artifact(lottery, draw_period, analysis_version, kind, payload["total"])
        return payload

    def complete_run(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        completed_at: str,
        *,
        owner_id: str | None = None,
    ) -> None:
        response = self.client.rpc("matrix_analysis_complete_owned", {
            "p_lottery": lottery,
            "p_draw_period": draw_period,
            "p_analysis_version": analysis_version,
            "p_owner_id": owner_id,
            "p_completed_at": completed_at,
        }).execute()
        if response.data is not True:
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def fail_run(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        error: str,
        *,
        owner_id: str | None = None,
    ) -> None:
        update = {"status": "failed", "error": error[:1000]}
        if owner_id is not None:
            update.update({"lease_owner": None, "lease_expires_at": None})
        query = self.client.table("matrix_analysis_runs").update(update).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version)
        if owner_id is not None:
            query = query.eq("lease_owner", owner_id).gt("lease_expires_at", datetime.now(UTC).isoformat())
        response = query.execute()
        if owner_id is not None and not response.data:
            raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")

    def get_progress(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str | None = None,
    ) -> dict[str, Any] | None:
        query = (
            self.client.table("matrix_analysis_runs")
            .select("*")
            .eq("lottery", lottery)
            .eq("draw_period", draw_period)
        )
        if analysis_version is not None:
            query = query.eq("analysis_version", analysis_version)
        response = query.order("started_at", desc=True).limit(1).execute()
        return self._normalize_run(dict(response.data[0])) if response.data else None

    def list_progress_for_periods(
        self,
        lottery: str,
        draw_periods: list[str],
        analysis_name: str,
    ) -> dict[str, dict[str, Any]]:
        if not draw_periods:
            return {}
        analysis_versions = [
            f"{period}:{analysis_name}"
            for period in draw_periods
        ]
        response = (
            self.client.table("matrix_analysis_runs")
            .select("*")
            .eq("lottery", lottery)
            .in_("draw_period", draw_periods)
            .in_("analysis_version", analysis_versions)
            .order("started_at", desc=True)
            .execute()
        )
        progress: dict[str, dict[str, Any]] = {}
        for raw in response.data:
            run = self._normalize_run(dict(raw))
            period = str(run["drawPeriod"])
            if run["analysisVersion"] != f"{period}:{analysis_name}":
                continue
            progress.setdefault(period, run)
        return progress

    def read_completed_artifact(self, lottery: str, draw_period: str, kind: str) -> Any | None:
        runs = self.client.table("matrix_analysis_runs").select("analysis_version").eq("lottery", lottery).eq("draw_period", draw_period).eq("status", "complete").order("completed_at", desc=True).limit(1).execute()
        if not runs.data:
            return None
        version = runs.data[0]["analysis_version"]
        return self.read_artifact(lottery, draw_period, version, kind)

    def cleanup_expired(self, now: datetime) -> int:
        try:
            status = self.client.rpc("matrix_analysis_cleanup_status", {}).execute().data
        except (HTTPError, APIError):
            # A missing/unreachable status RPC may still reach the existing
            # gated, advisory-locked core. Never delete through a second path.
            status = None
        if isinstance(status, dict) and (
            status.get("cleanup_enabled") is False or status.get("cleanup_due") is False
        ):
            return 0
        response = self.client.rpc("matrix_analysis_cleanup_expired", {
            "p_now": now.isoformat(),
        }).execute()
        return int(response.data)


def create_supabase_repository(
    url: str, secret_key: str, *, httpx_client: HttpClient | None = None,
) -> SupabaseAnalysisRepository:
    if not url or not secret_key:
        raise ValueError("SUPABASE_SERVER_CONFIGURATION_MISSING")
    from supabase import create_client
    from supabase.lib.client_options import SyncClientOptions

    options = SyncClientOptions(httpx_client=httpx_client) if httpx_client is not None else None
    return SupabaseAnalysisRepository(create_client(url, secret_key, options=options))


def _completed_result_snapshot(
    repository: AnalysisRepository, lottery: str, draw_period: str, analysis_version: str, kind: str,
) -> tuple[str, Any]:
    if kind not in {"explore", "tianheng"}:
        raise ValueError("UNKNOWN_RESULT_KIND")
    run = repository.get_progress(lottery, draw_period, analysis_version)
    if run is None or run["status"] != "complete":
        raise RuntimeError("ANALYSIS_RUN_LEASE_LOST")
    started_at = str(run["startedAt"])
    artifact = repository.read_artifact(lottery, draw_period, analysis_version, kind)
    if artifact is None:
        raise RuntimeError("ANALYSIS_REQUIRED_ARTIFACT_MISSING:" + kind)
    return started_at, artifact


def _result_records(
    kind: str, lottery: str, draw_period: str, analysis_version: str, payload: Any, expires_at: str,
) -> list[dict[str, Any]]:
    normalize = _explore_result_records if kind == "explore" else _tianheng_result_records
    return normalize(lottery, draw_period, analysis_version, payload, expires_at)


def _tianheng_result_records(
    lottery: str,
    draw_period: str,
    analysis_version: str,
    payload: Any,
    expires_at: str,
) -> list[dict[str, Any]]:
    records = []
    for item in payload.get("items", []):
        item_id = str(item["id"])
        records.append({
            "lottery": lottery,
            "draw_period": draw_period,
            "analysis_version": analysis_version,
            "item_id": item_id,
            "first_number": str(item["firstNumber"]),
            "first_locked_position": int(item["firstLockedPosition"]),
            "second_number": str(item["secondNumber"]),
            "second_locked_position": int(item["secondLockedPosition"]),
            "prediction_distance": int(item["predictionDistance"]),
            "consecutive": str(item["consecutive"]),
            "highest_streak": int(item["highestStreak"]),
            "prediction_numbers": list(item["predictionNumbers"]),
            "algorithm_type": str(item["algorithmType"]),
            "number_order": str(item["numberOrder"]),
            "rule_count": int(item["ruleCount"]),
            "explore_range": str(item["exploreRange"]),
            "locked_source_index": int(item["lockedSourceIndex"]),
            "locked_source_period": str(item["lockedSourcePeriod"]),
            "reference_offset": item.get("referenceOffset"),
            "reference_position": item.get("referencePosition"),
            "item": {key: value for key, value in item.items() if key != "exploreRange"},
            "validation": payload["validationById"].get(item_id, {}),
            "expires_at": expires_at,
        })
    return records


def _explore_result_records(
    lottery: str,
    draw_period: str,
    analysis_version: str,
    payload: Any,
    expires_at: str,
) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    items = payload.get("items", [])
    validations = payload.get("validationById", {})
    if not isinstance(items, list) or not isinstance(validations, dict):
        return []
    records: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict) or not str(item.get("id", "")):
            continue
        item_id = str(item["id"])
        explore_range = str(item.get("exploreRange", "完整範圍"))
        if explore_range not in {"標準範圍", "完整範圍"}:
            continue
        public_item = {
            key: value for key, value in item.items() if key != "exploreRange"
        }
        validation = validations.get(item_id, {})
        records.append({
            "lottery": lottery,
            "draw_period": draw_period,
            "analysis_version": analysis_version,
            "item_id": item_id,
            "number": str(item.get("number", "")),
            "locked_position": int(item.get("lockedPosition", 0)),
            "prediction_distance": int(item.get("predictionDistance", 0)),
            "consecutive": str(item.get("consecutive", "")),
            "highest_streak": int(item.get("highestStreak", 0)),
            "prediction_numbers": [str(value) for value in item.get("predictionNumbers", [])],
            "algorithm_type": str(item.get("algorithmType", "")),
            "number_order": str(item.get("numberOrder", "")),
            "rule_count": int(item.get("ruleCount", 0)),
            "explore_range": explore_range,
            "locked_source_index": int(item.get("lockedSourceIndex", 0)),
            "locked_source_period": str(item.get("lockedSourcePeriod", "")),
            "reference_offset": item.get("referenceOffset"),
            "reference_position": item.get("referencePosition"),
            "item": public_item,
            "validation": validation if isinstance(validation, dict) else {},
            "expires_at": expires_at,
        })
    return records
