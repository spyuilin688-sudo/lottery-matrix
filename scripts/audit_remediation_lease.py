from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


# Repository contract + in-memory implementation + Supabase implementation.
path = "services/matrix-api/app/repositories/analysis_repository.py"
text = read(path)
text = replace_once(
    text,
    "EXPLORE_RESULT_UPSERT_BATCH_SIZE = 100\n",
    "EXPLORE_RESULT_UPSERT_BATCH_SIZE = 100\nANALYSIS_RUN_LEASE_SECONDS = 300\n",
    "lease constant",
)
text = replace_once(
    text,
    "    def begin_run(self, lottery: str, draw_period: str, analysis_version: str, started_at: str) -> dict[str, Any]: ...\n"
    "    def update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int) -> None: ...\n",
    "    def begin_run(self, lottery: str, draw_period: str, analysis_version: str, started_at: str, *, owner_id: str | None = None, lease_seconds: int = ANALYSIS_RUN_LEASE_SECONDS) -> dict[str, Any]: ...\n"
    "    def renew_run_lease(self, lottery: str, draw_period: str, analysis_version: str, owner_id: str, lease_seconds: int = ANALYSIS_RUN_LEASE_SECONDS) -> bool: ...\n"
    "    def update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int, *, owner_id: str | None = None) -> None: ...\n",
    "repository lease protocol begin/update",
)
text = replace_once(
    text,
    "    def complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str) -> None: ...\n"
    "    def fail_run(self, lottery: str, draw_period: str, analysis_version: str, error: str) -> None: ...\n",
    "    def complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str, *, owner_id: str | None = None) -> None: ...\n"
    "    def fail_run(self, lottery: str, draw_period: str, analysis_version: str, error: str, *, owner_id: str | None = None) -> None: ...\n",
    "repository lease protocol completion",
)
old_in_memory = '''    def begin_run(self, lottery: str, draw_period: str, analysis_version: str, started_at: str) -> dict[str, Any]:
        key = (lottery, draw_period, analysis_version)
        if key not in self.runs:
            self.runs[key] = {
                "lottery": lottery, "drawPeriod": draw_period, "analysisVersion": analysis_version,
                "phase": "explore", "cursor": 0, "total": 0, "status": "running",
                "startedAt": started_at, "completedAt": None, "error": None,
            }
        return dict(self.runs[key])

    def update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int) -> None:
        self.runs[(lottery, draw_period, analysis_version)].update({"phase": phase, "cursor": cursor, "total": total, "status": "running", "completedAt": None, "error": None})
'''
new_in_memory = '''    @staticmethod
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
        run = self.runs[(lottery, draw_period, analysis_version)]
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
        if run.get("status") == "complete":
            return {**run, "leaseAcquired": False}
        current_expiry_raw = run.get("leaseExpiresAt")
        current_expiry = (
            self._lease_datetime(str(current_expiry_raw))
            if current_expiry_raw else None
        )
        can_acquire = (
            run.get("status") == "failed"
            or not run.get("leaseOwner")
            or run.get("leaseOwner") == owner_id
            or current_expiry is None
            or current_expiry <= now
        )
        if can_acquire:
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
'''
text = replace_once(text, old_in_memory, new_in_memory, "in-memory run lease")
text = replace_once(
    text,
    '''    def complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str) -> None:
        available = {key[3] for key in self.artifacts if key[:3] == (lottery, draw_period, analysis_version)}
        if available != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_ARTIFACTS_INCOMPLETE")
        self.runs[(lottery, draw_period, analysis_version)].update({"phase": "complete", "status": "complete", "completedAt": completed_at, "error": None})

    def fail_run(self, lottery: str, draw_period: str, analysis_version: str, error: str) -> None:
        self.runs[(lottery, draw_period, analysis_version)].update({"status": "failed", "error": error[:1000]})
''',
    '''    def complete_run(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        completed_at: str,
        *,
        owner_id: str | None = None,
    ) -> None:
        available = {key[3] for key in self.artifacts if key[:3] == (lottery, draw_period, analysis_version)}
        if available != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_ARTIFACTS_INCOMPLETE")
        self._require_run_owner(lottery, draw_period, analysis_version, owner_id)
        update = {"phase": "complete", "status": "complete", "completedAt": completed_at, "error": None}
        if owner_id is not None:
            update.update({"leaseOwner": None, "leaseExpiresAt": None})
        self.runs[(lottery, draw_period, analysis_version)].update(update)

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
''',
    "in-memory complete/fail lease",
)
text = replace_once(
    text,
    '''    @staticmethod
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
''',
    '''    @staticmethod
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
''',
    "normalize run lease",
)
old_supabase = '''    def begin_run(self, lottery: str, draw_period: str, analysis_version: str, started_at: str) -> dict[str, Any]:
        record = {"lottery": lottery, "draw_period": draw_period, "analysis_version": analysis_version, "phase": "explore", "cursor": 0, "total": 0, "status": "running", "started_at": started_at, "error": None}
        response = self.client.table("matrix_analysis_runs").upsert(record, on_conflict="lottery,draw_period,analysis_version", ignore_duplicates=True).execute()
        if response.data:
            return self._normalize_run(self._one(response))
        existing = self.client.table("matrix_analysis_runs").select("*").eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).single().execute()
        return self._normalize_run(self._one(existing))

    def update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int) -> None:
        self.client.table("matrix_analysis_runs").update({"phase": phase, "cursor": cursor, "total": total, "status": "running", "completed_at": None, "error": None}).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()
'''
new_supabase = '''    def begin_run(
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
'''
text = replace_once(text, old_supabase, new_supabase, "Supabase begin/update lease")
text = replace_once(
    text,
    '''    def complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str) -> None:
        response = self.client.table("matrix_analysis_artifacts").select("kind").eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()
        if {row["kind"] for row in response.data} != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_ARTIFACTS_INCOMPLETE")
        self.client.table("matrix_analysis_runs").update({"phase": "complete", "status": "complete", "completed_at": completed_at, "error": None}).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()

    def fail_run(self, lottery: str, draw_period: str, analysis_version: str, error: str) -> None:
        self.client.table("matrix_analysis_runs").update({"status": "failed", "error": error[:1000]}).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()
''',
    '''    def complete_run(
        self,
        lottery: str,
        draw_period: str,
        analysis_version: str,
        completed_at: str,
        *,
        owner_id: str | None = None,
    ) -> None:
        response = self.client.table("matrix_analysis_artifacts").select("kind").eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version).execute()
        if {row["kind"] for row in response.data} != ARTIFACT_KINDS:
            raise ValueError("ANALYSIS_ARTIFACTS_INCOMPLETE")
        update = {"phase": "complete", "status": "complete", "completed_at": completed_at, "error": None}
        if owner_id is not None:
            update.update({"lease_owner": None, "lease_expires_at": None})
        query = self.client.table("matrix_analysis_runs").update(update).eq("lottery", lottery).eq("draw_period", draw_period).eq("analysis_version", analysis_version)
        if owner_id is not None:
            query = query.eq("lease_owner", owner_id).gt("lease_expires_at", datetime.now(UTC).isoformat())
        update_response = query.execute()
        if owner_id is not None and not update_response.data:
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
''',
    "Supabase complete/fail lease",
)
write(path, text)


