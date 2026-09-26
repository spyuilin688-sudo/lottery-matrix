import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPsqlClient,assertLocalAppTestDatabase } from './helpers/app-postgres.mjs';
import { createAppNotificationDb } from './helpers/app-notification-db.mjs';
import { applyAppMigrations,identity,rpc,asUser } from './helpers/app-db.mjs';
const url=process.env.APP_TEST_DATABASE_URL;
assert.ok(url,'Run through scripts/run-app-db-checks.mjs with a dedicated local server');assertLocalAppTestDatabase(url);
const claims=who=>JSON.stringify({sub:who.user,session_id:who.session,role:'authenticated'});
async function login(client,who){await client.query("select set_config('request.jwt.claims',$1,false)",[claims(who)]);await client.exec('set role authenticated;');}
async function waitForLock(db,pid){
 const until=Date.now()+4000;
 while(Date.now()<until){if((await db.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]?.wait_event_type==='Lock') return;await new Promise(done=>setTimeout(done,20));}
 assert.fail('Concurrent connection did not reach the expected database lock');
}
test('real Postgres serializes App bootstrap, deletion vs PWA join, and unique revenue events',async t=>{
 const db=createPsqlClient(url),a=createPsqlClient(url),b=createPsqlClient(url);
 t.after(async()=>{await a.close();await b.close();await db.close();});
 await createAppNotificationDb({database:db});
 await db.exec(`alter table auth.users add column email text;create table public.admin_accounts(id uuid primary key,account text,role text,status text);`);
 await applyAppMigrations(db,['app_account_deletion']);
 const who=await identity(db);
 const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 await login(a,who);await login(b,who);await a.exec('begin;');
 const first=await rpc(a,'app_member_bootstrap');
 const pending=rpc(b,'app_member_bootstrap');await waitForLock(db,pid);await a.exec('commit;');
 assert.equal((await pending).memberId,first.memberId);
 assert.equal((await db.query('select count(*)::int n from public.app_members')).rows[0].n,1);
 // Deletion first: PWA waits on the exact same identity lock, then rejects pending cleanup.
 await a.exec('reset role;begin;');
 await rpc(a,'app_account_deletion_begin',[who.user,who.session]);
 const pwaJoin=rpc(b,'member_bootstrap');pwaJoin.catch(()=>{});
 await waitForLock(db,pid);await a.exec('commit;');
 await assert.rejects(pwaJoin,/ACCOUNT_DELETION_PENDING|AUTH_REQUIRED/);
 assert.equal((await db.query('select count(*)::int n from public.members')).rows[0].n,0);
 // The opposite ordering retains Auth and PWA after their transaction commits.
 const shared=await identity(db);await login(a,shared);await a.exec('begin;');
 await rpc(a,'member_bootstrap');
 await b.exec('reset role;');const deletion=rpc(b,'app_account_deletion_begin',[shared.user,shared.session]);
 await waitForLock(db,pid);await a.exec('commit;');assert.equal((await deletion).authIdentity,'retained');
 // Unique source IDs are enforced across independent transactions, not in a JS set.
 await a.exec('reset role;begin;');await a.exec("insert into public.app_revenue_entries(source_event_id,currency,gross_minor,occurred_at) values('same-source','TWD',100,now());");
 const duplicate=b.exec("insert into public.app_revenue_entries(source_event_id,currency,gross_minor,occurred_at) values('same-source','TWD',100,now());");duplicate.catch(()=>{});
 await waitForLock(db,pid);await a.exec('commit;');await assert.rejects(duplicate,/duplicate key/);
 assert.equal((await db.query('select count(*)::int n from public.app_revenue_entries')).rows[0].n,1);
 // Two workers must never acquire the same unexpired delivery lease.
 const pushUser=await identity(db),installation=randomUUID(),eventId=randomUUID();
 await asUser(db,pushUser,async()=>{
  await rpc(db,'app_member_bootstrap');
  await rpc(db,'app_native_push_save',[installation,'fixture-token-'+installation,'android']);
  const settings=await rpc(db,'app_notification_settings_get');settings.settings.result=true;
  await rpc(db,'app_notification_settings_save',[settings]);
 });
 await db.query("insert into notification_events(id,event_key,event_type,source,payload,occurred_at) values($1,$1,'lottery_result','railway',$2,now())",[eventId,{lottery:'今彩539',drawDate:'2026-09-26',numbers:['01','02','03','04','05']}]);
 // Materialize a pending delivery before testing claim locking independently.
 const [initial]=await rpc(db,'app_native_notification_claim',[20]);assert.ok(initial);
 await db.exec("update private.app_native_push_deliveries set status='pending',claim_id=null,lease_until=null,attempt_count=0;");
 await a.exec('begin;');const [leased]=await rpc(a,'app_native_notification_claim',[20]);
 assert.equal(leased.delivery_id,initial.delivery_id);
 assert.deepEqual(await rpc(b,'app_native_notification_claim',[20]),[]);
 await a.exec('commit;');
 assert.deepEqual(await rpc(b,'app_native_notification_claim',[20]),[]);
 assert.deepEqual(await rpc(a,'app_native_notification_finalize',[leased.delivery_id,leased.claim_id,'sent']),{finalized:true});
 assert.equal((await db.query("select count(*)::int n from private.app_native_push_deliveries where status='sent'")).rows[0].n,1);

});
