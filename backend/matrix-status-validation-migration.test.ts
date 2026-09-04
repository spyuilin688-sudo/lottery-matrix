import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20260904080000_matrix_status_validation_source.sql', import.meta.url),
  'utf8',
);

describe('Matrix status validation source migration', () => {
  it('keeps the raw validation reader service-role-only', () => {
    expect(migration).toContain('security definer');
    expect(migration).toMatch(
      /revoke all on function public\.matrix_status_validation_source_get\(jsonb\)[\s\S]*from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.matrix_status_validation_source_get\(jsonb\)[\s\S]*to service_role;/,
    );
  });

  it('requires an exact completed analysis run and item identity', () => {
    expect(migration).toContain("run.status = 'complete'");
    expect(migration).toContain('result.analysis_version = v_version');
    expect(migration).toContain('result.item_id = v_item_id');
  });
});
