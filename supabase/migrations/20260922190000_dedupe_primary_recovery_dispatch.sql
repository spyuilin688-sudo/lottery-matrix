begin;

-- Primary owns every clock shared by the normal acquisition/analysis schedule.
-- Recovery keeps its independent late/extra checkpoints, but no longer wakes
-- the watchdog at a clock where primary is already scheduled to do the work.
create or replace function private.matrix_recovery_dispatch_slots(
  p_group text,
  p_day date
)
returns setof timestamptz
language sql
stable
set search_path = ''
as $$
  select recovery.slot
  from private.matrix_recovery_slots(p_group, p_day) as recovery(slot)
  where not exists (
    select 1
    from private.matrix_primary_slots(p_group, p_day) as primary_slot(slot)
    where primary_slot.slot = recovery.slot
  )
  order by recovery.slot
$$;

revoke all on function private.matrix_recovery_dispatch_slots(text, date)
from public, anon, authenticated, service_role;

create or replace function private.matrix_recovery_refresh_calendar(
  p_group text,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.matrix_recovery_schedule;
  v_skip text;
  v_next timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-recovery:' || p_group));

  for r in
    select *
    from private.matrix_recovery_schedule
    where worker_group = p_group
      and completed_at is null
  loop
    v_skip := case
      when not private.matrix_recovery_draw_due(r.lottery, r.cycle_date, p_now)
        then 'no-draw'
    end;

    if v_skip is distinct from r.skip_reason then
      select min(slot)
      into v_next
      from private.matrix_recovery_dispatch_slots(p_group, r.cycle_date) as slot
      where slot > p_now;

      update private.matrix_recovery_schedule
      set skip_reason = v_skip,
          next_at = case when v_skip is null then v_next end,
          dispatched_at = null
      where lottery = r.lottery;
    end if;
  end loop;

  perform private.matrix_recovery_replan(p_group);
end;
$$;

create or replace function private.matrix_recovery_tick(
  p_group text,
  p_now timestamptz default pg_catalog.now(),
  p_dispatch boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Taipei';
  v_day date;
  v_open time;
  v_lottery text;
  v_state private.matrix_recovery_schedule;
  v_next timestamptz;
  v_url text;
  v_token text;
  v_request bigint;
  v_due boolean := false;
  v_completed timestamptz;
  v_period text;
  v_due_slot timestamptz;
begin
  if p_group not in ('evening', 'fantasy5')
    or p_group is null
    or p_now is null
    or not pg_catalog.isfinite(p_now)
  then
    raise exception 'RECOVERY_GROUP_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-recovery:' || p_group));

  v_open := case when p_group = 'evening' then time '20:30' else time '09:30' end;
  v_day := v_local::date - case when v_local::time < v_open then 1 else 0 end;

  foreach v_lottery in array case
    when p_group = 'evening' then array['今彩539', '大樂透', '六合彩']
    else array['天天樂']
  end loop
    select min(slot)
    into v_next
    from private.matrix_recovery_dispatch_slots(p_group, v_day) as slot
    where slot >= pg_catalog.date_trunc('minute', p_now);

    insert into private.matrix_recovery_schedule(
      lottery,
      worker_group,
      cycle_date,
      next_at,
      skip_reason
    )
    values(
      v_lottery,
      p_group,
      v_day,
      v_next,
      case
        when not private.matrix_recovery_draw_due(v_lottery, v_day, p_now)
          then 'no-draw'
      end
    )
    on conflict(lottery) do update
      set cycle_date = excluded.cycle_date,
          next_at = excluded.next_at,
          completed_at = null,
          dispatched_at = null,
          skip_reason = excluded.skip_reason,
          last_error = null
      where private.matrix_recovery_schedule.cycle_date <> excluded.cycle_date;

    update private.matrix_recovery_schedule
    set skip_reason = case
      when not private.matrix_recovery_draw_due(v_lottery, v_day, p_now)
        then 'no-draw'
    end
    where lottery = v_lottery
      and completed_at is null;

    select *
    into v_state
    from private.matrix_recovery_schedule
    where lottery = v_lottery;

    if v_state.completed_at is not null or v_state.skip_reason is not null then
      continue;
    end if;

    select c.draw_period
    into v_period
    from private.matrix_worker_completion as c
    where c.lottery = v_lottery
      and c.certified_generation = c.generation
      and c.valid_until > p_now;

    if v_period is not null then
      begin
        perform public.matrix_recovery_complete(v_lottery, v_period);
      exception
        when others then
          update private.matrix_recovery_schedule
          set last_error = 'RECOVERY_COMPLETION_CHECK_FAILED'
          where lottery = v_lottery;
      end;
    end if;

    select *
    into v_state
    from private.matrix_recovery_schedule
    where lottery = v_lottery;

    if v_state.completed_at is not null or v_state.skip_reason is not null then
      continue;
    end if;

    select max(slot)
    into v_due_slot
    from private.matrix_recovery_dispatch_slots(p_group, v_day) as slot
    where slot <= p_now
      and p_now < slot + interval '10 minutes';

    if p_dispatch and v_state.next_at <= p_now and v_due_slot is not null then
      v_due := true;
      update private.matrix_recovery_schedule
      set dispatched_at = p_now
      where lottery = v_lottery;
    end if;

    select min(slot)
    into v_next
    from private.matrix_recovery_dispatch_slots(p_group, v_day) as slot
    where slot > p_now;

    update private.matrix_recovery_schedule
    set next_at = v_next
    where lottery = v_lottery;
  end loop;

  perform private.matrix_recovery_replan(p_group);
  if not v_due then
    return null;
  end if;

  select updated_at
  into v_completed
  from private.admin_watchdog_status
  where id = true;

  insert into private.admin_watchdog_schedule as current(
    id,
    checked_at,
    due,
    pending_since
  )
  values(true, p_now, true, p_now)
  on conflict(id) do update
    set checked_at = excluded.checked_at,
        due = true,
        pending_since = case
          when current.pending_since is not null
            and (v_completed is null or v_completed < current.pending_since)
            then current.pending_since
          else p_now
        end;

  begin
    select decrypted_secret
    into v_url
    from vault.decrypted_secrets
    where name = 'matrix_project_url'
    limit 1;

    select decrypted_secret
    into v_token
    from vault.decrypted_secrets
    where name = 'matrix_admin_watchdog_token'
    limit 1;

    if nullif(pg_catalog.btrim(v_url), '') is null
      or nullif(pg_catalog.btrim(v_token), '') is null
    then
      raise exception 'RECOVERY_DISPATCH_CONFIG_MISSING';
    end if;

    select net.http_post(
      url := pg_catalog.rtrim(v_url, '/') || '/functions/v1/admin-api/api/internal/matrix-watchdog',
      headers := pg_catalog.jsonb_build_object(
        'Content-Type', 'application/json',
        'Origin', 'https://matrixlottery.idv.tw',
        'x-matrix-watchdog-token', v_token
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    )
    into v_request;
  exception
    when others then
      update private.matrix_recovery_schedule
      set last_error = 'RECOVERY_DISPATCH_FAILED'
      where worker_group = p_group
        and dispatched_at = p_now;
  end;

  return v_request;
end;
$$;

revoke all on function private.matrix_recovery_refresh_calendar(text, timestamptz),
  private.matrix_recovery_tick(text, timestamptz, boolean)
from public, anon, authenticated, service_role;

-- Recalculate any pending one-shot recovery cron from the non-overlapping
-- dispatch clocks without launching work during migration.
update private.matrix_recovery_schedule as current
set next_at = (
  select min(slot)
  from private.matrix_recovery_dispatch_slots(current.worker_group, current.cycle_date) as slot
  where slot > pg_catalog.now()
),
dispatched_at = null
where completed_at is null
  and skip_reason is null;

select private.matrix_recovery_replan('evening');
select private.matrix_recovery_replan('fantasy5');

commit;
