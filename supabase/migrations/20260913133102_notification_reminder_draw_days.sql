begin;

-- One notification calendar, shared by generation, fanout and delivery claims.
-- Explicit dated changes win over the usual week. In particular, Mark Six can
-- move its weekend draw to Sunday; do not enable both weekend days by default.
create table private.notification_draw_day_overrides (
  lottery text not null check (lottery in ('今彩539', '天天樂', '六合彩', '大樂透')),
  draw_date date not null check (pg_catalog.isfinite(draw_date)),
  is_draw_day boolean not null,
  reason text not null check (pg_catalog.btrim(reason) <> ''),
  source_url text not null check (source_url ~ '^https://'),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (lottery, draw_date)
);
alter table private.notification_draw_day_overrides enable row level security;
revoke all on private.notification_draw_day_overrides from public, anon, authenticated, service_role;

create or replace function private.notification_is_draw_day(
  p_lottery text,
  p_taipei_date date
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_override boolean;
  v_weekday integer;
begin
  if p_lottery is null
    or p_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or p_taipei_date is null
    or not pg_catalog.isfinite(p_taipei_date) then
    return false;
  end if;

  select is_draw_day into v_override
  from private.notification_draw_day_overrides
  where lottery = p_lottery and draw_date = p_taipei_date;
  if found then
    return v_override;
  end if;

  v_weekday := extract(isodow from p_taipei_date)::integer;
  return case p_lottery
    when '今彩539' then v_weekday between 1 and 6
    when '天天樂' then true
    when '六合彩' then v_weekday in (2, 4, 6)
    when '大樂透' then v_weekday in (2, 5)
    else false
  end;
end;
$$;
revoke all on function private.notification_is_draw_day(text, date)
  from public, anon, authenticated, service_role;

-- Validate the intended date AND the current delivery date. Old reminders must
-- not reappear after an outage, a retry crossing midnight or native enrollment.
create or replace function private.notification_reminder_is_due(
  p_payload jsonb,
  p_now timestamptz
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_scheduled_at timestamptz;
  v_date date;
begin
  if p_now is null or not pg_catalog.isfinite(p_now)
    or coalesce(p_payload->>'scheduledAt', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return false;
  end if;
  v_scheduled_at := (p_payload->>'scheduledAt')::timestamptz;
  v_date := (v_scheduled_at at time zone 'Asia/Taipei')::date;
  return coalesce(
    v_scheduled_at <= p_now
    and v_date = (p_now at time zone 'Asia/Taipei')::date
    and private.notification_is_draw_day(p_payload->>'lottery', v_date),
    false
  );
exception
  when data_exception then
    return false;
end;
$$;
revoke all on function private.notification_reminder_is_due(jsonb, timestamptz)
  from public, anon, authenticated, service_role;
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
          if not private.notification_is_draw_day(v_lottery.lottery, v_local_date) then
            continue;
          end if;

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


create or replace function private.notification_member_matches(
  p_member_id uuid,
  p_event_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_member_status text;
  v_enabled boolean;
  v_options jsonb := '[]'::jsonb;
  v_value text;
begin
  select
    coalesce(setting.settings, private.default_member_notification_settings()),
    member.status
  into v_settings, v_member_status
  from public.members as member
  left join public.notification_settings as setting
    on setting.member_id = member.id
  where member.id = p_member_id
  limit 1;

  if not found
    or coalesce(v_member_status, '') in ('停用', 'disabled', 'inactive') then
    return false;
  end if;

  if pg_catalog.jsonb_typeof(v_settings) <> 'object'
    or pg_catalog.jsonb_typeof(v_settings->'settings') <> 'object'
    or pg_catalog.jsonb_typeof(v_settings->'selectedOptions') <> 'object' then
    return false;
  end if;

  if p_event_type = 'lottery_result' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'result') = 'boolean'
        then (v_settings->'settings'->>'result')::boolean
      else false
    end;
    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'result') = 'array'
        then v_settings->'selectedOptions'->'result'
      else '[]'::jsonb
    end;
    v_value := p_payload->>'lottery';
  elsif p_event_type = 'matrix_status' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'status') = 'boolean'
        then (v_settings->'settings'->>'status')::boolean
      else false
    end;
    if not v_enabled then
      return false;
    end if;

    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'status') = 'array'
        then v_settings->'selectedOptions'->'status'
      else '[]'::jsonb
    end;
    if not exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(v_options) as option(value)
      where option.value = p_payload->>'lottery'
    ) then
      return false;
    end if;

    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'statusOptions') = 'object'
        and pg_catalog.jsonb_typeof(v_settings->'statusOptions'->(p_payload->>'lottery')) = 'array'
        then v_settings->'statusOptions'->(p_payload->>'lottery')
      else '[]'::jsonb
    end;
    v_value := p_payload->>'statusLabel';
  elsif p_event_type = 'matrix_card' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'card') = 'boolean'
        then (v_settings->'settings'->>'card')::boolean
      else false
    end;
    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'card') = 'array'
        then v_settings->'selectedOptions'->'card'
      else '[]'::jsonb
    end;
    v_value := p_payload->>'lottery';
  elsif p_event_type = 'system_notice' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'system') = 'boolean'
        then (v_settings->'settings'->>'system')::boolean
      else false
    end;
    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'system') = 'array'
        then v_settings->'selectedOptions'->'system'
      else '[]'::jsonb
    end;
    v_value := p_payload->>'category';
  elsif p_event_type = 'bet_reminder' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'bet') = 'boolean'
        then (v_settings->'settings'->>'bet')::boolean
      else false
    end;
    -- Both web fanout and native_push_eligible use this existing guard.
    -- Use the statement's delivery time, including for native retry recovery.
    return coalesce(v_enabled
      and p_payload->>'memberId' = p_member_id::text
      and private.notification_reminder_is_due(p_payload, pg_catalog.statement_timestamp()), false);
  elsif p_event_type = 'membership_expiry' then
    v_enabled := case
      when pg_catalog.jsonb_typeof(v_settings->'settings'->'expiry') = 'boolean'
        then (v_settings->'settings'->>'expiry')::boolean
      else false
    end;
    if not (
      v_enabled
      and p_payload->>'memberId' = p_member_id::text
    ) then
      return false;
    end if;
    v_options := case
      when pg_catalog.jsonb_typeof(v_settings->'selectedOptions'->'expiry') = 'array'
        then v_settings->'selectedOptions'->'expiry'
      else '[]'::jsonb
    end;
    v_value := '提前' || coalesce(p_payload->>'daysBefore', '') || '日';
  else
    return false;
  end if;

  if not coalesce(v_enabled, false) or v_value is null then
    return false;
  end if;

  return exists (
    select 1
    from pg_catalog.jsonb_array_elements_text(v_options) as option(value)
    where option.value = v_value
  );
