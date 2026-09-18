from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = ROOT / "supabase" / "migrations" / "20260831210046_matrix_tiangong_python_rpc_after_v8.sql"


def test_tiangong_rpc_requires_attachment_filters_and_authenticated_access() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")

    assert "v_explore = '[]'::jsonb" in sql
    assert "v_first_directions = '[]'::jsonb" in sql
    assert "v_second_roads = '[]'::jsonb" in sql
    assert "v_mode" not in sql
    assert "v_hit" not in sql
    assert "revoke all on function public.matrix_tiangong_list(jsonb) from public, anon, authenticated;" in sql
    assert "grant execute on function public.matrix_tiangong_list(jsonb) to authenticated;" in sql
