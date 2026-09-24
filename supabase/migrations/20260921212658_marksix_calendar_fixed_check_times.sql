begin;

-- Mark Six calendar checks now run only at the explicitly requested Taipei times:
-- 12:00, 14:00, 16:00, plus 15 minutes before each selectable Mark Six reminder.
-- The existing five-minute notification recovery cron remains for notification
-- recovery only and no longer performs calendar checks.
create or replace function private.notification_draw_calendar_scheduled_slot(
  p_now timestamptz default pg_catalog.now()
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with local_now as (
    select p_now at time zone 'Asia/Taipei' as value
  ),
  slots as (
    select ((local_now.value::date + slot_time)::timestamp at time zone 'Asia/Taipei') as slot_at
    from local_now
    cross join pg_catalog.unnest(array[
      time '12:00',
      time '14:00',
      time '16:00',
      time '16:45',
      time '17:15',
      time '17:45',
      time '18:15',
      time '18:45',
      time '19:15',
      time '19:45',
      time '20:15',
      time '20:30',
      time '20:45',
      time '20:55',
      time '21:05',
      time '21:10'
    ]) as t(slot_time)
  )
  select max(slot_at)
  from slots
  where p_now >= slot_at
    and p_now < slot_at + interval '5 minutes'
$$;

revoke all on function private.notification_draw_calendar_scheduled_slot(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.notification_draw_calendar_acquire(p_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_state private.notification_draw_calendar_sync;
  v_slot timestamptz;
begin
  if p_owner_id is null then
    return false;
  end if;

  v_slot := private.notification_draw_calendar_scheduled_slot(v_now);
  if v_slot is null then
    return false;
  end if;

  select *
    into v_state
  from private.notification_draw_calendar_sync
  where lottery = '六合彩'
  for update skip locked;

  if not found
    or v_state.lease_expires_at > v_now
    or (v_state.last_success_at is not null and v_state.last_success_at >= v_slot)
  then
    return false;
  end if;

  update private.notification_draw_calendar_sync
  set lease_owner = p_owner_id,
      lease_expires_at = v_now + interval '5 minutes',
      last_started_at = v_now,
      next_attempt_at = v_now + interval '5 minutes',
      valid_until = v_now,
      last_error = 'OFFICIAL_CALENDAR_PENDING'
  where lottery = '六合彩';

  return true;
end;
$$;

create or replace function private.notification_draw_calendar_refresh_http_tick(
  p_now timestamptz default pg_catalog.now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Taipei';
  v_cycle_date date;
  v_url text;
  v_token text;
  v_request bigint;
begin
  if private.notification_draw_calendar_scheduled_slot(p_now) is null then
    return null;
  end if;

  v_cycle_date := v_local::date
    - case when v_local::time < time '20:30' then 1 else 0 end;

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

  if nullif(pg_catalog.btrim(v_url),'') is null
    or nullif(pg_catalog.btrim(v_token),'') is null then
    raise exception 'CALENDAR_REFRESH_CONFIG_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_url,'/') || '/functions/v1/admin-api/api/internal/matrix-primary',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type','application/json',
      'Origin','https://matrixlottery.idv.tw',
      'x-matrix-watchdog-token',v_token
    ),
    body := pg_catalog.jsonb_build_object(
      'group','evening',
      'cycleDate',v_cycle_date,
      'lotteries',pg_catalog.jsonb_build_array('六合彩')
    ),
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function private.notification_draw_calendar_refresh_http_tick(timestamptz)
  from public, anon, authenticated, service_role;

-- Restore the five-minute recovery job to notification recovery only.
create or replace function private.notification_recovery_tick(
  p_now timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fanout jsonb := '{}'::jsonb;
  v_web bigint;
  v_native bigint;
  v_admin bigint;
  v_fanout_failed boolean := false;
  v_web_failed boolean := false;
  v_native_failed boolean := false;
  v_admin_failed boolean := false;
begin
  begin
    v_fanout := private.notification_fanout_drain(100, p_now);
  exception
    when others then
      v_fanout_failed := true;
  end;

  begin
    v_web := private.notification_dispatch_http_tick();
  exception
    when others then
      v_web_failed := true;
  end;

  begin
    v_native := private.native_notification_dispatch_http_tick();
  exception
    when others then
      v_native_failed := true;
  end;

  begin
    v_admin := private.admin_transfer_push_tick();
  exception
    when others then
      v_admin_failed := true;
  end;

  return pg_catalog.jsonb_build_object(
    'fanout', v_fanout,
    'fanoutFailed', v_fanout_failed,
    'webRequestId', v_web,
    'webFailed', v_web_failed,
    'nativeRequestId', v_native,
    'nativeFailed', v_native_failed,
    'adminRequestId', v_admin,
    'adminFailed', v_admin_failed
  );
end;
$$;

revoke all on function private.notification_recovery_tick(timestamptz)
  from public, anon, authenticated, service_role;

drop function if exists private.notification_draw_calendar_refresh_due(timestamptz);

-- pg_cron is UTC. These six schedules expand to the 16 requested Taipei checks:
-- 12:00, 14:00, 16:00,
-- 16:45, 17:15, 17:45, 18:15, 18:45, 19:15, 19:45,
-- 20:15, 20:30, 20:45, 20:55, 21:05, 21:10.
do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'matrix-marksix-calendar-midday',
      'matrix-marksix-calendar-45',
      'matrix-marksix-calendar-15',
      'matrix-marksix-calendar-2030',
      'matrix-marksix-calendar-2055',
      'matrix-marksix-calendar-2105-2110'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'matrix-marksix-calendar-midday',
  '0 4,6,8 * * *',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-45',
  '45 8-12 * * *',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-15',
  '15 9-12 * * *',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-2030',
  '30 12 * * *',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-2055',
  '55 12 * * *',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-2105-2110',
  '5,10 13 * * *',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

commit;
