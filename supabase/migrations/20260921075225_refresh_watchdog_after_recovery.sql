begin;

-- Recovery runs asynchronously after a watchdog observation. Once the worker
-- commits a verified success, queue a new observation so the admin status does
-- not keep displaying the pre-recovery failure until the next scheduled slot.
create function private.matrix_watchdog_refresh_dispatch()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'matrix_project_url'
  limit 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'matrix_admin_watchdog_token'
  limit 1;

  if nullif(pg_catalog.btrim(v_project_url), '') is null
    or nullif(pg_catalog.btrim(v_token), '') is null then
    raise exception using errcode = '55000', message = 'MATRIX_WATCHDOG_VAULT_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/admin-api/api/internal/matrix-watchdog',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Origin', 'https://matrixlottery.idv.tw',
      'x-matrix-watchdog-token', v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

create function private.matrix_watchdog_refresh_after_recovery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_name not like 'matrix-recovery:%' or new.status <> 'success' then
    return null;
  end if;

  if tg_op = 'UPDATE' and new.recovery_count <= old.recovery_count then
    return null;
  end if;

  -- pg_net sends after this transaction commits, so the new watchdog request
  -- observes the committed draw, analysis, and successful job status together.
  perform private.matrix_watchdog_refresh_dispatch();
  return null;
exception when others then
  -- Status refresh is auxiliary and must never roll back verified recovery.
  return null;
end;
$$;

create trigger matrix_watchdog_refresh_after_recovery
after insert or update of recovery_count on public.system_job_status
for each row execute function private.matrix_watchdog_refresh_after_recovery();

revoke all on function private.matrix_watchdog_refresh_dispatch(),
  private.matrix_watchdog_refresh_after_recovery()
from public, anon, authenticated, service_role;

commit;
