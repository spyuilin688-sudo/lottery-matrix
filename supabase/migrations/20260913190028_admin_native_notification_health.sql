begin;

-- Read-only aggregate evidence for the admin system-status page.
-- Native dispatch is independently deployed. A missing native/cron schema returns
-- no evidence instead of preventing a fresh migration replay.
create or replace function public.admin_native_notification_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_enabled_devices bigint;
  v_schedule jsonb;
  v_deliveries jsonb;
begin
  if pg_catalog.to_regclass('private.native_push_devices') is null
    or pg_catalog.to_regclass('private.native_push_deliveries') is null
    or pg_catalog.to_regclass('cron.job') is null
    or pg_catalog.to_regclass('cron.job_run_details') is null then
    return null;
  end if;

  select count(*) into v_enabled_devices
  from private.native_push_devices where enabled;

  select pg_catalog.jsonb_build_object(
    'enabled', j.active,
    'every_minute', j.schedule = '* * * * *',
    'last_started_at', r.start_time,
    'last_finished_at', r.end_time,
    'last_status', case
      when r.status in ('succeeded', 'failed', 'running') then r.status
      when r.status is not null then 'unknown'
      else null end
  ) into v_schedule
  from cron.job j
  left join lateral (
    select d.start_time, d.end_time, d.status
    from cron.job_run_details d
    where d.jobid = j.jobid
    order by d.runid desc limit 1
  ) r on true
  where j.jobname = 'matrix-native-notification-dispatch-minute'
  order by j.jobid desc limit 1;

  select pg_catalog.jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'processing', count(*) filter (where status = 'processing'),
    'overdue', count(*) filter (where
      (status = 'pending' and next_attempt_at < now() - interval '5 minutes')
      or (status = 'processing' and lease_until < now() - interval '5 minutes')),
    'sent_24h', count(*) filter (where status = 'sent' and finished_at >= now() - interval '24 hours'),
    'failed_24h', count(*) filter (where status = 'failed' and finished_at >= now() - interval '24 hours'),
    'canceled_24h', count(*) filter (where status = 'canceled' and finished_at >= now() - interval '24 hours'),
    'last_sent_at', max(finished_at) filter (where status = 'sent'),
    'last_failed_at', max(finished_at) filter (where status = 'failed')
  ) into v_deliveries
  from private.native_push_deliveries;

  return pg_catalog.jsonb_build_object(
    'checked_at', now(),
    'enabled_devices', v_enabled_devices,
    'schedule', coalesce(v_schedule, pg_catalog.jsonb_build_object(
      'enabled', false, 'every_minute', false,
      'last_started_at', null, 'last_finished_at', null, 'last_status', null)),
    'deliveries', v_deliveries
  );
end;
$function$;

revoke all on function public.admin_native_notification_health() from public, anon, authenticated;
grant execute on function public.admin_native_notification_health() to service_role;
comment on function public.admin_native_notification_health() is
  'Service-only read-only native push aggregates. Cron SQL success does not verify OAuth, FCM or device receipt. No tokens, identities, payloads or raw errors are returned.';

commit;
