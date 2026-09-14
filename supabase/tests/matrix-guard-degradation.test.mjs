import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Captured verbatim from production on 2026-09-14. Real authorization and query
// implementations are exercised against isolated fixtures; only limiter and
// active-version lookup are substituted. No production account/data is touched.
const entitlementsSql = String.raw`CREATE OR REPLACE FUNCTION private.matrix_result_entitlements()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan text := 'free';
  v_paid boolean := false;
  v_free_access boolean := false;
  v_referrals integer := 0;
  v_dow integer := extract(isodow from pg_catalog.timezone('Asia/Taipei', pg_catalog.now()));
begin
  if v_uid is not null then
    select * into v_member from public.members where auth_user_id = v_uid limit 1;
    if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
    select registered_member_free_access into v_free_access
    from private.matrix_permission_settings where singleton;
    v_free_access := coalesce(v_free_access, false);
    if v_member.is_lifetime then
      v_plan := 'lifetime';
      v_paid := true;
    else
      select case plan.name
        when '試用方案' then 'trial'
        when '月費方案' then 'monthly'
        when '季費方案' then 'quarterly'
        when '年費方案' then 'yearly'
        else 'free'
      end into v_plan
      from public.plans as plan where plan.id = v_member.current_plan_id;
      v_plan := coalesce(v_plan, 'free');
      v_paid := v_plan <> 'free'
        and coalesce(v_member.plan_expires_at > pg_catalog.now(), false);
    end if;
    if coalesce(v_member.referral_code, '') <> '' then
      select pg_catalog.count(distinct invited.id)::integer into v_referrals
      from public.members as invited
      where invited.invitation_code = v_member.referral_code
        and exists (
          select 1 from public.payments as payment
          where payment.member_id = invited.id and payment.status = 'confirmed'
        );
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'canUseSeven', v_free_access or v_paid or v_referrals >= 15 or (v_uid is not null and nullif(pg_catalog.btrim(v_member.line_user_id), '') is not null and v_dow in (2, 5)) or (v_referrals >= 10 and v_dow in (1, 4)),
    'canUseThirteen', v_free_access or v_paid,
    'canUseFullRange', v_free_access or v_paid or v_referrals >= 50 or (v_referrals >= 30 and v_dow in (2, 5)),
    'canUseTianyan', v_free_access or (v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')) or coalesce(v_member.line_trial_started_at <= pg_catalog.now() and v_member.line_trial_started_at + interval '48 hours' > pg_catalog.now(), false),
    'canUseTiangong', v_free_access or (v_paid and v_plan in ('yearly', 'lifetime')) or coalesce(v_member.line_trial_started_at <= pg_catalog.now() and v_member.line_trial_started_at + interval '24 hours' > pg_catalog.now(), false),
    'canViewFullStatus', v_paid,
    'canCustomizeStatus', v_paid and v_plan <> 'trial',
    'canUseCompositeCustomRoad', v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')
  );
end;
$function$`;
const exploreSql = String.raw`CREATE OR REPLACE FUNCTION private.matrix_explore_list_impl(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_order text := p_request->>'numberOrder';
  v_periods integer := (p_request->>'explorePeriods')::integer;
  v_offset integer := (p_request->>'exploreDateOffset')::integer;
  v_range text := p_request->>'exploreRange';
  v_rule integer := (p_request->>'ruleCount')::integer;
  v_roads jsonb := coalesce(p_request->'roadTypes', '[]'::jsonb);
  v_streaks jsonb := coalesce(p_request->'selectedStreaks', '[]'::jsonb);
  v_same boolean := coalesce((p_request->>'sameCode')::boolean, false);
  v_prediction_number text := nullif(pg_catalog.btrim(p_request->>'predictionNumber'), '');
  v_entitlements jsonb;
  v_version text;
  v_draw text;
  v_items jsonb;
  v_stats jsonb;
  v_total integer;
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_order not in ('依號碼由小到大排序', '依實際開獎順序排序')
    or v_periods is null or v_periods not in (2, 7, 13)
    or v_offset is null or v_offset not in (0, 1, 2)
    or v_range not in ('標準範圍', '完整範圍')
    or v_rule is null or v_rule not in (1, 2)
    or pg_catalog.jsonb_typeof(v_roads) <> 'array'
    or pg_catalog.jsonb_array_length(v_roads) = 0
    or pg_catalog.jsonb_typeof(v_streaks) <> 'array'
    or (v_prediction_number is not null and v_prediction_number !~ '^(0[1-9]|[1-4][0-9])$') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  v_entitlements := private.matrix_result_entitlements();
  if (v_periods = 7 and not (v_entitlements->>'canUseSeven')::boolean)
    or (v_periods = 13 and not (v_entitlements->>'canUseThirteen')::boolean)
    or (v_range = '完整範圍' and not (v_entitlements->>'canUseFullRange')::boolean) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  v_draw := private.matrix_analysis_read_period(v_lottery, v_period, v_offset);
  v_version := private.matrix_analysis_order_version(v_lottery, v_draw, v_order, 'explore');

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  with base as (
    select result.*
    from public.matrix_explore_results as result
    where result.lottery = v_lottery
      and result.draw_period = v_draw
      and result.analysis_version = v_version
      and (
        result.explore_range = '標準範圍'
        or v_range = '完整範圍'
      )
      and result.number_order = v_order
      and result.locked_source_index < v_periods
      and result.rule_count = v_rule
      and v_roads ? result.algorithm_type
      and v_streaks ? result.consecutive
  ), same_groups as (
    select prediction_numbers
    from base
    group by prediction_numbers
    having pg_catalog.count(*) > 1
  ), same_allowed as (
    select base.*
    from base
    where not v_same
      or exists (
        select 1 from same_groups
        where same_groups.prediction_numbers = base.prediction_numbers
      )
  ), number_counts as (
    select number, pg_catalog.count(*)::integer as count
    from same_allowed
    cross join lateral pg_catalog.jsonb_array_elements_text(same_allowed.prediction_numbers) as number
    group by number
  ), filtered as (
    select same_allowed.*
    from same_allowed
    where v_prediction_number is null
      or same_allowed.prediction_numbers ? v_prediction_number
  )
  select
    coalesce(
      pg_catalog.jsonb_agg(
        filtered.item || pg_catalog.jsonb_build_object(
          'explorePeriods', v_periods,
          'exploreDateOffset', v_offset
        )
        order by
          case when v_same or v_prediction_number is not null then filtered.prediction_numbers::text else '' end,
          filtered.highest_streak desc,
          filtered.prediction_distance,
          filtered.locked_position,
          filtered.item_id
      ),
      '[]'::jsonb
    ),
    pg_catalog.count(*)::integer
  into v_items, v_total
  from filtered;

  with base as (
    select result.prediction_numbers
    from public.matrix_explore_results as result
    where result.lottery = v_lottery
      and result.draw_period = v_draw
      and result.analysis_version = v_version
      and (
        result.explore_range = '標準範圍'
        or v_range = '完整範圍'
      )
      and result.number_order = v_order
      and result.locked_source_index < v_periods
      and result.rule_count = v_rule
      and v_roads ? result.algorithm_type
      and v_streaks ? result.consecutive
  ), same_groups as (
    select prediction_numbers
    from base
    group by prediction_numbers
    having pg_catalog.count(*) > 1
  ), same_allowed as (
    select base.*
    from base
    where not v_same
      or exists (
        select 1 from same_groups
        where same_groups.prediction_numbers = base.prediction_numbers
      )
  ), number_counts as (
    select number, pg_catalog.count(*)::integer as count
    from same_allowed
    cross join lateral pg_catalog.jsonb_array_elements_text(same_allowed.prediction_numbers) as number
    group by number
  ), top_numbers as (
    select number, count
    from number_counts
    order by count desc, number::integer
    limit 18
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('number', number, 'count', count)
      order by count desc, number::integer
    ),
    '[]'::jsonb
  ) into v_stats
  from top_numbers;

  return pg_catalog.jsonb_build_object(
    'kind', 'explore',
    'lottery', v_lottery,
    'drawPeriod', v_draw,
    'analysisVersion', v_version,
    'status', 'complete',
    'items', v_items,
    'duplicateStats', v_stats,
    'total', v_total
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$function$`;
const wrapperSql = String.raw`CREATE OR REPLACE FUNCTION public.matrix_explore_list(p_request jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.matrix_request_guard('explore_list',p_request)$function$`;
const migrationUrl = new URL('../migrations/20260914114232_guard_degradation.sql', import.meta.url);
const rollbackUrl = new URL('../rollbacks/20260914114232_guard_degradation.sql', import.meta.url);

