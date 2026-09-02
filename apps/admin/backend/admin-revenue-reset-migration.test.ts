import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../../../supabase/migrations/20260902064500_admin_revenue_reset_baseline.sql', import.meta.url),
  'utf8',
).toLowerCase();
const privilegeSql = readFileSync(
  new URL('../../../supabase/migrations/20260902070030_limit_admin_revenue_settings_privileges.sql', import.meta.url),
  'utf8',
).toLowerCase();
const resetRpcSql = readFileSync(
  new URL('../../../supabase/migrations/20260902071500_admin_revenue_reset_rpc.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('admin revenue reset migration', () => {
  it('stores one reset baseline without modifying payment records', () => {
    expect(sql).toContain('create table if not exists public.admin_revenue_settings');
    expect(sql).toContain('check (id = 1)');
    expect(sql).toContain('reset_at timestamp with time zone not null');
    expect(sql).not.toMatch(/delete\s+from\s+public\.payments/);
    expect(sql).not.toMatch(/update\s+public\.payments/);
  });

  it('exposes the baseline only to the server-side service role', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on table public.admin_revenue_settings from public, anon, authenticated');
    expect(sql).toContain('revoke all on table public.admin_revenue_settings from service_role');
    expect(sql).toContain('grant select, insert, update on table public.admin_revenue_settings to service_role');
    expect(privilegeSql).toContain('revoke all on table public.admin_revenue_settings from service_role');
    expect(privilegeSql).toContain('grant select, insert, update on table public.admin_revenue_settings to service_role');
  });

  it('advances the reset baseline atomically using database time', () => {
    expect(resetRpcSql).toContain('clock_timestamp()');
    expect(resetRpcSql).toContain('greatest(settings.reset_at, excluded.reset_at)');
    expect(resetRpcSql).toContain('revoke all on function public.admin_reset_revenue_baseline() from public, anon, authenticated');
    expect(resetRpcSql).toContain('grant execute on function public.admin_reset_revenue_baseline() to service_role');
  });
});
