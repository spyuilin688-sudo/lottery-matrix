import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260904070000_admin_todos.sql',
  import.meta.url,
);
const indexMigrationUrl = new URL(
  '../../../supabase/migrations/20260904081000_admin_todos_admin_id_index.sql',
  import.meta.url,
);

describe('admin_todos migration', () => {
  it('creates a length-constrained todo table owned only by the backend service role', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toMatch(/create table public\.admin_todos/i);
    expect(sql).toMatch(/admin_id uuid not null references public\.admin_accounts\s*\(id\)/i);
    expect(sql).toMatch(/content varchar\s*\(100\) not null/i);
    expect(sql).toMatch(/char_length\s*\(\s*btrim\s*\(\s*content\s*\)\s*\)\s+between\s+1\s+and\s+100/i);
    expect(sql).toMatch(/created_at timestamptz not null default now\s*\(\s*\)/i);
    expect(sql).toMatch(/create index[^;]+created_at desc\s*,\s*id desc/i);
    expect(sql).toMatch(/alter table public\.admin_todos enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.admin_todos from public\s*,\s*anon\s*,\s*authenticated/i);
    expect(sql).toMatch(/grant select\s*,\s*insert\s*,\s*update\s*,\s*delete on table public\.admin_todos to service_role/i);
  });

  it('indexes the todo author foreign key used by ownership checks', () => {
    const sql = readFileSync(indexMigrationUrl, 'utf8');
    expect(sql).toMatch(
      /create index admin_todos_admin_id_idx\s+on public\.admin_todos\s*\(admin_id\)/i,
    );
  });
});
