begin;

-- Optional for existing/manual push producers. Only dispatcher logs link to an
-- outbox; do not infer historic links from matching text or notification times.
alter table public.push_delivery_logs
  add column notification_outbox_id uuid
  references public.notification_outbox(id) on delete set null;

create index push_delivery_logs_outbox_receipt_idx
  on public.push_delivery_logs (notification_outbox_id, sent_at)
  where notification_outbox_id is not null and status = 'sent';

-- Keep the current reminder eligibility and five-minute claim lease. A provider
-- acceptance recorded before a finalizer failure is reconciled without another
-- delivery. Never treat an absent or failed log as a successful send.
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
                      when eligible.allowed then 'processing' else 'skipped' end,
        attempt_count = outbox.attempt_count
          + case when eligible.accepted_at is null and eligible.allowed then 1 else 0 end,
        next_attempt_at = null,
        processing_started_at = case when eligible.accepted_at is null and eligible.allowed then v_now end,
        processed_at = case when eligible.accepted_at is not null then eligible.accepted_at
                            when not eligible.allowed then v_now end,
        last_error = case when eligible.accepted_at is not null then null
                          when eligible.allowed then outbox.last_error else 'bet_reminder_not_eligible' end,
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
  where id = p_outbox_id and status = 'processing';

  get diagnostics v_changed = row_count;
  -- A retry after a lost HTTP response must not rewrite the original timestamp.
  return v_changed = 1 or exists (
    select 1 from public.notification_outbox where id = p_outbox_id and status = 'sent'
  );
end;
$$;

revoke all on function public.notification_dispatch_claim(integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.notification_dispatch_mark_sent(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.notification_dispatch_claim(integer, timestamptz) to service_role;
grant execute on function public.notification_dispatch_mark_sent(uuid, timestamptz) to service_role;

comment on column public.push_delivery_logs.notification_outbox_id is
  'Optional dispatcher receipt link. Provider acceptance is not device receipt; absent logs never imply sent.';

commit;