exception
  when data_exception then
    return false;
end;
$$;

revoke all on function private.notification_member_matches(uuid, text, jsonb)
  from public, anon, authenticated, service_role;

-- Recheck already queued reminders, including retries, before web delivery.
create or replace function public.notification_dispatch_claim(
  p_limit integer default 25,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  "outboxId" uuid,
  "memberId" uuid,
  "userId" uuid,
  "eventId" uuid,
  "eventKey" text,
  payload jsonb,
  "attemptCount" integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.now());
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  return query
  with due as (
    select outbox.id
    from public.notification_outbox as outbox
    where (
        outbox.status = 'pending'
        and (outbox.next_attempt_at is null or outbox.next_attempt_at <= v_now)
      )
      or (
        outbox.status = 'processing'
        and outbox.processing_started_at is not null
        and outbox.processing_started_at <= v_now - interval '5 minutes'
      )
    order by outbox.created_at, outbox.id
    for update skip locked
    limit v_limit
  ),
  eligible as (
    select due.id,
      event.event_type <> 'bet_reminder'
      or (
        private.notification_member_matches(outbox.member_id, event.event_type, event.payload)
        and private.notification_reminder_is_due(event.payload, v_now)
      ) as allowed
    from due
    join public.notification_outbox as outbox on outbox.id = due.id
    join public.notification_events as event on event.id = outbox.event_id
  ),
  claimed as (
    update public.notification_outbox as outbox
    set status = case when eligible.allowed then 'processing' else 'skipped' end,
        attempt_count = outbox.attempt_count + case when eligible.allowed then 1 else 0 end,
        next_attempt_at = null,
        processing_started_at = case when eligible.allowed then v_now end,
        processed_at = case when not eligible.allowed then v_now end,
        last_error = case when eligible.allowed then outbox.last_error else 'bet_reminder_not_eligible' end,
        updated_at = v_now
    from eligible
    where outbox.id = eligible.id
    returning outbox.*
  )
  select
    claimed.id,
    claimed.member_id,
    member.auth_user_id,
    claimed.event_id,
    event.event_key,
    claimed.notification_payload,
    claimed.attempt_count
  from claimed
  join public.members as member
    on member.id = claimed.member_id
  join public.notification_events as event
    on event.id = claimed.event_id
  where claimed.status = 'processing'
  order by claimed.created_at, claimed.id;
end;
$$;

revoke all on function private.notification_time_events_tick(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.notification_dispatch_claim(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.notification_dispatch_claim(integer, timestamptz) to service_role;

commit;
