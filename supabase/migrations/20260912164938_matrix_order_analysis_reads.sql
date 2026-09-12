-- Resolve a draw before choosing its completed order stage. The prior migration
-- adds result_status and reconciles/invalidate draws whose canonical input changed.
-- Public request guards, entitlement policies, and existing function grants stay in place.
begin;

create or replace function private.matrix_analysis_read_period(
  p_lottery text, p_draw_period text default null, p_offset integer default 0
)
returns text language sql stable security invoker set search_path = ''
as $$
  select draw.period
  from public.lottery_draws as draw
  where draw.lottery = p_lottery
    and (p_draw_period is null or draw.period = p_draw_period)
  order by draw.draw_date desc nulls last, draw.period desc
  -- An explicit retained period identifies the draw itself; offsets apply only
  -- when the caller asks for a draw relative to the current draw.
  offset case when p_draw_period is null then p_offset else 0 end
  limit 1;
$$;

create or replace function private.matrix_analysis_order_version(
  p_lottery text, p_draw_period text, p_number_order text, p_kind text
)
returns text language sql stable security invoker set search_path = ''
as $$
  select run.analysis_version
  from public.matrix_analysis_runs as run
  join public.lottery_draws as draw
    on draw.lottery = run.lottery and draw.period = run.draw_period
  where run.lottery = p_lottery and run.draw_period = p_draw_period
    and run.status = 'complete'
    and p_number_order in ('依號碼由小到大排序', '依實際開獎順序排序')
    and (p_number_order = '依號碼由小到大排序'
      or (draw.result_status = 'confirmed'
        and pg_catalog.jsonb_typeof(draw.draw_order_numbers) = 'array'
        and pg_catalog.jsonb_array_length(draw.draw_order_numbers) > 0))
    and exists (
      select 1 from public.matrix_analysis_artifacts as artifact
      where artifact.lottery = run.lottery and artifact.draw_period = run.draw_period
        and artifact.analysis_version = run.analysis_version and artifact.kind = p_kind
    )
    and (
      (run.analysis_version = p_draw_period || ':matrix-python-v14-'
        || case p_number_order when '依號碼由小到大排序' then 'sorted' else 'draw' end
        and (select pg_catalog.count(*) from public.matrix_analysis_artifacts as artifact
          where artifact.lottery = run.lottery and artifact.draw_period = run.draw_period
            and artifact.analysis_version = run.analysis_version
            and artifact.kind in ('explore','tianheng','tianyan','tiangong','status')) = 5)
      or (run.analysis_version = p_draw_period || ':matrix-python-v13'
        and not exists (
          select 1 from public.matrix_analysis_runs as stage
          where stage.lottery = run.lottery and stage.draw_period = run.draw_period
            and stage.analysis_version in (p_draw_period || ':matrix-python-v14-sorted',
              p_draw_period || ':matrix-python-v14-draw')
        ))
    )
  limit 1;
$$;

create or replace function private.matrix_analysis_version_readable(
  p_lottery text, p_draw_period text, p_analysis_version text, p_kind text
)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce(p_analysis_version in (
    private.matrix_analysis_order_version(p_lottery, p_draw_period, '依號碼由小到大排序', p_kind),
    private.matrix_analysis_order_version(p_lottery, p_draw_period, '依實際開獎順序排序', p_kind)
  ), false);
$$;

-- Keep the sorted chapter output and compose custom-status input from only the
-- readable stages of this draw. Filter by each source's order even for legacy runs.
create or replace function private.matrix_status_read_payload(p_lottery text, p_draw_period text)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_draw text := private.matrix_analysis_read_period(p_lottery, p_draw_period, 0);
  v_sorted text := private.matrix_analysis_order_version(p_lottery, v_draw, '依號碼由小到大排序', 'status');
  v_actual text := private.matrix_analysis_order_version(p_lottery, v_draw, '依實際開獎順序排序', 'status');
  v_version text;
  v_payload jsonb;
  v_stage_payload jsonb;
  v_explore jsonb := '[]'::jsonb;
  v_tianyan jsonb := '[]'::jsonb;
  v_items jsonb;
  v_stage record;
