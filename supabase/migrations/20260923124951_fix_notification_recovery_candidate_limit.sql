-- The final LIMIT in the previous definition capped the entire UNION ALL,
-- allowing one later queue candidate to hide earlier work in another queue.
create or replace function private.notification_recovery_next_at(
  p_now timestamptz default pg_catalog.now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_due timestamptz;
begin
  if p_now is null or not pg_catalog.isfinite(p_now) then
    raise exception using errcode = '22023', message = 'NOTIFICATION_RECOVERY_TIME_INVALID';
  end if;

  -- Each branch contributes at most one candidate. The due indexes on events
  -- and outbox can then stop at the first row rather than scanning a backlog
  -- on every queue-write trigger.
  with candidates(due_at) as (
    (select event.next_fanout_at
    from public.notification_events as event
    where event.fanout_status = 'pending'
      and event.next_fanout_at is not null
    order by event.next_fanout_at
    limit 1)
    union all
    (select event.processing_started_at + interval '5 minutes'
    from public.notification_events as event
    where event.fanout_status = 'processing'
      and event.processing_started_at is not null
    order by event.processing_started_at
    limit 1)
    union all
    select p_now
    where exists (
      select 1 from public.notification_outbox as outbox
      where outbox.status = 'pending' and outbox.next_attempt_at is null
    )
    union all
    (select outbox.next_attempt_at
    from public.notification_outbox as outbox
    where outbox.status = 'pending'
      and outbox.next_attempt_at is not null
    order by outbox.next_attempt_at
    limit 1)
    union all
    (select outbox.processing_started_at + interval '5 minutes'
    from public.notification_outbox as outbox
    where outbox.status = 'processing'
      and outbox.processing_started_at is not null
    order by outbox.processing_started_at
    limit 1)
    union all
    (select delivery.next_attempt_at
    from private.native_push_deliveries as delivery
    where delivery.status = 'pending'
      and delivery.attempt_count < 5
      and delivery.next_attempt_at is not null
    order by delivery.next_attempt_at
    limit 1)
    union all
    (select delivery.lease_until
    from private.native_push_deliveries as delivery
    where delivery.status = 'processing'
      and delivery.attempt_count < 5
      and delivery.lease_until is not null
    order by delivery.lease_until
    limit 1)
    union all
    (select job.next_attempt_at
    from public.admin_transfer_push_jobs as job
    where job.status = 'pending'
      and job.attempt_count < 5
      and job.next_attempt_at is not null
    order by job.next_attempt_at
    limit 1)
    union all
    (select job.lease_until
    from public.admin_transfer_push_jobs as job
    where job.status = 'sending'
      and job.attempt_count < 5
      and job.lease_until is not null
    order by job.lease_until
    limit 1)
    union all
    select p_now
    where exists (
      select 1
      from private.native_push_devices as device
      join public.notification_outbox as outbox
        on outbox.member_id = device.member_id
       and outbox.created_at >= device.enabled_at
      where device.enabled
        and private.native_push_eligible(
          device.installation_id,
          device.revision,
          outbox.id
        )
        and not exists (
          select 1
          from private.native_push_deliveries as existing
          where existing.outbox_id = outbox.id
            and existing.installation_id = device.installation_id
        )
    )
  )
  select min(candidate.due_at)
    into v_due
  from candidates as candidate
  where candidate.due_at is not null;

  if v_due is null then
    return null;
  end if;
  if v_due <= p_now then
    return p_now + interval '5 minutes';
  end if;
  return v_due;
end;
$$;

-- Keep the existing hourly fallback untouched; correct the dynamic slot now.
select private.notification_recovery_replan(pg_catalog.now());
