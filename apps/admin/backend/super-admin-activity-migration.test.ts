import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260901164500_restore_super_admin_activity_log_exemption.sql',
  import.meta.url,
);

describe('super administrator activity migration', () => {
  it('restores the audit-log trigger that omits super administrator actions', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    if (!existsSync(migrationUrl)) return;

    const sql = readFileSync(migrationUrl, 'utf8');
    expect(sql).toContain('create trigger skip_super_admin_audit_logs');
    expect(sql).toContain('before insert on public.audit_logs');
  });
});