begin
  if v_sorted is null and v_actual is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  v_version := case when v_sorted is not null and v_actual is not null and v_sorted <> v_actual
    then v_draw || ':matrix-python-v14' else coalesce(v_sorted, v_actual) end;
  v_payload := private.matrix_artifact_payload('status', p_lottery, v_draw, coalesce(v_sorted, v_actual));
  for v_stage in select * from (values
    (v_sorted, '依號碼由小到大排序'), (v_actual, '依實際開獎順序排序')
  ) as stage(analysis_version, number_order) where stage.analysis_version is not null
  loop
    v_stage_payload := private.matrix_artifact_payload('status', p_lottery, v_draw, v_stage.analysis_version);
    if pg_catalog.jsonb_typeof(v_stage_payload->'statusSources'->'explore'->'items') is distinct from 'array'
      or pg_catalog.jsonb_typeof(v_stage_payload->'statusSources'->'tianyan'->'items') is distinct from 'array' then
      raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
    end if;
    select coalesce(pg_catalog.jsonb_agg(item order by position), '[]'::jsonb) into v_items
    from pg_catalog.jsonb_array_elements(v_stage_payload->'statusSources'->'explore'->'items')
      with ordinality as source(item, position)
    where item->>'numberOrder' = v_stage.number_order;
    v_explore := v_explore || v_items;
    select coalesce(pg_catalog.jsonb_agg(item order by position), '[]'::jsonb) into v_items
    from pg_catalog.jsonb_array_elements(v_stage_payload->'statusSources'->'tianyan'->'items')
      with ordinality as source(item, position)
    where item->>'numberOrder' = v_stage.number_order;
    v_tianyan := v_tianyan || v_items;
  end loop;
  return pg_catalog.jsonb_build_object('lottery', p_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'payload', v_payload || pg_catalog.jsonb_build_object('statusSources',
      pg_catalog.jsonb_build_object(
        'explore', pg_catalog.jsonb_build_object('lottery', p_lottery, 'drawPeriod', v_draw, 'items', v_explore),
        'tianyan', pg_catalog.jsonb_build_object('lottery', p_lottery, 'drawPeriod', v_draw, 'items', v_tianyan)
      )));
end;
$$;

