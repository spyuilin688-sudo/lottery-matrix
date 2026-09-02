import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = new URL(
  '../supabase/migrations/20260902193000_matrix_card_static_storage.sql',
  import.meta.url,
);

test('Matrix card storage migration creates a public SVG-only bucket', async () => {
  const sql = await readFile(migration, 'utf8');

  assert.match(sql, /insert into storage\.buckets[\s\S]*?'matrix-cards'[\s\S]*?true[\s\S]*?1048576[\s\S]*?image\/svg\+xml/i);
  assert.match(sql, /on conflict \(id\) do update/i);
});

test('Matrix card publication pointer is server-only and protected by RLS', async () => {
  const sql = await readFile(migration, 'utf8');

  assert.match(sql, /create table if not exists public\.matrix_card_publications[\s\S]*?lottery text primary key[\s\S]*?draw_path text not null[\s\S]*?sorted_path text not null/i);
  assert.match(sql, /alter table public\.matrix_card_publications enable row level security/i);
  assert.match(sql, /revoke all on table public\.matrix_card_publications from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.matrix_card_publications to service_role/i);
});

test('Matrix card publication advances atomically only for the latest stored draw', async () => {
  const sql = await readFile(migration, 'utf8');

  assert.match(sql, /create or replace function public\.publish_matrix_card\(/i);
  assert.match(sql, /pg_advisory_xact_lock\([\s\S]*?hashtextextended\(p_lottery/i);
  assert.match(sql, /from public\.lottery_draws[\s\S]*?where lottery = p_lottery[\s\S]*?order by draw_date desc nulls last, period desc[\s\S]*?limit 1/i);
  assert.match(sql, /MATRIX_CARD_PERIOD_STALE/i);
  assert.match(sql, /updated_at = excluded\.updated_at/i);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.publish_matrix_card\([\s\S]*?from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.publish_matrix_card\([\s\S]*?to service_role/i);
});
