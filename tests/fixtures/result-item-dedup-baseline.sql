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
CREATE OR REPLACE FUNCTION public.matrix_status_validation_source_get(p_request jsonb)
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION private.matrix_worker_completion_invalidate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_query text;
  v_column text := case when tg_table_name = 'notification_events'
    then 'payload->>''lottery''' else 'lottery' end;
  v_lottery text;
begin
  if tg_op = 'TRUNCATE' then
    update private.matrix_worker_completion set generation = generation + 1;
    return null;
  end if;
  -- Transition tables amortize bulk writes: one generation update per lottery,
  -- per statement, even when a batch materializes thousands of result rows.
  if tg_op = 'INSERT' then
    v_query := 'select ' || v_column || ' lottery from new_rows';
  elsif tg_op = 'DELETE' then
    v_query := 'select ' || v_column || ' lottery from old_rows';
  else
    v_query := 'select ' || v_column || ' lottery from new_rows union all select '
      || v_column || ' lottery from old_rows';
  end if;
  for v_lottery in execute
    'select distinct lottery from (' || v_query || ') changed where lottery is not null order by lottery'
  loop
    insert into private.matrix_worker_completion as state(lottery, generation)
      values (v_lottery, 1)
      on conflict (lottery) do update set generation = state.generation + 1;
  end loop;
  return null;
end;
$function$
;
