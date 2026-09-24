-- Align the list RPC with the live 50-period, two-stage Tiangong page and
-- artifact producer. Preserve the existing entitlement and result filters.
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
    or v_period_range is distinct from 50
    or p_request->>'mode' is distinct from 'two-stage'
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
