create or replace function public.matrix_tiangong_list(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period_range integer := (p_request->>'periodRange')::integer;
  v_mode text := p_request->>'mode';
  v_hit text := p_request->>'hitCondition';
  v_explore jsonb := pg_catalog.coalesce(p_request->'exploreDirections', '[]'::jsonb);
  v_first_directions jsonb := pg_catalog.coalesce(p_request->'firstStageDirections', '[]'::jsonb);
  v_first_roads jsonb := pg_catalog.coalesce(p_request->'firstRoadTypes', '[]'::jsonb);
  v_second_directions jsonb := pg_catalog.coalesce(p_request->'secondStageDirections', '[]'::jsonb);
  v_second_roads jsonb := pg_catalog.coalesce(p_request->'secondRoadTypes', '[]'::jsonb);
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
    or v_mode is distinct from 'two-stage'
    or v_hit is distinct from '準2進3'
    or pg_catalog.jsonb_typeof(v_explore) <> 'array'
    or pg_catalog.jsonb_typeof(v_first_directions) <> 'array'
    or pg_catalog.jsonb_typeof(v_first_roads) <> 'array'
    or pg_catalog.jsonb_typeof(v_second_directions) <> 'array'
    or pg_catalog.jsonb_typeof(v_second_roads) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  where run.lottery = v_lottery and run.status = 'complete'
  order by run.completed_at desc nulls last limit 1;
  if v_version is null then raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY'; end if;
  v_payload := private.matrix_artifact_payload('tiangong', v_lottery, v_draw, v_version);
  if v_payload is null then raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY'; end if;
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(item order by (item->>'interval')::integer, item->>'id'), '[]'::jsonb)
    into v_items
  from pg_catalog.jsonb_array_elements(pg_catalog.coalesce(v_payload->'items', '[]'::jsonb)) as item
  where (item->>'eligiblePeriodRange')::integer <= v_period_range
    and item->>'mode' = v_mode
    and item->>'hitCondition' = v_hit
    and v_explore ? (item->>'exploreDirection')
    and v_first_directions ? (item->>'firstStageDirection')
    and v_first_roads ? (item->>'firstRoadType')
    and v_second_directions ? (item->>'secondStageDirection')
    and v_second_roads ? (item->>'secondRoadType');
  return pg_catalog.jsonb_build_object(
    'kind', 'tiangong', 'lottery', v_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'status', 'complete',
    'items', v_items, 'total', pg_catalog.jsonb_array_length(v_items)
  );
exception when invalid_text_representation then
  raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$$;
