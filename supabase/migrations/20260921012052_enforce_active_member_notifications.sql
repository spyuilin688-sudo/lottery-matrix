begin;
set local lock_timeout = '5s';

-- Push subscription RPCs are member APIs. Authentication alone is insufficient:
-- an administratively disabled member must not register or inspect a device.
create or replace function public.member_push_subscription_status(p_endpoint text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform private.active_member_id();

  if nullif(pg_catalog.btrim(p_endpoint), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  return pg_catalog.jsonb_build_object(
    'enabled', exists (
      select 1
      from public.member_push_subscriptions
      where user_id = v_uid and endpoint = p_endpoint and enabled
    )
  );
end;
$$;

create or replace function public.member_push_subscription_save(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_subscription public.member_push_subscriptions%rowtype;
begin
  perform private.active_member_id();

  if not coalesce(private.member_push_endpoint_allowed(p_endpoint), false)
    or nullif(pg_catalog.btrim(p_p256dh), '') is null
    or nullif(pg_catalog.btrim(p_auth), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  insert into public.member_push_subscriptions (
    user_id, endpoint, p256dh, auth_key
  ) values (
    v_uid, p_endpoint, p_p256dh, p_auth
  )
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth_key = excluded.auth_key,
      enabled = true,
      updated_at = pg_catalog.now()
  where member_push_subscriptions.user_id = v_uid
     or (member_push_subscriptions.p256dh = excluded.p256dh
         and member_push_subscriptions.auth_key = excluded.auth_key)
  returning * into v_subscription;

  if not found then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_subscription.id,
    'endpoint', v_subscription.endpoint,
    'enabled', v_subscription.enabled,
    'createdAt', v_subscription.created_at,
    'updatedAt', v_subscription.updated_at,
    'lastSuccessAt', v_subscription.last_success_at,
    'lastFailureAt', v_subscription.last_failure_at
  );
end;
$$;

create or replace function public.member_push_subscription_disable(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_subscription public.member_push_subscriptions%rowtype;
begin
  perform private.active_member_id();

  if nullif(pg_catalog.btrim(p_endpoint), '') is null then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  update public.member_push_subscriptions
  set enabled = false,
      updated_at = pg_catalog.now()
  where user_id = v_uid and endpoint = p_endpoint
  returning * into v_subscription;

  return pg_catalog.jsonb_build_object(
    'disabled', v_subscription.id is not null,
    'endpoint', p_endpoint
  );
end;
$$;

-- Recheck member status at claim time. Work already accepted by the provider is
-- still reconciled as sent; only unaccepted work is suppressed.
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
      coalesce(member.status, '') not in ('停用', 'disabled', 'inactive') as member_active,
      event.event_type <> 'bet_reminder'
      or (
        private.notification_member_matches(outbox.member_id, event.event_type, event.payload)
        and private.notification_reminder_is_due(event.payload, v_now)
      ) as allowed,
      (
        select log.sent_at
        from public.push_delivery_logs as log
        where log.notification_outbox_id = outbox.id
          and log.status = 'sent'
          and log.admin_account = 'system:notification-dispatch'
          and log.user_id = member.auth_user_id
        order by log.sent_at
        limit 1
      ) as accepted_at
    from due
    join public.notification_outbox as outbox on outbox.id = due.id
    join public.notification_events as event on event.id = outbox.event_id
    join public.members as member on member.id = outbox.member_id
  ),
  claimed as (
    update public.notification_outbox as outbox
    set status = case when eligible.accepted_at is not null then 'sent'
                      when eligible.member_active and eligible.allowed then 'processing'
                      else 'skipped' end,
        attempt_count = outbox.attempt_count
          + case when eligible.accepted_at is null and eligible.member_active and eligible.allowed then 1 else 0 end,
        next_attempt_at = null,
        processing_started_at = case
          when eligible.accepted_at is null and eligible.member_active and eligible.allowed then v_now
        end,
        processed_at = case when eligible.accepted_at is not null then eligible.accepted_at
                            when not eligible.member_active or not eligible.allowed then v_now end,
        last_error = case when eligible.accepted_at is not null then null
                          when not eligible.member_active then 'member_inactive'
                          when eligible.allowed then outbox.last_error
                          else 'bet_reminder_not_eligible' end,
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
  join public.members as member on member.id = claimed.member_id
  join public.notification_events as event on event.id = claimed.event_id
  where claimed.status = 'processing'
  order by claimed.created_at, claimed.id;
end;
$$;

revoke all on function public.member_push_subscription_status(text) from public, anon;
revoke all on function public.member_push_subscription_save(text, text, text) from public, anon;
revoke all on function public.member_push_subscription_disable(text) from public, anon;
revoke all on function public.notification_dispatch_claim(integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.member_push_subscription_status(text) to authenticated;
grant execute on function public.member_push_subscription_save(text, text, text) to authenticated;
grant execute on function public.member_push_subscription_disable(text) to authenticated;
grant execute on function public.notification_dispatch_claim(integer, timestamptz) to service_role;

comment on function public.notification_dispatch_claim(integer, timestamptz) is
  'Claims active-member notification work and reconciles accepted delivery receipts without resending.';

commit;
