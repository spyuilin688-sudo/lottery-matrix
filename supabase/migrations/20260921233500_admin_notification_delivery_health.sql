begin;

create or replace function public.admin_notification_delivery_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_event_trigger boolean := false;
  v_admin_trigger boolean := false;
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

  select pg_catalog.jsonb_build_object(
    'enabled', job.active,
    'schedule', job.schedule,
    'last_started_at', run.start_time,
    'last_finished_at', run.end_time,
    'last_status', case
      when run.status in ('succeeded', 'failed', 'running') then run.status
      when run.status is not null then 'unknown'
      else null end
  )
  into v_recovery
  from cron.job as job
  left join lateral (
    select detail.start_time, detail.end_time, detail.status
    from cron.job_run_details as detail
    where detail.jobid = job.jobid
    order by detail.runid desc
    limit 1
  ) as run on true
  where job.jobname = 'matrix-notification-recovery-5m'
  order by job.jobid desc
  limit 1;

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
    'recovery', coalesce(v_recovery, pg_catalog.jsonb_build_object(
      'enabled', false,
      'schedule', null,
      'last_started_at', null,
      'last_finished_at', null,
      'last_status', null
    )),
    'web', v_web,
    'native', v_native,
    'admin', v_admin
  );
end;
$function$;

revoke all on function public.admin_notification_delivery_health()
  from public, anon, authenticated;
grant execute on function public.admin_notification_delivery_health()
  to service_role;

comment on function public.admin_notification_delivery_health() is
  'Service-only read-only notification delivery health. Verifies event triggers, five-minute recovery and aggregate Web/Native/Admin queues without sending a notification or exposing tokens, identities, payloads, SQL or provider errors.';

notify pgrst, 'reload schema';
commit;
