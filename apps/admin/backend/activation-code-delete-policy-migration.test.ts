import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = new URL('../../../supabase/migrations/', import.meta.url);

function readMigration() {
  const matches = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('_restrict_redeemed_activation_code_deletion.sql'));
  expect(matches).toHaveLength(1);
  return readFileSync(new URL(matches[0], migrationsDirectory), 'utf8');
}

describe('redeemed activation-code deletion policy migration', () => {
  it('checks the locked code state and the persisted administrator role before deletion', () => {
    const sql = readMigration();
    expect(sql).toMatch(/from public\.activation_codes[\s\S]*for update/i);
    expect(sql).toMatch(/from public\.admin_accounts[\s\S]*p_actor_id/i);
    expect(sql).toMatch(/status[\s\S]*used[\s\S]*redeemed_at[\s\S]*redeemed_by_member_id/i);
    expect(sql).toContain('REDEEMED_ACTIVATION_CODE_DELETE_FORBIDDEN');
  });

  it('keeps the RPC service-role only', () => {
    const sql = readMigration();
    expect(sql).toMatch(/revoke all on function public\.admin_delete_activation_code\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.admin_delete_activation_code\(uuid, uuid, text\)[\s\S]*to service_role/i);
  });
});
