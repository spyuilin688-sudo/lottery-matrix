begin;

-- Regular Mark Six calendar checks run on Tuesday, Thursday and Saturday.
-- Sunday keeps the same check windows as an exception-safety day so late
-- Saturday-to-Sunday changes can still be discovered before reminders.
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
    where pg_catalog.date_part('isodow', local_now.value)::integer in (2,4,6,7)
  )
  select max(slot_at)
  from slots
  where p_now >= slot_at
    and p_now < slot_at + interval '5 minutes'
$$;

revoke all on function private.notification_draw_calendar_scheduled_slot(timestamptz)
  from public, anon, authenticated, service_role;

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

-- pg_cron uses UTC. Taipei is UTC+8, and these times do not cross a UTC date.
-- Cron DOW 0,2,4,6 = Sunday, Tuesday, Thursday, Saturday.
select cron.schedule(
  'matrix-marksix-calendar-midday',
  '0 4,6,8 * * 0,2,4,6',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-45',
  '45 8-12 * * 0,2,4,6',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-15',
  '15 9-12 * * 0,2,4,6',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-2030',
  '30 12 * * 0,2,4,6',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-2055',
  '55 12 * * 0,2,4,6',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

select cron.schedule(
  'matrix-marksix-calendar-2105-2110',
  '5,10 13 * * 0,2,4,6',
  'select private.notification_draw_calendar_refresh_http_tick(pg_catalog.now());'
);

commit;
