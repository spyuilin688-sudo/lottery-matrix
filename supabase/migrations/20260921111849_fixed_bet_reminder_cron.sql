begin;

create or replace function private.notification_bet_time_pair_valid(
  p_times jsonb,
  p_allowed text[]
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_times) <> 'array'
    or pg_catalog.jsonb_array_length(p_times) <> 2 then
    return false;
  end if;

  return not exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(p_times) as item(value)
    where not (item.value = any(p_allowed))
  );
exception
  when data_exception then
    return false;
end;
$$;

create or replace function private.notification_bet_times_valid(
  p_settings jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_times jsonb;
  v_key_count integer;
begin
  if pg_catalog.jsonb_typeof(p_settings) <> 'object' then
    return false;
  end if;

  v_times := p_settings->'betTimes';
  if pg_catalog.jsonb_typeof(v_times) <> 'object' then
    return false;
  end if;

  select pg_catalog.count(*)::integer
  into v_key_count
  from pg_catalog.jsonb_object_keys(v_times);

  if v_key_count <> 4
    or not (v_times ?& array['今彩539','天天樂','六合彩','大樂透']) then
    return false;
  end if;

  return
    private.notification_bet_time_pair_valid(
      v_times->'今彩539',
      array['','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','19:45','20:00','20:10','20:20','20:25']
    )
    and private.notification_bet_time_pair_valid(
      v_times->'天天樂',
      array['','05:00','05:30','06:00','06:30','07:00','07:30','08:00','08:30','08:45','09:00','09:10','09:20','09:25']
    )
    and private.notification_bet_time_pair_valid(
      v_times->'六合彩',
      array['','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','20:45','21:00','21:10','21:20','21:25']
    )
    and private.notification_bet_time_pair_valid(
      v_times->'大樂透',
      array['','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','19:45','20:00','20:10','20:20','20:25']
    );
end;
$$;

revoke all on function private.notification_bet_time_pair_valid(jsonb, text[])
  from public, anon, authenticated, service_role;
revoke all on function private.notification_bet_times_valid(jsonb)
  from public, anon, authenticated, service_role;

alter table public.notification_settings
  drop constraint if exists notification_settings_bet_times_allowed;
alter table public.notification_settings
  add constraint notification_settings_bet_times_allowed
  check (private.notification_bet_times_valid(settings))
  not valid;
alter table public.notification_settings
  validate constraint notification_settings_bet_times_allowed;

create or replace function private.notification_bet_reminders_tick(
  p_now timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.now());
  v_local_now timestamp := v_now at time zone 'Asia/Taipei';
  v_local_date date := v_local_now::date;
  v_local_minute text := pg_catalog.to_char(v_local_now, 'HH24:MI');
  v_scheduled_at text := pg_catalog.to_char(v_local_now, 'YYYY-MM-DD"T"HH24:MI:00') || '+08:00';
  v_candidate record;
  v_result jsonb;
  v_created integer := 0;
  v_fanout jsonb;
begin
  for v_candidate in
    select
      member.id as member_id,
      lottery.name as lottery,
      lottery.code as lottery_code
    from public.notification_settings as setting
    join public.members as member
      on member.id = setting.member_id
    cross join (
      values
        ('今彩539'::text, '539'::text),
        ('天天樂'::text, 'fantasy5'::text),
        ('六合彩'::text, 'marksix'::text),
        ('大樂透'::text, 'lotto649'::text)
    ) as lottery(name, code)
    where coalesce(member.status, '') not in ('停用', 'disabled', 'inactive')
      and setting.settings @> '{"settings":{"bet":true}}'::jsonb
      and private.notification_is_draw_day(lottery.name, v_local_date)
      and setting.settings @> pg_catalog.jsonb_build_object(
        'betTimes',
        pg_catalog.jsonb_build_object(
          lottery.name,
          pg_catalog.jsonb_build_array(v_local_minute)
        )
      )
  loop
    v_result := private.notification_event_enqueue(
      'bet_reminder:' || v_candidate.member_id::text || ':'
        || v_candidate.lottery_code || ':' || v_scheduled_at,
      'bet_reminder',
      'cron',
      v_scheduled_at::timestamptz,
      pg_catalog.jsonb_build_object(
        'memberId', v_candidate.member_id::text,
        'lottery', v_candidate.lottery,
        'lotteryCode', v_candidate.lottery_code,
        'scheduledAt', v_scheduled_at
      )
    );

    if coalesce((v_result->>'created')::boolean, false) then
      v_created := v_created + 1;
    end if;
  end loop;

  -- Preserve same-minute fanout behavior even though event generation moved
  -- out of the minute pipeline.
  v_fanout := private.notification_fanout_drain(100, v_now);

  return pg_catalog.jsonb_build_object(
    'minute', v_local_minute,
    'created', v_created,
    'fanout', v_fanout
  );
end;
$$;

revoke all on function private.notification_bet_reminders_tick(timestamptz)
  from public, anon, authenticated, service_role;

-- The minute pipeline remains only as a delivery/recovery drain. Bet reminder
-- generation is now exclusively owned by the fixed-time jobs below.
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
  v_fanout jsonb;
begin
  v_fanout := private.notification_fanout_drain(100, v_now);

  return pg_catalog.jsonb_build_object(
    'timeEvents', pg_catalog.jsonb_build_object(
      'created', 0,
      'betCreated', 0,
      'expiryCreated', 0,
      'fixedSchedule', true
    ),
    'fanout', v_fanout
  );
end;
$$;

revoke all on function private.notification_pipeline_tick(timestamptz)
  from public, anon, authenticated, service_role;

drop function if exists private.notification_time_events_due(timestamptz);

-- Fixed PWA options are Taipei local time. pg_cron runs in UTC:
-- 05:00-07:30 -> 21:00-23:30 UTC on the previous UTC date.
select cron.schedule(
  'matrix-notification-bet-0500-0730',
  '0,30 21-23 * * *',
  'select private.notification_bet_reminders_tick(pg_catalog.now());'
);
select cron.schedule(
  'matrix-notification-bet-0800',
  '0,30,45 0 * * *',
  'select private.notification_bet_reminders_tick(pg_catalog.now());'
);
select cron.schedule(
  'matrix-notification-bet-0900',
  '0,10,20,25 1 * * *',
  'select private.notification_bet_reminders_tick(pg_catalog.now());'
);
select cron.schedule(
  'matrix-notification-bet-1600-1830',
  '0,30 8-10 * * *',
  'select private.notification_bet_reminders_tick(pg_catalog.now());'
);
select cron.schedule(
  'matrix-notification-bet-1900',
  '0,30,45 11 * * *',
  'select private.notification_bet_reminders_tick(pg_catalog.now());'
);
select cron.schedule(
  'matrix-notification-bet-2000',
  '0,10,20,25,30,45 12 * * *',
  'select private.notification_bet_reminders_tick(pg_catalog.now());'
);
select cron.schedule(
  'matrix-notification-bet-2100',
  '0,10,20,25 13 * * *',
  'select private.notification_bet_reminders_tick(pg_catalog.now());'
);

commit;
