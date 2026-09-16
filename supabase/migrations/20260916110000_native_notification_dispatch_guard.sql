begin;

create or replace function private.native_notification_dispatch_http_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_dispatch_token text;
  v_request_id bigint;
begin
  -- Existing due/recoverable work, including one final cleanup pass for an
  -- expired max-attempt lease that native_notification_claim marks failed.
  if not exists (
    select 1
    from private.native_push_deliveries as delivery
    where (
      delivery.status = 'pending'
      and delivery.next_attempt_at <= pg_catalog.now()
      and delivery.attempt_count < 5
    ) or (
      delivery.status = 'processing'
      and delivery.lease_until is not null
      and delivery.lease_until <= pg_catalog.now()
    )
  ) and not exists (
    -- native_notification_claim materializes delivery rows lazily. The guard
    -- must also wake for eligible outbox/device pairs that do not have a row yet.
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
    limit 1
  ) then
    return null;
  end if;

  select secret.decrypted_secret
  into v_project_url
  from vault.decrypted_secrets as secret
  where secret.name = 'matrix_project_url'
  limit 1;

  select secret.decrypted_secret
  into v_dispatch_token
  from vault.decrypted_secrets as secret
  where secret.name = 'matrix_notification_dispatch_token'
  limit 1;

  if nullif(pg_catalog.btrim(v_project_url), '') is null
     or nullif(pg_catalog.btrim(v_dispatch_token), '') is null then
    raise exception using
      errcode = '55000',
      message = 'NATIVE_NOTIFICATION_DISPATCH_VAULT_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/native-notification-dispatch',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-matrix-dispatch-token', v_dispatch_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.native_notification_dispatch_http_tick()
  from public, anon, authenticated;

-- Alter the existing job in place. Do not create a parallel minute scheduler.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'matrix-native-notification-dispatch-minute';

  if v_job_id is null then
    raise exception 'MATRIX_NATIVE_NOTIFICATION_CRON_MISSING';
  end if;

  perform cron.alter_job(
    job_id := v_job_id,
    command := 'select private.native_notification_dispatch_http_tick();'
  );
end;
$$;

commit;