revoke all on function private.matrix_analysis_read_period(text,text,integer) from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_order_version(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_version_readable(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.matrix_status_read_payload(text,text) from public, anon, authenticated, service_role;

create or replace function public.matrix_status_get(p_request jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_source jsonb;
  v_entitlements jsonb := private.matrix_result_entitlements();
begin
  if pg_catalog.jsonb_typeof(p_request) is distinct from 'object'
    or v_lottery is null or v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_source := private.matrix_status_read_payload(v_lottery, v_period);
  return pg_catalog.jsonb_build_object(
    'kind', 'status', 'lottery', v_lottery, 'drawPeriod', v_source->>'drawPeriod',
    'analysisVersion', (v_source->>'analysisVersion') || ':status',
    'sourceAnalysisVersion', v_source->>'analysisVersion',
    'customTriggers', '[]'::jsonb,
    'detailLocked', not (v_entitlements->>'canViewFullStatus')::boolean
  ) || ((v_source->'payload') - 'lottery' - 'drawPeriod' - 'artifactKinds' - 'artifactCounts');
end;
$$;

create or replace function public.matrix_status_sources_get(p_request jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_source jsonb;
begin
  if pg_catalog.jsonb_typeof(p_request) is distinct from 'object'
    or v_lottery is null or v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_source := private.matrix_status_read_payload(v_lottery, v_period);
  return pg_catalog.jsonb_build_object(
    'analysisVersion', v_source->>'analysisVersion', 'drawPeriod', v_source->>'drawPeriod',
    'explore', v_source->'payload'->'statusSources'->'explore',
    'tianyan', v_source->'payload'->'statusSources'->'tianyan'
  );
end;
$$;

-- Status versions identify the set of completed stages, so detail requests must
-- resolve their item within that same set rather than treating it as one run.
create or replace function public.matrix_status_validation_source_get(p_request jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_draw text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text := nullif(pg_catalog.btrim(p_request->>'analysisVersion'), '');
  v_item_id text := nullif(pg_catalog.btrim(p_request->>'itemId'), '');
  v_source jsonb;
  v_validation jsonb;
  v_order text;
  v_item_version text;
  v_kind text;
  v_payload jsonb;
begin
  if pg_catalog.jsonb_typeof(p_request) is distinct from 'object'
    or v_lottery is null or v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_draw is null or v_version is null or v_item_id is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  begin
    v_source := private.matrix_status_read_payload(v_lottery, v_draw);
  exception when sqlstate 'P0001' then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end;
  if v_version is distinct from v_source->>'analysisVersion' then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;
  select source.kind, item->>'numberOrder' into v_kind, v_order
  from (values ('explore'), ('tianyan')) as source(kind)
  cross join lateral pg_catalog.jsonb_array_elements(v_source->'payload'->'statusSources'->source.kind->'items') as item
  where item->>'id' = v_item_id
  order by source.kind
  limit 1;
  v_item_version := private.matrix_analysis_order_version(v_lottery, v_draw, v_order, v_kind);
  if v_kind = 'explore' then
    select result.validation into v_validation
    from public.matrix_explore_results as result
    where result.lottery = v_lottery and result.draw_period = v_draw
      and result.analysis_version = v_item_version and result.item_id = v_item_id
      and result.number_order = v_order
    limit 1;
  elsif v_kind = 'tianyan' then
    v_payload := private.matrix_artifact_payload('tianyan', v_lottery, v_draw, v_item_version);
    v_validation := v_payload->'validationById'->v_item_id;
  end if;
  if v_validation is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  return pg_catalog.jsonb_build_object('itemId', v_item_id, 'validation', v_validation);
end;
$$;

-- Source RPCs are called by the authenticated edge service, never directly by guests.
revoke all on function public.matrix_status_sources_get(jsonb) from public, anon, authenticated;
grant execute on function public.matrix_status_sources_get(jsonb) to service_role;
revoke all on function public.matrix_status_validation_source_get(jsonb) from public, anon, authenticated;
grant execute on function public.matrix_status_validation_source_get(jsonb) to service_role;

CREATE OR REPLACE FUNCTION private.matrix_explore_list_impl(p_request jsonb)
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
$function$
;

CREATE OR REPLACE FUNCTION private.matrix_tianheng_list_impl(p_request jsonb)
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
  v_version := private.matrix_analysis_order_version(v_lottery, v_draw, v_order, 'tianheng');

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
$function$
;

CREATE OR REPLACE FUNCTION private.matrix_tianyan_list_impl(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_periods integer := coalesce((p_request->>'explorePeriods')::integer, 13);
  v_range text := coalesce(p_request->>'exploreRange', '完整範圍');
  v_order text := coalesce(p_request->>'numberOrder', '依號碼由小到大排序');
  v_offset integer := coalesce((p_request->>'exploreDateOffset')::integer, 0);
  v_streaks jsonb := coalesce(p_request->'selectedStreaks', '[]'::jsonb);
  v_same boolean := coalesce((p_request->>'sameCode')::boolean, false);
  v_prediction_number text := nullif(pg_catalog.btrim(p_request->>'predictionNumber'), '');
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_items jsonb;
  v_stats jsonb;
  v_total integer;
  v_entitlements jsonb := private.matrix_result_entitlements();
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or pg_catalog.jsonb_typeof(v_streaks) <> 'array'
    or v_periods not in (2, 7, 13)
    or v_range not in ('標準範圍', '完整範圍')
    or v_order not in ('依號碼由小到大排序', '依實際開獎順序排序')
    or v_offset not in (0, 1, 2)
    or (v_prediction_number is not null and v_prediction_number !~ '^(0[1-9]|[1-4][0-9])$') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  -- Tianyan access includes its own period/range settings. Registration trials
  -- must not grant those settings to the separate Matrix Explore algorithm.
  if (v_entitlements->>'canUseTianyan')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  v_draw := private.matrix_analysis_read_period(v_lottery, v_period, v_offset);
  v_version := private.matrix_analysis_order_version(v_lottery, v_draw, v_order, 'tianyan');

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  v_payload := private.matrix_artifact_payload('tianyan', v_lottery, v_draw, v_version);
  if v_payload is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;


  -- Apply the requested search before both list and duplicate-number aggregation.
  select pg_catalog.jsonb_set(v_payload, '{items}', coalesce(pg_catalog.jsonb_agg(
    item || pg_catalog.jsonb_build_object('explorePeriods', v_periods, 'exploreDateOffset', v_offset)
  ), '[]'::jsonb)) into v_payload
  from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
  where item->>'numberOrder' = v_order
    and (item->>'lockedSourceIndex')::integer >= 0
    and (item->>'lockedSourceIndex')::integer < v_periods
    and pg_catalog.jsonb_array_length(v_payload->'validationById'->(item->>'id')->'rules') = 2
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_payload->'validationById'->(item->>'id')->'rules') as rule
      where coalesce((rule->>'referenceOffset')::integer,
                     (rule->>'validationPeriodOffset')::integer) is null
        or coalesce((rule->>'referenceOffset')::integer,
                    (rule->>'validationPeriodOffset')::integer) < case when v_range = '標準範圍' then -7 else -14 end
        or coalesce((rule->>'referenceOffset')::integer,
                    (rule->>'validationPeriodOffset')::integer) >= (item->>'predictionDistance')::integer
    );

  with labeled as (
    select item || pg_catalog.jsonb_build_object(
      'roadTypeLabel',
      case
        when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
         and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減' then '加減版路'
        when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
         and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值' then '合值版路'
        when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
         and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌' then '拖牌版路'
        when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值')
          or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減') then '加減合值'
        when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌')
          or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減') then '加減拖牌'
        when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌')
          or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
          and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值') then '合值拖牌'
      end
    ) as item
    from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
    where v_streaks ? (item->>'consecutive')
  ), same_groups as (
    select labeled.item->'predictionNumbers' as prediction_numbers
    from labeled
    group by labeled.item->'predictionNumbers'
    having pg_catalog.count(*) > 1
  ), same_allowed as (
    select labeled.item
    from labeled
    where not v_same
      or exists (
        select 1
        from same_groups
        where same_groups.prediction_numbers = labeled.item->'predictionNumbers'
      )
  ), filtered as (
    select same_allowed.item
    from same_allowed
    where v_prediction_number is null
      or same_allowed.item->'predictionNumbers' ? v_prediction_number
  )
  select
    coalesce(
      pg_catalog.jsonb_agg(
        filtered.item
        order by
          case when v_same or v_prediction_number is not null then (filtered.item->'predictionNumbers')::text else '' end,
          (filtered.item->>'highestStreak')::integer desc,
          (filtered.item->>'predictionDistance')::integer,
          (filtered.item->>'lockedPosition')::integer,
          filtered.item->>'id'
      ),
      '[]'::jsonb
    ),
    pg_catalog.count(*)::integer
  into v_items, v_total
  from filtered;

  with labeled as (
    select item
    from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
    where v_streaks ? (item->>'consecutive')
  ), same_groups as (
    select labeled.item->'predictionNumbers' as prediction_numbers
    from labeled
    group by labeled.item->'predictionNumbers'
    having pg_catalog.count(*) > 1
  ), same_allowed as (
    select labeled.item
    from labeled
    where not v_same
      or exists (
        select 1
        from same_groups
        where same_groups.prediction_numbers = labeled.item->'predictionNumbers'
      )
  ), number_counts as (
    select prediction_number.number, pg_catalog.count(*)::integer as count
    from same_allowed
    cross join lateral pg_catalog.jsonb_array_elements_text(same_allowed.item->'predictionNumbers') as prediction_number(number)
    group by prediction_number.number
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
    'kind', 'tianyan',
    'lottery', v_lottery,
    'drawPeriod', v_draw,
    'analysisVersion', v_version,
    'exploreDateOffset', v_offset,
    'status', 'complete',
    'items', v_items,
    'duplicateStats', v_stats,
    'total', v_total
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$function$
;

CREATE OR REPLACE FUNCTION private.matrix_tiangong_list_impl(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period_range integer := (p_request->>'periodRange')::integer;
  v_explore jsonb := coalesce(p_request->'exploreDirections', '[]'::jsonb);
  v_first_directions jsonb := coalesce(p_request->'firstStageDirections', '[]'::jsonb);
  v_first_roads jsonb := coalesce(p_request->'firstRoadTypes', '[]'::jsonb);
  v_second_directions jsonb := coalesce(p_request->'secondStageDirections', '[]'::jsonb);
  v_second_roads jsonb := coalesce(p_request->'secondRoadTypes', '[]'::jsonb);
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_items jsonb;
begin
  if (private.matrix_result_entitlements()->>'canUseTiangong')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_period_range not in (50, 80)
    or pg_catalog.jsonb_typeof(v_explore) <> 'array' or v_explore = '[]'::jsonb
    or pg_catalog.jsonb_typeof(v_first_directions) <> 'array' or v_first_directions = '[]'::jsonb
    or pg_catalog.jsonb_typeof(v_first_roads) <> 'array' or v_first_roads = '[]'::jsonb
    or pg_catalog.jsonb_typeof(v_second_directions) <> 'array' or v_second_directions = '[]'::jsonb
    or pg_catalog.jsonb_typeof(v_second_roads) <> 'array' or v_second_roads = '[]'::jsonb then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  v_draw := private.matrix_analysis_read_period(v_lottery, nullif(pg_catalog.btrim(p_request->>'drawPeriod'), ''), 0);
  v_version := private.matrix_analysis_order_version(v_lottery, v_draw, '依號碼由小到大排序', 'tiangong');

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  v_payload := private.matrix_artifact_payload('tiangong', v_lottery, v_draw, v_version);
  if coalesce(v_payload->>'numberOrder', '') <> '依號碼由小到大排序' then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  if v_payload is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      item order by (item->>'interval')::integer, item->>'id'
    ),
    '[]'::jsonb
  ) into v_items
  from pg_catalog.jsonb_array_elements(
    coalesce(v_payload->'items', '[]'::jsonb)
  ) as item
  where (item->>'eligiblePeriodRange')::integer <= v_period_range
    and (
      (v_lottery in ('六合彩','大樂透') and (item->>'predictedPosition')::integer = 7)
      or (item->>'predictionNumber')::integer between (item->>'predictedPosition')::integer
        and case when v_lottery in ('今彩539','天天樂') then 34 else 43 end + (item->>'predictedPosition')::integer
    )
    and v_explore ? (item->>'exploreDirection')
    and v_first_directions ? (item->>'firstStageDirection')
    and v_first_roads ? (item->>'firstRoadType')
    and v_second_directions ? (item->>'secondStageDirection')
    and v_second_roads ? (item->>'secondRoadType');

  return pg_catalog.jsonb_build_object(
    'kind', 'tiangong',
    'lottery', v_lottery,
    'drawPeriod', v_draw,
    'analysisVersion', v_version,
    'status', 'complete',
    'items', v_items,
    'total', pg_catalog.jsonb_array_length(v_items)
  );
exception
  when invalid_text_representation then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$function$
;

CREATE OR REPLACE FUNCTION private.matrix_explore_validation_impl(p_request jsonb)
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

  if not private.matrix_analysis_version_readable(v_lottery, v_draw, v_version, 'explore') then
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
    and result.analysis_version = private.matrix_analysis_order_version(v_lottery, v_draw, result.number_order, 'explore')
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
$function$
;

CREATE OR REPLACE FUNCTION private.matrix_tianheng_validation_impl(p_request jsonb)
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

  if not private.matrix_analysis_version_readable(v_lottery, v_draw, v_version, 'tianheng') then
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
    and result.analysis_version = private.matrix_analysis_order_version(v_lottery, v_draw, result.number_order, 'tianheng')
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
$function$
;

CREATE OR REPLACE FUNCTION private.matrix_tianyan_validation_impl(p_request jsonb)
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
  v_payload jsonb;
  v_validation jsonb;
begin
  if not (private.matrix_result_entitlements()->>'canUseTianyan')::boolean then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_lottery is null or v_draw is null or v_version is null or v_item_id is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if not private.matrix_analysis_version_readable(v_lottery, v_draw, v_version, 'tianyan') then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;
  v_payload := private.matrix_artifact_payload('tianyan', v_lottery, v_draw, v_version);
  if not exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
    where item->>'id' = v_item_id
      and v_version = private.matrix_analysis_order_version(v_lottery, v_draw, item->>'numberOrder', 'tianyan')
  ) then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_validation := v_payload->'validationById'->v_item_id;
  if v_validation is null then raise exception using errcode = '22023', message = 'INVALID_REQUEST'; end if;
  return pg_catalog.jsonb_build_object(
    'kind', 'tianyan', 'lottery', v_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'status', 'complete',
    'itemId', v_item_id, 'validation', v_validation
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.matrix_tiangong_validation_impl(p_request jsonb)
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
  v_payload jsonb;
  v_validation jsonb;
begin
  if (private.matrix_result_entitlements()->>'canUseTiangong')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_draw is null or v_version is null or v_item_id is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if v_version is distinct from private.matrix_analysis_order_version(v_lottery, v_draw, '依號碼由小到大排序', 'tiangong') then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;

  v_payload := private.matrix_artifact_payload('tiangong', v_lottery, v_draw, v_version);
  if coalesce(v_payload->>'numberOrder', '') <> '依號碼由小到大排序' then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  v_validation := v_payload->'validationById'->v_item_id;
  if v_validation is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  return pg_catalog.jsonb_build_object(
    'kind', 'tiangong',
    'lottery', v_lottery,
    'drawPeriod', v_draw,
    'analysisVersion', v_version,
    'status', 'complete',
    'itemId', v_item_id,
    'validation', v_validation
  );
end;
$function$
;

revoke all on function private.matrix_explore_list_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_explore_validation_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_tianheng_list_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_tianheng_validation_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_tianyan_list_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_tianyan_validation_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_tiangong_list_impl(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.matrix_tiangong_validation_impl(jsonb) from public, anon, authenticated, service_role;

commit;
