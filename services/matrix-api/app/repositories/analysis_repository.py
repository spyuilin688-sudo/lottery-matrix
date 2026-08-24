from datetime import UTC, datetime, timedelta
from typing import Any, Protocol


ARTIFACT_KINDS = {"explore", "tianyan", "tiangong", "status"}
RETENTION = timedelta(days=3)


class AnalysisRepository(Protocol):
    def upsert_draw(self, draw: dict[str, Any]) -> dict[str, Any]: ...
    def begin_run(self, lottery: str, draw_period: str, analysis_version: str, started_at: str) -> dict[str, Any]: ...
    def update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int) -> None: ...
    def save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any) -> None: ...
    def complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str) -> None: ...
    def fail_run(self, lottery: str, draw_period: str, analysis_version: str, error: str) -> None: ...
    def get_progress(self, lottery: str, draw_period: str) -> dict[str, Any] | None: ...
    def read_completed_artifact(self, lottery: str, draw_period: str, kind: str) -> Any | None: ...
    def cleanup_expired(self, now: datetime) -> int: ...


class InMemoryAnalysisRepository:
    def __init__(self) -> None:
        self.draws: dict[tuple[str, str], dict[str, Any]] = {}
        self.runs: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.artifacts: dict[tuple[str, str, str, str], dict[str, Any]] = {}

    def upsert_draw(self, draw: dict[str, Any]) -> dict[str, Any]:
        stored = dict(draw)
        self.draws[(stored["lottery"], stored["period"])] = stored
        return stored

    def begin_run(self, lottery: str, draw_period: str, analysis_version: str, started_at: str) -> dict[str, Any]:
        key = (lottery, draw_period, analysis_version)
        if key not in self.runs:
            self.runs[key] = {
                "lottery": lottery, "drawPeriod": draw_period, "analysisVersion": analysis_version,
                "phase": "explore", "cursor": 0, "total": 0, "status": "running",
                "startedAt": started_at, "completedAt": None, "error": None,
            }
        return dict(self.runs[key])

    def update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int) -> None:
        self.runs[(lottery, draw_period, analysis_version)].update({"phase": phase, "cursor": cursor, "total": total})

    def save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any) -> None:
        if kind not in ARTIFACT_KINDS:
            raise ValueError("UNKNOWN_ARTIFACT_KIND")
        self.artifacts[(lottery, draw_period, analysis_version, kind)] = {
            "payload": payload, "expiresAt": datetime.now(UTC) + RETENTION,
        }

    def complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str) -> None:
        available = {key[3] for key in self.artifacts if key[:3] == (lottery, draw_period, analysis_version)}
        if available != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_ARTIFACTS_INCOMPLETE")
        self.runs[(lottery, draw_period, analysis_version)].update({"phase": "complete", "status": "complete", "completedAt": completed_at, "error": None})

    def fail_run(self, lottery: str, draw_period: str, analysis_version: str, error: str) -> None:
        self.runs[(lottery, draw_period, analysis_version)].update({"status": "failed", "error": error[:1000]})

    def get_progress(self, lottery: str, draw_period: str) -> dict[str, Any] | None:
        matches = [run for key, run in self.runs.items() if key[:2] == (lottery, draw_period)]
        return dict(max(matches, key=lambda run: run["startedAt"])) if matches else None

    def read_completed_artifact(self, lottery: str, draw_period: str, kind: str) -> Any | None:
        complete = [run for key, run in self.runs.items() if key[:2] == (lottery, draw_period) and run["status"] == "complete"]
        if not complete:
            return None
        run = max(complete, key=lambda item: item["completedAt"] or "")
        record = self.artifacts.get((lottery, draw_period, run["analysisVersion"], kind))
        return None if record is None else record["payload"]

    def cleanup_expired(self, now: datetime) -> int:
        expired = [key for key, record in self.artifacts.items() if record["expiresAt"] < now]
        for key in expired:
            del self.artifacts[key]
        return len(expired)


