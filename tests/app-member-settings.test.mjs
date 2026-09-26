import assert from 'node:assert/strict';
import { after,test } from 'node:test';
import { createAppDb,applyAppMigrations,installFunction,readMigration,identity,asUser,rpc,pwaSnapshot } from './helpers/app-db.mjs';
import { validateMemberNotificationSettings } from '../backend/member-notification-settings.ts';
const db=await createAppDb();
after(()=>db.close());
await db.exec(await readMigration('20260823042016_create_member_notification_settings.sql'));
await db.exec(await readMigration('20260821115603_member_online_tracking.sql'));
await installFunction(db,'20260913193834_remove_win_notification_settings.sql','private.default_member_notification_settings');
await applyAppMigrations(db,['app_member_settings']);
const actor=await identity(db),other=await identity(db);
const app=await asUser(db,actor,()=>rpc(db,'app_member_bootstrap'));
await asUser(db,other,()=>rpc(db,'app_member_bootstrap'));
const pwa=await asUser(db,actor,()=>rpc(db,'member_bootstrap'));
await db.query("insert into notification_settings(member_id,settings) values($1,'{\"pwaFixture\":true}')",[pwa.memberId]);
const baseline=await pwaSnapshot(db);
const pwaSettings=(await db.query('select * from notification_settings')).rows;

test('App settings default off and satisfy the existing notification contract',async()=>{
  const settings=await asUser(db,actor,()=>rpc(db,'app_notification_settings_get'));
  assert.ok(Object.values(settings.settings).every(v=>v===false));
  assert.deepEqual(validateMemberNotificationSettings(settings),settings);
});
test('saving owns only the current App member and leaves PWA preferences unchanged',async()=>{
  const settings=await asUser(db,actor,()=>rpc(db,'app_notification_settings_get'));
  settings.settings.result=true;
  settings.selectedOptions.result=['今彩539'];
  assert.deepEqual(await asUser(db,actor,()=>rpc(db,'app_notification_settings_save',[settings])),settings);
  assert.equal((await asUser(db,other,()=>rpc(db,'app_notification_settings_get'))).settings.result,false);
  assert.deepEqual((await db.query('select * from notification_settings')).rows,pwaSettings);
  assert.deepEqual(await pwaSnapshot(db),baseline);
});
test('invalid JSON, extra owner fields, unrecognized options and boolean strings cannot be saved',async()=>{
  const settings=await asUser(db,actor,()=>rpc(db,'app_notification_settings_get'));
  for(const invalid of [null,[],{}, {...settings,memberId:other.user}, {...settings,settings:{...settings.settings,result:'true'}},
    {...settings,selectedOptions:{...settings.selectedOptions,result:['nowhere']}},
    {...settings,selectedOptions:{...settings.selectedOptions,result:['今彩539','今彩539']}},
    {...settings,betTimes:{...settings.betTimes,'今彩539':['01:23','']}}]) {
    await assert.rejects(asUser(db,actor,()=>rpc(db,'app_notification_settings_save',[invalid])),/INVALID_NOTIFICATION_SETTINGS/);
  }
  assert.deepEqual(await asUser(db,actor,()=>rpc(db,'app_notification_settings_get')),settings);
});
test('online end is idempotent and cannot close another member session',async()=>{
  const session=await asUser(db,actor,()=>rpc(db,'app_member_online_start'));
  await db.query("update app_member_online_sessions set started_at=now()-interval '70 seconds' where id=$1",[session.sessionId]);
  await assert.rejects(asUser(db,other,()=>rpc(db,'app_member_online_end',[session.sessionId])),/MEMBER_ONLINE_SESSION_NOT_FOUND/);
  const first=await asUser(db,actor,()=>rpc(db,'app_member_online_end',[session.sessionId]));
  assert.ok(first.onlineSeconds>=70);
  assert.deepEqual(await asUser(db,actor,()=>rpc(db,'app_member_online_end',[session.sessionId])),first);
  const row=(await db.query('select total_online_seconds,online_session_count from app_members where id=$1',[app.memberId])).rows[0];
  assert.equal(Number(row.total_online_seconds),first.onlineSeconds);
  assert.equal(Number(row.online_session_count),1);
  assert.deepEqual(await pwaSnapshot(db),baseline);
});
test('disabled and revoked App sessions cannot read or write personal settings/activity',async()=>{
  const settings=await asUser(db,actor,()=>rpc(db,'app_notification_settings_get'));
  await db.query("update app_members set status='disabled' where id=$1",[app.memberId]);
  for(const [name,args] of [['app_notification_settings_get',[]],['app_notification_settings_save',[settings]],['app_member_online_start',[]]]) {
    await assert.rejects(asUser(db,actor,()=>rpc(db,name,args)),/FORBIDDEN/);
  }
  await db.query('delete from auth.sessions where id=$1',[other.session]);
  await assert.rejects(asUser(db,other,()=>rpc(db,'app_notification_settings_get')),/AUTH_REQUIRED/);
  await asUser(db,actor,async()=>{
    await assert.rejects(db.exec('update app_notification_settings set settings=\'{}\''),e=>e.code==='42501');
    await assert.rejects(db.exec('delete from app_member_online_sessions'),e=>e.code==='42501');
  });
});
