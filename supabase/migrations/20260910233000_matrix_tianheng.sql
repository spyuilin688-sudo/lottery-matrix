-- Independent Tianheng results and guarded RPCs for the shared v13 analysis run.
-- Preserve existing Explore, request-guard and retained-run cleanup behavior.
begin;

create table public.matrix_tianheng_results (
  lottery text not null check (lottery in ('今彩539','天天樂','六合彩','大樂透')),
  draw_period text not null,
  analysis_version text not null,
  item_id text not null,
  first_number text not null,
  first_locked_position integer not null check (first_locked_position > 0),
  second_number text not null,
  second_locked_position integer not null check (second_locked_position > first_locked_position),
  prediction_distance integer not null check (prediction_distance > 0),
  consecutive text not null,
  highest_streak integer not null check (highest_streak > 0),
  prediction_numbers jsonb not null check (jsonb_typeof(prediction_numbers) = 'array'),
  algorithm_type text not null check (algorithm_type in ('加減','合值','拖牌')),
  number_order text not null check (number_order in ('依號碼由小到大排序','依實際開獎順序排序')),
  rule_count integer not null check (rule_count in (1,2)),
  explore_range text not null check (explore_range in ('標準範圍','完整範圍')),
  locked_source_index integer not null check (locked_source_index between 0 and 12),
  locked_source_period text not null,
  reference_offset integer,
  reference_position integer,
  item jsonb not null check (jsonb_typeof(item) = 'object'),
  validation jsonb not null check (jsonb_typeof(validation) = 'object'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (lottery, draw_period, analysis_version, item_id),
  foreign key (lottery, draw_period, analysis_version)
    references public.matrix_analysis_runs(lottery, draw_period, analysis_version)
    on delete cascade
);
alter table public.matrix_tianheng_results enable row level security;
revoke all on table public.matrix_tianheng_results from public, anon, authenticated;
grant select, insert, update, delete on table public.matrix_tianheng_results to service_role;

create index matrix_tianheng_results_list_idx
  on public.matrix_tianheng_results (
    lottery, draw_period, analysis_version, explore_range, number_order,
    rule_count, algorithm_type, consecutive, locked_source_index,
    highest_streak desc, prediction_distance, first_locked_position, second_locked_position
  );

create index matrix_tianheng_results_prediction_numbers_idx
  on public.matrix_tianheng_results using gin (prediction_numbers);

create index matrix_tianheng_results_expiry_idx
  on public.matrix_tianheng_results (expires_at);

alter table public.matrix_analysis_runs
  drop constraint matrix_analysis_runs_phase_check,
  add constraint matrix_analysis_runs_phase_check
    check (phase in ('explore', 'tianheng', 'tianyan', 'tiangong', 'status', 'complete'));

alter table public.matrix_analysis_artifacts
  drop constraint matrix_analysis_artifacts_kind_check,
  add constraint matrix_analysis_artifacts_kind_check
    check (kind in ('explore', 'tianheng', 'tianyan', 'tiangong', 'status'));

alter table public.matrix_analysis_artifact_chunks
  drop constraint matrix_analysis_artifact_chunks_kind_check,
  add constraint matrix_analysis_artifact_chunks_kind_check
    check (kind in ('explore', 'tianheng', 'tianyan', 'tiangong', 'status'));

-- Match Explore's standard/full inclusion, duplicate statistics and stable ordering.
-- Parse numeric/boolean request values inside the exception-protected body.
create or replace function private.matrix_tianheng_list_impl(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  left join public.lottery_draws as draw
    on draw.lottery = run.lottery
   and draw.period = run.draw_period
  where run.lottery = v_lottery
    and run.status = 'complete'
    and run.analysis_version = run.draw_period || ':matrix-python-v13'
    and (v_period is null or run.draw_period = v_period)
  order by
    (draw.draw_date is not null) desc,
    draw.draw_date desc nulls last,
    run.draw_period desc,
    run.completed_at desc nulls last
  offset v_offset
  limit 1;

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  with base as (
    select result.*
    from public.matrix_tianheng_results as result
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
          filtered.item_id
      ),
      '[]'::jsonb
    ),
    pg_catalog.count(*)::integer
  into v_items, v_total
  from filtered;

  with base as (
    select result.prediction_numbers
    from public.matrix_tianheng_results as result
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
    'kind', 'tianheng',
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
$$;

create or replace function private.matrix_tianheng_validation_impl(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  if v_version <> v_draw || ':matrix-python-v13'
    or not exists (
      select 1
      from public.matrix_analysis_runs as run
      where run.lottery = v_lottery
        and run.draw_period = v_draw
        and run.analysis_version = v_version
        and run.status = 'complete'
    ) then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;

  v_entitlements := private.matrix_result_entitlements();
  if (v_periods = 13 and not coalesce((v_entitlements->>'canUseThirteen')::boolean, false))
    or (v_range = '完整範圍' and not coalesce((v_entitlements->>'canUseFullRange')::boolean, false)) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select result.validation into v_validation
  from public.matrix_tianheng_results as result
  where result.lottery = v_lottery
    and result.draw_period = v_draw
    and result.analysis_version = v_version
    and result.item_id = v_item_id
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
    'kind', 'tianheng',
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
$$;

revoke all on function private.matrix_tianheng_list_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_tianheng_validation_impl(jsonb) from public, anon, authenticated, service_role;

-- Existing private Explore implementations: change only the exact shared analysis suffix.
create or replace function private.matrix_explore_list_impl(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  left join public.lottery_draws as draw
    on draw.lottery = run.lottery
   and draw.period = run.draw_period
  where run.lottery = v_lottery
    and run.status = 'complete'
    and run.analysis_version = run.draw_period || ':matrix-python-v13'
    and (v_period is null or run.draw_period = v_period)
  order by
    (draw.draw_date is not null) desc,
    draw.draw_date desc nulls last,
    run.draw_period desc,
    run.completed_at desc nulls last
  offset v_offset
  limit 1;

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
$$;

create or replace function private.matrix_explore_validation_impl(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_draw text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text := nullif(pg_catalog.btrim(p_request->>'analysisVersion'), '');
  v_item_id text := nullif(pg_catalog.btrim(p_request->>'itemId'), '');
  v_periods integer := (p_request->>'explorePeriods')::integer;
  v_range text := p_request->>'exploreRange';
  v_entitlements jsonb;
  v_validation jsonb;
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_draw is null or v_version is null or v_item_id is null
    or v_periods is null or v_periods not in (2, 7, 13)
    or v_range not in ('標準範圍', '完整範圍') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  if v_version <> v_draw || ':matrix-python-v13'
    or not exists (
      select 1
      from public.matrix_analysis_runs as run
      where run.lottery = v_lottery
        and run.draw_period = v_draw
        and run.analysis_version = v_version
        and run.status = 'complete'
    ) then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;

  v_entitlements := private.matrix_result_entitlements();
  if (v_periods = 7 and not (v_entitlements->>'canUseSeven')::boolean)
    or (v_periods = 13 and not (v_entitlements->>'canUseThirteen')::boolean)
    or (v_range = '完整範圍' and not (v_entitlements->>'canUseFullRange')::boolean) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select result.validation into v_validation
  from public.matrix_explore_results as result
  where result.lottery = v_lottery
    and result.draw_period = v_draw
    and result.analysis_version = v_version
    and result.item_id = v_item_id
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
    'kind', 'explore',
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
$$;

-- Extend the audited guard only with Tianheng dispatch; preserve all error/observation behavior.
create or replace function private.matrix_request_guard(p_operation text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_method text:=nullif(current_setting('request.method',true),''); v_uid text; v_source text; v_guard jsonb; v_result jsonb;
 v_code text;v_message text;v_detail text;v_hint text; v_status text;
begin
 if v_method is not null and v_method<>'POST' then raise exception using errcode='25006',message='POST_REQUIRED'; end if;
 if v_method='POST' then
   if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'prefer','') ~* '(^|,)\s*tx\s*=\s*rollback\s*(,|$)' then raise exception using errcode='22023',message='TRANSACTION_ROLLBACK_NOT_SUPPORTED'; end if;
   begin
    v_uid:=auth.uid()::text;
    select encode(sha256(convert_to(secret||coalesce(v_uid,'unattributed'),'UTF8')),'hex') into v_source from private.security_identity_secret;
    v_guard:=private.security_collect('public_query',v_source,v_uid is not null,'attempt');
   exception when others then v_guard:=null; end;
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
    else raise exception 'INVALID_OPERATION';
   end case;
 exception when others then
   get stacked diagnostics v_code=returned_sqlstate,v_message=message_text,v_detail=pg_exception_detail,v_hint=pg_exception_hint;
   if v_method is null or not(v_code in ('42501','22023','22P02','22007','22008') or (v_code='P0001' and v_message in ('ANALYSIS_NOT_FOUND','ANALYSIS_NOT_READY','ANALYSIS_VERSION_MISMATCH','ANALYSIS_STALE','INVALID_REQUEST','FORBIDDEN'))) then raise; end if;
 end;
 if v_code is not null then
   if v_code<>'P0001' then
     begin perform private.security_collect('public_query',v_source,v_uid is not null,case when v_code='42501' then 'denied' else 'invalid' end); exception when others then null; end;
   end if;
   v_status:=case when v_code='42501' then case when coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','anon')='anon' then '401' else '403' end else '400' end;
   perform set_config('response.status',v_status,true);
   return jsonb_build_object('code',v_code,'message',v_message,'details',nullif(v_detail,''),'hint',nullif(v_hint,''));
 end if;
 return v_result;
end;$$;

revoke all on function private.matrix_request_guard(text,jsonb) from public,anon,authenticated,service_role;

create function public.matrix_tianheng_list(p_request jsonb)
returns jsonb language sql volatile security definer set search_path=''
as $$select private.matrix_request_guard('tianheng_list', p_request)$$;

revoke all on function public.matrix_tianheng_list(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.matrix_tianheng_list(jsonb) to anon, authenticated, service_role;

create function public.matrix_tianheng_validation(p_request jsonb)
returns jsonb language sql volatile security definer set search_path=''
as $$select private.matrix_request_guard('tianheng_validation', p_request)$$;

revoke all on function public.matrix_tianheng_validation(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.matrix_tianheng_validation(jsonb) to anon, authenticated, service_role;

-- Preserve all versions of the latest three completed periods and running checkpoints.
create or replace function public.matrix_analysis_cleanup_expired(p_now timestamptz)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_now is null then
    raise exception 'CLEANUP_TIME_REQUIRED' using errcode = '22023';
  end if;

  -- Date offsets 0, 1 and 2 refer to completed draw periods, not wall-clock days.
  -- All versions of those periods and in-progress checkpoints remain readable.
  with completed_periods as (
    select distinct run.lottery, run.draw_period, draw.draw_date
    from public.matrix_analysis_runs as run
    left join public.lottery_draws as draw
      on draw.lottery = run.lottery and draw.period = run.draw_period
    where run.status = 'complete'
  ), ranked_periods as (
    select lottery, draw_period,
      row_number() over (
        partition by lottery
        order by (draw_date is not null) desc, draw_date desc nulls last, draw_period desc
      ) as position
    from completed_periods
  ), retained as materialized (
    select run.lottery, run.draw_period, run.analysis_version
    from public.matrix_analysis_runs as run
    where run.status = 'running'
      or exists (
        select 1 from ranked_periods as period
        where period.lottery = run.lottery
          and period.draw_period = run.draw_period and period.position <= 3
      )
  ), removed_artifacts as (
    delete from public.matrix_analysis_artifacts as artifact
    where artifact.expires_at < p_now and not exists (
      select 1 from retained
      where retained.lottery = artifact.lottery
        and retained.draw_period = artifact.draw_period
        and retained.analysis_version = artifact.analysis_version
    )
    returning 1
  ), removed_chunks as (
    delete from public.matrix_analysis_artifact_chunks as chunk
    where chunk.expires_at < p_now and not exists (
      select 1 from retained
      where retained.lottery = chunk.lottery
        and retained.draw_period = chunk.draw_period
        and retained.analysis_version = chunk.analysis_version
    )
    returning 1
  ), removed_results as (
    delete from public.matrix_explore_results as result
    where result.expires_at < p_now and not exists (
      select 1 from retained
      where retained.lottery = result.lottery
        and retained.draw_period = result.draw_period
        and retained.analysis_version = result.analysis_version
    )
    returning 1
  ), removed_tianheng_results as (
    delete from public.matrix_tianheng_results as result
    where result.expires_at < p_now and not exists (
      select 1 from retained
      where retained.lottery = result.lottery
        and retained.draw_period = result.draw_period
        and retained.analysis_version = result.analysis_version
    )
    returning 1
  )
  select ((select count(*) from removed_artifacts)
    + (select count(*) from removed_chunks)
    + (select count(*) from removed_results)
    + (select count(*) from removed_tianheng_results))::integer into v_deleted;
  return v_deleted;
end;
$$;

revoke all on function public.matrix_analysis_cleanup_expired(timestamptz) from public, anon, authenticated;
grant execute on function public.matrix_analysis_cleanup_expired(timestamptz) to service_role;

commit;
