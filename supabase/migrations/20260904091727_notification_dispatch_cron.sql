begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function private.notification_dispatch_http_tick()
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
  select s.decrypted_secret
    into v_project_url
    from vault.decrypted_secrets as s
   where s.name = 'matrix_project_url'
   limit 1;

  select s.decrypted_secret
    into v_dispatch_token
    from vault.decrypted_secrets as s
   where s.name = 'matrix_notification_dispatch_token'
   limit 1;

  if nullif(pg_catalog.btrim(v_project_url), '') is null
     or nullif(pg_catalog.btrim(v_dispatch_token), '') is null then
    raise exception using
      errcode = '55000',
      message = 'NOTIFICATION_DISPATCH_VAULT_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/notification-dispatch',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-matrix-dispatch-token', v_dispatch_token
    ),
    body := '{}'::jsonb
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.notification_dispatch_http_tick() from public;
revoke all on function private.notification_dispatch_http_tick() from anon;
revoke all on function private.notification_dispatch_http_tick() from authenticated;
revoke all on function private.notification_dispatch_http_tick() from service_role;

do $$
declare
  v_job record;
begin
  for v_job in
    select j.jobid
      from cron.job as j
     where j.jobname in (
       'matrix-notification-pipeline-minute',
       'matrix-notification-dispatch-minute'
     )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule_in_database(
  'matrix-notification-pipeline-minute',
  '* * * * *',
  'select private.notification_pipeline_tick(pg_catalog.now());',
  pg_catalog.current_database(),
  null,
  false
);

select cron.schedule_in_database(
  'matrix-notification-dispatch-minute',
  '* * * * *',
  'select private.notification_dispatch_http_tick();',
  pg_catalog.current_database(),
  null,
  false
);

commit;
