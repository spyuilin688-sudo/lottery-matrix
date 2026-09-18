import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const families=['explore','tianyan','tiangong'];
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth; create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'$$;`.replace("returns uuid", "returns text"));
 await db.exec(`create table public.admin_accounts(id uuid primary key,role text,status text); create table public.admin_push_subscriptions(id uuid primary key,admin_id uuid,endpoint text,p256dh text,auth_key text,enabled boolean,updated_at timestamptz);`);
 for(const f of families)for(const op of ['list','validation'])await db.exec(`create function public.matrix_${f}_${op}(p_request jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$begin if p_request->>'error'='denied' then raise exception using errcode='42501',message='FORBIDDEN'; end if; if p_request->>'error'='invalid' then raise exception using errcode='22023',message='INVALID_REQUEST'; end if; if p_request->>'error'='ready' then raise exception using errcode='P0001',message='ANALYSIS_NOT_READY'; end if; if p_request->>'error'='version' then raise exception using errcode='P0001',message='ANALYSIS_VERSION_MISMATCH'; end if; if p_request->>'error'='internal' then raise exception using errcode='XX000',message='secret'; end if; return jsonb_build_object('request',p_request,'uid',auth.uid()); end$$; revoke all on function public.matrix_${f}_${op}(jsonb) from public; grant execute on function public.matrix_${f}_${op}(jsonb) to authenticated,service_role${f==='explore'?',anon':''};`);
 await db.exec(readFileSync('docs/security/security-monitoring.sql','utf8'));
 await db.exec(`set request.method='POST'; set request.jwt.claims='{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}';`);
 return db;
}
test('wrapper preserves payload and JWT identity, business failures commit, unknown failures raise',async()=>{
 const db=await fixture(); try {
 const success=(await db.query(`select public.matrix_explore_list('{"x":1}') result`)).rows[0].result;
 assert.equal(success.request.x,1); assert.equal(success.uid,'00000000-0000-0000-0000-000000000001');
 await db.exec('begin');
 const error=(await db.query(`select public.matrix_explore_list('{"error":"denied"}') result,current_setting('response.status',true) status`)).rows[0];
 assert.deepEqual(error.result,{code:'42501',message:'FORBIDDEN',details:null,hint:null});
 assert.equal((await db.query(`select current_setting('response.status') status`)).rows[0].status,'403');
 await db.exec('commit');
 assert.equal((await db.query(`select sum(denied_count)::int n from private.security_counters`)).rows[0].n,1);
 await assert.rejects(db.query(`select public.matrix_explore_list('{"error":"internal"}')`),/secret/);
 }finally{await db.close();}
});
test('ACLs, GET safety, observe/enforce boundary and telemetry failure isolation',async()=>{
 const db=await fixture();try{
 for(const f of families){ assert.equal((await db.query(`select has_function_privilege('anon','public.matrix_${f}_list(jsonb)','execute') allowed`)).rows[0].allowed,f==='explore'); assert.equal((await db.query(`select has_function_privilege('authenticated','private.matrix_${f}_list_impl(jsonb)','execute') allowed`)).rows[0].allowed,false); }
 await db.exec(`set role authenticated`); await assert.rejects(db.query(`select private.matrix_explore_list_impl('{}')`),/permission denied/); await db.exec(`reset role`);
 await db.exec(`set request.method='GET'`); await assert.rejects(db.query(`select public.matrix_explore_list('{}')`),/POST_REQUIRED/); assert.equal((await db.query(`select count(*)::int n from private.security_counters`)).rows[0].n,0);
 await db.exec(`set request.method='POST'; update private.security_policies set threshold=2 where category='public_query'`);
 for(let i=0;i<3;i++) assert.ok((await db.query(`select public.matrix_explore_list('{}') result`)).rows[0].result.request);
 await db.exec(`update private.security_policies set mode='enforce' where category='public_query'`);
 assert.equal((await db.query(`select public.matrix_explore_list('{}') result`)).rows[0].result.code,'RATE_LIMITED');
 await db.exec(`set request.jwt.claims='{"role":"anon"}'`); for(let i=0;i<4;i++)assert.ok((await db.query(`select public.matrix_explore_list('{}') result`)).rows[0].result.request);
 await db.exec(`alter table private.security_counters rename to counters_unavailable`); assert.ok((await db.query(`select public.matrix_explore_list('{}') result`)).rows[0].result.request);
 }finally{await db.close();}
});
test('service ingestion aggregates, deduplicates jobs, lease and enrollment safeguards',async()=>{
 const db=await fixture();try{
 await db.exec(`insert into public.admin_accounts values ('00000000-0000-0000-0000-000000000010','超級管理員','啟用'); insert into public.admin_push_subscriptions values ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000010','https://fcm.googleapis.com/a','p','a',true,now()-interval '1 day'); update private.security_policies set threshold=2 where category='admin_login';`);
 for(let i=0;i<4;i++)await db.query(`select public.security_observe('admin_login',$1,true,'attempt')`,['a'.repeat(64)]);
 assert.equal((await db.query(`select count(*)::int n from private.admin_security_push_jobs`)).rows[0].n,1);
 const job=(await db.query(`select * from public.admin_security_push_claim()`)).rows[0]; assert.equal(job.event_count,4);
 assert.equal((await db.query(`select public.admin_security_push_eligible($1,$2) ok`,[job.id,job.lease_token])).rows[0].ok,true);
 assert.equal((await db.query(`select public.admin_security_push_finish($1,gen_random_uuid(),'sent',false) ok`,[job.id])).rows[0].ok,false);
 await db.exec(`update public.admin_push_subscriptions set updated_at=now()+interval '1 second'`);
 assert.equal((await db.query(`select public.admin_security_push_eligible($1,$2) ok`,[job.id,job.lease_token])).rows[0].ok,false);
 assert.equal((await db.query(`select has_function_privilege('authenticated','public.security_observe(text,text,boolean,text)','execute') ok`)).rows[0].ok,false);
 }finally{await db.close();}
});

