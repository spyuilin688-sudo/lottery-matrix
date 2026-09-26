import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createAppDb, identity, asUser, rpc, pwaSnapshot } from './helpers/app-db.mjs';

const db = await createAppDb();
after(() => db.close());

test('LINE identity creation alone cannot enroll or start a trial in PWA', async () => {
  const actor = await identity(db);
  assert.equal((await db.query('select count(*)::int as n from members where auth_user_id=$1',[actor.user])).rows[0].n, 0);
});

test('App bootstrap is idempotent, grants free features and never edits PWA financial state', async () => {
  const actor = await identity(db);
  const before = await pwaSnapshot(db);
  const profile = await asUser(db, actor, async () => {
    const first = await rpc(db, 'app_member_bootstrap');
    assert.deepEqual(await rpc(db, 'app_member_bootstrap'), first);
    return rpc(db, 'app_member_profile');
  });
  assert.equal(profile.status, 'active');
  assert.equal(profile.entitlementSource, 'free_launch');
  assert.deepEqual(profile.entitlements, {canUseSeven:true,canUseThirteen:true,canUseFullRange:true,canUseTianyan:true,canUseTiangong:true,canViewFullStatus:true});
  assert.deepEqual(await pwaSnapshot(db), before);
  assert.equal((await db.query('select count(*)::int as n from app_members where auth_user_id=$1',[actor.user])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from app_subscriptions')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from app_revenue_entries')).rows[0].n,0);
});

test('PWA first use initializes its LINE trial and name exactly once, including after App use', async () => {
  const actor = await identity(db, {name:'LINE Display Name'});
  await asUser(db, actor, () => rpc(db, 'app_member_bootstrap'));
  const first = await asUser(db, actor, () => rpc(db, 'member_bootstrap'));
  const initial = (await db.query('select * from members where id=$1',[first.memberId])).rows[0];
  assert.equal(initial.line_display_name,'LINE Display Name');
  assert.ok(initial.line_trial_started_at);
  assert.deepEqual(await asUser(db, actor, () => rpc(db, 'member_bootstrap')),first);
  assert.deepEqual((await db.query('select * from members where id=$1',[first.memberId])).rows[0],initial);
});

test('PWA suspension does not disable App, and App clients cannot change authoritative columns', async () => {
  const actor = await identity(db);
  const pwa = await asUser(db, actor, () => rpc(db, 'member_bootstrap'));
  await db.query("update members set status='停用',plan_expires_at=now()+interval '20 days' where id=$1",[pwa.memberId]);
  const before = await pwaSnapshot(db);
  const app = await asUser(db, actor, () => rpc(db,'app_member_bootstrap'));
  await asUser(db, actor, async () => {
    await assert.rejects(db.query("update app_members set status='disabled' where id=$1",[app.memberId]),e=>e.code==='42501');
    await assert.rejects(db.exec('delete from app_entitlements'),e=>e.code==='42501');
    await assert.rejects(db.exec('insert into app_revenue_entries default values'),e=>e.code==='42501');
    await assert.rejects(rpc(db,'member_bootstrap'),/FORBIDDEN/);
  });
  assert.deepEqual(await pwaSnapshot(db),before);
});

test('RLS hides other App accounts and profile rejects revoked sessions', async () => {
  const owner = await identity(db), stranger = await identity(db);
  const own = await asUser(db,owner,()=>rpc(db,'app_member_bootstrap'));
  await asUser(db,stranger,()=>rpc(db,'app_member_bootstrap'));
  const rows = await asUser(db,owner,()=>db.query('select id from app_members'));
  assert.deepEqual(rows.rows,[{id:own.memberId}]);
  await db.query('delete from auth.sessions where id=$1',[owner.session]);
  await assert.rejects(asUser(db,owner,()=>rpc(db,'app_member_profile')),/AUTH_REQUIRED/);
  await assert.rejects(asUser(db,owner,()=>db.query('select * from app_members')),/AUTH_REQUIRED/);
});

test('deleted App requires explicit rejoin and pending identity cleanup blocks both products', async () => {
  const actor = await identity(db);
  await asUser(db,actor,()=>rpc(db,'app_member_bootstrap'));
  await db.query('delete from app_members where auth_user_id=$1',[actor.user]);
  await db.query('update private.product_identity_lifecycle set app_deleted_at=now(),deletion_id=gen_random_uuid() where auth_user_id=$1',[actor.user]);
  await assert.rejects(asUser(db,actor,()=>rpc(db,'app_member_bootstrap')),/APP_ACCOUNT_DELETED/);
  await asUser(db,actor,()=>rpc(db,'app_member_bootstrap',[true]));
  assert.equal((await db.query('select app_deleted_at from private.product_identity_lifecycle where auth_user_id=$1',[actor.user])).rows[0].app_deleted_at,null);
  await db.query("update private.product_identity_lifecycle set auth_cleanup_state='pending' where auth_user_id=$1",[actor.user]);
  for (const name of ['app_member_bootstrap','member_bootstrap']) {
    await assert.rejects(asUser(db,actor,()=>rpc(db,name)),/ACCOUNT_DELETION_PENDING/);
  }
});

test('anonymous callers cannot bootstrap and authenticated callers cannot invoke implementation helpers', async () => {
  await db.exec('set role anon');
  try { await assert.rejects(rpc(db,'app_member_bootstrap'),e=>e.code==='42501'); }
  finally { await db.exec('reset role'); }
  const actor = await identity(db);
  await asUser(db,actor,async () => {
    await assert.rejects(db.exec('select private.lock_product_identity(auth.uid())'),e=>e.code==='42501');
    await assert.rejects(db.exec('select public.member_bootstrap_20260829_impl()'),e=>e.code==='42501');
    await assert.rejects(db.exec('select * from app_member_login_records'),e=>e.code==='42501');
  });
});

test('disabled App membership does not reactivate on bootstrap or edit PWA', async () => {
  const actor = await identity(db);
  const app = await asUser(db,actor,()=>rpc(db,'app_member_bootstrap'));
  await db.query("update app_members set status='disabled' where id=$1",[app.memberId]);
  const before = await pwaSnapshot(db);
  await assert.rejects(asUser(db,actor,()=>rpc(db,'app_member_bootstrap')),/FORBIDDEN/);
  const profile = await asUser(db,actor,()=>rpc(db,'app_member_profile'));
  assert.ok(Object.values(profile.entitlements).every(v=>v===false));
  assert.deepEqual(await pwaSnapshot(db),before);
});

test('LINE identity conflicts fail without linking another PWA member', async () => {
  const first = await identity(db,{providerId:'same-provider-id'});
  await asUser(db,first,()=>rpc(db,'member_bootstrap'));
  const second = await identity(db,{providerId:'same-provider-id'});
  const before = await pwaSnapshot(db);
  await assert.rejects(asUser(db,second,()=>rpc(db,'member_bootstrap')),/LINE_IDENTITY_CONFLICT/);
  assert.deepEqual(await pwaSnapshot(db),before);
});