class SupabaseAnalysisRepository:
    def __init__(self, client: Any) -> None:
        self.client = client

    @staticmethod
    def _one(response: Any) -> dict[str, Any]:
        data = response.data
        return dict(data[0] if isinstance(data, list) else data)

    @staticmethod
    def _normalize_run(run: dict[str, Any]) -> dict[str, Any]:
        return {
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

    def upsert_draw(self, draw: dict[str, Any]) -> dict[str, Any]:
        record = {
            "lottery": draw["lottery"], "period": draw["period"], "draw_date": draw.get("drawDate") or None,
            "numbers": draw["numbers"], "sorted_numbers": draw.get("sortedNumbers", draw["numbers"]),
            "draw_order_numbers": draw.get("drawOrderNumbers"), "source_id": draw.get("sourceId"),
        }
        response = self.client.table("lottery_draws").upsert(record, on_conflict="lottery,period").execute()
        return self._one(response)

    def begin_run(self, lottery: str, draw_period: str, analysis_version: str, started_at: str) -> dict[str, Any]:
        record = {"lottery": lottery, "draw_period": draw_period, "analysis_version": analysis_version, "phase": "explore", "cursor": 0, "total": 0, "status": "running", "started_at": started_at, "error": None}
        response = self.client.table("matrix_analysis_runs").upsert(record, on_conflict="lottery,draw_period,analysis_version", ignore_duplicates=True).execute()
        if response.data:
            return self._normalize_run(self._one(response))
        existing = self.client.table("matrix_analysis_runs").select("*").eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).single().execute()
        return self._normalize_run(self._one(existing))

    def update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int) -> None:
        self.client.table("matrix_analysis_runs").update({"phase": phase, "cursor": cursor, "total": total}).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()

    def save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any) -> None:
        if kind not in ARTIFACT_KINDS:
            raise ValueError("UNKNOWN_ARTIFACT_KIND")
        now = datetime.now(UTC)
        record = {"lottery": lottery, "draw_period": draw_period, "analysis_version": analysis_version, "kind": kind, "payload": payload, "completed_at": now.isoformat(), "expires_at": (now + RETENTION).isoformat()}
        self.client.table("matrix_analysis_artifacts").upsert(record, on_conflict="lottery,draw_period,analysis_version,kind").execute()

    def complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str) -> None:
        response = self.client.table("matrix_analysis_artifacts").select("kind").eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()
        if {row["kind"] for row in response.data} != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_ARTIFACTS_INCOMPLETE")
        self.client.table("matrix_analysis_runs").update({"phase": "complete", "status": "complete", "completed_at": completed_at, "error": None}).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()

    def fail_run(self, lottery: str, draw_period: str, analysis_version: str, error: str) -> None:
        self.client.table("matrix_analysis_runs").update({"status": "failed", "error": error[:1000]}).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()

    def get_progress(self, lottery: str, draw_period: str) -> dict[str, Any] | None:
        response = self.client.table("matrix_analysis_runs").select("*").eq("lottery", lottery).eq("draw_period", draw_period).order("started_at", desc=True).limit(1).execute()
        return self._normalize_run(dict(response.data[0])) if response.data else None

    def read_completed_artifact(self, lottery: str, draw_period: str, kind: str) -> Any | None:
        runs = self.client.table("matrix_analysis_runs").select("analysis_version").eq("lottery", lottery).eq("draw_period", draw_period).eq("status", "complete").order("completed_at", desc=True).limit(1).execute()
        if not runs.data:
            return None
        version = runs.data[0]["analysis_version"]
        artifact = self.client.table("matrix_analysis_artifacts").select("payload").eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", version).eq("kind", kind).limit(1).execute()
        return artifact.data[0]["payload"] if artifact.data else None

    def cleanup_expired(self, now: datetime) -> int:
        expired = self.client.table("matrix_analysis_artifacts").select("id").lt("expires_at", now.isoformat()).execute()
        if expired.data:
            self.client.table("matrix_analysis_artifacts").delete().lt("expires_at", now.isoformat()).execute()
        return len(expired.data)


def create_supabase_repository(url: str, secret_key: str) -> SupabaseAnalysisRepository:
    if not url or not secret_key:
        raise ValueError("SUPABASE_SERVER_CONFIGURATION_MISSING")
    from supabase import create_client

    return SupabaseAnalysisRepository(create_client(url, secret_key))
