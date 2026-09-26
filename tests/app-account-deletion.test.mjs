import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppNotificationDb } from './helpers/app-notification-db.mjs';
import { applyAppMigrations, identity, asUser, rpc, pwaSnapshot } from './helpers/app-db.mjs';
async function setup(t) {
  const db=await createAppNotificationDb(); t.after(()=>db.close());
  await db.exec(`alter table auth.users add column email text;
    create table public.admin_accounts(id uuid primary key default gen_random_uuid(),account text,role text,status text);
    create table public.admin_profiles(user_id uuid primary key references auth.users on delete cascade);
    alter table auth.identities drop constraint identities_user_id_fkey;
    alter table auth.identities add foreign key(user_id) references auth.users on delete cascade;
    alter table auth.sessions drop constraint sessions_user_id_fkey;
    alter table auth.sessions add foreign key(user_id) references auth.users on delete cascade;`);
  await applyAppMigrations(db,['app_account_deletion']);
  const who=await identity(db); const app=await asUser(db,who,()=>rpc(db,'app_member_bootstrap'));
  await asUser(db,who,()=>rpc(db,'app_notification_settings_get'));
  return {db,who,app};
}
test('dual-product deletion preserves PWA membership and shared sessions, blocks silent App recreation',async t=>{
  const {db,who,app}=await setup(t);
  await db.query("insert into private.app_native_push_events(event_key,event_type,payload) values('personal-reminder','bet_reminder',$1),('global-draw','lottery_result','{}')",[{memberId:app.memberId}]);
  await asUser(db,who,()=>rpc(db,'member_bootstrap'));
  const before=await pwaSnapshot(db);
  const job=await rpc(db,'app_account_deletion_begin',[who.user,who.session]);
  assert.equal(job.authIdentity,'retained'); assert.equal(job.status,'completed');
  assert.deepEqual((await db.query('select event_key from private.app_native_push_events')).rows,[{event_key:'global-draw'}]);
  assert.deepEqual(await pwaSnapshot(db),before);
  assert.equal((await db.query('select count(*)::int n from public.app_members')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.app_notification_settings')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[who.session])).rows[0].n,1);
  await assert.rejects(asUser(db,who,()=>rpc(db,'app_member_bootstrap')),/APP_ACCOUNT_DELETED/);
  assert.equal((await rpc(db,'app_account_deletion_begin',[who.user,who.session])).deletionId,job.deletionId);
  const rejoined=await asUser(db,who,()=>rpc(db,'app_member_bootstrap',[true])); assert.ok(rejoined.memberId);
});
test('App-only deletion revokes sessions, keeps a retryable job and blocks PWA enrollment until Auth cleanup',async t=>{
  const {db,who}=await setup(t);
  const job=await rpc(db,'app_account_deletion_begin',[who.user,who.session]);
  assert.equal(job.authIdentity,'pending');
  assert.equal((await db.query('select count(*)::int n from auth.sessions')).rows[0].n,0);
  const fresh=await identity(db,{user:who.user,provider:'google'});
  await assert.rejects(asUser(db,fresh,()=>rpc(db,'member_bootstrap')),/ACCOUNT_DELETION_PENDING/);
  const retry=await rpc(db,'app_account_deletion_begin',[who.user,fresh.session]);
  assert.equal(retry.deletionId,job.deletionId);
  await db.query('delete from auth.users where id=$1',[who.user]);
  assert.deepEqual(await rpc(db,'app_account_deletion_finalize',[who.user,job.deletionId]),{status:'completed',authIdentity:'deleted'});
});
test('owner and any other real auth foreign key retain the shared identity',async t=>{
  const {db,who}=await setup(t);
  await db.exec('create table public.other_product_accounts(owner uuid references auth.users on delete cascade)');
  await db.query('insert into public.other_product_accounts values($1)',[who.user]);
  assert.equal((await rpc(db,'app_account_deletion_begin',[who.user,who.session])).authIdentity,'retained');
  const owner=await identity(db); await asUser(db,owner,()=>rpc(db,'app_member_bootstrap'));
  await db.query("update auth.users set email='spyuilin688@gmail.com' where id=$1",[owner.user]);
  assert.equal((await rpc(db,'app_account_deletion_begin',[owner.user,owner.session])).authIdentity,'retained');
});
test('a dependency arriving after begin prevents cascading Auth deletion and allows retry to retain it',async t=>{
  const {db,who}=await setup(t);
  const job=await rpc(db,'app_account_deletion_begin',[who.user,who.session]);
  await db.query('insert into public.admin_profiles values($1)',[who.user]);
  await assert.rejects(db.query('delete from auth.users where id=$1',[who.user]),/APP_AUTH_IDENTITY_IN_USE/);
  const fresh=await identity(db,{user:who.user,provider:'google'});
  assert.equal((await rpc(db,'app_account_deletion_begin',[who.user,fresh.session])).authIdentity,'retained');
  assert.equal((await rpc(db,'app_account_deletion_finalize',[who.user,job.deletionId])).authIdentity,'retained');
});
test('invalid sessions and direct authenticated SQL calls cannot delete accounts',async t=>{
  const {db,who}=await setup(t); const other=await identity(db);
  await assert.rejects(rpc(db,'app_account_deletion_begin',[who.user,other.session]),/AUTH_REQUIRED/);
  await assert.rejects(asUser(db,who,()=>rpc(db,'app_account_deletion_begin',[who.user,who.session])),/permission denied/);
  assert.equal((await db.query('select count(*)::int n from public.app_members')).rows[0].n,1);
});