const fixtureSql = `
create schema private;
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid
$$;
create table public.members (
 id uuid primary key, auth_user_id uuid, status text, is_lifetime boolean,
 current_plan_id uuid, plan_expires_at timestamptz, referral_code text,
 invitation_code text, line_user_id text, line_trial_started_at timestamptz
);
create table public.plans (id uuid primary key, name text);
create table public.payments (member_id uuid, status text);
create table private.matrix_permission_settings (singleton boolean, registered_member_free_access boolean);
insert into private.matrix_permission_settings values (true,false);
insert into public.plans values ('00000000-0000-0000-0000-000000000010','年費方案');
insert into public.members (id,auth_user_id,status,is_lifetime,current_plan_id,plan_expires_at)
select id,id,status,lifetime,'00000000-0000-0000-0000-000000000010',expiry
from (values
 ('00000000-0000-0000-0000-000000000001'::uuid,'啟用',false,now()+interval '1 day'),
 ('00000000-0000-0000-0000-000000000002'::uuid,'啟用',false,now()-interval '1 day'),
 ('00000000-0000-0000-0000-000000000003'::uuid,'停用',true,now()+interval '1 day')
) fixture(id,status,lifetime,expiry);
create table private.security_identity_secret (secret text);
insert into private.security_identity_secret values ('isolated-test-secret');
create function private.security_collect(text,text,boolean,text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('test.limiter',true)='attempt_error' and $4='attempt'
   or current_setting('test.limiter',true)='outcome_error' and $4<>'attempt' then
   raise exception using errcode='55P03',message='fixture-sensitive-token-DO-NOT-LOG';
 end if;
 if current_setting('test.limiter',true)='null' then return null; end if;
 if current_setting('test.limiter',true)='malformed' then return '{"allowed":"yes"}'::jsonb; end if;
 return jsonb_build_object('allowed',current_setting('test.limiter',true)<>'denied','retryAfter',9,'mode','observe');
end $$;
create function private.matrix_analysis_read_period(text,text,integer) returns text
language sql stable as $$ select 'fixture-period'::text $$;
create function private.matrix_analysis_order_version(text,text,text,text) returns text
language sql stable as $$ select 'fixture-version'::text $$;
create table public.matrix_explore_results (
 lottery text, draw_period text, analysis_version text, explore_range text,
 number_order text, locked_source_index int, rule_count int, algorithm_type text,
 consecutive text, prediction_numbers jsonb, item jsonb, highest_streak int,
 prediction_distance int, locked_position int, item_id text
);
insert into public.matrix_explore_results values (
 '今彩539','fixture-period','fixture-version','標準範圍',
 '依號碼由小到大排序',0,1,'加減版路','準2進3','["01"]','{"id":"fixture-item"}',2,1,1,'fixture-item'
);
`;

