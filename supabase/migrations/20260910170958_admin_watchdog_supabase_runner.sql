create schema if not exists private;

create table if not exists private.admin_watchdog_runtime (
  id boolean primary key default true check (id),
  active_runner text not null check (active_runner in ('appdeploy', 'supabase')),
  cron_token_sha256 bytea not null check (octet_length(cron_token_sha256) = 32),
  updated_at timestamptz not null default now()
);

revoke all on table private.admin_watchdog_runtime from public, anon, authenticated, service_role;

do $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_secret_id uuid;
begin
  insert into private.admin_watchdog_runtime (id, active_runner, cron_token_sha256, updated_at)
  values (true, 'supabase', extensions.digest(v_token, 'sha256'), now())
  on conflict (id) do update
    set active_runner = excluded.active_runner,
        cron_token_sha256 = excluded.cron_token_sha256,
        updated_at = excluded.updated_at;

  select id into v_secret_id
  from vault.secrets
  where name = 'matrix_admin_watchdog_token';

  if v_secret_id is null then
    perform vault.create_secret(
      v_token,
      'matrix_admin_watchdog_token',
      'Private Supabase Cron credential for the canonical admin watchdog'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      v_token,
      'matrix_admin_watchdog_token',
      'Private Supabase Cron credential for the canonical admin watchdog'
    );
  end if;
end;
$$;

create or replace function public.admin_watchdog_cron_authorize(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select extensions.digest(p_token, 'sha256') = cron_token_sha256
    from private.admin_watchdog_runtime
    where id = true
      and active_runner = 'supabase'
      and p_token is not null
      and octet_length(p_token) = 64
  ), false);
$$;

revoke all on function public.admin_watchdog_cron_authorize(text) from public, anon, authenticated;
grant execute on function public.admin_watchdog_cron_authorize(text) to service_role;

create or replace function public.claim_matrix_watchdog_lease(
  p_lease_key text,
  p_owner_id text,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if nullif(trim(p_lease_key), '') is null
    or nullif(trim(p_owner_id), '') is null
    or p_ttl_seconds not between 60 and 3600 then
    raise exception 'INVALID_WATCHDOG_LEASE';
  end if;

  if coalesce(
    (select active_runner from private.admin_watchdog_runtime where id = true),
    'appdeploy'
  ) = 'supabase'
    and p_owner_id not like 'supabase-cron:%'
    and p_owner_id not like 'admin-manual:%' then
    return false;
  end if;

  insert into public.matrix_watchdog_leases (
    lease_key,
    owner_id,
    acquired_at,
    expires_at
  ) values (
    p_lease_key,
    p_owner_id,
    now(),
    now() + make_interval(secs => p_ttl_seconds)
  )
  on conflict (lease_key) do update
  set owner_id = excluded.owner_id,
      runner_id = null,
      acquired_at = excluded.acquired_at,
      recovery_started_at = null,
      expires_at = excluded.expires_at
  where public.matrix_watchdog_leases.expires_at <= now();

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_matrix_watchdog_lease(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_matrix_watchdog_lease(text, text, integer)
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'matrix-admin-watchdog-v1';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'matrix-admin-watchdog-v1',
  '3-59/10 * * * *',
  $cron$
    select net.http_post(
      url := rtrim((
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'matrix_project_url'
      ), '/') || '/functions/v1/admin-api/api/internal/matrix-watchdog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Origin', 'https://matrixlottery.idv.tw',
        'x-matrix-watchdog-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'matrix_admin_watchdog_token'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $cron$
);
