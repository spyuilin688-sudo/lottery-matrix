begin;

-- Fast indexed lookup for configured reminder minutes. This avoids walking all
-- members on the 1,300+ daily minutes where no configured reminder can fire.
create index if not exists notification_settings_runtime_due_idx
  on public.notification_settings
  using gin (settings jsonb_path_ops);

create or replace function private.notification_time_events_due(
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.now());
  v_local_date date := (v_now at time zone 'Asia/Taipei')::date;
  v_local_minute text := pg_catalog.to_char(v_now at time zone 'Asia/Taipei', 'HH24:MI');
  v_local_start timestamptz;
begin
  v_local_start := v_local_date::timestamp at time zone 'Asia/Taipei';

  if exists (
    select 1
    from public.notification_settings as setting
    join public.members as member on member.id = setting.member_id
    where coalesce(member.status, '') not in ('停用', 'disabled', 'inactive')
      and setting.settings @> '{"settings":{"bet":true}}'::jsonb
      and (
        (
          private.notification_is_draw_day('今彩539', v_local_date)
          and setting.settings @> pg_catalog.jsonb_build_object(
            'betTimes',
            pg_catalog.jsonb_build_object('今彩539', pg_catalog.jsonb_build_array(v_local_minute))
          )
        )
        or (
          private.notification_is_draw_day('天天樂', v_local_date)
          and setting.settings @> pg_catalog.jsonb_build_object(
            'betTimes',
            pg_catalog.jsonb_build_object('天天樂', pg_catalog.jsonb_build_array(v_local_minute))
          )
        )
        or (
          private.notification_is_draw_day('六合彩', v_local_date)
          and setting.settings @> pg_catalog.jsonb_build_object(
            'betTimes',
            pg_catalog.jsonb_build_object('六合彩', pg_catalog.jsonb_build_array(v_local_minute))
          )
        )
        or (
          private.notification_is_draw_day('大樂透', v_local_date)
          and setting.settings @> pg_catalog.jsonb_build_object(
            'betTimes',
            pg_catalog.jsonb_build_object('大樂透', pg_catalog.jsonb_build_array(v_local_minute))
          )
        )
      )
    limit 1
  ) then
    return true;
  end if;

  -- Expiry reminders have no user-selected clock time. Use the existing
  -- members_plan_expires_at_idx ranges and the unique notification event key
  -- to stop re-running the full generator after today's reminder exists.
  if exists (
    select 1
    from public.members as member
    left join public.notification_settings as setting
      on setting.member_id = member.id
    cross join lateral (
      select coalesce(setting.settings, private.default_member_notification_settings()) as settings
    ) as config
    where coalesce(member.status, '') not in ('停用', 'disabled', 'inactive')
      and member.plan_expires_at is not null
      and not coalesce(member.is_lifetime, false)
      and case
        when pg_catalog.jsonb_typeof(config.settings->'settings'->'expiry') = 'boolean'
          then (config.settings->'settings'->>'expiry')::boolean
        else false
      end
      and pg_catalog.jsonb_typeof(config.settings->'selectedOptions'->'expiry') = 'array'
      and (
        (
          (config.settings->'selectedOptions'->'expiry') ? '提前1日'
          and member.plan_expires_at >= v_local_start + interval '1 day'
          and member.plan_expires_at < v_local_start + interval '2 days'
          and not exists (
            select 1
            from public.notification_events as event
            where event.event_key =
              'membership_expiry:' || member.id::text || ':'
              || (v_local_date + 1)::text || ':1'
          )
        )
        or (
          (config.settings->'selectedOptions'->'expiry') ? '提前3日'
          and member.plan_expires_at >= v_local_start + interval '3 days'
          and member.plan_expires_at < v_local_start + interval '4 days'
          and not exists (
            select 1
            from public.notification_events as event
            where event.event_key =
              'membership_expiry:' || member.id::text || ':'
              || (v_local_date + 3)::text || ':3'
          )
        )
        or (
          (config.settings->'selectedOptions'->'expiry') ? '提前7日'
          and member.plan_expires_at >= v_local_start + interval '7 days'
          and member.plan_expires_at < v_local_start + interval '8 days'
          and not exists (
            select 1
            from public.notification_events as event
            where event.event_key =
              'membership_expiry:' || member.id::text || ':'
              || (v_local_date + 7)::text || ':7'
          )
        )
      )
    limit 1
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function private.notification_time_events_due(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.notification_pipeline_tick(
  p_now timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.now());
  v_time_events jsonb;
  v_fanout jsonb;
begin
  if private.notification_time_events_due(v_now) then
    v_time_events := private.notification_time_events_tick(v_now);
  else
    v_time_events := pg_catalog.jsonb_build_object(
      'betCreated', 0,
      'expiryCreated', 0,
      'created', 0,
      'skippedIdle', true
    );
  end if;

  -- Fanout stays minute-level so newly enqueued events retain the existing
  -- delivery latency and abandoned processing rows are recovered promptly.
  v_fanout := private.notification_fanout_drain(100, v_now);

  return pg_catalog.jsonb_build_object(
    'timeEvents', v_time_events,
    'fanout', v_fanout
  );
end;
$$;

revoke all on function private.notification_pipeline_tick(timestamptz)
  from public, anon, authenticated, service_role;

-- Pilio is only useful in two Taipei result windows:
-- 20:34-21:00 and 21:34-22:00. pg_cron schedules are UTC.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'matrix-notification-pilio-minute'
  order by jobid desc
  limit 1;

  if v_job_id is not null then
    perform cron.alter_job(
      job_id := v_job_id,
      schedule := '34-59 12,13 * * *',
      command := 'select private.notification_pilio_http_tick();',
      active := true
    );
  else
    perform cron.schedule(
      'matrix-notification-pilio-minute',
      '34-59 12,13 * * *',
      'select private.notification_pilio_http_tick();'
    );
  end if;
end;
$$;

select cron.schedule(
  'matrix-notification-pilio-window-boundary',
  '0 13,14 * * *',
  'select private.notification_pilio_http_tick();'
);

commit;
