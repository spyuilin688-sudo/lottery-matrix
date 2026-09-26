begin;

-- Reuse the existing recovery cadence; idle App queues make no HTTP calls.
create function private.app_notification_dispatch_http_tick()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_url text; v_token text; v_request bigint;
begin
  perform private.app_notification_fanout(100);
  if not exists (
    select 1 from private.app_native_push_deliveries q
    where (q.status='pending' and q.next_attempt_at<=now() and q.attempt_count<5)
       or (q.status='processing' and q.lease_until<=now())
  ) and not exists (
    select 1 from private.app_native_push_devices d
    join private.app_native_push_outbox o on o.member_id=d.member_id and o.created_at>=d.enabled_at
    where private.app_native_push_eligible(d.installation_id,d.revision,o.id)
      and not exists(select 1 from private.app_native_push_deliveries q where q.outbox_id=o.id and q.installation_id=d.installation_id)
  ) and not exists (
    select 1 from private.app_native_push_events e
    where e.processed_at is null and e.attempt_count<5 and e.available_at<=now()
  ) then return null; end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_notification_dispatch_token' limit 1;
  if nullif(btrim(v_url),'') is null or nullif(btrim(v_token),'') is null then
    raise exception using errcode='55000',message='APP_NOTIFICATION_DISPATCH_VAULT_MISSING';
  end if;
  select net.http_post(
    url:=rtrim(v_url,'/')||'/functions/v1/app-native-notification-dispatch',
    headers:=jsonb_build_object('Content-Type','application/json','x-matrix-dispatch-token',v_token),
    body:='{}'::jsonb, timeout_milliseconds:=30000
  ) into v_request;
  return v_request;
end;
$$;

create function private.app_notification_recovery_tick()
returns bigint language plpgsql security definer set search_path='' as $$
begin
  return private.app_notification_dispatch_http_tick();
exception when others then
  -- Preserve the source/durable event and all independent PWA recovery work.
  return null;
end;
$$;

create or replace function private.app_notification_capture()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.event_type in ('lottery_result','matrix_status','matrix_card') then
    insert into private.app_native_push_events(id,event_key,event_type,payload,created_at)
      values(new.id,new.event_key,new.event_type,new.payload,new.created_at) on conflict do nothing;
    -- Snapshot is outside the best-effort wake's exception subtransaction.
    if pg_catalog.current_setting('matrix.app_notification_woken',true) is distinct from '1' then
      perform pg_catalog.set_config('matrix.app_notification_woken','1',true);
      perform private.app_notification_recovery_tick();
    end if;
  end if;
  return null;
end;
$$;

revoke all on function private.app_notification_dispatch_http_tick(),private.app_notification_recovery_tick(),private.app_notification_capture()
  from public,anon,authenticated,service_role;

do $$
declare v_job record;
begin
  select jobid,command into v_job from cron.job where jobname='matrix-notification-recovery-fallback';
  if not found then raise exception 'MATRIX_NOTIFICATION_RECOVERY_FALLBACK_CRON_MISSING'; end if;
  perform cron.alter_job(job_id:=v_job.jobid,
    command:=v_job.command||' select private.app_notification_recovery_tick();');
end;
$$;
commit;
