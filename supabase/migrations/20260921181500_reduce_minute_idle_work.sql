begin;

-- Fast, read-only gate for the minute cron. The expensive generator only needs
-- to scan every active member when the current Taipei minute can actually
-- create a reminder or when a still-unmaterialized expiry reminder is due.
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
begin
  if exists (
    select 1
    from public.notification_settings as setting
    join public.members as member on member.id = setting.member_id
    where coalesce(member.status, '') not in ('停用', 'disabled', 'inactive')
      and case
        when pg_catalog.jsonb_typeof(setting.settings->'settings'->'bet') = 'boolean'
          then (setting.settings->'settings'->>'bet')::boolean
        else false
      end
      and exists (
        select 1
        from (values
          ('今彩539'::text),
          ('天天樂'::text),
          ('六合彩'::text),
          ('大樂透'::text)
        ) as lottery(name)
        where private.notification_is_draw_day(lottery.name, v_local_date)
          and exists (
            select 1
            from pg_catalog.jsonb_array_elements_text(
              case
                when pg_catalog.jsonb_typeof(setting.settings->'betTimes'->lottery.name) = 'array'
                  then setting.settings->'betTimes'->lottery.name
                else '[]'::jsonb
              end
            ) as reminder(value)
            where reminder.value = v_local_minute
          )
      )
    limit 1
  ) then
    return true;
  end if;

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
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(
          case
            when pg_catalog.jsonb_typeof(config.settings->'selectedOptions'->'expiry') = 'array'
              then config.settings->'selectedOptions'->'expiry'
            else '[]'::jsonb
          end
        ) as option(value)
        cross join lateral (
          select case option.value
            when '提前1日' then 1
            when '提前3日' then 3
            when '提前7日' then 7
            else null
          end as lead_days
        ) as lead
        where lead.lead_days is not null
          and v_local_date =
            (member.plan_expires_at at time zone 'Asia/Taipei')::date - lead.lead_days
          and not exists (
            select 1
            from public.notification_events as event
            where event.event_key =
              'membership_expiry:' || member.id::text || ':'
              || ((member.plan_expires_at at time zone 'Asia/Taipei')::date)::text
              || ':' || lead.lead_days::text
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

  -- Fanout remains minute-level so newly enqueued events keep their existing
  -- delivery latency and stale processing work is still recovered promptly.
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
-- 20:34-21:00 and 21:34-22:00. pg_cron schedules are UTC, so keep the
-- existing trusted function but stop invoking its cheap gate all day.
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
