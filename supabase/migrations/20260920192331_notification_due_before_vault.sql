-- Empty queues do not need Vault reads; retain the dispatch claim due/lease predicate.
begin;

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
  if not exists (
    select 1
      from public.notification_outbox as outbox
     where (
       outbox.status = 'pending'
       and (outbox.next_attempt_at is null or outbox.next_attempt_at <= pg_catalog.now())
     )
     or (
       outbox.status = 'processing'
       and outbox.processing_started_at is not null
       and outbox.processing_started_at <= pg_catalog.now() - interval '5 minutes'
     )
  ) then
    return null;
  end if;

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

commit;
