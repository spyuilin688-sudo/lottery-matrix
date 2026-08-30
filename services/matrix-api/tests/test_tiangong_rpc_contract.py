from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = ROOT / "supabase" / "migrations" / "20260831030000_tiangong_two_stage_ready2_only.sql"


def test_tiangong_rpc_only_accepts_two_stage_ready2() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")

    assert "v_mode is distinct from 'two-stage'" in sql
    assert "v_hit is distinct from '準2進3'" in sql
    assert "v_mode = 'one-stage'" not in sql
