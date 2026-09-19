begin;
CREATE OR REPLACE FUNCTION public.matrix_analysis_acquire_run(p_lottery text, p_draw_period text, p_analysis_version text, p_owner_id text, p_started_at timestamp with time zone, p_lease_seconds integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_run public.matrix_analysis_runs%rowtype;
  v_acquired boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if nullif(btrim(p_owner_id), '') is null then
    raise exception 'ANALYSIS_RUN_OWNER_REQUIRED' using errcode = '22023';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'ANALYSIS_RUN_LEASE_SECONDS_INVALID' using errcode = '22023';
  end if;

  insert into public.matrix_analysis_runs (
    lottery,
    draw_period,
    analysis_version,
    phase,
    cursor,
    total,
    status,
    started_at,
    completed_at,
    error,
    lease_owner,
    lease_expires_at,
    updated_at
  ) values (
    p_lottery,
    p_draw_period,
    p_analysis_version,
    'explore',
    0,
    0,
    'running',
    coalesce(p_started_at, v_now),
    null,
    null,
    p_owner_id,
    v_now + make_interval(secs => p_lease_seconds),
    v_now
  )
  on conflict (lottery, draw_period, analysis_version) do nothing;

  select *
    into strict v_run
    from public.matrix_analysis_runs
   where lottery = p_lottery
     and draw_period = p_draw_period
     and analysis_version = p_analysis_version
   for update;

  if v_run.status = 'complete' then
    if pg_catalog.cardinality(private.matrix_analysis_missing_kinds(p_lottery,p_draw_period,p_analysis_version)) = 0 then
      return to_jsonb(v_run) || jsonb_build_object('lease_acquired', false);
    end if;
    -- Resume missing artifacts through the same exclusive run lease.
    update public.matrix_analysis_runs
       set phase = case when not exists (select 1 from public.matrix_analysis_artifacts where lottery=p_lottery and draw_period=p_draw_period and analysis_version=p_analysis_version and kind='status') and pg_catalog.cardinality(private.matrix_analysis_missing_kinds(p_lottery,p_draw_period,p_analysis_version))=1 then 'status' else 'explore' end, cursor = 0, total = 0,
           status = 'running', completed_at = null, error = null,
           lease_owner = p_owner_id,
           lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
           updated_at = v_now
     where id = v_run.id
     returning * into v_run;
    return to_jsonb(v_run) || jsonb_build_object('lease_acquired', true);
  end if;

  if v_run.status = 'failed'
     or v_run.lease_owner is null
     or v_run.lease_owner = p_owner_id
     or v_run.lease_expires_at is null
     or v_run.lease_expires_at <= v_now then
    update public.matrix_analysis_runs
       set status = 'running',
           completed_at = null,
           error = null,
           lease_owner = p_owner_id,
           lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
           updated_at = v_now
     where id = v_run.id
     returning * into v_run;
    v_acquired := true;
  end if;

  return to_jsonb(v_run) || jsonb_build_object('lease_acquired', v_acquired);
end;
$function$;
revoke all on function public.matrix_analysis_acquire_run(text,text,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.matrix_analysis_acquire_run(text,text,text,text,timestamptz,integer) to service_role;
commit;
