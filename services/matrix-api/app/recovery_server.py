from __future__ import annotations

from collections.abc import Callable
from os import environ
from typing import Any
from urllib.parse import urlsplit

from app.api_server import (
    MAX_REQUEST_BODY_BYTES,
    BoundedApiServer,
    RailwayApiHandler,
    create_repository,
    handle_api_request,
    run_lottery_recovery,
)
from app.fantasy5_crawler import run_fantasy5_crawler_once
from app.recovery import RecoveryCoordinator
from app.repositories.analysis_repository import AnalysisRepository
from app.security_monitor import SecurityMonitor
from app.settings import load_settings
from app.watchdog_lease import (
    begin_recovery_lease,
    release_recovery_lease,
    renew_recovery_lease,
    terminate_on_lease_loss,
)


SERVICE_NAME = "matrix-railway-recovery"
GET_PATHS = {"/health", "/jobs/status"}
POST_PATHS = {"/jobs/refresh", "/jobs/recover", "/jobs/result-ready"}


def _service_version() -> str:
    return (
        environ.get("MATRIX_SERVICE_VERSION", "").strip()
        or environ.get("RAILWAY_GIT_COMMIT_SHA", "").strip()
        or "unknown"
    )


def _health(repository: AnalysisRepository) -> tuple[int, dict[str, Any]]:
    try:
        repository.health_check()
    except Exception:
        status = "error"
        code = 503
    else:
        status = "ok"
        code = 200
    return code, {
        "status": status,
        "service": SERVICE_NAME,
        "version": _service_version(),
        "database": {"status": status},
    }


def run_full_lottery_recovery(
    lottery: str,
    *,
    fantasy5_crawler: Callable[[], dict[str, Any]] | None = None,
    downstream_recovery: Callable[[str], None] | None = None,
) -> None:
    if lottery == "天天樂":
        result = (fantasy5_crawler or run_fantasy5_crawler_once)()
        status = str(result.get("status") or "")
        if status == "not-acquired":
            return
        if status not in {"acquired", "already-acquired"}:
            raise RuntimeError("FANTASY5_RECOVERY_INVALID_STATUS")
    (downstream_recovery or run_lottery_recovery)(lottery)


_RECOVERY_COORDINATOR = RecoveryCoordinator(
    run_full_lottery_recovery,
    begin_lease=begin_recovery_lease,
    renew_lease=renew_recovery_lease,
    release_lease=release_recovery_lease,
    on_lease_lost=terminate_on_lease_loss,
)


def handle_recovery_request(
    method: str,
    target: str,
    body: bytes | None,
    repository: AnalysisRepository,
    request_monitor_token: str | None = None,
    refresh_lottery: Callable[[str, AnalysisRepository], dict[str, Any]] | None = None,
    recover_lottery: Callable[[str, str], str] | None = None,
    request_notification_token: str | None = None,
) -> tuple[int, dict[str, Any]]:
    path = urlsplit(target).path
    if method == "GET" and path == "/health":
        return _health(repository)
    if (
        (method == "GET" and path not in GET_PATHS)
        or (method == "POST" and path not in POST_PATHS)
        or method not in {"GET", "POST"}
    ):
        return 404, {"error": "NOT_FOUND"}
    return handle_api_request(
        method,
        target,
        body,
        repository,
        request_monitor_token=request_monitor_token,
        refresh_lottery=refresh_lottery,
        recover_lottery=recover_lottery or _RECOVERY_COORDINATOR.enqueue,
        request_notification_token=request_notification_token,
    )


class RecoveryApiHandler(RailwayApiHandler):
    """Expose only recovery/job routes on a process isolated from the public API."""

    def do_GET(self) -> None:
        if not self._security_before("GET"):
            return
        path = urlsplit(self.path).path
        status, payload = handle_recovery_request(
            "GET",
            self.path,
            None,
            self.repository,
            request_monitor_token=self.headers.get("X-Matrix-Admin-Token"),
            request_notification_token=self.headers.get("X-Matrix-Notification-Token"),
        )
        protected = path.startswith("/jobs/")
        self._send(
            status,
            payload,
            allow_cors=not protected,
            no_store=protected,
        )

    def do_POST(self) -> None:
        if not self._security_before("POST"):
            return
        path = urlsplit(self.path).path
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        protected = path.startswith("/jobs/")
        if length > MAX_REQUEST_BODY_BYTES:
            self._send(
                413,
                {"error": "PAYLOAD_TOO_LARGE"},
                allow_cors=not protected,
                no_store=True,
            )
            return
        body = self.rfile.read(length) if length > 0 else b""
        status, payload = handle_recovery_request(
            "POST",
            self.path,
            body,
            self.repository,
            request_monitor_token=self.headers.get("X-Matrix-Admin-Token"),
            request_notification_token=self.headers.get("X-Matrix-Notification-Token"),
        )
        self._send(
            status,
            payload,
            allow_cors=not protected,
            no_store=True,
        )


def main() -> None:
    host = "0.0.0.0"
    port = int(environ.get("PORT", "8000"))
    RecoveryApiHandler.repository = create_repository()
    settings = load_settings()
    RecoveryApiHandler.security_monitor = SecurityMonitor(
        settings.supabase_url,
        settings.supabase_secret_key,
        enforce=environ.get("MATRIX_SECURITY_ENFORCE", "") == "true",
        trust_direct_peer=environ.get("MATRIX_SECURITY_TRUST_DIRECT_PEER", "") == "true",
    )
    server = BoundedApiServer((host, port), RecoveryApiHandler)
    print(f"Railway Matrix recovery API listening on {host}:{port}")
    try:
        server.serve_forever()
    finally:
        RecoveryApiHandler.security_monitor.close()
        server.server_close()


if __name__ == "__main__":
    main()
