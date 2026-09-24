import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../supabase/migrations/20260924022524_test_push_idempotency.sql', import.meta.url),
  'utf8',
);
const requestId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const adminId = '30000000-0000-4000-8000-000000000001';
const otherUser = '20000000-0000-4000-8000-000000000002';

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create schema private;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create table public.admin_accounts(id uuid primary key, status text not null);
    insert into public.admin_accounts values ('${adminId}', '啟用');
  `);
  await db.exec(migration);
  return db;
}

test('a push retry checks one persisted claim and reads the completed result', async () => {
  const db = await setup();
  try {
    await db.exec("select set_config('request.jwt.claim.role', 'service_role', false)");
    const claim = async (user = userId) => (await db.query(
      'select public.admin_claim_test_push($1,$2,$3) as result', [requestId, user, adminId],
    )).rows[0].result;
    assert.deepEqual(await claim(), { state: 'claimed' });
    assert.deepEqual(await claim(), { state: 'pending', result: null });
    await assert.rejects(claim(otherUser), /TEST_PUSH_REQUEST_CONFLICT/);
    const done = (await db.query(
      'select public.admin_finish_test_push($1,$2,$3,$4::jsonb) as result',
      [requestId, userId, adminId, JSON.stringify({ sent: 1, failed: 0 })],
    )).rows[0].result;
    assert.deepEqual(done, { sent: 1, failed: 0 });
    assert.deepEqual(await claim(), { state: 'completed', result: done });
    assert.equal((await db.query('select count(*)::integer as count from private.admin_test_push_requests')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('only the backend service role can claim or finish a send', async () => {
  const db = await setup();
  try {
    await db.exec("select set_config('request.jwt.claim.role', 'authenticated', false)");
    await assert.rejects(db.query('select public.admin_claim_test_push($1,$2,$3)', [requestId, userId, adminId]), /ADMIN_BACKEND_REQUIRED/);
    await db.exec("select set_config('request.jwt.claim.role', 'service_role', false)");
    await db.query('select public.admin_claim_test_push($1,$2,$3)', [requestId, userId, adminId]);
    await db.exec("select set_config('request.jwt.claim.role', 'authenticated', false)");
    await assert.rejects(db.query('select public.admin_finish_test_push($1,$2,$3,$4::jsonb)', [requestId, userId, adminId, '{"sent":1,"failed":0}']), /ADMIN_BACKEND_REQUIRED/);
  } finally { await db.close(); }
});
