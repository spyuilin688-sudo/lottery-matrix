import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../supabase/migrations/20260924022506_admin_todo_revision.sql', import.meta.url),
  'utf8',
);

test('existing todos gain revision zero and a stale conditional update cannot overwrite another edit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.admin_todos (
        id uuid primary key, admin_id uuid not null, content text not null,
        created_at timestamptz not null default now()
      );
      insert into public.admin_todos(id, admin_id, content)
      values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'original');
    `);
    await db.exec(migration);
    const filter = ['10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 0];
    const update = 'update public.admin_todos set content = $4, revision = $3 + 1 where id = $1 and admin_id = $2 and revision = $3 returning content, revision';
    assert.deepEqual((await db.query(update, [...filter, 'first'])).rows, [{ content: 'first', revision: 1 }]);
    assert.deepEqual((await db.query(update, [...filter, 'stale'])).rows, []);
    assert.deepEqual((await db.query('select content, revision from public.admin_todos')).rows, [{ content: 'first', revision: 1 }]);
  } finally { await db.close(); }
});
