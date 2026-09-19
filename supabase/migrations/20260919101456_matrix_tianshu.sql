-- Independent three-lock TianShu results and guarded reads for v15+ analysis.
-- Historical v14 and legacy active versions keep their five-artifact contract.
begin;

create table public.matrix_tianshu_results (
  lottery text not null check (lottery in ('今彩539','天天樂','六合彩','大樂透')),
  draw_period text not null,
  analysis_version text not null,
  item_id text not null,
  first_number text not null,
  first_locked_position integer not null check (first_locked_position > 0),
  second_number text not null,
  second_locked_position integer not null check (second_locked_position > first_locked_position),
  third_number text not null,
  third_locked_position integer not null check (third_locked_position > second_locked_position),
  prediction_distance integer not null check (prediction_distance > 0),
  consecutive text not null,
  highest_streak integer not null check (highest_streak > 0),
  prediction_numbers jsonb not null check (pg_catalog.jsonb_typeof(prediction_numbers) = 'array'),
  algorithm_type text not null check (algorithm_type in ('加減','合值','拖牌')),
  number_order text not null check (number_order in ('依號碼由小到大排序','依實際開獎順序排序')),
  rule_count integer not null check (rule_count in (1,2)),
  explore_range text not null check (explore_range in ('標準範圍','完整範圍')),
  locked_source_index integer not null check (locked_source_index between 0 and 12),
  locked_source_period text not null,
  reference_offset integer,
  reference_position integer,
  item jsonb not null check (pg_catalog.jsonb_typeof(item) = 'object'),
  validation jsonb not null check (pg_catalog.jsonb_typeof(validation) = 'object'),
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (lottery, draw_period, analysis_version, item_id),
  foreign key (lottery, draw_period, analysis_version)
    references public.matrix_analysis_runs(lottery, draw_period, analysis_version)
    on delete cascade
);
alter table public.matrix_tianshu_results enable row level security;
revoke all on table public.matrix_tianshu_results from public, anon, authenticated, service_role;
grant select, delete on table public.matrix_tianshu_results to service_role;

create index matrix_tianshu_results_list_idx
  on public.matrix_tianshu_results (
    lottery, draw_period, analysis_version, explore_range, number_order,
    rule_count, algorithm_type, consecutive, locked_source_index,
    highest_streak desc, prediction_distance, first_locked_position,
    second_locked_position, third_locked_position
  );
create index matrix_tianshu_results_prediction_numbers_idx
  on public.matrix_tianshu_results using gin (prediction_numbers);
create index matrix_tianshu_results_expiry_idx
  on public.matrix_tianshu_results (expires_at);

alter table public.matrix_analysis_runs
  drop constraint matrix_analysis_runs_phase_check,
  add constraint matrix_analysis_runs_phase_check
    check (phase in ('explore','tianheng','tianshu','tianyan','tiangong','status','complete'));
alter table public.matrix_analysis_artifacts
  drop constraint matrix_analysis_artifacts_kind_check,
  add constraint matrix_analysis_artifacts_kind_check
    check (kind in ('explore','tianheng','tianshu','tianyan','tiangong','status'));
alter table public.matrix_analysis_artifact_chunks
  drop constraint matrix_analysis_artifact_chunks_kind_check,
  add constraint matrix_analysis_artifact_chunks_kind_check
    check (kind in ('explore','tianheng','tianshu','tianyan','tiangong','status'));

