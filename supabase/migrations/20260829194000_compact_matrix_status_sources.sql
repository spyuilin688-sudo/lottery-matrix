begin;

create or replace function public.matrix_status_sources_get(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_sources jsonb;
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  where run.lottery = v_lottery and run.status = 'complete'
    and (v_period is null or run.draw_period = v_period)
  order by run.completed_at desc nulls last limit 1;
  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  v_payload := private.matrix_artifact_payload('status', v_lottery, v_draw, v_version);
  v_sources := v_payload->'statusSources';
  if v_sources is null or v_sources->'explore' is null or v_sources->'tianyan' is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  return pg_catalog.jsonb_build_object(
    'analysisVersion', v_version,
    'drawPeriod', v_draw,
    'explore', v_sources->'explore',
    'tianyan', v_sources->'tianyan'
  );
end;
$$;

revoke all on function public.matrix_status_sources_get(jsonb) from public, anon, authenticated;
grant execute on function public.matrix_status_sources_get(jsonb) to service_role;

commit;
