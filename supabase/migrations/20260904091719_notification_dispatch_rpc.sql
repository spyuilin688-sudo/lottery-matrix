begin;

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
  claimed as (
    update public.notification_outbox as outbox
    set status = 'processing',
        attempt_count = outbox.attempt_count + 1,
        next_attempt_at = null,
        processing_started_at = v_now,
        processed_at = null,
        updated_at = v_now
    from due
    where outbox.id = due.id
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
  order by claimed.created_at, claimed.id;
end;
$$;

create or replace function public.notification_dispatch_mark_sent(
  p_outbox_id uuid,
  p_processed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_processed_at timestamptz := coalesce(p_processed_at, pg_catalog.now());
begin
  update public.notification_outbox
  set status = 'sent',
      next_attempt_at = null,
      processing_started_at = null,
      last_error = null,
      processed_at = v_processed_at,
      updated_at = v_processed_at
  where id = p_outbox_id
    and status = 'processing';

  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

create or replace function public.notification_dispatch_mark_skipped(
  p_outbox_id uuid,
  p_reason text,
  p_processed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_processed_at timestamptz := coalesce(p_processed_at, pg_catalog.now());
begin
  update public.notification_outbox
  set status = 'skipped',
      next_attempt_at = null,
      processing_started_at = null,
      last_error = p_reason,
      processed_at = v_processed_at,
      updated_at = v_processed_at
  where id = p_outbox_id
    and status = 'processing';

  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

create or replace function public.notification_dispatch_mark_retry(
  p_outbox_id uuid,
  p_error text,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_now timestamptz := pg_catalog.now();
begin
  update public.notification_outbox
  set status = 'pending',
      next_attempt_at = p_next_attempt_at,
      processing_started_at = null,
      last_error = p_error,
      processed_at = null,
      updated_at = v_now
  where id = p_outbox_id
    and status = 'processing';

  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

create or replace function public.notification_dispatch_mark_failed(
  p_outbox_id uuid,
  p_error text,
  p_processed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
  v_processed_at timestamptz := coalesce(p_processed_at, pg_catalog.now());
begin
  update public.notification_outbox
  set status = 'failed',
      next_attempt_at = null,
      processing_started_at = null,
      last_error = p_error,
      processed_at = v_processed_at,
      updated_at = v_processed_at
  where id = p_outbox_id
    and status = 'processing';

  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

revoke all on function public.notification_dispatch_claim(integer, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.notification_dispatch_mark_sent(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.notification_dispatch_mark_skipped(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.notification_dispatch_mark_retry(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.notification_dispatch_mark_failed(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.notification_dispatch_claim(integer, timestamptz)
  to service_role;
grant execute on function public.notification_dispatch_mark_sent(uuid, timestamptz)
  to service_role;
grant execute on function public.notification_dispatch_mark_skipped(uuid, text, timestamptz)
  to service_role;
grant execute on function public.notification_dispatch_mark_retry(uuid, text, timestamptz)
  to service_role;
grant execute on function public.notification_dispatch_mark_failed(uuid, text, timestamptz)
  to service_role;

commit;