const requestParams = {
 lottery: '今彩539', numberOrder: '依號碼由小到大排序',
 explorePeriods: 2, exploreDateOffset: 0, exploreRange: '標準範圍',
 ruleCount: 1, roadTypes: ['加減版路'], selectedStreaks: ['準2進3'],
};
const uid = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');

test('matrix guard degradation uses isolated Postgres fixtures', async t => {
 const db = new PGlite();
 t.after(() => db.close());
 const migration = await readFile(migrationUrl,'utf8');
 const rollback = await readFile(rollbackUrl,'utf8');
 await db.exec([fixtureSql, entitlementsSql, exploreSql, rollback, wrapperSql].join('\n;\n'));
 await db.exec(`
 revoke all on function private.matrix_request_guard(text,jsonb) from public;
 revoke all on function private.matrix_result_entitlements() from public;
 revoke all on function private.matrix_explore_list_impl(jsonb) from public;
 revoke all on function public.matrix_explore_list(jsonb) from public;
 grant execute on function public.matrix_explore_list(jsonb) to anon,authenticated,service_role;
 `);

 async function request({member=null, limiter='normal', params={}, method='POST'}={}) {
  const notices=[];
  return db.transaction(async tx => {
   const role=member===null?'anon':'authenticated';
   await tx.query(`select set_config('request.jwt.claims',$1,true),
      set_config('request.method',$2,true),set_config('request.headers','{}',true),
      set_config('test.limiter',$3,true),set_config('response.status','',true),
      set_config('response.headers','',true),set_config('client_min_messages','log',true)`,
      [JSON.stringify({role,...(member===null?{}:{sub:uid(member)})}),method,limiter]);
   await tx.exec('set local role '+role);
   const result=await tx.query('select public.matrix_explore_list($1::jsonb) result',
    [JSON.stringify({...requestParams,...params})],{onNotice:notice=>notices.push(notice)});
   const response=await tx.query(`select nullif(current_setting('response.status',true),'') status,
      nullif(current_setting('response.headers',true),'')::jsonb headers`);
   return {body:result.rows[0].result,...response.rows[0],notices};
  });
 }

 await t.test('baseline reproduces silent limiter failure returning query data',async()=>{
  const result=await request({limiter:'attempt_error'});
  assert.equal(result.status,null);
  assert.equal(result.body.status,'complete');
  assert.equal(result.notices.length,0);
 });
 await db.exec(migration);

 await t.test('initial collector exception returns 503, retry hint and sanitized LOG',async()=>{
  const result=await request({member:1,limiter:'attempt_error'});
  assert.equal(result.status,'503');
  assert.deepEqual(result.headers,[{'Retry-After':'5'}]);
  assert.deepEqual(result.body,{
   code:'RATE_LIMIT_UNAVAILABLE',message:'Request protection temporarily unavailable',details:null,hint:null,
  });
  assert.equal(result.notices.length,1);
  assert.equal(result.notices[0].message,'MATRIX_RATE_LIMIT_UNAVAILABLE sqlstate=55P03');
  assert.equal(result.notices[0].severity,'LOG');
  assert.doesNotMatch(JSON.stringify(result),/fixture-sensitive-token|isolated-test-secret|00000000-0000/);
 });
 await t.test('null and malformed limiter result cannot silently disable protection',async()=>{
  for(const limiter of ['null','malformed']){
   const result=await request({limiter});
   assert.equal(result.status,'503');
   assert.equal(result.notices[0].message,'MATRIX_RATE_LIMIT_UNAVAILABLE sqlstate=22023');
  }
 });
 await t.test('next request recovers without internal retry or changed normal JSON format',async()=>{
  const result=await request();
  assert.equal(result.status,null);
  assert.deepEqual(result.body.items,[{id:'fixture-item',explorePeriods:2,exploreDateOffset:0}]);
  assert.equal(result.body.total,1);
  assert.deepEqual(result.body.duplicateStats,[{number:'01',count:1}]);
  assert.equal(result.notices.length,0);
 });
 await t.test('intentional limiter denial keeps existing 429 contract',async()=>{
  const result=await request({limiter:'denied'});
  assert.equal(result.status,'429');
  assert.equal(result.body.code,'RATE_LIMITED');
  assert.deepEqual(result.headers,[{'Retry-After':'9'}]);
 });
 await t.test('anon can query standard results but cannot access restricted range',async()=>{
  const result=await request({params:{explorePeriods:13}});
  assert.equal(result.status,'401');
  assert.equal(result.body.code,'42501');
  assert.equal(result.body.message,'FORBIDDEN');
 });
 await t.test('current paid member keeps authorized full-range results',async()=>{
  const result=await request({member:1,params:{explorePeriods:13,exploreRange:'完整範圍'}});
  assert.equal(result.status,null);
  assert.equal(result.body.total,1);
 });
 await t.test('expired member denied premium range while standard remains available',async()=>{
  assert.equal((await request({member:2})).body.status,'complete');
  const result=await request({member:2,params:{explorePeriods:13}});
  assert.equal(result.status,'403');
  assert.equal(result.body.code,'42501');
 });
 await t.test('disabled member is denied even with lifetime subscription',async()=>{
  const result=await request({member:3});
  assert.equal(result.status,'403');
  assert.equal(result.body.message,'FORBIDDEN');
 });
 await t.test('free registered access retains existing expired-member behavior and rejects disabled',async()=>{
  await db.exec('update private.matrix_permission_settings set registered_member_free_access=true');
  try{
   assert.equal((await request({member:2,params:{explorePeriods:13}})).body.status,'complete');
   assert.equal((await request({member:3})).status,'403');
   assert.equal((await request({params:{explorePeriods:13}})).status,'401');
  }finally{
   await db.exec('update private.matrix_permission_settings set registered_member_free_access=false');
  }
 });
 await t.test('outcome logging failure preserves actual 401 and 403 authorization failures',async()=>{
  for(const member of [null,2,3]){
   const result=await request({member,limiter:'outcome_error',params:{explorePeriods:13}});
   assert.equal(result.status,member===null?'401':'403');
   assert.equal(result.body.code,'42501');
   assert.equal(result.body.message,'FORBIDDEN');
   assert.equal(result.notices[0].message,'MATRIX_RATE_LIMIT_OUTCOME_UNAVAILABLE sqlstate=55P03');
   assert.doesNotMatch(JSON.stringify(result),/fixture-sensitive-token|isolated-test-secret/);
  }
 });
 await t.test('invalid-request tracking failure keeps the original 400',async()=>{
  const result=await request({limiter:'outcome_error',params:{explorePeriods:999}});
  assert.equal(result.status,'400');
  assert.equal(result.body.message,'INVALID_REQUEST');
  assert.equal(result.notices[0].message,'MATRIX_RATE_LIMIT_OUTCOME_UNAVAILABLE sqlstate=55P03');
 });
 await t.test('unexpected entitlement database errors propagate and never return allowed data',async()=>{
  await db.exec('alter table public.plans rename to unavailable_plans');
  try{
   await assert.rejects(request({member:1}),error=>error.code==='42P01');
  }finally{
   await db.exec('alter table public.unavailable_plans rename to plans');
  }
 });
 await t.test('single guard retains POST requirement and private ACL',async()=>{
  await assert.rejects(request({method:'GET'}),error=>error.code==='25006');
  const {rows}=await db.query(`select has_function_privilege('anon','private.matrix_request_guard(text,jsonb)','EXECUTE') anon_guard,
   has_function_privilege('authenticated','private.matrix_request_guard(text,jsonb)','EXECUTE') member_guard,
   p.prosecdef,p.proconfig from pg_proc p where p.oid='private.matrix_request_guard(text,jsonb)'::regprocedure`);
  assert.equal(rows[0].anon_guard,false);
  assert.equal(rows[0].member_guard,false);
  assert.equal(rows[0].prosecdef,true);
  assert.deepEqual(rows[0].proconfig,['search_path=""']);
 });
 await t.test('rollback restores previous definition and reapplication recovers protection',async()=>{
  await db.exec(rollback);
  assert.equal((await request({limiter:'attempt_error'})).body.status,'complete');
  await db.exec(migration);
  assert.equal((await request({limiter:'attempt_error'})).status,'503');
  assert.equal((await request({member:1})).body.status,'complete');
 });
});