test('collisions cannot falsely enforce either identity; readiness is not a security denial',async()=>{
 const db=await fixture();try{
 await db.exec(`update private.security_policies set mode='enforce',threshold=2 where category='admin_login'`);
 const a='a'.repeat(64), b='a'.repeat(8)+'b'.repeat(56);
 await db.query(`select public.security_observe('admin_login',$1,true,'attempt')`,[a]);
 for(let i=0;i<4;i++) assert.equal((await db.query(`select public.security_observe('admin_login',$1,true,'attempt') result`,[b])).rows[0].result.allowed,true);
 assert.equal((await db.query(`select public.security_observe('admin_login',$1,true,'attempt') result`,[a])).rows[0].result.allowed,true);
 for(const error of ['ready','version']) {
  await db.exec('begin');
  const result=(await db.query(`select public.matrix_explore_validation($1) result`,[{error}])).rows[0].result;
  assert.equal(result.code,'P0001'); assert.equal((await db.query(`select current_setting('response.status') status`)).rows[0].status,'400');
  await db.exec('commit');
 }
 assert.equal((await db.query(`select sum(denied_count)::int n from private.security_counters where category='public_query'`)).rows[0].n,0);
 await db.exec(`set request.method=''`);await assert.rejects(db.query(`select public.matrix_explore_list('{"error":"denied"}')`),/FORBIDDEN/);
 await db.exec(`set request.method='POST'; set request.headers='{"prefer":"tx=rollback"}'`);
 await assert.rejects(db.query(`select public.matrix_explore_list('{}')`),/TRANSACTION_ROLLBACK_NOT_SUPPORTED/);
 }finally{await db.close();}
});
test('cooldown, atomic increments, retries, retention and policy audit revision',async()=>{
 const db=await fixture();try{
 const admin='00000000-0000-0000-0000-000000000010';
 await db.exec(`insert into public.admin_accounts values ('${admin}','超級管理員','啟用'); insert into public.admin_push_subscriptions values ('00000000-0000-0000-0000-000000000020','${admin}','https://fcm.googleapis.com/a','p','a',true,now()-interval '1 day');`);
 await assert.rejects(db.query(`select public.security_policy_update(gen_random_uuid(),'admin_login','enforce',2,300,1)`),/FORBIDDEN/);
 await db.query(`select public.security_policy_update($1,'admin_login','observe',2,300,1)`,[admin]);
 await assert.rejects(db.query(`select public.security_policy_update($1,'admin_login','enforce',2,300,1)`,[admin]),/REVISION_CONFLICT/);
 assert.equal((await db.query(`select count(*)::int n from private.security_policy_audit`)).rows[0].n,1);
 await Promise.all(Array.from({length:10},()=>db.query(`select public.security_observe('admin_login',$1,true,'attempt')`,['a'.repeat(64)])));
 assert.equal((await db.query(`select request_count n from private.security_counters`)).rows[0].n,10);
 assert.equal((await db.query(`select count(*)::int n from private.admin_security_push_jobs`)).rows[0].n,1);
 let job=(await db.query(`select * from public.admin_security_push_claim()`)).rows[0];assert.equal(job.event_count,10);
 assert.equal((await db.query(`select public.admin_security_push_finish($1,$2,'retry',false) ok`,[job.id,job.lease_token])).rows[0].ok,true);
 assert.equal((await db.query(`select * from public.admin_security_push_claim()`)).rows.length,0);
 for(let i=2;i<=5;i++){
  await db.exec(`update private.admin_security_push_jobs set next_attempt_at=now()-interval '1 second'`);
  job=(await db.query(`select * from public.admin_security_push_claim()`)).rows[0];
  await db.query(`select public.admin_security_push_finish($1,$2,'retry',false)`,[job.id,job.lease_token]);
 }
 assert.equal((await db.query(`select status from private.admin_security_push_jobs`)).rows[0].status,'failed');
 await db.exec(`update private.security_events set started_at=now()-interval '16 minutes'`);
 await db.query(`select public.security_observe('admin_login',$1,true,'attempt')`,['a'.repeat(64)]);
 assert.equal((await db.query(`select count(*)::int n from private.admin_security_push_jobs`)).rows[0].n,2);
 await db.exec(`update private.admin_security_push_jobs set created_at=now()-interval '8 days';update private.security_counters set updated_at=now()-interval '8 days';update private.security_events set updated_at=now()-interval '8 days';select private.security_cleanup();`);
 assert.equal((await db.query(`select count(*)::int n from private.admin_security_push_jobs`)).rows[0].n,0);
 }finally{await db.close();}
});
test('rollback restores original callable behavior and reapply restores wrappers without data loss',async()=>{
 const db=await fixture();try{
 await db.exec(readFileSync('docs/security/security-monitoring-rollback.sql','utf8'));
 assert.equal((await db.query(`select provolatile from pg_proc where oid='public.matrix_explore_list(jsonb)'::regprocedure`)).rows[0].provolatile,'s');
 await assert.rejects(db.query(`select public.matrix_explore_list('{"error":"denied"}')`),/FORBIDDEN/);
 await db.exec(readFileSync('docs/security/security-monitoring-reapply.sql','utf8'));
 assert.equal((await db.query(`select public.matrix_explore_list('{"error":"denied"}') result`)).rows[0].result.code,'42501');
 }finally{await db.close();}
});

