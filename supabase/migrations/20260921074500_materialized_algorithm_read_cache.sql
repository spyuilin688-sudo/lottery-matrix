begin;

-- Materialize only the small list/search projection for Tianyan/Tiangong.
-- Full validation remains in the existing artifacts so this read optimization
-- does not duplicate the largest evidence payloads.
create table private.matrix_artifact_read_state (
  artifact_id uuid primary key references public.matrix_analysis_artifacts(id) on delete cascade,
  kind text not null check (kind in ('tianyan','tiangong')),
  lottery text not null,
  draw_period text not null,
  analysis_version text not null,
  number_order text,
  item_count integer not null check (item_count >= 0),
  expires_at timestamptz not null,
  unique (lottery, draw_period, analysis_version, kind)
);

create table private.matrix_tianyan_read_rows (
  artifact_id uuid not null references public.matrix_analysis_artifacts(id) on delete cascade,
  lottery text not null,
  draw_period text not null,
  analysis_version text not null,
  item_id text not null,
  item jsonb not null,
  number_order text not null,
  locked_source_index integer not null,
  consecutive text not null,
  highest_streak integer not null,
  prediction_distance integer not null,
  locked_position integer not null,
  prediction_numbers jsonb not null,
  road_type_label text not null,
  rule_count integer not null,
  reference_min integer,
  reference_max integer,
  reference_complete boolean not null,
  primary key (artifact_id, item_id)
);

create index matrix_tianyan_read_filter_idx
  on private.matrix_tianyan_read_rows (
    lottery, draw_period, analysis_version, number_order,
    locked_source_index, consecutive, highest_streak desc,
    prediction_distance, locked_position, item_id
  );

create table private.matrix_tiangong_read_rows (
  artifact_id uuid not null references public.matrix_analysis_artifacts(id) on delete cascade,
  lottery text not null,
  draw_period text not null,
  analysis_version text not null,
  item_id text not null,
  item jsonb not null,
  eligible_period_range integer not null,
  interval integer not null,
  predicted_position integer not null,
  prediction_number integer not null,
  explore_direction text not null,
  first_stage_direction text not null,
  first_road_type text not null,
  second_stage_direction text not null,
  second_road_type text not null,
  primary key (artifact_id, item_id)
);

create index matrix_tiangong_read_filter_idx
  on private.matrix_tiangong_read_rows (
    lottery, draw_period, analysis_version,
    eligible_period_range, interval, item_id
  );

alter table private.matrix_artifact_read_state enable row level security;
alter table private.matrix_tianyan_read_rows enable row level security;
alter table private.matrix_tiangong_read_rows enable row level security;
revoke all on private.matrix_artifact_read_state from public, anon, authenticated, service_role;
revoke all on private.matrix_tianyan_read_rows from public, anon, authenticated, service_role;
revoke all on private.matrix_tiangong_read_rows from public, anon, authenticated, service_role;

