begin;

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
  regular_slots as (
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
    where pg_catalog.date_part('isodow', local_now.value)::integer in (2,4,6,7)
  ),
  backup_slot as (
    select ((local_now.value::date + time '23:00')::timestamp at time zone 'Asia/Taipei') as slot_at
    from local_now
    where pg_catalog.date_part('isodow', local_now.value)::integer in (1,3,5)
  ),
  slots as (
    select slot_at from regular_slots
    union all
    select slot_at from backup_slot
  )
  select max(slot_at)
  from slots
  where p_now >= slot_at
    and p_now < slot_at + interval '5 minutes'
$$;

revoke all on function private.notification_draw_calendar_scheduled_slot(timestamptz)
  from public, anon, authenticated, service_role;

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
    select d::date as day,
           pg_catalog.date_part('isodow', d)::integer as isodow
    from local_after,
      pg_catalog.generate_series(
        local_after.value::date,
        local_after.value::date + 7,
        interval '1 day'
      ) as d
  ),
  regular_slots as (
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
    where days.isodow in (2,4,6,7)
  ),
  backup_slots as (
    select ((days.day + time '23:00')::timestamp at time zone 'Asia/Taipei') as slot_at
    from days
    where days.isodow in (1,3,5)
  ),
  slots as (
    select slot_at from regular_slots
    union all
    select slot_at from backup_slots
  )
  select min(slot_at)
  from slots
  where slot_at > p_after
$$;

revoke all on function private.notification_draw_calendar_next_slot(timestamptz)
  from public, anon, authenticated, service_role;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname = 'matrix-marksix-calendar-mwf-2300'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

-- pg_cron uses UTC. 23:00 Asia/Taipei is 15:00 UTC on the same date.
select cron.schedule(
  'matrix-marksix-calendar-mwf-2300',
  '0 15 * * 1,3,5',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

-- Re-align the current confirmed snapshot with the newly inserted next slot.
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