test('failed-login pairs count each request once in the summary and claimed alert',async()=>{
 const db=await fixture();try{
 const admin='00000000-0000-0000-0000-000000000010';
 await db.exec(`insert into public.admin_accounts values ('${admin}','超級管理員','啟用'); insert into public.admin_push_subscriptions values ('00000000-0000-0000-0000-000000000020','${admin}','https://fcm.googleapis.com/a','p','a',true,now()-interval '1 day');`);
 for(let i=0;i<11;i++){
  await db.query(`select public.security_observe('admin_login',$1,true,'attempt')`,['a'.repeat(64)]);
  await db.query(`select public.security_observe('admin_login',$1,true,'denied')`,['a'.repeat(64)]);
 }
 assert.deepEqual((await db.query(`select request_count,denied_count from private.security_counters`)).rows[0],{request_count:11,denied_count:11});
 assert.deepEqual((await db.query(`select event_count,denied_count from private.security_events`)).rows[0],{event_count:11,denied_count:11});
 assert.equal((await db.query(`select * from public.admin_security_push_claim()`)).rows[0].event_count,11);
 }finally{await db.close();}
});
test('mixed outcomes and subthreshold windows retain grouped counts until cooldown rollover',async()=>{
 const db=await fixture();try{
 const observe=outcome=>db.query(`select public.security_observe('admin_login',$1,true,$2)`,['a'.repeat(64),outcome]);
 await observe('attempt');await observe('denied');
 const group=(await db.query(`select group_id from private.security_events`)).rows[0].group_id;
 for(let window=0;window<3;window++){
  await db.exec(`update private.security_counters set window_start=now()-interval '1 day'`);
  for(let i=0;i<3;i++){await observe('attempt');await observe(i===0?'denied':'success');}
 }
 assert.deepEqual((await db.query(`select event_count,denied_count,group_id from private.security_events`)).rows[0],{event_count:10,denied_count:4,group_id:group});
 assert.equal((await db.query(`select count(*)::int n from private.admin_security_push_jobs`)).rows[0].n,0);
 // A late outcome stays with its existing attempt, even across the cooldown boundary.
 await db.exec(`update private.security_events set started_at=now()-interval '16 minutes'`);
 await observe('success');
 assert.equal((await db.query(`select group_id from private.security_events`)).rows[0].group_id,group);
 // The next request starts a new group; prior requests in the same rate window are excluded.
 await observe('attempt');await observe('invalid');
 const next=(await db.query(`select event_count,denied_count,group_id from private.security_events`)).rows[0];
 assert.equal(next.event_count,1);assert.equal(next.denied_count,1);assert.notEqual(next.group_id,group);
 await observe('attempt');await observe('success');
 assert.equal((await db.query(`select event_count from private.security_events`)).rows[0].event_count,2);
 }finally{await db.close();}
});
