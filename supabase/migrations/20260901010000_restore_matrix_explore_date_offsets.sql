begin;

do $restore_matrix_explore_date_offsets$
declare
  v_function_oid oid;
  v_definition text;
begin
  select p.oid into v_function_oid
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname = 'matrix_explore_list'
  limit 1;

  if v_function_oid is null then
    raise exception 'MATRIX_EXPLORE_LIST_MISSING';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_function_oid);
  if position('matrix-python-v8' in v_definition) = 0
    or position('or v_offset is distinct from 0' in v_definition) = 0
    or position('order by run.completed_at desc nulls last' || chr(10) || '  limit 1;' in v_definition) = 0
    or position($offset$'exploreDateOffset', 0$offset$ in v_definition) = 0 then
    raise exception 'MATRIX_EXPLORE_DATE_OFFSET_CONTRACT_MISSING';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    'or v_offset is distinct from 0',
    'or v_offset is null or v_offset not in (0, 1, 2)'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'order by run.completed_at desc nulls last' || chr(10) || '  limit 1;',
    'order by run.completed_at desc nulls last' || chr(10) || '  offset v_offset' || chr(10) || '  limit 1;'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    $offset$'exploreDateOffset', 0$offset$,
    $offset$'exploreDateOffset', v_offset$offset$
  );
  execute v_definition;

  if position('v_offset not in (0, 1, 2)' in pg_catalog.pg_get_functiondef(v_function_oid)) = 0
    or position('offset v_offset' in pg_catalog.pg_get_functiondef(v_function_oid)) = 0 then
    raise exception 'MATRIX_EXPLORE_DATE_OFFSET_RESTORE_FAILED';
  end if;
end;
$restore_matrix_explore_date_offsets$;

create or replace function public.matrix_tianyan_list(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_offset integer := coalesce((p_request->>'exploreDateOffset')::integer, 0);
  v_streaks jsonb := coalesce(p_request->'selectedStreaks', '[]'::jsonb);
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_items jsonb;
  v_entitlements jsonb := private.matrix_result_entitlements();
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or pg_catalog.jsonb_typeof(v_streaks) <> 'array'
    or v_offset not in (0, 1, 2) then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if (v_entitlements->>'canUseTianyan')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  where run.lottery = v_lottery and run.status = 'complete'
    and (v_period is null or run.draw_period = v_period)
  order by run.completed_at desc nulls last
  offset v_offset
  limit 1;
  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  v_payload := private.matrix_artifact_payload('tianyan', v_lottery, v_draw, v_version);
  if v_payload is null then raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY'; end if;
  select coalesce(pg_catalog.jsonb_agg(item order by (item->>'highestStreak')::integer desc, item->>'id'), '[]'::jsonb)
    into v_items
  from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
  where v_streaks ? (item->>'consecutive');
  return pg_catalog.jsonb_build_object(
    'kind', 'tianyan', 'lottery', v_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'exploreDateOffset', v_offset, 'status', 'complete',
    'items', v_items, 'total', pg_catalog.jsonb_array_length(v_items)
  );
end;
$$;

revoke all on function public.matrix_tianyan_list(jsonb) from public;
grant execute on function public.matrix_tianyan_list(jsonb) to anon, authenticated;

commit;
