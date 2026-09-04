begin;

create or replace function private.notification_render_payload(
  p_event_type text,
  p_event_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_numbers text;
  v_tag text := pg_catalog.encode(extensions.digest(p_event_key, 'sha256'), 'hex');
begin
  if p_event_type = 'lottery_result' then
    select pg_catalog.string_agg(number.value, ' ' order by number.ordinality)
      into v_numbers
    from pg_catalog.jsonb_array_elements_text(
      coalesce(p_payload->'numbers', '[]'::jsonb)
    ) with ordinality as number(value, ordinality);

    v_title := coalesce(p_payload->>'lottery', '') || ' 開獎結果';
    v_body := '第' || coalesce(p_payload->>'period', '') || '期｜' || coalesce(v_numbers, '');
  elsif p_event_type = 'matrix_status' then
    v_title := 'Matrix 狀態｜' || coalesce(p_payload->>'lottery', '');
    v_body := '第' || coalesce(p_payload->>'period', '') || '期｜' || coalesce(p_payload->>'statusLabel', '');
  elsif p_event_type = 'matrix_card' then
    v_title := 'Matrix 牌單｜' || coalesce(p_payload->>'lottery', '');
    v_body := coalesce(p_payload->>'period', '') || ' 牌單已更新';
  elsif p_event_type = 'bet_reminder' then
    v_title := coalesce(p_payload->>'lottery', '') || ' 選號提醒';
    v_body := '已到你設定的選號提醒時間';
  elsif p_event_type = 'membership_expiry' then
    v_title := 'Matrix Pro 即將到期';
    v_body := '距離到期剩 ' || coalesce(p_payload->>'daysBefore', '') || ' 日（' || coalesce(p_payload->>'expiryDate', '') || '）';
  elsif p_event_type = 'system_notice' then
    v_title := coalesce(p_payload->>'title', '');
    v_body := coalesce(p_payload->>'body', '');
  else
    raise exception using
      errcode = '22023',
      message = 'INVALID_NOTIFICATION_EVENT_TYPE';
  end if;

  return pg_catalog.jsonb_build_object(
    'title', v_title,
    'body', v_body,
    'url', '/',
    'tag', v_tag
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
  v_options jsonb;
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

  if p_event_type = 'lottery_result' then
    v_enabled := coalesce((v_settings->'settings'->>'result')::boolean, false);
    v_options := coalesce(v_settings->'selectedOptions'->'result', '[]'::jsonb);
    v_value := p_payload->>'lottery';
  elsif p_event_type = 'matrix_status' then
    v_enabled := coalesce((v_settings->'settings'->>'status')::boolean, false);
    if not v_enabled then
      return false;
    end if;
    if not exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(
        coalesce(v_settings->'selectedOptions'->'status', '[]'::jsonb)
      ) as option(value)
      where option.value = p_payload->>'lottery'
    ) then
      return false;
    end if;
    v_options := coalesce(
      v_settings->'statusOptions'->(p_payload->>'lottery'),
      '[]'::jsonb
    );
    v_value := p_payload->>'statusLabel';
  elsif p_event_type = 'matrix_card' then
    v_enabled := coalesce((v_settings->'settings'->>'card')::boolean, false);
    v_options := coalesce(v_settings->'selectedOptions'->'card', '[]'::jsonb);
    v_value := p_payload->>'lottery';
  elsif p_event_type = 'system_notice' then
    v_enabled := coalesce((v_settings->'settings'->>'system')::boolean, false);
    v_options := coalesce(v_settings->'selectedOptions'->'system', '[]'::jsonb);
    v_value := p_payload->>'category';
  elsif p_event_type = 'bet_reminder' then
    return coalesce((v_settings->'settings'->>'bet')::boolean, false)
      and p_payload->>'memberId' = p_member_id::text;
  elsif p_event_type = 'membership_expiry' then
    if not (
      coalesce((v_settings->'settings'->>'expiry')::boolean, false)
      and p_payload->>'memberId' = p_member_id::text
    ) then
      return false;
    end if;
    v_options := coalesce(v_settings->'selectedOptions'->'expiry', '[]'::jsonb);
    v_value := '提前' || coalesce(p_payload->>'daysBefore', '') || '日';
    v_enabled := true;
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
end;
$$;

create or replace function private.notification_retry_delay_minutes(p_attempt integer)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_attempt is null or p_attempt <= 1 then 1
    when p_attempt = 2 then 2
    when p_attempt = 3 then 5
    when p_attempt = 4 then 15
    else 30
  end;
$$;

create or replace function private.notification_fanout_event(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.notification_events%rowtype;
  v_payload jsonb;
  v_inserted integer := 0;
  v_error text;
begin
  select * into v_event
  from public.notification_events
  where id = p_event_id
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'NOTIFICATION_EVENT_NOT_FOUND';
  end if;

  if v_event.fanout_status in ('complete', 'failed') then
    return 0;
  end if;

  if v_event.fanout_status <> 'processing' then
    update public.notification_events
    set fanout_status = 'processing',
        fanout_attempt_count = fanout_attempt_count + 1,
        next_fanout_at = null,
        processing_started_at = pg_catalog.now(),
        last_error = null,
        updated_at = pg_catalog.now()
    where id = p_event_id
    returning * into v_event;
  end if;

  begin
    v_payload := private.notification_render_payload(
      v_event.event_type,
      v_event.event_key,
      v_event.payload
    );

    with inserted as (
      insert into public.notification_outbox (
        event_id,
        member_id,
        channel,
        notification_payload
      )
      select
        v_event.id,
        member.id,
        'web_push',
        v_payload
      from public.members as member
      where private.notification_member_matches(
        member.id,
        v_event.event_type,
        v_event.payload
      )
      on conflict (event_id, member_id, channel) do nothing
      returning 1
    )
    select pg_catalog.count(*)::integer into v_inserted from inserted;

    update public.notification_events
    set fanout_status = 'complete',
        next_fanout_at = null,
        processing_started_at = null,
        last_error = null,
        updated_at = pg_catalog.now()
    where id = v_event.id;

    return v_inserted;
  exception
    when others then
      v_error := pg_catalog.left(sqlerrm, 1000);
      if v_event.fanout_attempt_count >= 5 then
        update public.notification_events
        set fanout_status = 'failed',
            next_fanout_at = null,
            processing_started_at = null,
            last_error = v_error,
            updated_at = pg_catalog.now()
        where id = v_event.id;
      else
        update public.notification_events
        set fanout_status = 'pending',
            next_fanout_at = pg_catalog.now() + pg_catalog.make_interval(
              mins => private.notification_retry_delay_minutes(v_event.fanout_attempt_count)
            ),
            processing_started_at = null,
            last_error = v_error,
            updated_at = pg_catalog.now()
        where id = v_event.id;
      end if;
      return 0;
  end;
end;
$$;

create or replace function private.notification_fanout_drain(
  p_limit integer,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.now());
  v_limit integer := greatest(coalesce(p_limit, 0), 0);
  v_recovered integer := 0;
  v_claimed integer := 0;
  v_completed integer := 0;
  v_event_id uuid;
  v_status text;
begin
  with recovered as (
    update public.notification_events
    set fanout_status = 'pending',
        next_fanout_at = v_now,
        processing_started_at = null,
        updated_at = v_now
    where fanout_status = 'processing'
      and processing_started_at is not null
      and processing_started_at < v_now - interval '5 minutes'
    returning id
  )
  select pg_catalog.count(*)::integer into v_recovered from recovered;

  for v_event_id in
    select event.id
    from public.notification_events as event
    where event.fanout_status = 'pending'
      and (event.next_fanout_at is null or event.next_fanout_at <= v_now)
    order by event.created_at, event.id
    for update skip locked
    limit v_limit
  loop
    update public.notification_events
    set fanout_status = 'processing',
        fanout_attempt_count = fanout_attempt_count + 1,
        next_fanout_at = null,
        processing_started_at = v_now,
        last_error = null,
        updated_at = v_now
    where id = v_event_id;

    v_claimed := v_claimed + 1;
    perform private.notification_fanout_event(v_event_id);

    select fanout_status into v_status
    from public.notification_events
    where id = v_event_id;
    if v_status = 'complete' then
      v_completed := v_completed + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'recovered', v_recovered,
    'claimed', v_claimed,
    'completed', v_completed
  );
end;
$$;

revoke all on function private.notification_render_payload(text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.notification_member_matches(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.notification_retry_delay_minutes(integer)
  from public, anon, authenticated, service_role;
revoke all on function private.notification_fanout_event(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.notification_fanout_drain(integer, timestamptz)
  from public, anon, authenticated, service_role;

commit;
