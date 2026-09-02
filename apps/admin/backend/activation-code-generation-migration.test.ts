import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(import.meta.dirname, '../../../supabase/migrations');
const migrationName = existsSync(migrationsDir)
  ? readdirSync(migrationsDir).find((name) => name.endsWith('_activation_code_generation_rules.sql'))
  : undefined;
const sql = migrationName ? readFileSync(join(migrationsDir, migrationName), 'utf8') : '';

describe('activation-code generation migration', () => {
  it('adds 60-day activation codes and the approved quantity set', () => {
    expect(sql).toContain("'60_days'");
    expect(sql).toMatch(/quantity\s+in\s*\(1,\s*3,\s*5,\s*10,\s*20\)/i);
  });

  it('creates one non-overloaded service-role-only RPC that accepts quantity', () => {
    expect(sql).toMatch(/drop function if exists public\.generate_activation_code_batch\(text\)/i);
    expect(sql).toMatch(/generate_activation_code_batch\(p_duration_type text, p_quantity integer default 10\)/i);
    expect(sql).toMatch(/revoke execute on function public\.generate_activation_code_batch\(text, integer\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.generate_activation_code_batch\(text, integer\) to service_role/i);
  });

  it('uses the selected quantity for both batch metadata and generated rows', () => {
    expect(sql).toMatch(/values\s*\(p_duration_type,\s*p_quantity,/i);
    expect(sql).toMatch(/while\s+v_inserted_count\s*<\s*p_quantity/i);
  });

  it('makes 60-day redemption grant exactly 60 days using the monthly plan tier', () => {
    expect(sql).toMatch(/when '60_days' then '月費方案'/);
    expect(sql).toMatch(/when '60_days' then 60/);
  });
});
