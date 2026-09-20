-- Return only the stored summary for homepage reads. Full reads remain compatible.
create or replace function public.matrix_status_compact_get(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_draw text;
  v_sorted text;
  v_actual text;
  v_version text;
  v_compact jsonb;
begin
  if pg_catalog.jsonb_typeof(p_request) is distinct from 'object'
    or v_lottery is null
    or v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  v_draw := private.matrix_analysis_read_period(v_lottery, v_period, 0);
  if v_draw is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  v_sorted := private.matrix_analysis_order_version(
    v_lottery, v_draw, '依號碼由小到大排序', 'status'
  );
  v_actual := private.matrix_analysis_order_version(
    v_lottery, v_draw, '依實際開獎順序排序', 'status'
  );
  if v_sorted is null and v_actual is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  v_version := case
    when v_sorted is not null and v_actual is not null and v_sorted <> v_actual
      then v_draw || ':matrix-active:'
        || pg_catalog.md5(pg_catalog.jsonb_build_array(v_sorted, v_actual)::text)
    else coalesce(v_sorted, v_actual)
  end;

  select case when p_request->'summaryOnly' = 'true'::jsonb
    then pg_catalog.jsonb_build_object(
      'lottery', artifact.compact_payload->'lottery',
      'drawPeriod', artifact.compact_payload->'drawPeriod',
      'summary', artifact.compact_payload->'summary'
    ) else artifact.compact_payload end
    into v_compact
  from public.matrix_analysis_artifacts as artifact
  where artifact.kind = 'status'
    and artifact.lottery = v_lottery
    and artifact.draw_period = v_draw
    and artifact.analysis_version = coalesce(v_sorted, v_actual)
  limit 1;

  if v_compact is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  return pg_catalog.jsonb_build_object(
    'analysisVersion', v_version,
    'drawPeriod', v_draw,
    'payload', v_compact
  );
end;
$$;

revoke all on function public.matrix_status_compact_get(jsonb)
  from public, anon, authenticated;
grant execute on function public.matrix_status_compact_get(jsonb)
  to service_role;

