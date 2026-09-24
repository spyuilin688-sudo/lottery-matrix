import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const path=new URL('../supabase/migrations/20260920051031_watchdog_schedule_evidence.sql',import.meta.url);
const scalar=async(db,q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema private;create schema vault;create schema net;
 create table vault.decrypted_secrets(name text,decrypted_secret text);
 insert into vault.decrypted_secrets values('matrix_project_url','https://example.test'),('matrix_admin_watchdog_token','fixture');
 create table net.requests(id bigint generated always as identity,url text,headers jsonb,body jsonb);
 create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$declare v_id bigint;begin insert into net.requests(url,headers,body) values(url,headers,body) returning id into v_id;return v_id;end$$;
 create table private.test_gate(due boolean);insert into private.test_gate values(false);
 create function private.matrix_watchdog_should_call(timestamptz) returns boolean language sql as $$select due from private.test_gate$$;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20260910123745_admin_watchdog_status_store.sql',import.meta.url),'utf8'));
 await db.exec(`insert into private.admin_watchdog_status values(true,'{"status":"ok","completedAt":"2026-09-19T21:34:50Z"}','2026-09-19T21:34:50Z');`);
 await db.exec(readFileSync(path,'utf8'));
 return db;
}
test('idle ticks retain the previous report but expose fresh schedule evidence without HTTP',async t=>{
 const db=await fixture();t.after(()=>db.close());
 assert.equal(await scalar(db,"select private.matrix_admin_watchdog_http_tick('2026-09-19T21:53:00Z')"),null);
 const result=await scalar(db,'select admin_watchdog_status_read()');
 assert.equal(result.completedAt,'2026-09-19T21:34:50Z');
 assert.deepEqual(result.schedule,{checkedAt:'2026-09-19T21:53:00+00:00',due:false,pendingSince:null});
 assert.equal(await scalar(db,'select count(*) from net.requests'),0);
});
test('successive requests and idle ticks cannot reset an uncompleted request deadline',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.exec('update private.test_gate set due=true');
 assert.equal(await scalar(db,"select private.matrix_admin_watchdog_http_tick('2026-09-19T21:43:00Z')"),1);
 await scalar(db,"select private.matrix_admin_watchdog_http_tick('2026-09-19T21:53:00Z')");
 await db.exec('update private.test_gate set due=false');
 await scalar(db,"select private.matrix_admin_watchdog_http_tick('2026-09-19T22:03:00Z')");
 assert.equal((await scalar(db,'select admin_watchdog_status_read()')).schedule.pendingSince,'2026-09-19T21:43:00+00:00');
 await db.exec("update private.admin_watchdog_status set updated_at='2026-09-19T22:04:00Z',status=status||'{\"completedAt\":\"2026-09-19T22:04:00Z\"}'");
 assert.equal((await scalar(db,'select admin_watchdog_status_read()')).schedule.pendingSince,null);
 await db.exec('update private.test_gate set due=true');
 await scalar(db,"select private.matrix_admin_watchdog_http_tick('2026-09-19T22:13:00Z')");
 assert.equal((await scalar(db,'select admin_watchdog_status_read()')).schedule.pendingSince,'2026-09-19T22:13:00+00:00');
});
test('schedule metadata is server-owned and unavailable to members',async t=>{
 const db=await fixture();t.after(()=>db.close());
 await db.exec("update private.admin_watchdog_status set status=status||'{\"schedule\":{\"due\":false}}'");
 assert.equal((await scalar(db,'select admin_watchdog_status_read()')).schedule,undefined);
 await scalar(db,"select private.matrix_admin_watchdog_http_tick('2026-09-19T21:53:00Z')");
 for(const role of ['anon','authenticated']) {
  assert.equal(await scalar(db,"select has_table_privilege($1,'private.admin_watchdog_schedule','SELECT')",[role]),false);
  assert.equal(await scalar(db,"select has_function_privilege($1,'private.matrix_admin_watchdog_http_tick(timestamptz)','EXECUTE')",[role]),false);
 }
 await db.exec('set role service_role');
 assert.equal((await scalar(db,'select public.admin_watchdog_status_read()')).schedule.due,false);
 await assert.rejects(db.exec('update private.admin_watchdog_schedule set due=true'),/permission denied/);
});
