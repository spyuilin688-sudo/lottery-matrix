-- Canonical Matrix Explore v6 result storage and RPCs.
begin;

create table if not exists public.matrix_explore_results (
  lottery text not null check (lottery in ('今彩539', '天天樂', '六合彩', '大樂透')),
  draw_period text not null,
  analysis_version text not null,
  item_id text not null,
  number text not null,
  locked_position integer not null check (locked_position > 0),
  prediction_distance integer not null check (prediction_distance > 0),
  consecutive text not null,
  highest_streak integer not null check (highest_streak > 0),
  prediction_numbers jsonb not null check (pg_catalog.jsonb_typeof(prediction_numbers) = 'array'),
  algorithm_type text not null check (algorithm_type in ('加減', '合值', '拖牌')),
  number_order text not null check (number_order in ('依號碼由小到大排序', '依實際開獎順序排序')),
  rule_count integer not null check (rule_count in (1, 2)),
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
    references public.matrix_analysis_runs (lottery, draw_period, analysis_version)
    on delete cascade
);

create index if not exists matrix_explore_results_list_idx
  on public.matrix_explore_results (
    lottery, draw_period, analysis_version, number_order, rule_count,
    algorithm_type, consecutive, locked_source_index,
    highest_streak desc, prediction_distance, locked_position
  );

create index if not exists matrix_explore_results_prediction_numbers_idx
  on public.matrix_explore_results using gin (prediction_numbers);

create index if not exists matrix_explore_results_expiry_idx
  on public.matrix_explore_results (expires_at);

alter table public.matrix_explore_results enable row level security;
revoke all on table public.matrix_explore_results from public, anon, authenticated;
grant select, insert, update, delete on table public.matrix_explore_results to service_role;

create or replace function public.matrix_explore_list(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := pg_catalog.nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := pg_catalog.nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_order text := p_request->>'numberOrder';
  v_periods integer := (p_request->>'explorePeriods')::integer;
  v_offset integer := (p_request->>'exploreDateOffset')::integer;
  v_range text := p_request->>'exploreRange';
  v_rule integer := (p_request->>'ruleCount')::integer;
  v_roads jsonb := pg_catalog.coalesce(p_request->'roadTypes', '[]'::jsonb);
  v_streaks jsonb := pg_catalog.coalesce(p_request->'selectedStreaks', '[]'::jsonb);
  v_same boolean := pg_catalog.coalesce((p_request->>'sameCode')::boolean, false);
  v_prediction_number text := pg_catalog.nullif(pg_catalog.btrim(p_request->>'predictionNumber'), '');
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
    or v_offset is distinct from 0
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
  where run.lottery = v_lottery
    and run.status = 'complete'
    and run.analysis_version = run.draw_period || ':matrix-python-v6'
    and (v_period is null or run.draw_period = v_period)
  order by run.completed_at desc nulls last
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
      and result.number_order = v_order
      and result.locked_source_index < v_periods
      and result.rule_count = v_rule
      and v_roads ? result.algorithm_type
      and v_streaks ? result.consecutive
      and (v_range = '完整範圍' or pg_catalog.coalesce(result.reference_offset, 0) >= -7)
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
    pg_catalog.coalesce(
      pg_catalog.jsonb_agg(
        filtered.item || pg_catalog.jsonb_build_object(
          'explorePeriods', v_periods,
          'exploreDateOffset', 0
        )
        order by
          case when v_same then filtered.prediction_numbers::text else '' end,
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
      and result.number_order = v_order
      and result.locked_source_index < v_periods
      and result.rule_count = v_rule
      and v_roads ? result.algorithm_type
      and v_streaks ? result.consecutive
      and (v_range = '完整範圍' or pg_catalog.coalesce(result.reference_offset, 0) >= -7)
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
  select pg_catalog.coalesce(
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

create or replace function public.matrix_explore_validation(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := pg_catalog.nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_draw text := pg_catalog.nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text := pg_catalog.nullif(pg_catalog.btrim(p_request->>'analysisVersion'), '');
  v_item_id text := pg_catalog.nullif(pg_catalog.btrim(p_request->>'itemId'), '');
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

  if v_version <> v_draw || ':matrix-python-v6'
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
    and (v_range = '完整範圍' or pg_catalog.coalesce(result.reference_offset, 0) >= -7)
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

revoke all on function public.matrix_explore_list(jsonb) from public;
revoke all on function public.matrix_explore_validation(jsonb) from public;
grant execute on function public.matrix_explore_list(jsonb) to anon, authenticated;
grant execute on function public.matrix_explore_validation(jsonb) to anon, authenticated;

commit;