create function private.matrix_artifact_read_cache_refresh(p_artifact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kind text;
begin
  delete from private.matrix_tianyan_read_rows where artifact_id = p_artifact_id;
  delete from private.matrix_tiangong_read_rows where artifact_id = p_artifact_id;
  delete from private.matrix_artifact_read_state where artifact_id = p_artifact_id;

  select artifact.kind into v_kind
  from public.matrix_analysis_artifacts artifact
  where artifact.id = p_artifact_id;

  if v_kind is null or v_kind not in ('tianyan','tiangong') then
    return;
  end if;

  insert into private.matrix_artifact_read_state (
    artifact_id, kind, lottery, draw_period, analysis_version,
    number_order, item_count, expires_at
  )
  select
    artifact.id,
    artifact.kind,
    artifact.lottery,
    artifact.draw_period,
    artifact.analysis_version,
    nullif(artifact.payload->>'numberOrder', ''),
    case
      when pg_catalog.jsonb_typeof(artifact.payload->'items') = 'array'
        then pg_catalog.jsonb_array_length(artifact.payload->'items')
      else 0
    end,
    artifact.expires_at
  from public.matrix_analysis_artifacts artifact
  where artifact.id = p_artifact_id;

  if v_kind = 'tianyan' then
    insert into private.matrix_tianyan_read_rows (
      artifact_id, lottery, draw_period, analysis_version, item_id, item,
      number_order, locked_source_index, consecutive, highest_streak,
      prediction_distance, locked_position, prediction_numbers,
      road_type_label, rule_count, reference_min, reference_max,
      reference_complete
    )
    select
      artifact.id,
      artifact.lottery,
      artifact.draw_period,
      artifact.analysis_version,
      item.value->>'id',
      item.value,
      item.value->>'numberOrder',
      (item.value->>'lockedSourceIndex')::integer,
      item.value->>'consecutive',
      (item.value->>'highestStreak')::integer,
      (item.value->>'predictionDistance')::integer,
      (item.value->>'lockedPosition')::integer,
      item.value->'predictionNumbers',
      case
        when rule_meta.first_algorithm = '加減' and rule_meta.second_algorithm = '加減' then '加減版路'
        when rule_meta.first_algorithm = '合值' and rule_meta.second_algorithm = '合值' then '合值版路'
        when rule_meta.first_algorithm = '拖牌' and rule_meta.second_algorithm = '拖牌' then '拖牌版路'
        when rule_meta.first_algorithm in ('加減','合值') and rule_meta.second_algorithm in ('加減','合值')
          and rule_meta.first_algorithm <> rule_meta.second_algorithm then '加減合值'
        when rule_meta.first_algorithm in ('加減','拖牌') and rule_meta.second_algorithm in ('加減','拖牌')
          and rule_meta.first_algorithm <> rule_meta.second_algorithm then '加減拖牌'
        when rule_meta.first_algorithm in ('合值','拖牌') and rule_meta.second_algorithm in ('合值','拖牌')
          and rule_meta.first_algorithm <> rule_meta.second_algorithm then '合值拖牌'
        else ''
      end,
      rule_meta.rule_count,
      rule_meta.reference_min,
      rule_meta.reference_max,
      rule_meta.reference_complete
    from public.matrix_analysis_artifacts artifact
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(artifact.payload->'items') = 'array'
        then artifact.payload->'items' else '[]'::jsonb end
    ) item(value)
    cross join lateral (
      select artifact.payload->'validationById'->(item.value->>'id') as validation
    ) validation
    cross join lateral (
      select
        pg_catalog.count(*)::integer as rule_count,
        pg_catalog.max(rule.value->>'algorithmType') filter (where rule.ordinality = 1) as first_algorithm,
        pg_catalog.max(rule.value->>'algorithmType') filter (where rule.ordinality = 2) as second_algorithm,
        pg_catalog.min(coalesce(
          nullif(rule.value->>'referenceOffset','')::integer,
          nullif(rule.value->>'validationPeriodOffset','')::integer
        )) as reference_min,
        pg_catalog.max(coalesce(
          nullif(rule.value->>'referenceOffset','')::integer,
          nullif(rule.value->>'validationPeriodOffset','')::integer
        )) as reference_max,
        coalesce(pg_catalog.bool_and(coalesce(
          nullif(rule.value->>'referenceOffset','')::integer,
          nullif(rule.value->>'validationPeriodOffset','')::integer
        ) is not null), false) as reference_complete
      from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(validation.validation->'rules') = 'array'
          then validation.validation->'rules' else '[]'::jsonb end
      ) with ordinality rule(value, ordinality)
    ) rule_meta
    where artifact.id = p_artifact_id
      and artifact.kind = 'tianyan'
      and nullif(item.value->>'id','') is not null
      and nullif(item.value->>'numberOrder','') is not null
      and pg_catalog.jsonb_typeof(item.value->'predictionNumbers') = 'array';

  elsif v_kind = 'tiangong' then
    insert into private.matrix_tiangong_read_rows (
      artifact_id, lottery, draw_period, analysis_version, item_id, item,
      eligible_period_range, interval, predicted_position, prediction_number,
      explore_direction, first_stage_direction, first_road_type,
      second_stage_direction, second_road_type
    )
    select
      artifact.id,
      artifact.lottery,
      artifact.draw_period,
      artifact.analysis_version,
      item.value->>'id',
      item.value,
      (item.value->>'eligiblePeriodRange')::integer,
      (item.value->>'interval')::integer,
      (item.value->>'predictedPosition')::integer,
      (item.value->>'predictionNumber')::integer,
      item.value->>'exploreDirection',
      item.value->>'firstStageDirection',
      item.value->>'firstRoadType',
      item.value->>'secondStageDirection',
      item.value->>'secondRoadType'
    from public.matrix_analysis_artifacts artifact
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(artifact.payload->'items') = 'array'
        then artifact.payload->'items' else '[]'::jsonb end
    ) item(value)
    where artifact.id = p_artifact_id
      and artifact.kind = 'tiangong'
      and nullif(item.value->>'id','') is not null;
  end if;
end;
$function$;

revoke all on function private.matrix_artifact_read_cache_refresh(uuid)
  from public, anon, authenticated, service_role;

