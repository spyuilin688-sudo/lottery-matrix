create or replace function public.matrix_status_validation_source_get(p_request jsonb)
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
  v_validation jsonb;
begin
  if pg_catalog.jsonb_typeof(p_request) <> 'object'
    or v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or v_draw is null
    or v_version is null
    or v_item_id is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  if not exists (
    select 1
    from public.matrix_analysis_runs as run
    where run.lottery = v_lottery
      and run.draw_period = v_draw
      and run.analysis_version = v_version
      and run.status = 'complete'
  ) then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_VERSION_MISMATCH';
  end if;

  select result.validation
  into v_validation
  from public.matrix_explore_results as result
  where result.lottery = v_lottery
    and result.draw_period = v_draw
    and result.analysis_version = v_version
    and result.item_id = v_item_id
  limit 1;

  if v_validation is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  return pg_catalog.jsonb_build_object(
    'itemId', v_item_id,
    'validation', v_validation
  );
end;
$$;

revoke all on function public.matrix_status_validation_source_get(jsonb)
  from public, anon, authenticated;
grant execute on function public.matrix_status_validation_source_get(jsonb)
  to service_role;
