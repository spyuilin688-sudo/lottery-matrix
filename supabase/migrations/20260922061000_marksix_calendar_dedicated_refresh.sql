begin;

create or replace function private.notification_draw_calendar_next_slot(
  p_after timestamptz default pg_catalog.now()
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with local_after as (
    select p_after at time zone 'Asia/Taipei' as value
  ),
  days as (
    select d::date as day
    from local_after,
      pg_catalog.generate_series(
        local_after.value::date,
        local_after.value::date + 7,
        interval '1 day'
      ) as d
    where pg_catalog.date_part('isodow', d)::integer in (2,4,6,7)
  ),
  slots as (
    select ((days.day + slot_time)::timestamp at time zone 'Asia/Taipei') as slot_at
    from days
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
  select min(slot_at)
  from slots
  where slot_at > p_after
$$;

revoke all on function private.notification_draw_calendar_next_slot(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.notification_draw_calendar_complete(
  p_owner_id uuid,
  p_days jsonb,
  p_fetched_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_today date := (v_now at time zone 'Asia/Taipei')::date;
  v_state private.notification_draw_calendar_sync;
  v_start date;
  v_end date;
  v_count integer;
  v_unique integer;
  v_next_slot timestamptz;
  v_valid_until timestamptz;
begin
  select * into v_state
  from private.notification_draw_calendar_sync
  where lottery = '六合彩'
  for update;

  if not found
    or v_state.lease_owner is distinct from p_owner_id
    or p_owner_id is null
    or v_state.lease_expires_at is null
    or v_state.lease_expires_at <= v_now
  then
    return false;
  end if;

  if p_fetched_at is null
    or not pg_catalog.isfinite(p_fetched_at)
    or p_fetched_at < v_state.last_started_at
    or p_fetched_at > v_now + interval '1 minute'
    or p_fetched_at < v_now - interval '5 minutes'
    or pg_catalog.jsonb_typeof(p_days) is distinct from 'array'
  then
    raise exception 'OFFICIAL_CALENDAR_INVALID';
  end if;

  if pg_catalog.jsonb_array_length(p_days) not between 28 and 62
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_days) d
      where pg_catalog.jsonb_typeof(d) is distinct from 'object'
        or coalesce(d->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or pg_catalog.jsonb_typeof(d->'isDrawDay') is distinct from 'boolean'
    )
  then
    raise exception 'OFFICIAL_CALENDAR_INVALID';
  end if;

  select
    min((d->>'date')::date),
    max((d->>'date')::date),
    count(*),
    count(distinct d->>'date')
  into v_start, v_end, v_count, v_unique
  from pg_catalog.jsonb_array_elements(p_days) d;

  if v_start <> pg_catalog.date_trunc('month',v_today)::date
    or v_end not in (
      (v_start + interval '1 month' - interval '1 day')::date,
      (v_start + interval '2 months' - interval '1 day')::date
    )
    or v_count <> v_end - v_start + 1
    or v_count <> v_unique
    or not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_days) d
      where (d->>'isDrawDay')::boolean
    )
  then
    raise exception 'OFFICIAL_CALENDAR_INVALID';
  end if;

  v_next_slot := private.notification_draw_calendar_next_slot(v_now);
  if v_next_slot is null then
    raise exception 'OFFICIAL_CALENDAR_SCHEDULE_INVALID';
  end if;
  v_valid_until := v_next_slot + interval '5 minutes';

  insert into private.notification_draw_day_overrides as existing
    (lottery,draw_date,is_draw_day,reason,source_url,updated_at,source_kind,valid_until)
  select
    '六合彩',
    (d->>'date')::date,
    (d->>'isDrawDay')::boolean,
    '香港賽馬會官方攪珠日期表',
    'https://bet.hkjc.com/ch/marksix/fixtures',
    v_now,
    'hkjc',
    v_valid_until
  from pg_catalog.jsonb_array_elements(p_days) d
  on conflict (lottery,draw_date) do update set
    is_draw_day = excluded.is_draw_day,
    reason = excluded.reason,
    source_url = excluded.source_url,
    updated_at = excluded.updated_at,
    valid_until = excluded.valid_until
  where existing.source_kind = 'hkjc';

  update private.notification_draw_calendar_sync
  set lease_owner = null,
      lease_expires_at = null,
      last_success_at = v_now,
      valid_until = v_valid_until,
      next_attempt_at = v_next_slot,
      coverage_start = v_start,
      coverage_end = v_end,
      last_error = null
  where lottery = '六合彩';

  return true;
end;
$$;

create or replace function public.notification_draw_calendar_fail(p_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  update private.notification_draw_calendar_sync
  set lease_owner = null,
      lease_expires_at = null,
      valid_until = v_now,
      next_attempt_at = private.notification_draw_calendar_next_slot(v_now),
      last_error = 'OFFICIAL_CALENDAR_UNAVAILABLE'
  where lottery = '六合彩'
    and lease_owner = p_owner_id
    and lease_expires_at > v_now;
  return found;
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
  v_url text;
  v_token text;
  v_request bigint;
begin
  if private.notification_draw_calendar_scheduled_slot(p_now) is null then
    return null;
  end if;

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
    or nullif(pg_catalog.btrim(v_token),'') is null
  then
    raise exception 'CALENDAR_REFRESH_CONFIG_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_url,'/') || '/functions/v1/admin-api/api/internal/marksix-calendar',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type','application/json',
      'Origin','https://matrixlottery.idv.tw',
      'x-matrix-watchdog-token',v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function private.notification_draw_calendar_refresh_http_tick(timestamptz)
  from public, anon, authenticated, service_role;

-- Align an already-confirmed production snapshot with the next scheduled
-- confirmation window without extending an already-expired snapshot.
do $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_next timestamptz := private.notification_draw_calendar_next_slot(pg_catalog.clock_timestamp());
  v_until timestamptz;
begin
  if v_next is null then
    raise exception 'OFFICIAL_CALENDAR_SCHEDULE_INVALID';
  end if;
  v_until := v_next + interval '5 minutes';

  if exists (
    select 1
    from private.notification_draw_calendar_sync
    where lottery = '六合彩'
      and last_error is null
      and valid_until > v_now
  ) then
    update private.notification_draw_calendar_sync
    set valid_until = v_until,
        next_attempt_at = v_next
    where lottery = '六合彩';

    update private.notification_draw_day_overrides
    set valid_until = v_until
    where lottery = '六合彩'
      and source_kind = 'hkjc';
  end if;
end;
$$;

commit;
