import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createAppDb, applyAppMigrations, identity, asUser, rpc } from './helpers/app-db.mjs';

const db = await createAppDb({applyApp:false});
const historical = await identity(db);
const pwaBefore = await asUser(db,historical,()=>rpc(db,'member_bootstrap'));
await applyAppMigrations(db,['app_product_membership']);
after(()=>db.close());

test('existing PWA login history is preserved at the cutover', async () => {
  const view = await db.query("select to_regclass('public.pwa_member_login_records') as view");
  assert.ok(view.rows[0].view,'PWA-specific login projection must exist');
  assert.equal((await db.query('select count(*)::int as n from pwa_member_login_records where auth_user_id=$1',[historical.user])).rows[0].n,1);
  assert.equal((await db.query('select id from members where auth_user_id=$1',[historical.user])).rows[0].id,pwaBefore.memberId);
});

test('new App-only session stays out of PWA reports even if user also has PWA membership', async () => {
  const session = randomUUID();
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,historical.user]);
  const actor = {user:historical.user,session};
  await asUser(db,actor,()=>rpc(db,'app_member_bootstrap'));
  assert.equal((await db.query('select count(*)::int as n from pwa_member_login_records where id=$1',[session])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from app_member_login_records where id=$1',[session])).rows[0].n,1);
  await asUser(db,actor,()=>rpc(db,'member_bootstrap'));
  assert.equal((await db.query('select count(*)::int as n from pwa_member_login_records where id=$1',[session])).rows[0].n,1);
});

test('forged or expired session cannot enroll or mark product usage', async () => {
  const actor = await identity(db);
  const other = await identity(db);
  await assert.rejects(asUser(db,{...actor,session:other.session},()=>rpc(db,'app_member_bootstrap')),/AUTH_REQUIRED/);
  await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[actor.session]);
  await assert.rejects(asUser(db,actor,()=>rpc(db,'app_member_bootstrap')),/AUTH_REQUIRED/);
});
