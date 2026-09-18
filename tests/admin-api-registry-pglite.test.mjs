import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create schema private;
    create function public.member_transfer_request_submit() returns void language plpgsql as $$
      begin raise exception 'MUST_NOT_EXECUTE_MEMBER_OPERATION'; end;
    $$;
    create function public.member_transfer_request_submit(text) returns void language plpgsql as $$
      begin raise exception 'MUST_NOT_EXECUTE_MEMBER_OPERATION'; end;
    $$;
    create function private.hidden_operation() returns boolean language sql as 'select true';
    revoke all on function public.member_transfer_request_submit(), public.member_transfer_request_submit(text) from public, anon, service_role;
    grant execute on function public.member_transfer_request_submit(), public.member_transfer_request_submit(text) to authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260908172909_admin_api_registry.sql', import.meta.url), 'utf8'));
});
after(() => db.close());

test('service-role registry finds restricted public RPCs once without executing them', async () => {
  await db.exec('set role service_role');
  try {
    const { rows } = await db.query('select rpc_name from public.admin_api_registry() order by rpc_name');
    assert.deepEqual(rows, [{ rpc_name: 'admin_api_registry' }, { rpc_name: 'member_transfer_request_submit' }]);
    const { rows: privileges } = await db.query("select has_function_privilege(current_user, 'public.member_transfer_request_submit()', 'execute') as allowed");
    assert.equal(privileges[0].allowed, false);
  } finally { await db.exec('reset role'); }
});

test('anonymous and member roles cannot read the admin registry', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try { await assert.rejects(db.query('select * from public.admin_api_registry()'), /permission denied/); }
    finally { await db.exec('reset role'); }
  }
});

test('registry remains a stable invoker function and does not broaden member RPC permissions', async () => {
  const { rows } = await db.query(`select provolatile, prosecdef from pg_proc where oid='public.admin_api_registry()'::regprocedure`);
  assert.deepEqual(rows, [{ provolatile: 's', prosecdef: false }]);
  const { rows: grants } = await db.query(`select
    has_function_privilege('authenticated', 'public.member_transfer_request_submit()', 'execute') as member_allowed,
    has_function_privilege('anon', 'public.member_transfer_request_submit()', 'execute') as anon_allowed`);
  assert.deepEqual(grants, [{ member_allowed: true, anon_allowed: false }]);
});
