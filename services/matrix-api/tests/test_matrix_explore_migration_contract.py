from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260830105558_matrix_python_v6_explore_results.sql"
)
SQL = SQL_PATH.read_text(encoding="utf-8")
REPAIR_SQL_PATHS = (
    ROOT / "supabase" / "migrations" / "20260830220000_fix_matrix_v6_rpc_nullif.sql",
    ROOT / "supabase" / "migrations" / "20260830221500_fix_matrix_v6_rpc_coalesce.sql",
)
ENTITLEMENT_REPAIR_SQL_PATH = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260830223000_fix_matrix_entitlement_coalesce.sql"
)


def test_v6_uses_indexable_canonical_rows_instead_of_compressed_chunks() -> None:
    assert "create table if not exists public.matrix_explore_results" in SQL
    assert "references public.matrix_analysis_runs" in SQL
    assert "on delete cascade" in SQL
    assert "enable row level security" in SQL
    assert "from public.matrix_analysis_artifact_chunks" not in SQL
    assert "chunk.payload->'items'" not in SQL


def test_v6_list_filters_canonical_periods_and_today_only() -> None:
    assert "result.locked_source_index < v_periods" in SQL
    assert "v_offset is distinct from 0" in SQL
    assert "run.draw_period || ':matrix-python-v6'" in SQL
    assert "'explorePeriods', v_periods" in SQL
    assert "'exploreDateOffset', 0" in SQL


def test_same_code_compares_whole_prediction_arrays_and_stats_stop_at_18() -> None:
    assert "group by prediction_numbers" in SQL
    assert "same_groups.prediction_numbers = base.prediction_numbers" in SQL
    assert "limit 18" in SQL
    assert "prediction_numbers ? v_prediction_number" in SQL


def test_validation_reads_the_same_canonical_row_and_rechecks_access_scope() -> None:
    assert "select result.validation into v_validation" in SQL
    assert "result.item_id = v_item_id" in SQL
    assert "result.locked_source_index < v_periods" in SQL
    assert "v_range = '完整範圍'" in SQL


def test_unapplied_broken_v5_migration_is_removed() -> None:
    assert not (
        ROOT / "supabase" / "migrations" / "20260830083001_require_matrix_python_v5.sql"
    ).exists()


def test_v6_rpc_uses_nullif_expression_and_has_a_production_repair_migration() -> None:
    assert "pg_catalog.nullif" not in SQL
    assert "pg_catalog.coalesce" not in SQL
    for repair_path in REPAIR_SQL_PATHS:
        repair_sql = repair_path.read_text(encoding="utf-8")
        assert "pg_catalog.nullif" not in repair_sql
        assert "pg_catalog.coalesce" not in repair_sql
        for function_name in ("matrix_explore_list", "matrix_explore_validation"):
            marker = f"create or replace function public.{function_name}"
            canonical = marker + SQL.split(marker, 1)[1].split("$$;", 1)[0] + "$$;"
            repair = marker + repair_sql.split(marker, 1)[1].split("$$;", 1)[0] + "$$;"
            assert repair == canonical


def test_logged_in_matrix_entitlements_have_a_safe_production_repair() -> None:
    repair_sql = ENTITLEMENT_REPAIR_SQL_PATH.read_text(encoding="utf-8")
    compact_sql = " ".join(repair_sql.split())

    assert "create or replace function private.matrix_result_entitlements" in repair_sql
    assert "pg_catalog.coalesce" not in repair_sql
    assert "security definer" in repair_sql
    assert "set search_path = ''" in repair_sql
    assert (
        "revoke all on function private.matrix_result_entitlements() "
        "from public, anon, authenticated"
    ) in compact_sql
