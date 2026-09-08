import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migrations = new URL('../supabase/migrations/', import.meta.url);
const userA = '00000000-0000-0000-0000-000000000001';
const userB = '00000000-0000-0000-0000-000000000002';
const endpoint = 'https://fcm.googleapis.com/fcm/send/owned-device';
const save = (url, key = 'browser-public-key', auth = 'browser-auth-secret') => db.query(
  'select public.member_push_subscription_save($1,$2,$3) as result', [url, key, auth],
);
const asUser = id => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`);

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    insert into auth.users values ('${userA}'),('${userB}');
  `);
  for (const file of ['20260830144700_mobile_push_notifications.sql','20260830223000_fix_mobile_push_rpc_nullif.sql']) {
    await db.exec(await readFile(new URL(file, migrations), 'utf8'));
  }
  for (const file of (await readdir(migrations)).filter(name => name.endsWith('_member_push_endpoint_security.sql')).sort()) {
    await db.exec(await readFile(new URL(file, migrations), 'utf8'));
  }
  if (process.env.MATRIX_PUSH_MIGRATION) await db.exec(await readFile(process.env.MATRIX_PUSH_MIGRATION, 'utf8'));
});
after(() => db.close());

test('member cannot register internal, arbitrary, disguised or oversized push destinations', async () => {
  await asUser(userA);
  for (const url of [
    'http://fcm.googleapis.com/send/a','https://127.0.0.1/a','https://[::1]/a',
    'https://169.254.169.254/a','https://attacker.example/a',
    'https://fcm.googleapis.com.attacker.example/a','https://fcm.googleapis.com@attacker.example/a',
    'https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:443/a',
    'https://fcm.googleapis.com:8443/a','https://fcm.googleapis.com/a#fragment',
    'https://fcm.googleapis.com\\@attacker.example/a','https://%66cm.googleapis.com/a',
    'https://fcm.googleapis.com/a\n','https://fcm.googleapis.com/'+ 'a'.repeat(4096),
  ]) await assert.rejects(save(url), /INVALID_PUSH_SUBSCRIPTION/, url);
  assert.equal((await db.query('select count(*)::int as count from member_push_subscriptions')).rows[0].count, 0);
});

test('browser push providers retain save, status and disable behavior', async () => {
  await asUser(userA);
  for (const url of [endpoint,'https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/test','https://wns2.notify.windows.com/test']) {
    const saved = (await save(url)).rows[0].result;
    assert.equal(saved.enabled,true);
    assert.equal((await db.query('select member_push_subscription_status($1) as result',[url])).rows[0].result.enabled,true);
    assert.equal((await db.query('select member_push_subscription_disable($1) as result',[url])).rows[0].result.disabled,true);
  }
});

test('knowing another member endpoint cannot replace its owner or encryption keys', async () => {
  await asUser(userA); await save(endpoint);
  await asUser(userB);
  await assert.rejects(save(endpoint,'attacker-key','attacker-auth'), /INVALID_PUSH_SUBSCRIPTION/);
  await assert.rejects(save(endpoint,'browser-public-key','attacker-auth'), /INVALID_PUSH_SUBSCRIPTION/);
  await assert.rejects(save(endpoint,'attacker-key','browser-auth-secret'), /INVALID_PUSH_SUBSCRIPTION/);
  assert.equal((await db.query('select member_push_subscription_status($1) as result',[endpoint])).rows[0].result.enabled,false);
  await db.exec('reset role');
  assert.deepEqual((await db.query('select user_id,p256dh,auth_key from member_push_subscriptions where endpoint=$1',[endpoint])).rows,[{user_id:userA,p256dh:'browser-public-key',auth_key:'browser-auth-secret'}]);
});

test('same device can change account only with both existing browser keys', async () => {
  await asUser(userB); await save(endpoint);
  await asUser(userA);
  assert.equal((await db.query('select member_push_subscription_status($1) as result',[endpoint])).rows[0].result.enabled,false);
  await asUser(userB);
  assert.equal((await db.query('select member_push_subscription_status($1) as result',[endpoint])).rows[0].result.enabled,true);
  await save(endpoint,'rotated-public-key','rotated-auth-secret');
  assert.equal((await db.query('select p256dh from member_push_subscriptions where endpoint=$1',[endpoint])).rows[0].p256dh,'rotated-public-key');
});

test('anonymous callers cannot register push subscriptions', async () => {
  await db.exec('reset role; set role anon;');
  await assert.rejects(save(endpoint), /permission denied/);
});
