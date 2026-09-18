begin;

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
      and (
        exists (
          select 1
          from public.member_push_subscriptions as subscription
          where subscription.user_id = member.auth_user_id
            and subscription.enabled
            and nullif(pg_catalog.btrim(subscription.endpoint), '') is not null
            and nullif(pg_catalog.btrim(subscription.p256dh), '') is not null
            and nullif(pg_catalog.btrim(subscription.auth_key), '') is not null
        )
        or exists (
          select 1
          from private.native_push_devices as device
          where device.member_id = member.id
            and device.auth_user_id = member.auth_user_id
            and device.enabled
            and nullif(pg_catalog.btrim(device.token), '') is not null
            and private.native_push_session_valid(
              device.auth_user_id,
              device.session_id
            )
        )
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

commit;
