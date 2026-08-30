import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260830083000_fix_payment_history_and_audit_logs.sql',
  import.meta.url,
);

describe('payment history and audit log migration', () => {
  it('recreates payment history without schema-qualifying COALESCE', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('create or replace function public.member_payment_history_get()');
    expect(sql).toContain("coalesce(jsonb_agg(entry.item order by entry.recorded_at desc), '[]'::jsonb)");
    expect(sql).not.toContain('pg_catalog.coalesce');
  });

  it('stops discarding super administrator audit records', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('drop trigger if exists skip_super_admin_audit_logs on public.audit_logs');
    expect(sql).not.toContain('create trigger skip_super_admin_audit_logs');
  });
});
