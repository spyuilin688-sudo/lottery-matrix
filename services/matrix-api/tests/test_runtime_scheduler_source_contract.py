from __future__ import annotations

import re
from pathlib import Path


REPO = Path(__file__).resolve().parents[3]


def test_matrix_analysis_workflow_is_manual_recovery_only() -> None:
    workflow = (REPO / ".github" / "workflows" / "matrix-analysis.yml").read_text(
        encoding="utf-8",
    )

    assert re.search(r"(?m)^\s{2}workflow_dispatch:\s*$", workflow)
    assert not re.search(r"(?m)^\s{2}push:\s*$", workflow)


def test_watchdog_reads_canonical_draw_day_calendar_from_supabase() -> None:
    source = (REPO / "apps" / "admin" / "backend" / "watchdog.ts").read_text(
        encoding="utf-8",
    )

    assert "rpc/matrix_watchdog_draw_days" in source
    assert "function isPrimaryDrawDay" not in source


def test_pilio_and_watchdog_share_the_canonical_draw_day_resolver() -> None:
    migrations = REPO / "supabase" / "migrations"
    matches = sorted(migrations.glob("*canonical_draw_day_runtime*.sql"))

    assert matches, "missing canonical draw-day runtime migration"
    sql = matches[-1].read_text(encoding="utf-8")
    assert "private.notification_is_draw_day('今彩539', v_date)" in sql
    assert "private.notification_is_draw_day('大樂透', v_date)" in sql
    assert "private.notification_is_draw_day('六合彩', v_date)" in sql
    assert "matrix_watchdog_draw_days" in sql