# Pipeline: one owner per pipeline instance, renewal before every persistence boundary.
path = "services/matrix-api/app/services/analysis_pipeline.py"
text = read(path)
text = replace_once(text, "from typing import Any\n", "from typing import Any\nfrom uuid import uuid4\n", "pipeline uuid import")
text = replace_once(
    text,
    "from app.repositories.analysis_repository import ARTIFACT_KINDS, AnalysisRepository\n",
    "from app.repositories.analysis_repository import (\n    ANALYSIS_RUN_LEASE_SECONDS,\n    ARTIFACT_KINDS,\n    AnalysisRepository,\n)\n",
    "pipeline lease import",
)
text = replace_once(
    text,
    "        self.explore_batch_size = max(1, explore_batch_size)\n",
    "        self.explore_batch_size = max(1, explore_batch_size)\n"
    "        self.owner_id = uuid4().hex\n"
    "        self.lease_seconds = ANALYSIS_RUN_LEASE_SECONDS\n",
    "pipeline owner init",
)
text = replace_once(
    text,
    "        run = self.repository.begin_run(lottery, period, self.analysis_version, datetime.now(UTC).isoformat())\n"
    "        if run[\"status\"] == \"complete\":\n"
    "            return {**run, \"skipped\": True}\n",
    "        run = self.repository.begin_run(\n"
    "            lottery, period, self.analysis_version, datetime.now(UTC).isoformat(),\n"
    "            owner_id=self.owner_id, lease_seconds=self.lease_seconds,\n"
    "        )\n"
    "        if run[\"status\"] == \"complete\":\n"
    "            return {**run, \"skipped\": True}\n"
    "        if run.get(\"leaseAcquired\") is False:\n"
    "            return {**run, \"skipped\": True}\n",
    "pipeline acquire lease",
)
if text.count("                    built = self.builders[phase](context)\n") != 1:
    raise SystemExit("explore builder location changed")
text = text.replace(
    "                    built = self.builders[phase](context)\n",
    "                    self._require_lease(lottery, period)\n                    built = self.builders[phase](context)\n",
    1,
)
if text.count("                built = self.builders[phase](context)\n") != 1:
    raise SystemExit("phase builder location changed")