CREATE OR REPLACE FUNCTION private.matrix_tianshu_list_impl(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_order text := p_request->>'numberOrder';
  v_periods integer;
  v_offset integer;
  v_range text := p_request->>'exploreRange';
  v_rule integer;
  v_roads jsonb := coalesce(p_request->'roadTypes', '[]'::jsonb);
  v_streaks jsonb := coalesce(p_request->'selectedStreaks', '[]'::jsonb);
  v_same boolean;
  v_prediction_number text := nullif(pg_catalog.btrim(p_request->>'predictionNumber'), '');
  v_entitlements jsonb;
  v_version text;
  v_draw text;
  v_items jsonb;
  v_stats jsonb;
  v_total integer;
begin
  if pg_catalog.jsonb_typeof(p_request) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_periods := (p_request->>'explorePeriods')::integer;
  v_offset := (p_request->>'exploreDateOffset')::integer;
  v_rule := (p_request->>'ruleCount')::integer;
  v_same := coalesce((p_request->>'sameCode')::boolean, false);

  if v_lottery is null or v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_order is null or v_order not in ('依號碼由小到大排序', '依實際開獎順序排序')
    or v_periods is null or v_periods not in (3, 13)
    or v_offset is null or v_offset not in (0, 1, 2)
    or v_range is null or v_range not in ('標準範圍', '完整範圍')
    or v_rule is null or v_rule not in (1, 2)
    or pg_catalog.jsonb_typeof(v_roads) is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_roads) = 0
    or pg_catalog.jsonb_typeof(v_streaks) is distinct from 'array'
    or (v_prediction_number is not null and v_prediction_number !~ '^(0[1-9]|[1-4][0-9])$') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  v_entitlements := private.matrix_result_entitlements();
  if (v_periods = 13 and not coalesce((v_entitlements->>'canUseThirteen')::boolean, false))
    or (v_range = '完整範圍' and not coalesce((v_entitlements->>'canUseFullRange')::boolean, false)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  v_draw := private.matrix_analysis_read_period(v_lottery, v_period, v_offset);
  v_version := private.matrix_analysis_order_version(v_lottery, v_draw, v_order, 'tianshu');

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  with base as (
    select result.*
    from public.matrix_tianshu_results as result
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
          filtered.first_locked_position,
          filtered.second_locked_position,
          filtered.third_locked_position,
          filtered.item_id
      ),
      '[]'::jsonb
    ),
    pg_catalog.count(*)::integer
  into v_items, v_total
  from filtered;

  with base as (
    select result.prediction_numbers
    from public.matrix_tianshu_results as result
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
    'kind', 'tianshu',
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
$function$;

CREATE OR REPLACE FUNCTION private.matrix_tianshu_validation_impl(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_draw text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text := nullif(pg_catalog.btrim(p_request->>'analysisVersion'), '');
  v_item_id text := nullif(pg_catalog.btrim(p_request->>'itemId'), '');
  v_periods integer;
  v_range text := p_request->>'exploreRange';
  v_entitlements jsonb;
  v_validation jsonb;
begin
  if pg_catalog.jsonb_typeof(p_request) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_periods := (p_request->>'explorePeriods')::integer;

  if v_lottery is null or v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_draw is null or v_version is null or v_item_id is null
    or v_periods is null or v_periods not in (3, 13)
    or v_range is null or v_range not in ('標準範圍', '完整範圍') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  if not private.matrix_analysis_version_readable(v_lottery, v_draw, v_version, 'tianshu') then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;

  v_entitlements := private.matrix_result_entitlements();
  if (v_periods = 13 and not coalesce((v_entitlements->>'canUseThirteen')::boolean, false))
    or (v_range = '完整範圍' and not coalesce((v_entitlements->>'canUseFullRange')::boolean, false)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select result.validation into v_validation
  from public.matrix_tianshu_results as result
  where result.lottery = v_lottery
    and result.draw_period = v_draw
    and result.analysis_version = v_version
    and result.item_id = v_item_id
    and result.analysis_version = private.matrix_analysis_order_version(v_lottery, v_draw, result.number_order, 'tianshu')
    and result.locked_source_index < v_periods
    and (
      result.explore_range = '標準範圍'
      or v_range = '完整範圍'
    )
  limit 1;

  if v_validation is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  return pg_catalog.jsonb_build_object(
    'kind', 'tianshu',
    'lottery', v_lottery,
    'drawPeriod', v_draw,
    'analysisVersion', v_version,
    'status', 'complete',
    'itemId', v_item_id,
    'validation', v_validation
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$function$;

CREATE OR REPLACE FUNCTION private.matrix_request_guard(p_operation text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_method text:=nullif(current_setting('request.method',true),''); v_uid text; v_source text; v_guard jsonb; v_result jsonb;
 v_code text;v_message text;v_detail text;v_hint text; v_status text; v_guard_error text;
begin
 if v_method is not null and v_method<>'POST' then raise exception using errcode='25006',message='POST_REQUIRED'; end if;
 if v_method='POST' then
   if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'prefer','') ~* '(^|,)\s*tx\s*=\s*rollback\s*(,|$)' then raise exception using errcode='22023',message='TRANSACTION_ROLLBACK_NOT_SUPPORTED'; end if;
   begin
    v_uid:=auth.uid()::text;
    select encode(sha256(convert_to(secret||coalesce(v_uid,'unattributed'),'UTF8')),'hex') into v_source from private.security_identity_secret;
    v_guard:=private.security_collect('public_query',v_source,v_uid is not null,'attempt');
    if pg_catalog.jsonb_typeof(v_guard->'allowed') is distinct from 'boolean' then
      raise exception using errcode='22023',message='INVALID_RATE_LIMIT_RESULT';
    end if;
   exception when others then
    get stacked diagnostics v_guard_error=returned_sqlstate;
    -- Log only the fixed event and SQLSTATE. Exception text may contain secrets.
    raise log 'MATRIX_RATE_LIMIT_UNAVAILABLE sqlstate=%',v_guard_error;
    perform set_config('response.status','503',true);
    perform set_config('response.headers','[{"Retry-After":"5"}]',true);
    return jsonb_build_object('code','RATE_LIMIT_UNAVAILABLE','message','Request protection temporarily unavailable','details',null,'hint',null);
   end;
   if v_guard->>'allowed'='false' then
     perform set_config('response.status','429',true);
     perform set_config('response.headers',jsonb_build_array(jsonb_build_object('Retry-After',v_guard->>'retryAfter'))::text,true);
     return jsonb_build_object('code','RATE_LIMITED','message','Too many requests','details',null,'hint',null);
   end if;
 end if;
 begin
   case p_operation
    when 'explore_list' then v_result:=private.matrix_explore_list_impl(p_request);
    when 'explore_validation' then v_result:=private.matrix_explore_validation_impl(p_request);
    when 'tianyan_list' then v_result:=private.matrix_tianyan_list_impl(p_request);
    when 'tianyan_validation' then v_result:=private.matrix_tianyan_validation_impl(p_request);
    when 'tiangong_list' then v_result:=private.matrix_tiangong_list_impl(p_request);
    when 'tiangong_validation' then v_result:=private.matrix_tiangong_validation_impl(p_request);
    when 'tianheng_list' then v_result:=private.matrix_tianheng_list_impl(p_request);
    when 'tianheng_validation' then v_result:=private.matrix_tianheng_validation_impl(p_request);
    when 'tianshu_list' then v_result:=private.matrix_tianshu_list_impl(p_request);
    when 'tianshu_validation' then v_result:=private.matrix_tianshu_validation_impl(p_request);
    else raise exception 'INVALID_OPERATION';
   end case;
 exception when others then
   get stacked diagnostics v_code=returned_sqlstate,v_message=message_text,v_detail=pg_exception_detail,v_hint=pg_exception_hint;
   if v_method is null or not(v_code in ('42501','22023','22P02','22007','22008') or (v_code='P0001' and v_message in ('ANALYSIS_NOT_FOUND','ANALYSIS_NOT_READY','ANALYSIS_VERSION_MISMATCH','ANALYSIS_STALE','INVALID_REQUEST','FORBIDDEN'))) then raise; end if;
 end;
 if v_code is not null then
   if v_code<>'P0001' then
     begin
      perform private.security_collect('public_query',v_source,v_uid is not null,case when v_code='42501' then 'denied' else 'invalid' end);
     exception when others then
      get stacked diagnostics v_guard_error=returned_sqlstate;
      -- Reporting failure must not replace an authorization or validation failure.
      raise log 'MATRIX_RATE_LIMIT_OUTCOME_UNAVAILABLE sqlstate=%',v_guard_error;
     end;
   end if;
   v_status:=case when v_code='42501' then case when coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','anon')='anon' then '401' else '403' end else '400' end;
   perform set_config('response.status',v_status,true);
   return jsonb_build_object('code',v_code,'message',v_message,'details',nullif(v_detail,''),'hint',nullif(v_hint,''));
 end if;
 return v_result;
end;$function$;

CREATE OR REPLACE FUNCTION public.matrix_tianshu_list(p_request jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.matrix_request_guard('tianshu_list', p_request)$function$;

CREATE OR REPLACE FUNCTION public.matrix_tianshu_validation(p_request jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.matrix_request_guard('tianshu_validation', p_request)$function$;

CREATE OR REPLACE FUNCTION public.matrix_analysis_write_owned(p_lottery text, p_draw_period text, p_analysis_version text, p_owner_id text, p_started_at timestamp with time zone, p_target text, p_records jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run public.matrix_analysis_runs%rowtype;
begin
  if p_target is null or p_target not in (
    'matrix_analysis_artifacts', 'matrix_analysis_artifact_chunks',
    'matrix_explore_results', 'matrix_tianheng_results', 'matrix_tianshu_results'
  ) then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_TARGET_INVALID';
  end if;
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORDS_INVALID';
  end if;
  if pg_catalog.jsonb_array_length(p_records) > 100 then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORDS_INVALID';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_records) as item
    where pg_catalog.jsonb_typeof(item) is distinct from 'object'
       or item->>'lottery' is distinct from p_lottery
       or item->>'draw_period' is distinct from p_draw_period
       or item->>'analysis_version' is distinct from p_analysis_version
  ) then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORD_SCOPE_INVALID';
  end if;

  -- The lock serializes every child write with source invalidation (parent DELETE),
  -- lease takeover, progress and completion. Checking before a separate upsert
  -- is insufficient: a deleted parent can be recreated at the same version.
  select * into v_run
  from public.matrix_analysis_runs
  where lottery = p_lottery and draw_period = p_draw_period
    and analysis_version = p_analysis_version
  for update;
  if not found
    or nullif(pg_catalog.btrim(p_owner_id), '') is null
    or v_run.lease_owner is distinct from p_owner_id
    or v_run.started_at is distinct from p_started_at
    or v_run.status <> 'running'
    or v_run.lease_expires_at is null
    or v_run.lease_expires_at <= pg_catalog.clock_timestamp()
  then
    return false;
  end if;

  if p_target = 'matrix_analysis_artifacts' then
    insert into public.matrix_analysis_artifacts (
      lottery, draw_period, analysis_version, kind, payload, completed_at, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.kind, r.payload, r.completed_at, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_analysis_artifacts, p_records) as r
    on conflict (lottery, draw_period, analysis_version, kind) do update set
      payload = excluded.payload,
      completed_at = excluded.completed_at,
      expires_at = excluded.expires_at;
  elsif p_target = 'matrix_analysis_artifact_chunks' then
    insert into public.matrix_analysis_artifact_chunks (
      lottery, draw_period, analysis_version, kind, chunk_index, cursor_start, cursor_end, payload, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.kind, r.chunk_index, r.cursor_start, r.cursor_end, r.payload, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_analysis_artifact_chunks, p_records) as r
    on conflict (lottery, draw_period, analysis_version, kind, chunk_index) do update set
      cursor_start = excluded.cursor_start,
      cursor_end = excluded.cursor_end,
      payload = excluded.payload,
      expires_at = excluded.expires_at;
  elsif p_target = 'matrix_explore_results' then
    insert into public.matrix_explore_results (
      lottery, draw_period, analysis_version, item_id, number, locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.number, r.locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_explore_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      number = excluded.number,
      locked_position = excluded.locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  elsif p_target = 'matrix_tianheng_results' then
    insert into public.matrix_tianheng_results (
      lottery, draw_period, analysis_version, item_id, first_number, first_locked_position, second_number, second_locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.first_number, r.first_locked_position, r.second_number, r.second_locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_tianheng_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      first_number = excluded.first_number,
      first_locked_position = excluded.first_locked_position,
      second_number = excluded.second_number,
      second_locked_position = excluded.second_locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  elsif p_target = 'matrix_tianshu_results' then
    insert into public.matrix_tianshu_results (
      lottery, draw_period, analysis_version, item_id, first_number, first_locked_position, second_number, second_locked_position, third_number, third_locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.first_number, r.first_locked_position, r.second_number, r.second_locked_position, r.third_number, r.third_locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_tianshu_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      first_number = excluded.first_number,
      first_locked_position = excluded.first_locked_position,
      second_number = excluded.second_number,
      second_locked_position = excluded.second_locked_position,
      third_number = excluded.third_number,
      third_locked_position = excluded.third_locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.matrix_analysis_restore_results(p_lottery text, p_draw_period text, p_analysis_version text, p_started_at timestamp with time zone, p_kind text, p_records jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run public.matrix_analysis_runs%rowtype;
begin
  if p_kind is null or p_kind not in ('explore', 'tianheng', 'tianshu') then
    raise exception using errcode = '22023', message = 'UNKNOWN_RESULT_KIND';
  end if;
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORDS_INVALID';
  end if;
  if pg_catalog.jsonb_array_length(p_records) > 100 then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORDS_INVALID';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_records) as item
    where pg_catalog.jsonb_typeof(item) is distinct from 'object'
       or item->>'lottery' is distinct from p_lottery
       or item->>'draw_period' is distinct from p_draw_period
       or item->>'analysis_version' is distinct from p_analysis_version
  ) then
    raise exception using errcode = '22023', message = 'ANALYSIS_WRITE_RECORD_SCOPE_INVALID';
  end if;

  select * into v_run from public.matrix_analysis_runs
  where lottery = p_lottery and draw_period = p_draw_period
    and analysis_version = p_analysis_version
  for update;
  if not found or v_run.status <> 'complete'
    or v_run.started_at is distinct from p_started_at
    or not exists (
      select 1 from public.matrix_analysis_artifacts
      where lottery = p_lottery and draw_period = p_draw_period
        and analysis_version = p_analysis_version and kind = p_kind
    )
  then
    return false;
  end if;

  if p_kind = 'explore' then
    insert into public.matrix_explore_results (
      lottery, draw_period, analysis_version, item_id, number, locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.number, r.locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_explore_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      number = excluded.number,
      locked_position = excluded.locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  elsif p_kind = 'tianheng' then
    insert into public.matrix_tianheng_results (
      lottery, draw_period, analysis_version, item_id, first_number, first_locked_position, second_number, second_locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.first_number, r.first_locked_position, r.second_number, r.second_locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_tianheng_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      first_number = excluded.first_number,
      first_locked_position = excluded.first_locked_position,
      second_number = excluded.second_number,
      second_locked_position = excluded.second_locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  elsif p_kind = 'tianshu' then
    insert into public.matrix_tianshu_results (
      lottery, draw_period, analysis_version, item_id, first_number, first_locked_position, second_number, second_locked_position, third_number, third_locked_position, prediction_distance, consecutive, highest_streak, prediction_numbers, algorithm_type, number_order, rule_count, explore_range, locked_source_index, locked_source_period, reference_offset, reference_position, item, validation, expires_at
    )
    select r.lottery, r.draw_period, r.analysis_version, r.item_id, r.first_number, r.first_locked_position, r.second_number, r.second_locked_position, r.third_number, r.third_locked_position, r.prediction_distance, r.consecutive, r.highest_streak, r.prediction_numbers, r.algorithm_type, r.number_order, r.rule_count, r.explore_range, r.locked_source_index, r.locked_source_period, r.reference_offset, r.reference_position, r.item, r.validation, r.expires_at
    from pg_catalog.jsonb_populate_recordset(null::public.matrix_tianshu_results, p_records) as r
    on conflict (lottery, draw_period, analysis_version, item_id) do update set
      first_number = excluded.first_number,
      first_locked_position = excluded.first_locked_position,
      second_number = excluded.second_number,
      second_locked_position = excluded.second_locked_position,
      third_number = excluded.third_number,
      third_locked_position = excluded.third_locked_position,
      prediction_distance = excluded.prediction_distance,
      consecutive = excluded.consecutive,
      highest_streak = excluded.highest_streak,
      prediction_numbers = excluded.prediction_numbers,
      algorithm_type = excluded.algorithm_type,
      number_order = excluded.number_order,
      rule_count = excluded.rule_count,
      explore_range = excluded.explore_range,
      locked_source_index = excluded.locked_source_index,
      locked_source_period = excluded.locked_source_period,
      reference_offset = excluded.reference_offset,
      reference_position = excluded.reference_position,
      item = excluded.item,
      validation = excluded.validation,
      expires_at = excluded.expires_at;
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.matrix_analysis_missing_kinds(p_lottery text, p_draw_period text, p_analysis_version text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with parsed as (
    select pg_catalog.regexp_match(
      p_analysis_version,
      '(^|:)matrix-python-v([0-9]+)(-(sorted|draw))?$'
    ) as match
  ), required as (
    select case
      when parsed.match is not null and (parsed.match)[2]::numeric >= 15
        then array['explore','tianheng','tianshu','tianyan','tiangong','status']
      else array['explore','tianheng','tianyan','tiangong','status']
    end as kinds
    from parsed
  )
  select coalesce(pg_catalog.array_agg(kind order by kind), array[]::text[])
  from required
  cross join lateral pg_catalog.unnest(required.kinds) as expected(kind)
  where not exists (
    select 1 from public.matrix_analysis_artifacts artifact
    where artifact.lottery = p_lottery and artifact.draw_period = p_draw_period
      and artifact.analysis_version = p_analysis_version and artifact.kind = expected.kind
  );
$function$;

CREATE OR REPLACE FUNCTION public.matrix_analysis_complete_owned(p_lottery text, p_draw_period text, p_analysis_version text, p_owner_id text, p_completed_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run public.matrix_analysis_runs%rowtype;
  v_order text;
  v_now timestamptz;
begin
  -- Lock the draw first: source updates lock it before invalidating its runs.
  perform 1 from public.lottery_draws draw
    where draw.lottery = p_lottery and draw.period = p_draw_period for share;
  select * into v_run from public.matrix_analysis_runs run
    where run.lottery = p_lottery and run.draw_period = p_draw_period
      and run.analysis_version = p_analysis_version for update;
  if not found or v_run.status <> 'running'
    or nullif(pg_catalog.btrim(p_owner_id),'') is null
    or v_run.lease_owner is distinct from p_owner_id
    or v_run.lease_expires_at is null
    or v_run.lease_expires_at <= pg_catalog.clock_timestamp() then
    return false;
  end if;
  v_order := case when pg_catalog.right(p_analysis_version,7) = '-sorted' then 'sorted'
    when pg_catalog.right(p_analysis_version,5) = '-draw' then 'draw' end;
  if v_order = 'draw' and not private.matrix_analysis_draw_order_eligible(p_lottery,p_draw_period) then
    return false;
  end if;
  -- Owned artifact writes already serialize on the run. These row locks also
  -- prevent direct artifact deletion between completeness validation and commit.
  perform 1 from public.matrix_analysis_artifacts artifact
    where artifact.lottery = p_lottery and artifact.draw_period = p_draw_period
      and artifact.analysis_version = p_analysis_version
      and artifact.kind in ('explore','tianheng','tianshu','tianyan','tiangong','status')
    order by artifact.kind for share;
  if pg_catalog.cardinality(private.matrix_analysis_missing_kinds(p_lottery,p_draw_period,p_analysis_version)) <> 0 then
    return false;
  end if;
  -- A lock wait must never extend the lease implicitly.
  v_now := pg_catalog.clock_timestamp();
  if v_run.lease_expires_at <= v_now then return false; end if;
  update public.matrix_analysis_runs set phase = 'complete', status = 'complete',
    completed_at = coalesce(p_completed_at,v_now), error = null,
    lease_owner = null, lease_expires_at = null, updated_at = v_now
    where id = v_run.id;
  if v_order is not null then
    insert into private.matrix_analysis_active_versions(lottery,draw_period,number_order,analysis_version,activated_at)
      values (p_lottery,p_draw_period,v_order,p_analysis_version,v_now)
    on conflict (lottery,draw_period,number_order) do update
      set analysis_version = excluded.analysis_version, activated_at = excluded.activated_at;
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.matrix_analysis_cleanup_preview()
 RETURNS TABLE(table_name text, expired_total bigint, expired_retained bigint, expired_deletable bigint, superseded_rows bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with retained as materialized (select * from private.matrix_analysis_retained_versions()),
  superseded as materialized (select * from private.matrix_analysis_superseded_versions()),
  cutoff as materialized (select pg_catalog.statement_timestamp() as at),
  rows as (
    select 'explore' as table_name,lottery,draw_period,analysis_version,expires_at from public.matrix_explore_results
    union all select 'tianheng',lottery,draw_period,analysis_version,expires_at from public.matrix_tianheng_results
    union all select 'tianshu',lottery,draw_period,analysis_version,expires_at from public.matrix_tianshu_results
    union all select 'artifacts',lottery,draw_period,analysis_version,expires_at from public.matrix_analysis_artifacts
    union all select 'chunks',lottery,draw_period,analysis_version,expires_at from public.matrix_analysis_artifact_chunks
  ), totals as (
    select rows.table_name,
      pg_catalog.count(*) filter (where rows.expires_at < cutoff.at) as expired_total,
      pg_catalog.count(*) filter (where rows.expires_at < cutoff.at and retained.lottery is not null) as expired_retained,
      pg_catalog.count(*) filter (where rows.expires_at < cutoff.at and retained.lottery is null) as expired_deletable,
      pg_catalog.count(*) filter (where superseded.lottery is not null) as superseded_rows
    from rows cross join cutoff
    left join retained using (lottery,draw_period,analysis_version)
    left join superseded using (lottery,draw_period,analysis_version)
    group by rows.table_name
  )
  select names.table_name,coalesce(totals.expired_total,0),coalesce(totals.expired_retained,0),
    coalesce(totals.expired_deletable,0),coalesce(totals.superseded_rows,0)
  from (values ('explore'),('tianheng'),('tianshu'),('artifacts'),('chunks')) names(table_name)
  left join totals using (table_name);
$function$;

CREATE OR REPLACE FUNCTION private.matrix_analysis_cleanup_batch(p_now timestamp with time zone, p_batch_size integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz;
  v_deleted integer := 0;
  v_count integer;
  v_backlog integer;
  v_limit integer;
  v_table record;
  v_run_ids uuid[];
  v_error text;
begin
  -- Both cron and Railway use this exact transaction lock and this one core.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('matrix-analysis-cleanup',0)) then
    return 0;
  end if;
  if not exists (select 1 from private.matrix_maintenance_status
    where job_name='analysis-retention' and cleanup_enabled) then return 0; end if;

  update private.matrix_maintenance_status set last_started_at=pg_catalog.clock_timestamp(),
    last_deleted=0,updated_at=pg_catalog.clock_timestamp() where job_name='analysis-retention';
  -- This subtransaction rolls back EVERY result/pointer deletion on error, but
  -- its enclosing transaction can still commit the error record below.
  begin
    if p_now is null then raise exception 'CLEANUP_TIME_REQUIRED' using errcode='22023'; end if;
    if p_batch_size is null or p_batch_size < 1 then
      raise exception 'CLEANUP_BATCH_SIZE_INVALID' using errcode='22023';
    end if;
    -- Repeatable-read snapshots cannot provide the post-lock freshness required
    -- below. All normal RPC and pg_cron invocations use READ COMMITTED.
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
      raise exception 'CLEANUP_REQUIRES_READ_COMMITTED';
    end if;
    v_now := least(p_now,pg_catalog.clock_timestamp());

    -- Source invalidation can remove a newer period and bring an older one INTO
    -- the retained three. Freeze draw writes for this bounded batch, but allow
    -- reads and complete_owned's draw FOR SHARE. NOWAIT never queues behind a
    -- crawler; it exits safely instead. This lock also keeps draw-date ordering
    -- and confirmed/draw-order eligibility stable for the health check.
    lock table public.lottery_draws in share mode nowait;
    -- Protect the currently completed recent periods against acquire_run
    -- reopening a damaged complete run. Lock order stays draw -> run -> child.
    perform 1 from public.matrix_analysis_runs run
    join private.matrix_analysis_recent_completed_periods() period
      on period.lottery=run.lottery and period.draw_period=run.draw_period
    where run.status='complete' order by run.id for share of run nowait;
    -- A separate VOLATILE PL/pgSQL statement takes a fresh READ COMMITTED
    -- snapshot after the locks, never the candidate query's original snapshot.
    if exists (select 1 from private.matrix_analysis_active_version_health() where required) then
      raise exception 'MATRIX_ACTIVE_VERSION_UNHEALTHY';
    end if;

    -- Fixed metadata, never caller-provided identifiers. Each table has a direct
    -- FK to runs; artifact DELETE does NOT cascade into chunks or result rows.
    -- The five tables therefore use this identical predicate and locking code.
    for v_table in select * from (values
      ('matrix_explore_results',5000,'lottery,draw_period,analysis_version,item_id',
        'target.lottery=victim.lottery and target.draw_period=victim.draw_period and target.analysis_version=victim.analysis_version and target.item_id=victim.item_id'),
      ('matrix_tianheng_results',5000,'lottery,draw_period,analysis_version,item_id',
        'target.lottery=victim.lottery and target.draw_period=victim.draw_period and target.analysis_version=victim.analysis_version and target.item_id=victim.item_id'),
      ('matrix_tianshu_results',5000,'lottery,draw_period,analysis_version,item_id',
        'target.lottery=victim.lottery and target.draw_period=victim.draw_period and target.analysis_version=victim.analysis_version and target.item_id=victim.item_id'),
      ('matrix_analysis_artifact_chunks',2000,'id','target.id=victim.id'),
      ('matrix_analysis_artifacts',500,'id','target.id=victim.id')
    ) spec(relation_name,max_rows,key_columns,key_match)
    loop
      v_limit := least(p_batch_size,v_table.max_rows);
      -- Bound parent locks as well as deleted rows. SKIP LOCKED yields to active
      -- acquire/write/restore/complete calls rather than waiting on their run.
      execute pg_catalog.format($query$
        with retained as materialized (select * from private.matrix_analysis_retained_versions())
        select coalesce(pg_catalog.array_agg(candidate.id),array[]::uuid[]) from (
          select run.id from public.matrix_analysis_runs run
          where not exists (select 1 from retained
            where retained.lottery=run.lottery and retained.draw_period=run.draw_period
              and retained.analysis_version=run.analysis_version)
            and exists (select 1 from public.%I result
              where result.lottery=run.lottery and result.draw_period=run.draw_period
                and result.analysis_version=run.analysis_version and result.expires_at < $1)
          order by run.id limit $2 for update of run skip locked
        ) candidate
      $query$,v_table.relation_name) into v_run_ids using v_now,v_limit;
      if pg_catalog.cardinality(v_run_ids)=0 then continue; end if;

      -- This is deliberately a NEW SQL statement after the run locks. Retained
      -- membership and TTL are checked again with a fresh statement snapshot.
      -- Those run locks prevent reacquisition/activation until deletion commits.
      execute pg_catalog.format($query$
        with retained as materialized (select * from private.matrix_analysis_retained_versions()),
        victims as materialized (
          select %2$s from public.%1$I result
          join public.matrix_analysis_runs run
            on run.lottery=result.lottery and run.draw_period=result.draw_period
              and run.analysis_version=result.analysis_version
          where run.id=any($1) and result.expires_at < $2
            and not exists (select 1 from retained
              where retained.lottery=result.lottery and retained.draw_period=result.draw_period
                and retained.analysis_version=result.analysis_version)
          order by result.expires_at,%2$s limit $3 for update of result skip locked
        ), removed as (
          delete from public.%1$I target using victims victim where %3$s
          returning target.lottery,target.draw_period,target.analysis_version
        ), retired as (
          delete from private.matrix_analysis_active_versions active using removed
          where active.lottery=removed.lottery and active.draw_period=removed.draw_period
            and active.analysis_version=removed.analysis_version
            and not exists (select 1 from retained
              where retained.lottery=active.lottery and retained.draw_period=active.draw_period
                and retained.analysis_version=active.analysis_version)
          returning 1
        )
        select pg_catalog.count(*)::integer from removed
      $query$,v_table.relation_name,
        case when v_table.key_columns='id' then 'result.id'
          else 'result.lottery,result.draw_period,result.analysis_version,result.item_id' end,
        v_table.key_match) into v_count using v_run_ids,v_now,v_limit;
      v_deleted := v_deleted + v_count;
    end loop;
    select least(coalesce(pg_catalog.sum(expired_deletable),0),2147483647)::integer into v_backlog
      from private.matrix_analysis_cleanup_preview();
    update private.matrix_maintenance_status set
      last_finished_at=pg_catalog.clock_timestamp(),last_deleted=v_deleted,
      deletable_backlog=v_backlog,last_error=null,updated_at=pg_catalog.clock_timestamp()
      where job_name='analysis-retention';
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_error := sqlstate || ': ' || v_error;
    -- Refresh the backlog after the deletion subtransaction rolled back. If
    -- even preview is unavailable, preserve the last known count and the
    -- original failure instead of losing the maintenance error transaction.
    begin
      select least(coalesce(pg_catalog.sum(expired_deletable),0),2147483647)::integer into v_backlog
        from private.matrix_analysis_cleanup_preview();
    exception when others then v_backlog := null;
    end;
    -- last_finished_at continues to mean LAST SUCCESS. A failed attempt cannot
    -- suppress Railway fallback, even if a previous success was very recent.
    update private.matrix_maintenance_status set last_deleted=0,
      deletable_backlog=coalesce(v_backlog,deletable_backlog),last_error=pg_catalog.left(v_error,1000),
      updated_at=pg_catalog.clock_timestamp() where job_name='analysis-retention';
    return 0;
  end;
  return v_deleted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.matrix_analysis_storage_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with preview as materialized (select * from private.matrix_analysis_cleanup_preview()),
  totals as (
    select pg_catalog.sum(superseded_rows) as superseded_rows,
      pg_catalog.sum(expired_deletable) as expired_deletable_rows from preview
  ), integrity as (
    select pg_catalog.count(distinct (lottery,draw_period,number_order)) as unhealthy
    from private.matrix_analysis_active_version_health()
  ), maintenance as (select public.matrix_analysis_cleanup_status() as value)
  select pg_catalog.jsonb_build_object(
    'checked_at',pg_catalog.statement_timestamp(),
    'database_size_bytes',pg_catalog.pg_database_size(pg_catalog.current_database()),
    'tables',(select pg_catalog.jsonb_object_agg(preview.table_name,
      (pg_catalog.to_jsonb(preview)-'table_name') || pg_catalog.jsonb_build_object('size_bytes',
        pg_catalog.pg_total_relation_size(case preview.table_name
          when 'explore' then 'public.matrix_explore_results'::regclass
          when 'tianheng' then 'public.matrix_tianheng_results'::regclass
          when 'tianshu' then 'public.matrix_tianshu_results'::regclass
          when 'artifacts' then 'public.matrix_analysis_artifacts'::regclass
          when 'chunks' then 'public.matrix_analysis_artifact_chunks'::regclass end))) from preview),
    'active_versions',(select pg_catalog.count(*) from private.matrix_analysis_active_versions),
    'active_unhealthy',integrity.unhealthy,'superseded_rows',totals.superseded_rows,
    'expired_deletable_rows',totals.expired_deletable_rows,
    'cleanup',maintenance.value-'cleanup_due',
    -- Two hours matches the fallback contract: one hourly cron may be delayed.
    -- A bounded successful cleanup may leave work for the next hourly tick.
    -- Pending counts remain observable; their presence alone is not a failure.
    -- No capacity percentage is inferred from the database's physical size.
    'status',case when integrity.unhealthy > 0 or maintenance.value->>'last_error' is not null then 'Critical'
      when not (maintenance.value->>'cleanup_enabled')::boolean
        or (maintenance.value->>'cleanup_due')::boolean then 'Warning'
      else 'Healthy' end
  ) from totals cross join integrity cross join maintenance;
$function$;

revoke all on function private.matrix_tianshu_list_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_tianshu_validation_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_request_guard(text,jsonb) from public, anon, authenticated, service_role;

revoke all on function public.matrix_tianshu_list(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.matrix_tianshu_validation(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.matrix_tianshu_list(jsonb) to authenticated, service_role;
grant execute on function public.matrix_tianshu_validation(jsonb) to authenticated, service_role;

revoke all on function public.matrix_analysis_write_owned(text,text,text,text,timestamptz,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.matrix_analysis_write_owned(text,text,text,text,timestamptz,text,jsonb)
  to service_role;
revoke all on function public.matrix_analysis_restore_results(text,text,text,timestamptz,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.matrix_analysis_restore_results(text,text,text,timestamptz,text,jsonb)
  to service_role;
revoke all on function private.matrix_analysis_missing_kinds(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_cleanup_preview()
  from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_cleanup_batch(timestamptz,integer)
  from public, anon, authenticated, service_role;

commit;
