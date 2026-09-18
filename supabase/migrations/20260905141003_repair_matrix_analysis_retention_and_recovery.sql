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
    if exists (
      select 1 from public.matrix_analysis_artifacts as artifact
      where artifact.lottery = p_lottery
        and artifact.draw_period = p_draw_period
        and artifact.analysis_version = p_analysis_version
        and artifact.kind = 'explore'
    ) then
      return to_jsonb(v_run) || jsonb_build_object('lease_acquired', false);
    end if;
    -- A completed status without its source artifact is not recoverable by
    -- restoring result rows. Restart through the same exclusive run lease.
    update public.matrix_analysis_runs
       set phase = 'explore', cursor = 0, total = 0,
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
$function$
;

create or replace function public.matrix_analysis_cleanup_expired(p_now timestamptz)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_now is null then
    raise exception 'CLEANUP_TIME_REQUIRED' using errcode = '22023';
  end if;

  -- Date offsets 0, 1 and 2 refer to completed draw periods, not wall-clock days.
  -- All versions of those periods and in-progress checkpoints remain readable.
  with completed_periods as (
    select distinct run.lottery, run.draw_period, draw.draw_date
    from public.matrix_analysis_runs as run
    left join public.lottery_draws as draw
      on draw.lottery = run.lottery and draw.period = run.draw_period
    where run.status = 'complete'
  ), ranked_periods as (
    select lottery, draw_period,
      row_number() over (
        partition by lottery
        order by (draw_date is not null) desc, draw_date desc nulls last, draw_period desc
      ) as position
    from completed_periods
  ), retained as materialized (
    select run.lottery, run.draw_period, run.analysis_version
    from public.matrix_analysis_runs as run
    where run.status = 'running'
      or exists (
        select 1 from ranked_periods as period
        where period.lottery = run.lottery
          and period.draw_period = run.draw_period and period.position <= 3
      )
  ), removed_artifacts as (
    delete from public.matrix_analysis_artifacts as artifact
    where artifact.expires_at < p_now and not exists (
      select 1 from retained
      where retained.lottery = artifact.lottery
        and retained.draw_period = artifact.draw_period
        and retained.analysis_version = artifact.analysis_version
    )
    returning 1
  ), removed_chunks as (
    delete from public.matrix_analysis_artifact_chunks as chunk
    where chunk.expires_at < p_now and not exists (
      select 1 from retained
      where retained.lottery = chunk.lottery
        and retained.draw_period = chunk.draw_period
        and retained.analysis_version = chunk.analysis_version
    )
    returning 1
  ), removed_results as (
    delete from public.matrix_explore_results as result
    where result.expires_at < p_now and not exists (
      select 1 from retained
      where retained.lottery = result.lottery
        and retained.draw_period = result.draw_period
        and retained.analysis_version = result.analysis_version
    )
    returning 1
  )
  select ((select count(*) from removed_artifacts)
    + (select count(*) from removed_chunks)
    + (select count(*) from removed_results))::integer into v_deleted;
  return v_deleted;
end;
$$;

revoke all on function public.matrix_analysis_cleanup_expired(timestamptz) from public, anon, authenticated;
grant execute on function public.matrix_analysis_cleanup_expired(timestamptz) to service_role;
revoke all on function public.matrix_analysis_acquire_run(text,text,text,text,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.matrix_analysis_acquire_run(text,text,text,text,timestamptz,integer) to service_role;

