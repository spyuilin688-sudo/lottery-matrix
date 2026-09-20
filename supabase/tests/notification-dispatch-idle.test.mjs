import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema vault; create schema net;
    create table public.notification_outbox(status text, next_attempt_at timestamptz, processing_started_at timestamptz);
    create function vault.secret(name text) returns text language plpgsql as $$ begin
      raise exception 'VAULT_TOUCHED'; end $$;
    create view vault.decrypted_secrets as select name, vault.secret(name) as decrypted_secret
      from (values ('matrix_project_url'), ('matrix_notification_dispatch_token')) s(name);
    create table net.requests(url text, headers jsonb, body jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language plpgsql as $$ begin
      insert into net.requests values (url,headers,body); return 42; end $$;`);
  await db.exec(await readFile(new URL('../migrations/20260920192331_notification_due_before_vault.sql', import.meta.url), 'utf8'));
});
after(async () => db.close());
const tick = async () => (await db.query('select private.notification_dispatch_http_tick() as request')).rows[0].request;

test('empty queue skips Vault entirely', async () => assert.equal(await tick(), null));
test('future retries, active leases and terminal rows skip Vault', async () => {
  await db.exec(`insert into notification_outbox values
    ('pending',now()+interval '1 minute',null),
    ('processing',null,now()-interval '4 minutes'),
    ('processing',null,null), ('sent',null,null), ('failed',null,null), ('skipped',null,null);`);
  assert.equal(await tick(), null);
  await db.exec('delete from notification_outbox');
});
test('due pending and expired leases still read Vault', async () => {
  for (const row of ["('pending',null,null)", "('pending',now(),null)", "('processing',null,now()-interval '5 minutes')"]) {
    await db.exec(`insert into notification_outbox values ${row}`);
    await assert.rejects(tick(), /VAULT_TOUCHED/);
    await db.exec('delete from notification_outbox');
  }
});
test('due work retains URL, headers, body and returned request id', async () => {
  await db.exec(`create or replace function vault.secret(name text) returns text language sql as $$
    select case when name='matrix_project_url' then 'https://project.test/' else 'dispatch-token' end $$;
    insert into notification_outbox values ('pending',null,null);`);
  assert.equal(await tick(), 42);
  assert.deepEqual((await db.query('select * from net.requests')).rows, [{
    url: 'https://project.test/functions/v1/notification-dispatch',
    headers: { 'Content-Type': 'application/json', 'x-matrix-dispatch-token': 'dispatch-token' }, body: {},
  }]);
});
test('due work with missing secrets still fails and public roles cannot invoke the tick', async () => {
  await db.exec(`create or replace function vault.secret(name text) returns text language sql as $$ select null::text $$;`);
  await assert.rejects(tick(), /NOTIFICATION_DISPATCH_VAULT_MISSING/);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await db.query("select has_function_privilege($1,'private.notification_dispatch_http_tick()','EXECUTE') as allowed", [role])).rows[0].allowed, false);
  }
});
