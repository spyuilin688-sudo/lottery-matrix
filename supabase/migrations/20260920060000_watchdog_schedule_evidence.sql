begin;

-- Keep the canonical draw-window gate and physical cron schedule unchanged.
-- Separate scheduler liveness from the last completed data-chain observation.
create table private.admin_watchdog_schedule (
  id boolean primary key default true check (id),
  checked_at timestamptz not null,
  due boolean not null,
  pending_since timestamptz
);
alter table private.admin_watchdog_schedule enable row level security;
revoke all on table private.admin_watchdog_schedule from public, anon, authenticated, service_role;
grant select on table private.admin_watchdog_schedule to service_role;
create policy watchdog_schedule_service_read on private.admin_watchdog_schedule
  for select to service_role using (true);

create or replace function private.matrix_admin_watchdog_http_tick(
  p_now timestamptz default pg_catalog.now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_token text;
  v_request_id bigint;
  v_due boolean := private.matrix_watchdog_should_call(p_now);
  v_completed_at timestamptz;
begin
  -- Record skipped ticks without rewriting the last completed observation.
  select updated_at into v_completed_at from private.admin_watchdog_status where id = true;
  insert into private.admin_watchdog_schedule as current (id, checked_at, due, pending_since)
  values (true, p_now, v_due, case when v_due then p_now else null end)
  on conflict (id) do update set
    checked_at = excluded.checked_at,
    due = excluded.due,
    pending_since = case
      when current.pending_since is not null and (v_completed_at is null or v_completed_at < current.pending_since)
        then current.pending_since
      when excluded.due then excluded.checked_at
      else null
    end;

  if not v_due then
    return null;
  end if;

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

revoke all on function private.matrix_admin_watchdog_http_tick(timestamptz)
  from public, anon, authenticated, service_role;

-- A report cannot supply its own scheduler evidence. Only the cron-owned row can.
create or replace function public.admin_watchdog_status_read()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select (s.status - 'schedule') || pg_catalog.jsonb_build_object('id', 'singleton')
    || case when t.id is null then '{}'::jsonb else pg_catalog.jsonb_build_object(
      'schedule', pg_catalog.jsonb_build_object(
        'checkedAt', t.checked_at,
        'due', t.due,
        'pendingSince', case when s.updated_at >= t.pending_since then null else t.pending_since end
      )
    ) end
  from private.admin_watchdog_status s
  left join private.admin_watchdog_schedule t on t.id = s.id
  where s.id = true;
$$;
revoke all on function public.admin_watchdog_status_read() from public, anon, authenticated;
grant execute on function public.admin_watchdog_status_read() to service_role;

commit;
