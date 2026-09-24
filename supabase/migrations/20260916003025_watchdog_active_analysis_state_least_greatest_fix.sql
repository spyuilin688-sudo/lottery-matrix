create or replace function public.matrix_watchdog_analysis_state(
  p_lottery text,
  p_draw_period text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_draw_required boolean;
  v_sorted private.matrix_analysis_active_versions%rowtype;
  v_draw private.matrix_analysis_active_versions%rowtype;
  v_sorted_run public.matrix_analysis_runs%rowtype;
  v_draw_run public.matrix_analysis_runs%rowtype;
  v_latest public.matrix_analysis_runs%rowtype;
  v_complete boolean := false;
  v_started_at timestamptz;
  v_updated_at timestamptz;
  v_base_sorted text;
  v_base_draw text;
begin
  if p_lottery not in ('今彩539','天天樂','六合彩','大樂透')
    or nullif(pg_catalog.btrim(p_draw_period), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_WATCHDOG_ANALYSIS_QUERY';
  end if;

  v_draw_required := private.matrix_analysis_draw_order_eligible(p_lottery, p_draw_period);

  select * into v_sorted
  from private.matrix_analysis_active_versions
  where lottery = p_lottery and draw_period = p_draw_period and number_order = 'sorted';
  if found then
    select * into v_sorted_run
    from public.matrix_analysis_runs
    where lottery = v_sorted.lottery and draw_period = v_sorted.draw_period
      and analysis_version = v_sorted.analysis_version;
  end if;

  if v_draw_required then
    select * into v_draw
    from private.matrix_analysis_active_versions
    where lottery = p_lottery and draw_period = p_draw_period and number_order = 'draw';
    if found then
      select * into v_draw_run
      from public.matrix_analysis_runs
      where lottery = v_draw.lottery and draw_period = v_draw.draw_period
        and analysis_version = v_draw.analysis_version;
    end if;
  end if;

  v_base_sorted := pg_catalog.regexp_replace(coalesce(v_sorted.analysis_version, ''), '-sorted$', '');
  v_base_draw := pg_catalog.regexp_replace(coalesce(v_draw.analysis_version, ''), '-draw$', '');
  v_complete := v_sorted.analysis_version is not null
    and v_sorted_run.status = 'complete'
    and pg_catalog.cardinality(private.matrix_analysis_missing_kinds(
      p_lottery, p_draw_period, v_sorted.analysis_version
    )) = 0
    and (
      not v_draw_required
      or (
        v_draw.analysis_version is not null
        and v_draw_run.status = 'complete'
        and pg_catalog.cardinality(private.matrix_analysis_missing_kinds(
          p_lottery, p_draw_period, v_draw.analysis_version
        )) = 0
        and v_base_sorted = v_base_draw
      )
    );

  if v_complete then
    v_started_at := case
      when v_draw_required then least(v_sorted_run.started_at, v_draw_run.started_at)
      else v_sorted_run.started_at end;
    v_updated_at := case
      when v_draw_required then greatest(v_sorted_run.updated_at, v_draw_run.updated_at)
      else v_sorted_run.updated_at end;
    return pg_catalog.jsonb_build_object(
      'drawPeriod', p_draw_period,
      'status', 'complete',
      'startedAt', v_started_at,
      'updatedAt', v_updated_at,
      'leaseExpiresAt', null,
      'requiredOrders', case when v_draw_required
        then pg_catalog.jsonb_build_array('sorted','draw')
        else pg_catalog.jsonb_build_array('sorted') end,
      'activeVersions', case when v_draw_required
        then pg_catalog.jsonb_build_object('sorted',v_sorted.analysis_version,'draw',v_draw.analysis_version)
        else pg_catalog.jsonb_build_object('sorted',v_sorted.analysis_version) end
    );
  end if;

  select * into v_latest
  from public.matrix_analysis_runs run
  where run.lottery = p_lottery and run.draw_period = p_draw_period
    and (
      pg_catalog.right(run.analysis_version, 7) = '-sorted'
      or (v_draw_required and pg_catalog.right(run.analysis_version, 5) = '-draw')
      or run.analysis_version !~ '-(sorted|draw)$'
    )
  order by run.started_at desc, run.updated_at desc
  limit 1;

  if v_latest.id is null then
    return pg_catalog.jsonb_build_object(
      'drawPeriod', p_draw_period,
      'status', 'missing',
      'startedAt', null,
      'updatedAt', null,
      'leaseExpiresAt', null
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'drawPeriod', p_draw_period,
    'status', v_latest.status,
    'startedAt', v_latest.started_at,
    'updatedAt', v_latest.updated_at,
    'leaseExpiresAt', v_latest.lease_expires_at
  );
end;
$$;

revoke all on function public.matrix_watchdog_analysis_state(text,text)
  from public, anon, authenticated;
grant execute on function public.matrix_watchdog_analysis_state(text,text)
  to service_role;

notify pgrst, 'reload schema';