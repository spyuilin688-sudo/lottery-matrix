import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = new URL('../../../supabase/migrations/', import.meta.url);

function readMigration() {
  const matches = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('_fix_activation_code_plan_entitlements.sql'));
  expect(matches).toHaveLength(1);
  return readFileSync(new URL(matches[0], migrationsDirectory), 'utf8');
}

describe('activation code entitlement migration', () => {
  it('maps durations to plans and preserves an active higher tier', () => {
    const sql = readMigration();
    expect(sql).toContain("when '7_days' then '月費方案'");
    expect(sql).toContain("when '15_days' then '月費方案'");
    expect(sql).toContain("when '30_days' then '月費方案'");
    expect(sql).toContain("when '90_days' then '季費方案'");
    expect(sql).toContain("when '365_days' then '年費方案'");
    expect(sql).toMatch(/v_current_plan_rank\s*>\s*v_target_plan_rank/);
    expect(sql).toContain('current_plan_id = v_effective_plan_id');
    expect(sql).toContain('greatest(');
    expect(sql.match(/for update/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps redemption member-only and batch generation server-only', () => {
    const sql = readMigration();
    expect(sql).toContain('set search_path = \'\'');
    expect(sql).toContain('grant execute on function public.redeem_activation_code(text) to authenticated');
    expect(sql).toContain('revoke execute on function public.redeem_activation_code(text) from public, anon, service_role');
    expect(sql).toContain('grant execute on function public.generate_activation_code_batch(text) to service_role');
    expect(sql).toContain('revoke execute on function public.generate_activation_code_batch(text) from public, anon, authenticated');
  });
});
