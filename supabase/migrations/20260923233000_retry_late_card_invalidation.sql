-- A later draw correction invalidates the card after the cycle's one-shot
-- primary and recovery jobs have stopped. Reuse the hourly retention clock;
-- the four-row check makes no HTTP request when the current chain is complete.
begin;
set local lock_timeout = '5s';

create function private.matrix_late_correction_candidates(p_now timestamptz)
returns table(lottery text, cycle_date date)
language sql stable security invoker set search_path = '' as $$
  select item.lottery, draw.draw_date
  from pg_catalog.unnest(array['今彩539','大樂透','六合彩','天天樂']::text[]) as item(lottery)
  cross join lateral (
    select d.period,d.draw_date,d.result_status
    from public.lottery_draws d
    where d.lottery = item.lottery
    order by d.draw_date desc nulls last,d.period desc
    limit 1
  ) draw
  cross join lateral (
    select public.matrix_watchdog_chain_state(item.lottery,draw.period) as value
  ) chain
  left join private.matrix_primary_schedule primary_state
    on primary_state.worker_group = case when item.lottery='天天樂' then 'fantasy5' else 'evening' end
  left join private.matrix_recovery_schedule recovery_state
    on recovery_state.lottery = item.lottery
  cross join lateral (
    select max(recovery.slot) as last_at
    from private.matrix_recovery_slots(
      case when item.lottery='天天樂' then 'fantasy5' else 'evening' end,
      draw.draw_date
    ) as recovery(slot)
  ) recovery_window
  cross join lateral (
    select max(recovery.slot) as last_at
    from private.matrix_recovery_slots(
      coalesce(recovery_state.worker_group,
        case when item.lottery='天天樂' then 'fantasy5' else 'evening' end),
      coalesce(recovery_state.cycle_date,draw.draw_date)
    ) as recovery(slot)
  ) active_window
  where draw.result_status = 'confirmed'
    and draw.draw_date <= (p_now at time zone 'Asia/Taipei')::date
    and (
      (primary_state.cycle_date = draw.draw_date and primary_state.completed_at is not null)
      or (recovery_state.cycle_date = draw.draw_date and recovery_state.completed_at is not null)
      or p_now > recovery_window.last_at
    )
    -- The existing one-shot recovery owns this lottery until its next valid
    -- future slot, even when a newer cycle has superseded this draw's date.
    and (
      recovery_state.completed_at is null
      and recovery_state.skip_reason is null
      and recovery_state.next_at > p_now
      and recovery_state.next_at <= active_window.last_at
    ) is not true
    -- net.http_post queues asynchronously. Do not queue the same draw again
    -- while a normal recovery dispatch from the past ten minutes is pending.
    and (
      recovery_state.completed_at is null
      and recovery_state.skip_reason is null
      and recovery_state.dispatched_at > p_now - interval '10 minutes'
      and recovery_state.dispatched_at <= p_now
    ) is not true
    and (
      chain.value->>'latestPeriod' is distinct from draw.period
      or (chain.value->>'analysisComplete')::boolean is distinct from true
      or (chain.value->>'matrixStatusComplete')::boolean is distinct from true
      or (chain.value->>'cardComplete')::boolean is distinct from true
    )
$$;

-- The scheduled watchdog reads this exact RPC. A correction is independent
-- of the recovery row's completed_at and remains visible until the card gate
-- and analysis pass, including after a subsequent no-draw cycle replaces its date.
create or replace function public.matrix_recovery_pending(p_now timestamptz default pg_catalog.now())
returns jsonb language sql stable security definer set search_path = '' as $$
  with pending as (
    select lottery,cycle_date from private.matrix_recovery_schedule
    where completed_at is null and skip_reason is null
      and dispatched_at<=p_now and dispatched_at>p_now-interval '10 minutes'
    union all
    select lottery,cycle_date from private.matrix_late_correction_candidates(p_now)
  ), unique_lotteries as (
    select distinct on (lottery) lottery,cycle_date from pending
    order by lottery,cycle_date desc
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('lottery',lottery,'cycleDate',cycle_date)
    order by lottery
  ),'[]'::jsonb) from unique_lotteries
