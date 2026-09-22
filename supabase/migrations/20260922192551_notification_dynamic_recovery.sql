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

  with candidates(due_at) as (
    select event.next_fanout_at
    from public.notification_events as event
    where event.fanout_status = 'pending'
      and event.next_fanout_at is not null
    union all
    select event.processing_started_at + interval '5 minutes'
    from public.notification_events as event
    where event.fanout_status = 'processing'
      and event.processing_started_at is not null
    union all
    select coalesce(outbox.next_attempt_at, p_now)
    from public.notification_outbox as outbox
    where outbox.status = 'pending'
    union all
    select outbox.processing_started_at + interval '5 minutes'
    from public.notification_outbox as outbox
    where outbox.status = 'processing'
      and outbox.processing_started_at is not null
    union all
    select delivery.next_attempt_at
    from private.native_push_deliveries as delivery
    where delivery.status = 'pending'
      and delivery.attempt_count < 5
      and delivery.next_attempt_at is not null
    union all
    select delivery.lease_until
    from private.native_push_deliveries as delivery
    where delivery.status = 'processing'
      and delivery.attempt_count < 5
      and delivery.lease_until is not null
    union all
    select job.next_attempt_at
    from public.admin_transfer_push_jobs as job
    where job.status = 'pending'
      and job.attempt_count < 5
      and job.next_attempt_at is not null
    union all
    select job.lease_until
    from public.admin_transfer_push_jobs as job
    where job.status = 'sending'
      and job.attempt_count < 5
      and job.lease_until is not null
    union all
    select p_now
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
    limit 1
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

create or replace function private.notification_recovery_replan(
  p_now timestamptz default pg_catalog.now()
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next timestamptz;
  v_run_at timestamptz;
  v_job_name text := 'matrix-notification-recovery-next';
begin
  if p_now is null or not pg_catalog.isfinite(p_now) then
    raise exception using errcode = '22023', message = 'NOTIFICATION_RECOVERY_TIME_INVALID';
  end if;

  v_next := private.notification_recovery_next_at(p_now);
  if v_next is null then
    if exists (select 1 from cron.job where jobname = v_job_name) then
      perform cron.unschedule(v_job_name);
    end if;
    return null;
  end if;

  v_run_at := pg_catalog.date_trunc('minute', v_next);
  if v_run_at < v_next then
    v_run_at := v_run_at + interval '1 minute';
  end if;
  if v_run_at <= pg_catalog.date_trunc('minute', p_now) then
    v_run_at := pg_catalog.date_trunc('minute', p_now) + interval '1 minute';
  end if;

  perform cron.schedule(
    v_job_name,
    pg_catalog.to_char(v_run_at at time zone 'UTC', 'MI HH24') || ' * * *',
    'select private.notification_recovery_tick(pg_catalog.now());'
  );
  return v_next;
end;
$$;

create or replace function private.notification_recovery_tick(
  p_now timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fanout jsonb := '{}'::jsonb;
  v_web bigint;
  v_native bigint;
  v_admin bigint;
  v_fanout_failed boolean := false;
  v_web_failed boolean := false;
  v_native_failed boolean := false;
  v_admin_failed boolean := false;
  v_replan_failed boolean := false;
  v_replan_code text;
begin
  begin
    v_fanout := private.notification_fanout_drain(100, p_now);
  exception
    when others then
      v_fanout_failed := true;
  end;

  begin
    v_web := private.notification_dispatch_http_tick();
  exception
    when others then
      v_web_failed := true;
  end;

  begin
    v_native := private.native_notification_dispatch_http_tick();
  exception
    when others then
      v_native_failed := true;
  end;

  begin
    v_admin := private.admin_transfer_push_tick();
  exception
    when others then
      v_admin_failed := true;
  end;

  begin
    perform private.notification_recovery_replan(coalesce(p_now, pg_catalog.now()));
  exception
    when others then
      v_replan_failed := true;
      get stacked diagnostics v_replan_code = returned_sqlstate;
      raise log 'NOTIFICATION_RECOVERY_REPLAN_FAILED sqlstate=%', v_replan_code;
  end;

  return pg_catalog.jsonb_build_object(
    'fanout', v_fanout,
    'fanoutFailed', v_fanout_failed,
    'webRequestId', v_web,
    'webFailed', v_web_failed,
    'nativeRequestId', v_native,
    'nativeFailed', v_native_failed,
    'adminRequestId', v_admin,
    'adminFailed', v_admin_failed,
    'replanFailed', v_replan_failed
  );
end;
$$;

create or replace function private.notification_recovery_replan_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_code text;
begin
  v_state := pg_catalog.current_setting('matrix.notification_recovery_replanned', true);
  if v_state = '1' then
    return null;
  end if;
  perform pg_catalog.set_config('matrix.notification_recovery_replanned', '1', true);
  begin
    perform private.notification_recovery_replan(pg_catalog.now());
  exception
    when others then
      get stacked diagnostics v_code = returned_sqlstate;
      raise log 'NOTIFICATION_RECOVERY_REPLAN_FAILED sqlstate=%', v_code;
  end;
  return null;
end;
$$;

drop trigger if exists notification_recovery_replan_event_retry on public.notification_events;
create trigger notification_recovery_replan_event_retry
after update of fanout_status, next_fanout_at on public.notification_events
for each row
when (new.fanout_status = 'pending' and new.next_fanout_at is not null)
execute function private.notification_recovery_replan_trigger();

drop trigger if exists notification_recovery_replan_outbox on public.notification_outbox;
create trigger notification_recovery_replan_outbox
after insert or update or delete on public.notification_outbox
for each statement
execute function private.notification_recovery_replan_trigger();

drop trigger if exists notification_recovery_replan_native on private.native_push_deliveries;
create trigger notification_recovery_replan_native
after insert or update or delete on private.native_push_deliveries
for each statement
execute function private.notification_recovery_replan_trigger();

drop trigger if exists notification_recovery_replan_admin on public.admin_transfer_push_jobs;
create trigger notification_recovery_replan_admin
after insert or update or delete on public.admin_transfer_push_jobs
for each statement
execute function private.notification_recovery_replan_trigger();

revoke all on function private.notification_recovery_next_at(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.notification_recovery_replan(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.notification_recovery_replan_trigger()
  from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'matrix-notification-recovery-5m') then
    perform cron.unschedule('matrix-notification-recovery-5m');
  end if;
  if exists (select 1 from cron.job where jobname = 'matrix-notification-recovery-fallback') then
    perform cron.unschedule('matrix-notification-recovery-fallback');
  end if;
end;
$$;

select cron.schedule(
  'matrix-notification-recovery-fallback',
  '7 * * * *',
  'select private.notification_recovery_tick(pg_catalog.now());'
);

select private.notification_recovery_replan(pg_catalog.now());

create or replace function public.admin_notification_delivery_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event_trigger boolean := false;
  v_admin_trigger boolean := false;
  v_replan_triggers boolean := false;
  v_fallback_active boolean := false;
  v_fallback_schedule text;
  v_dynamic_active boolean := false;
  v_next_due timestamptz;
  v_last_started timestamptz;
  v_last_finished timestamptz;
  v_last_status text;
  v_recovery jsonb;
  v_web jsonb;
  v_native jsonb;
  v_admin jsonb;
  v_enabled_devices bigint := 0;
  v_enabled_admin_subscriptions bigint := 0;
begin
  if pg_catalog.to_regclass('public.notification_events') is null
    or pg_catalog.to_regclass('public.notification_outbox') is null
    or pg_catalog.to_regclass('private.native_push_devices') is null
    or pg_catalog.to_regclass('private.native_push_deliveries') is null
    or pg_catalog.to_regclass('public.admin_push_subscriptions') is null
    or pg_catalog.to_regclass('public.admin_transfer_push_jobs') is null
    or pg_catalog.to_regclass('cron.job') is null
    or pg_catalog.to_regclass('cron.job_run_details') is null then
    return null;
  end if;

  select exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'notification_events'
      and trigger.tgname = 'notification_event_publish_after_insert'
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
  ) into v_event_trigger;

  select exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'transfer_requests'
      and trigger.tgname = 'admin_transfer_push_on_insert'
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
  ) into v_admin_trigger;

  select count(*) = 4
  into v_replan_triggers
  from pg_catalog.pg_trigger as trigger
  join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
  where not trigger.tgisinternal
    and trigger.tgenabled <> 'D'
    and trigger.tgname in (
      'notification_recovery_replan_event_retry',
      'notification_recovery_replan_outbox',
      'notification_recovery_replan_native',
      'notification_recovery_replan_admin'
    )
    and (
      (namespace.nspname = 'public' and relation.relname in (
        'notification_events',
        'notification_outbox',
        'admin_transfer_push_jobs'
      ))
      or (namespace.nspname = 'private' and relation.relname = 'native_push_deliveries')
    );

  select coalesce(job.active, false), job.schedule
  into v_fallback_active, v_fallback_schedule
  from cron.job as job
  where job.jobname = 'matrix-notification-recovery-fallback'
  order by job.jobid desc
  limit 1;

  select coalesce(bool_or(job.active), false)
  into v_dynamic_active
  from cron.job as job
  where job.jobname = 'matrix-notification-recovery-next';

  v_next_due := private.notification_recovery_next_at(pg_catalog.now());

  select detail.start_time, detail.end_time,
    case
      when detail.status in ('succeeded', 'failed', 'running') then detail.status
      when detail.status is not null then 'unknown'
      else null
    end
  into v_last_started, v_last_finished, v_last_status
  from cron.job as job
  join cron.job_run_details as detail on detail.jobid = job.jobid
  where job.jobname = 'matrix-notification-recovery-fallback'
  order by detail.runid desc
  limit 1;

  v_recovery := pg_catalog.jsonb_build_object(
    'enabled', coalesce(v_fallback_active, false),
    'strategy', 'dynamic-with-hourly-fallback',
    'schedule', v_fallback_schedule,
    'queue_trigger_enabled', v_replan_triggers,
    'dynamic_enabled', coalesce(v_dynamic_active, false),
    'next_due_at', v_next_due,
    'last_started_at', v_last_started,
    'last_finished_at', v_last_finished,
    'last_status', v_last_status
  );

  select pg_catalog.jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'processing', count(*) filter (where status = 'processing'),
    'overdue', count(*) filter (where
      (status = 'pending' and coalesce(next_attempt_at, created_at) <= pg_catalog.now() - interval '5 minutes')
      or (status = 'processing' and processing_started_at <= pg_catalog.now() - interval '5 minutes')),
    'sent_24h', count(*) filter (where status = 'sent' and processed_at >= pg_catalog.now() - interval '24 hours'),
    'failed_24h', count(*) filter (where status = 'failed' and processed_at >= pg_catalog.now() - interval '24 hours'),
    'skipped_24h', count(*) filter (where status = 'skipped' and processed_at >= pg_catalog.now() - interval '24 hours'),
    'last_sent_at', max(processed_at) filter (where status = 'sent'),
    'last_failed_at', max(processed_at) filter (where status = 'failed')
  )
  into v_web
  from public.notification_outbox;

  select count(*) into v_enabled_devices
  from private.native_push_devices
  where enabled;

  select pg_catalog.jsonb_build_object(
    'enabled_devices', v_enabled_devices,
    'pending', count(*) filter (where status = 'pending'),
    'processing', count(*) filter (where status = 'processing'),
    'overdue', count(*) filter (where
      (status = 'pending' and next_attempt_at <= pg_catalog.now() - interval '5 minutes')
      or (status = 'processing' and lease_until <= pg_catalog.now() - interval '5 minutes')),
    'sent_24h', count(*) filter (where status = 'sent' and finished_at >= pg_catalog.now() - interval '24 hours'),
    'failed_24h', count(*) filter (where status = 'failed' and finished_at >= pg_catalog.now() - interval '24 hours'),
    'canceled_24h', count(*) filter (where status = 'canceled' and finished_at >= pg_catalog.now() - interval '24 hours'),
    'last_sent_at', max(finished_at) filter (where status = 'sent'),
    'last_failed_at', max(finished_at) filter (where status = 'failed')
  )
  into v_native
  from private.native_push_deliveries;

  select count(*) into v_enabled_admin_subscriptions
  from public.admin_push_subscriptions
  where enabled;

  select pg_catalog.jsonb_build_object(
    'enabled_subscriptions', v_enabled_admin_subscriptions,
    'pending', count(*) filter (where status = 'pending'),
    'sending', count(*) filter (where status = 'sending'),
    'overdue', count(*) filter (where
      (status = 'pending' and next_attempt_at <= pg_catalog.now() - interval '5 minutes')
      or (status = 'sending' and lease_until <= pg_catalog.now() - interval '5 minutes')),
    'sent_24h', count(*) filter (where status = 'sent' and finished_at >= pg_catalog.now() - interval '24 hours'),
    'failed_24h', count(*) filter (where status = 'failed' and finished_at >= pg_catalog.now() - interval '24 hours'),
    'skipped_24h', count(*) filter (where status = 'skipped' and finished_at >= pg_catalog.now() - interval '24 hours'),
    'last_sent_at', max(finished_at) filter (where status = 'sent'),
    'last_failed_at', max(finished_at) filter (where status = 'failed')
  )
  into v_admin
  from public.admin_transfer_push_jobs;

  return pg_catalog.jsonb_build_object(
    'checked_at', pg_catalog.now(),
    'mode', 'event-driven',
    'event_trigger_enabled', v_event_trigger,
    'admin_transfer_trigger_enabled', v_admin_trigger,
    'recovery', v_recovery,
    'web', v_web,
    'native', v_native,
    'admin', v_admin
  );
end;
$$;
