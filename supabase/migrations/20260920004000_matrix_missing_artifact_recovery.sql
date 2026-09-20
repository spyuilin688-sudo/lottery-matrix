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

-- Restore only absent active slots for the versions explicitly selected by the
-- existing worker. Never replace an active version or choose among old runs.
create function public.matrix_restore_analysis_pointers(
 p_lottery text,p_draw_period text,p_versions jsonb,p_owner_id text,p_runner_id text
) returns boolean language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
 v_latest text;
 v_orders text[];
 v_order text;
 v_version text;
 v_base text;
 v_existing text;
begin
 if p_lottery not in ('今彩539','天天樂','六合彩','大樂透')
   or nullif(pg_catalog.btrim(p_draw_period),'') is null
   or pg_catalog.jsonb_typeof(p_versions) is distinct from 'object'
 then return false; end if;
 -- Match recovery completion's lock order. Take the active table's write lock
 -- up front so two restorers cannot deadlock while upgrading shared locks.
 lock table public.lottery_draws in share mode;
 lock table public.matrix_analysis_runs in share mode;
 lock table public.matrix_analysis_artifacts in share mode;
 lock table private.matrix_analysis_active_versions in share row exclusive mode;
 perform 1 from public.matrix_watchdog_leases
 where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id
   and expires_at>pg_catalog.clock_timestamp() for update;
 if not found then return false; end if;
 select period into v_latest from public.lottery_draws where lottery=p_lottery
 order by draw_date desc nulls last,period desc limit 1;
 if v_latest is distinct from p_draw_period then return false; end if;
 v_orders := case when private.matrix_analysis_draw_order_eligible(p_lottery,p_draw_period)
   then array['sorted','draw'] else array['sorted'] end;
 if (select count(*) from pg_catalog.jsonb_object_keys(p_versions)) <> pg_catalog.cardinality(v_orders)
 then return false; end if;
 -- Validate every slot before inserting any, including pair/version consistency.
 foreach v_order in array v_orders loop
   v_version := p_versions->>v_order;
   if v_version is null or pg_catalog.left(v_version,pg_catalog.length(p_draw_period)+1) <> p_draw_period||':'
     or pg_catalog.right(v_version,pg_catalog.length(v_order)+1) <> '-'||v_order
   then return false; end if;
   if v_base is null then
     v_base := pg_catalog.left(v_version,pg_catalog.length(v_version)-pg_catalog.length(v_order)-1);
   elsif v_base <> pg_catalog.left(v_version,pg_catalog.length(v_version)-pg_catalog.length(v_order)-1)
   then return false; end if;
   if not exists(select 1 from public.matrix_analysis_runs where lottery=p_lottery
     and draw_period=p_draw_period and analysis_version=v_version and status='complete')
     or pg_catalog.cardinality(private.matrix_analysis_missing_kinds(p_lottery,p_draw_period,v_version)) <> 0
   then return false; end if;
   select analysis_version into v_existing from private.matrix_analysis_active_versions
   where lottery=p_lottery and draw_period=p_draw_period and number_order=v_order;
   if found and v_existing is distinct from v_version then return false; end if;
 end loop;
 if not exists(select 1 from public.matrix_watchdog_leases where lease_key='railway:'||p_lottery
   and owner_id=p_owner_id and runner_id=p_runner_id and expires_at>pg_catalog.clock_timestamp())
 then return false; end if;
 insert into private.matrix_analysis_active_versions(lottery,draw_period,number_order,analysis_version,activated_at)
 select p_lottery,p_draw_period,o,p_versions->>o,pg_catalog.clock_timestamp() from pg_catalog.unnest(v_orders) o
 on conflict(lottery,draw_period,number_order) do nothing;
 return true;
end;
$$;
revoke all on function public.matrix_restore_analysis_pointers(text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.matrix_restore_analysis_pointers(text,text,jsonb,text,text) to service_role;
notify pgrst,'reload schema';
commit;