$$;

-- Avoid returning a stale success after draw_changed has invalidated analysis
-- and card metadata. The watchdog can plan the necessary recovery stage.
create or replace function public.matrix_recovery_complete(p_lottery text,p_period text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_state private.matrix_recovery_schedule; v_draw public.lottery_draws; v_chain jsonb; v_group text;
begin
 v_group:=case when p_lottery='天天樂' then 'fantasy5' else 'evening' end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-recovery:'||v_group));
 select * into v_state from private.matrix_recovery_schedule where lottery=p_lottery for update;
 if not found then return false; end if;
 select * into v_draw from public.lottery_draws where lottery=p_lottery
 order by draw_date desc nulls last,period desc limit 1;
 if v_draw.period is distinct from p_period or v_draw.draw_date is distinct from v_state.cycle_date
  or v_draw.result_status is distinct from 'confirmed' then return false; end if;
 v_chain:=public.matrix_watchdog_chain_state(p_lottery,p_period);
 if v_chain->>'latestPeriod' is distinct from p_period
  or (v_chain->>'analysisComplete')::boolean is distinct from true
  or (v_chain->>'matrixStatusComplete')::boolean is distinct from true
  or (v_chain->>'cardComplete')::boolean is distinct from true then return false; end if;
 if v_state.completed_at is not null then return true; end if;
 update private.matrix_recovery_schedule set completed_at=pg_catalog.clock_timestamp(),next_at=null,dispatched_at=null,last_error=null where lottery=p_lottery;
 perform private.matrix_recovery_replan(v_group);
 return true;
end $$;

create function private.matrix_late_correction_tick(p_now timestamptz default pg_catalog.clock_timestamp())
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_url text; v_token text; v_request bigint;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('matrix-late-correction')) then
    return null;
  end if;
  if not exists(select 1 from private.matrix_late_correction_candidates(p_now)) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets
    where name='matrix_project_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets
    where name='matrix_admin_watchdog_token' limit 1;
  if nullif(pg_catalog.btrim(v_url),'') is null or nullif(pg_catalog.btrim(v_token),'') is null then
    raise exception 'MATRIX_LATE_CORRECTION_CONFIG_MISSING';
  end if;
  select net.http_post(
    url:=pg_catalog.rtrim(v_url,'/')||'/functions/v1/admin-api/api/internal/matrix-watchdog',
    headers:=pg_catalog.jsonb_build_object(
      'Content-Type','application/json','Origin','https://matrixlottery.idv.tw',
      'x-matrix-watchdog-token',v_token),
    body:='{}'::jsonb,timeout_milliseconds:=30000
  ) into v_request;
  return v_request;
end $$;

create function private.matrix_retention_with_correction_tick(p_now timestamptz default pg_catalog.clock_timestamp())
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_deleted integer;
begin
  v_deleted := private.matrix_analysis_cleanup_tick();
  begin
    perform private.matrix_late_correction_tick(p_now);
  exception when others then
    -- A missing Vault setting or transient dispatch failure must not roll
    -- back an otherwise successful cleanup. The card remains pending and the
    -- same existing hourly job will retry the incomplete chain.
    raise warning 'MATRIX_LATE_CORRECTION_DISPATCH_FAILED %', SQLSTATE;
  end;
  return v_deleted;
end $$;

revoke all on function private.matrix_late_correction_candidates(timestamptz),
 private.matrix_late_correction_tick(timestamptz),
 private.matrix_retention_with_correction_tick(timestamptz)
 from public,anon,authenticated,service_role;
revoke all on function public.matrix_recovery_pending(timestamptz),
 public.matrix_recovery_complete(text,text) from public,anon,authenticated;
grant execute on function public.matrix_recovery_pending(timestamptz),
 public.matrix_recovery_complete(text,text) to service_role;

-- Exactly one existing job keeps the same name and hour, with no extra cron.
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname='matrix-analysis-retention'
  loop perform cron.unschedule(v_job.jobid); end loop;
  perform cron.schedule('matrix-analysis-retention','17 * * * *',
    'select private.matrix_retention_with_correction_tick();');
end $$;
notify pgrst, 'reload schema';
commit;