create function private.matrix_artifact_read_cache_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' and old.kind in ('tianyan','tiangong') then
    delete from private.matrix_tianyan_read_rows where artifact_id = old.id;
    delete from private.matrix_tiangong_read_rows where artifact_id = old.id;
    delete from private.matrix_artifact_read_state where artifact_id = old.id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.kind in ('tianyan','tiangong') then
    perform private.matrix_artifact_read_cache_refresh(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function private.matrix_artifact_read_cache_changed()
  from public, anon, authenticated, service_role;

create trigger matrix_artifact_read_cache_changed
after insert or update or delete on public.matrix_analysis_artifacts
for each row execute function private.matrix_artifact_read_cache_changed();

do $backfill$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.matrix_analysis_artifacts
    where kind in ('tianyan','tiangong')
    order by completed_at, id
  loop
    perform private.matrix_artifact_read_cache_refresh(v_id);
  end loop;
end;
$backfill$;

create or replace function private.matrix_tianyan_list_impl(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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

  if (v_entitlements->>'canUseTianyan')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  v_draw := private.matrix_analysis_read_period(v_lottery, v_period, v_offset);
  v_version := private.matrix_analysis_order_version(v_lottery, v_draw, v_order, 'tianyan');

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  if not exists (
    select 1
    from private.matrix_artifact_read_state state
    where state.kind = 'tianyan'
      and state.lottery = v_lottery
      and state.draw_period = v_draw
      and state.analysis_version = v_version
  ) then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  with base as materialized (
    select
      result.item
        || pg_catalog.jsonb_build_object(
          'explorePeriods', v_periods,
          'exploreDateOffset', v_offset,
          'roadTypeLabel', result.road_type_label
        ) as item,
      result.item_id,
      result.prediction_numbers,
      result.highest_streak,
      result.prediction_distance,
      result.locked_position
    from private.matrix_tianyan_read_rows result
    where result.lottery = v_lottery
      and result.draw_period = v_draw
      and result.analysis_version = v_version
      and result.number_order = v_order
      and result.locked_source_index >= 0
      and result.locked_source_index < v_periods
      and result.rule_count = 2
      and result.reference_complete
      and result.reference_min >= case when v_range = '標準範圍' then -7 else -14 end
      and result.reference_max < result.prediction_distance
      and v_streaks ? result.consecutive
  ), same_groups as (
    select prediction_numbers
    from base
    group by prediction_numbers
    having pg_catalog.count(*) > 1
  ), same_allowed as materialized (
    select base.*
    from base
    where not v_same
      or exists (
        select 1 from same_groups
        where same_groups.prediction_numbers = base.prediction_numbers
      )
  ), filtered as (
    select same_allowed.*
    from same_allowed
    where v_prediction_number is null
      or same_allowed.prediction_numbers ? v_prediction_number
  ), number_counts as (
    select prediction_number.number, pg_catalog.count(*)::integer as count
    from same_allowed
    cross join lateral pg_catalog.jsonb_array_elements_text(
      same_allowed.prediction_numbers
    ) prediction_number(number)
    group by prediction_number.number
  ), top_numbers as (
    select number, count
    from number_counts
    order by count desc, number::integer
    limit 18
  )
  select
    coalesce((
      select pg_catalog.jsonb_agg(
        filtered.item
        order by
          case when v_same or v_prediction_number is not null
            then filtered.prediction_numbers::text else '' end,
          filtered.highest_streak desc,
          filtered.prediction_distance,
          filtered.locked_position,
          filtered.item_id
      )
      from filtered
    ), '[]'::jsonb),
    (select pg_catalog.count(*)::integer from filtered),
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('number', number, 'count', count)
        order by count desc, number::integer
      )
      from top_numbers
    ), '[]'::jsonb)
  into v_items, v_total, v_stats;

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
$function$;

create or replace function private.matrix_tiangong_list_impl(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
  v_artifact_order text;
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

  v_draw := private.matrix_analysis_read_period(
    v_lottery, nullif(pg_catalog.btrim(p_request->>'drawPeriod'), ''), 0
  );
  v_version := private.matrix_analysis_order_version(
    v_lottery, v_draw, '依號碼由小到大排序', 'tiangong'
  );

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  select state.number_order into v_artifact_order
  from private.matrix_artifact_read_state state
  where state.kind = 'tiangong'
    and state.lottery = v_lottery
    and state.draw_period = v_draw
    and state.analysis_version = v_version;

  if v_artifact_order is distinct from '依號碼由小到大排序' then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      result.item order by result.interval, result.item_id
    ),
    '[]'::jsonb
  ) into v_items
  from private.matrix_tiangong_read_rows result
  where result.lottery = v_lottery
    and result.draw_period = v_draw
    and result.analysis_version = v_version
    and result.eligible_period_range <= v_period_range
    and (
      (v_lottery in ('六合彩','大樂透') and result.predicted_position = 7)
      or result.prediction_number between result.predicted_position
        and case when v_lottery in ('今彩539','天天樂') then 34 else 43 end
          + result.predicted_position
    )
    and v_explore ? result.explore_direction
    and v_first_directions ? result.first_stage_direction
    and v_first_roads ? result.first_road_type
    and v_second_directions ? result.second_stage_direction
    and v_second_roads ? result.second_road_type;

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
$function$;

commit;
