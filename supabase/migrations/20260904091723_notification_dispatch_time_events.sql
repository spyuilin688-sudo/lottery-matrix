begin;

create or replace function private.notification_time_events_tick(
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
  v_local_date date := (v_now at time zone 'Asia/Taipei')::date;
  v_local_minute text := pg_catalog.to_char(v_now at time zone 'Asia/Taipei', 'HH24:MI');
  v_member record;
  v_lottery record;
  v_settings jsonb;
  v_times jsonb;
  v_time text;
  v_scheduled_at text;
  v_expiry_options jsonb;
  v_expiry_date date;
  v_lead_days integer;
  v_result jsonb;
  v_bet_created integer := 0;
  v_expiry_created integer := 0;
begin
  for v_member in
    select
      member.id,
      member.plan_expires_at,
      member.is_lifetime,
      member.status,
      coalesce(setting.settings, private.default_member_notification_settings()) as settings
    from public.members as member
    left join public.notification_settings as setting
      on setting.member_id = member.id
    where coalesce(member.status, '') not in ('停用', 'disabled', 'inactive')
  loop
    v_settings := v_member.settings;

    begin
      if pg_catalog.jsonb_typeof(v_settings) = 'object'
        and pg_catalog.jsonb_typeof(v_settings->'settings') = 'object'
        and pg_catalog.jsonb_typeof(v_settings->'settings'->'bet') = 'boolean'
        and (v_settings->'settings'->>'bet')::boolean
        and pg_catalog.jsonb_typeof(v_settings->'betTimes') = 'object' then

        for v_lottery in
          select *
          from (values
            ('今彩539'::text, '539'::text),
            ('天天樂'::text, 'fantasy5'::text),
            ('六合彩'::text, 'marksix'::text),
            ('大樂透'::text, 'lotto649'::text)
          ) as lotteries(lottery, lottery_code)
        loop
          v_times := v_settings->'betTimes'->v_lottery.lottery;
          if pg_catalog.jsonb_typeof(v_times) <> 'array' then
            continue;
          end if;

          for v_time in
            select value
            from pg_catalog.jsonb_array_elements_text(v_times) as reminder(value)
          loop
            if v_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
              or v_time <> v_local_minute then
              continue;
            end if;

            v_scheduled_at := pg_catalog.to_char(
              v_local_now,
              'YYYY-MM-DD"T"HH24:MI:00'
            ) || '+08:00';

            v_result := private.notification_event_enqueue(
              'bet_reminder:' || v_member.id::text || ':' || v_lottery.lottery_code || ':' || v_scheduled_at,
              'bet_reminder',
              'cron',
              v_scheduled_at::timestamptz,
              pg_catalog.jsonb_build_object(
                'memberId', v_member.id::text,
                'lottery', v_lottery.lottery,
                'lotteryCode', v_lottery.lottery_code,
                'scheduledAt', v_scheduled_at
              )
            );

            if coalesce((v_result->>'created')::boolean, false) then
              v_bet_created := v_bet_created + 1;
            end if;
          end loop;
        end loop;
      end if;
    exception
      when data_exception then
        null;
    end;

    begin
      if v_member.plan_expires_at is null
        or coalesce(v_member.is_lifetime, false)
        or pg_catalog.jsonb_typeof(v_settings) <> 'object'
        or pg_catalog.jsonb_typeof(v_settings->'settings') <> 'object'
        or pg_catalog.jsonb_typeof(v_settings->'settings'->'expiry') <> 'boolean'
        or not (v_settings->'settings'->>'expiry')::boolean
        or pg_catalog.jsonb_typeof(v_settings->'selectedOptions') <> 'object'
        or pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'expiry') <> 'array' then
        continue;
      end if;

      v_expiry_date := (v_member.plan_expires_at at time zone 'Asia/Taipei')::date;
      v_expiry_options := v_settings->'selectedOptions'->'expiry';

      for v_time in
        select value
        from pg_catalog.jsonb_array_elements_text(v_expiry_options) as option(value)
      loop
        v_lead_days := case v_time
          when '提前1日' then 1
          when '提前3日' then 3
          when '提前7日' then 7
          else null
        end;

        if v_lead_days is null
          or v_local_date <> v_expiry_date - v_lead_days then
          continue;
        end if;

        v_result := private.notification_event_enqueue(
          'membership_expiry:' || v_member.id::text || ':' || v_expiry_date::text || ':' || v_lead_days::text,
          'membership_expiry',
          'cron',
          v_now,
          pg_catalog.jsonb_build_object(
            'memberId', v_member.id::text,
            'expiryDate', v_expiry_date::text,
            'daysBefore', v_lead_days
          )
        );

        if coalesce((v_result->>'created')::boolean, false) then
          v_expiry_created := v_expiry_created + 1;
        end if;
      end loop;
    exception
      when data_exception then
        null;
    end;
  end loop;

  return pg_catalog.jsonb_build_object(
    'betCreated', v_bet_created,
    'expiryCreated', v_expiry_created,
    'created', v_bet_created + v_expiry_created
  );
end;
$$;

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
  v_time_events := private.notification_time_events_tick(v_now);
  v_fanout := private.notification_fanout_drain(100, v_now);

  return pg_catalog.jsonb_build_object(
    'timeEvents', v_time_events,
    'fanout', v_fanout
  );
end;
$$;

revoke all on function private.notification_time_events_tick(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.notification_pipeline_tick(timestamptz)
  from public, anon, authenticated, service_role;

commit;
