begin;

create or replace function private.notification_dispatch_wake()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_web bigint;
  v_native bigint;
begin
  if pg_catalog.current_setting('matrix.notification_dispatch_woken', true) = '1' then
    return pg_catalog.jsonb_build_object(
      'deduplicated', true,
      'webRequestId', null,
      'nativeRequestId', null
    );
  end if;

  perform pg_catalog.set_config('matrix.notification_dispatch_woken', '1', true);
  v_web := private.notification_dispatch_http_tick();
  v_native := private.native_notification_dispatch_http_tick();

  return pg_catalog.jsonb_build_object(
    'deduplicated', false,
    'webRequestId', v_web,
    'nativeRequestId', v_native
  );
end;
$$;

revoke all on function private.notification_dispatch_wake()
  from public, anon, authenticated, service_role;

create or replace function private.notification_event_publish_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fixed-time reminder producers already batch fanout in their scheduled tick.
  -- Keep them out of this row trigger so one large reminder batch does not turn
  -- into one synchronous fanout scan per member.
  if new.event_type in ('bet_reminder', 'membership_expiry') then
    return null;
  end if;

  perform private.notification_fanout_event(new.id);

  -- Dispatch is best-effort here. The five-minute recovery job owns retries
  -- and must preserve the source event even if Edge or Vault is unavailable.
  begin
    perform private.notification_dispatch_wake();
  exception
    when others then
      null;
  end;

  return null;
end;
$$;

revoke all on function private.notification_event_publish_after_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists notification_event_publish_after_insert
  on public.notification_events;

create trigger notification_event_publish_after_insert
after insert on public.notification_events
for each row
execute function private.notification_event_publish_after_insert();

create or replace function private.notification_bet_reminders_publish_tick(
  p_now timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_dispatch jsonb;
begin
  v_result := private.notification_bet_reminders_tick(p_now);
  v_dispatch := private.notification_dispatch_wake();

  return v_result || pg_catalog.jsonb_build_object('dispatch', v_dispatch);
end;
$$;

revoke all on function private.notification_bet_reminders_publish_tick(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.notification_expiry_publish_tick(
  p_now timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_events jsonb;
  v_fanout jsonb;
  v_dispatch jsonb;
begin
  v_events := private.notification_time_events_tick(p_now);
  v_fanout := private.notification_fanout_drain(100, p_now);
  v_dispatch := private.notification_dispatch_wake();

  return pg_catalog.jsonb_build_object(
    'events', v_events,
    'fanout', v_fanout,
    'dispatch', v_dispatch
  );
end;
$$;

revoke all on function private.notification_expiry_publish_tick(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.admin_transfer_push_wake()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request bigint;
begin
  if pg_catalog.current_setting('matrix.admin_transfer_push_woken', true) = '1' then
    return null;
  end if;

  perform pg_catalog.set_config('matrix.admin_transfer_push_woken', '1', true);
  v_request := private.admin_transfer_push_tick();
  return v_request;
end;
$$;

revoke all on function private.admin_transfer_push_wake()
  from public, anon, authenticated, service_role;

create or replace function private.admin_transfer_push_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    insert into public.admin_transfer_push_jobs(
      transfer_id,
      subscription_id,
      admin_id
    )
    select new.id, subscription.id, subscription.admin_id
    from public.admin_push_subscriptions as subscription
    join public.admin_accounts as account
      on account.id = subscription.admin_id
    where subscription.enabled
      and account.status = '啟用'
      and account.role = '超級管理員'
    on conflict (transfer_id, subscription_id) do nothing;

    -- Never make transfer creation depend on push delivery availability.
    begin
      perform private.admin_transfer_push_wake();
    exception
      when others then
        null;
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.admin_transfer_push_enqueue()
  from public, anon, authenticated, service_role;

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

  return pg_catalog.jsonb_build_object(
    'fanout', v_fanout,
    'fanoutFailed', v_fanout_failed,
    'webRequestId', v_web,
    'webFailed', v_web_failed,
    'nativeRequestId', v_native,
    'nativeFailed', v_native_failed,
    'adminRequestId', v_admin,
    'adminFailed', v_admin_failed
  );
end;
$$;

revoke all on function private.notification_recovery_tick(timestamptz)
  from public, anon, authenticated, service_role;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'matrix-notification-pipeline-minute',
      'matrix-notification-dispatch-minute',
      'matrix-native-notification-dispatch-minute',
      'admin-transfer-push-minute',
      'matrix-notification-recovery-5m'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'matrix-notification-recovery-5m',
  '*/5 * * * *',
  'select private.notification_recovery_tick(pg_catalog.now());'
);

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'matrix-notification-bet-0500-0730',
      'matrix-notification-bet-0800',
      'matrix-notification-bet-0900',
      'matrix-notification-bet-1600-1830',
      'matrix-notification-bet-1900',
      'matrix-notification-bet-2000',
      'matrix-notification-bet-2100'
    )
  loop
    perform cron.alter_job(
      job_id := v_job.jobid,
      command := 'select private.notification_bet_reminders_publish_tick(pg_catalog.now());',
      active := true
    );
  end loop;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'matrix-notification-expiry-daily'
  limit 1;

  if v_job_id is null then
    raise exception 'MATRIX_NOTIFICATION_EXPIRY_CRON_MISSING';
  end if;

  perform cron.alter_job(
    job_id := v_job_id,
    command := 'select private.notification_expiry_publish_tick(pg_catalog.now());',
    active := true
  );
end;
$$;

commit;
