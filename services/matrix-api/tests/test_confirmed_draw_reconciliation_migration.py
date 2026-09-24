from pathlib import Path


MIGRATION = Path(__file__).parents[3] / "supabase" / "migrations" / "20260915195954_reconcile_confirmed_same_period_draws.sql"


def test_confirmed_same_period_correction_reuses_existing_reconciliation_lifecycle():
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "reconcile_confirmed_period boolean := false" in sql
    assert "period_match.result_status='confirmed'" in sql
    assert "existing.result_status='preliminary'" in sql
    assert "delete from public.lottery_draws where id=existing.id" in sql
    assert "existing := period_match" in sql
    assert "update public.lottery_draws d set period='reconcile:'" in sql
    assert "DRAW_PERIOD_DATE_CONFLICT" in sql
    assert "existing.draw_date<>incoming.draw_date then raise exception 'DRAW_PERIOD_DATE_CONFLICT'" not in sql
    assert "grant execute on function public.matrix_upsert_draws(jsonb) to service_role" in sql