text = text.replace(
    "                built = self.builders[phase](context)\n",
    "                self._require_lease(lottery, period)\n                built = self.builders[phase](context)\n",
    1,
)
text = text.replace("self.repository.save_artifact_chunk(", "self._save_artifact_chunk(")
text = text.replace("self.repository.save_explore_results(", "self._save_explore_results(")
text = text.replace("self.repository.update_progress(", "self._update_progress(")
text = text.replace("self.repository.save_artifact(", "self._save_artifact(")
text = text.replace("self.repository.complete_run(", "self._complete_run(")
text = replace_once(
    text,
    "        except Exception as error:\n            self.repository.fail_run(lottery, period, self.analysis_version, str(error))\n            raise\n\n    def _hydrate_dependencies(\n",
    "        except Exception as error:\n"
    "            try:\n"
    "                self.repository.fail_run(\n"
    "                    lottery, period, self.analysis_version, str(error),\n"
    "                    owner_id=self.owner_id,\n"
    "                )\n"
    "            except RuntimeError as lease_error:\n"
    "                if str(lease_error) != \"ANALYSIS_RUN_LEASE_LOST\":\n"
    "                    raise\n"
    "            raise\n\n"
    "    def _require_lease(self, lottery: str, period: str) -> None:\n"
    "        if not self.repository.renew_run_lease(\n"
    "            lottery, period, self.analysis_version, self.owner_id,\n"
    "            lease_seconds=self.lease_seconds,\n"
    "        ):\n"
    "            raise RuntimeError(\"ANALYSIS_RUN_LEASE_LOST\")\n\n"
    "    def _save_artifact(self, lottery: str, draw_period: str, analysis_version: str, kind: str, payload: Any) -> None:\n"
    "        self._require_lease(lottery, draw_period)\n"
    "        self.repository.save_artifact(lottery, draw_period, analysis_version, kind, payload)\n\n"
    "    def _save_artifact_chunk(self, lottery: str, draw_period: str, analysis_version: str, kind: str, chunk_index: int, cursor_start: int, cursor_end: int, payload: Any) -> None:\n"
    "        self._require_lease(lottery, draw_period)\n"
    "        self.repository.save_artifact_chunk(lottery, draw_period, analysis_version, kind, chunk_index, cursor_start, cursor_end, payload)\n\n"
    "    def _save_explore_results(self, lottery: str, draw_period: str, analysis_version: str, payload: Any) -> None:\n"
    "        self._require_lease(lottery, draw_period)\n"
    "        self.repository.save_explore_results(lottery, draw_period, analysis_version, payload)\n\n"
    "    def _update_progress(self, lottery: str, draw_period: str, analysis_version: str, phase: str, cursor: int, total: int) -> None:\n"
    "        self._require_lease(lottery, draw_period)\n"
    "        self.repository.update_progress(\n"
    "            lottery, draw_period, analysis_version, phase, cursor, total,\n"
    "            owner_id=self.owner_id,\n"
    "        )\n\n"
    "    def _complete_run(self, lottery: str, draw_period: str, analysis_version: str, completed_at: str) -> None:\n"
    "        self._require_lease(lottery, draw_period)\n"
    "        self.repository.complete_run(\n"
    "            lottery, draw_period, analysis_version, completed_at,\n"
    "            owner_id=self.owner_id,\n"
    "        )\n\n"
    "    def _hydrate_dependencies(\n",
    "pipeline lease helpers",
)
write(path, text)


# A live lease owned elsewhere is not a reason to spin the same invocation 450 times.
path = "services/matrix-api/app/worker.py"
text = read(path)
text = replace_once(
    text,
    "        if result.get(\"status\") != \"running\":\n            return result\n",
    "        if result.get(\"leaseAcquired\") is False:\n            return result\n"
    "        if result.get(\"status\") != \"running\":\n            return result\n",
    "worker lease-held exit",
)
write(path, text)


# Existing spy adopts the expanded optional owner keyword without changing its assertions.
path = "services/matrix-api/tests/test_analysis_pipeline.py"
text = read(path)
text = replace_once(
    text,
    '''    def update_progress(
        self, lottery: str, draw_period: str, analysis_version: str,
        phase: str, cursor: int, total: int,
    ) -> None:
        self.calls.append(f"update_progress:{phase}:{cursor}")
        super().update_progress(lottery, draw_period, analysis_version, phase, cursor, total)
''',
    '''    def update_progress(
        self, lottery: str, draw_period: str, analysis_version: str,
        phase: str, cursor: int, total: int, *, owner_id: str | None = None,
    ) -> None:
        self.calls.append(f"update_progress:{phase}:{cursor}")
        super().update_progress(
            lottery, draw_period, analysis_version, phase, cursor, total,
            owner_id=owner_id,
        )
''',
    "pipeline repository spy owner keyword",
)
write(path, text)

print("matrix analysis lease patch applied")
