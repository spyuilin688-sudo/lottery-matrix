import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $f$;
create table public.members (id uuid default gen_random_uuid(), auth_user_id uuid, status text, is_lifetime boolean default false, current_plan_id uuid, plan_expires_at timestamptz, line_user_id text, referral_code text, invitation_code text, line_trial_started_at timestamptz, registered_at timestamptz default now());
create table public.plans(id uuid, name text);
create table public.payments(member_id uuid,status text);
`);
await db.exec(readFileSync(new URL('../../supabase/migrations/20260909215507_matrix_permission_switches.sql', import.meta.url),'utf8'));
const q = async sql => (await db.query(sql)).rows[0];
const read = async () => (await q('select public.matrix_permission_settings() as value')).value;
const ent = async () => (await q('select private.matrix_result_entitlements() as value')).value;
const setUser = async uid => db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
const change = async (key,value,revision) => db.query('select public.matrix_permission_settings_update($1::jsonb) as value',[JSON.stringify({key,value,expectedRevision:revision})]);
assert.equal((await read()).registeredMemberFreeAccess,false);
await db.exec("set role anon");
await assert.rejects(change('registeredMemberFreeAccess',true,0), /FORBIDDEN/);
await assert.rejects(db.query('select * from private.matrix_permission_credentials'), /permission denied/);
await assert.rejects(db.query('update private.matrix_permission_settings set registered_member_free_access=true'), /permission denied/);
await db.exec("reset role");
const token='local-test-only-credential-with-48-characters-123456789';
await db.query("insert into private.matrix_permission_credentials values(true,encode(sha256(convert_to($1,'UTF8')),'hex'))",[token]);
await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-matrix-management-token':token})]);
await db.exec("set role anon");
assert.equal((await change('registeredMemberFreeAccess',true,0)).rows[0].value.registeredMemberFreeAccess,true);
await assert.rejects(change('subscriptionPurchaseVisible',true,0),/SETTINGS_CONFLICT/);
for(const bad of [null,{},[],{key:'unknown',value:true,expectedRevision:1},{key:'registeredMemberFreeAccess',value:'true',expectedRevision:1},{key:'registeredMemberFreeAccess',value:true,expectedRevision:1,extra:true},{key:'registeredMemberFreeAccess',value:true,expectedRevision:1.5}]) {
 await assert.rejects(db.query('select public.matrix_permission_settings_update($1::jsonb)',[JSON.stringify(bad)]), /INVALID_REQUEST/);
}
await db.exec("reset role");
assert.equal((await ent()).canUseThirteen,false,'guest cannot gain free access');
const old='11111111-1111-4111-8111-111111111111', newer='22222222-2222-4222-8222-222222222222';
await db.query("insert into public.members(auth_user_id,registered_at) values ($1,now()-interval '1 year'),($2,now())",[old,newer]);
for(const uid of [old,newer]) {
 await setUser(uid); const rights=await ent();
 for(const key of ['canUseSeven','canUseThirteen','canUseFullRange','canUseTianyan','canUseTiangong']) assert.equal(rights[key],true,key);
 for(const key of ['canViewFullStatus','canCustomizeStatus','canUseCompositeCustomRoad']) assert.equal(rights[key],false,key);
}
await db.query("update public.members set status='停用' where auth_user_id=$1",[newer]);
await assert.rejects(ent(),/FORBIDDEN/);
await setUser('33333333-3333-4333-8333-333333333333');
await assert.rejects(ent(),/FORBIDDEN/);
await setUser(old);
await change('subscriptionPurchaseVisible',true,1);
assert.equal((await ent()).canUseThirteen,true,'purchase flag is independent');
await change('registeredMemberFreeAccess',false,2);
assert.equal((await ent()).canUseThirteen,false);
assert.equal((await ent()).canUseTianyan,false);
await db.query("update public.members set is_lifetime=true where auth_user_id=$1",[old]);
assert.equal((await ent()).canUseTiangong,true,'paid entitlement survives closing');
assert.equal((await q('select count(*)::int as n from public.members where current_plan_id is not null or plan_expires_at is not null')).n,0);
console.log('PASS: settings authorization, payload validation, revision conflict, guest/old/new/disabled/missing members, five-feature scope, independent toggles and paid fallback');
await db.close();
