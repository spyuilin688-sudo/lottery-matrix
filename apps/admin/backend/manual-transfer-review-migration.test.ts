import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = new URL('../../../supabase/migrations/', import.meta.url);

function readMigration() {
  const matches = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('_normalize_manual_transfer_review.sql'));
  expect(matches).toHaveLength(1);
  return readFileSync(new URL(matches[0], migrationsDirectory), 'utf8');
}

describe('manual transfer review normalization migration', () => {
  it('keeps the canonical admin review RPC and disables auto renew for manual transfers', () => {
    const sql = readMigration();
    expect(sql).toContain('create or replace function public.admin_review_transfer_request');
    expect(sql).toContain('auto_renew = false');
    expect(sql).not.toContain('auto_renew = true');
  });

  it('removes the legacy duplicate transfer-review RPC', () => {
    const sql = readMigration();
    expect(sql).toContain('drop function if exists public.admin_transfer_request_review(uuid, text);');
  });
});
