create schema if not exists private;

create table if not exists private.admin_watchdog_status (
  id boolean primary key default true check (id),
  status jsonb not null,
  updated_at timestamptz not null default now()
);

revoke all on table private.admin_watchdog_status from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on table private.admin_watchdog_status to service_role;

create or replace function public.admin_watchdog_status_read()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select status || jsonb_build_object('id', 'singleton')
  from private.admin_watchdog_status where id = true;
$$;

create or replace function public.admin_watchdog_status_write(p_status jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_status is null or jsonb_typeof(p_status) <> 'object'
    or octet_length(p_status::text) > 16384
    or coalesce(p_status->>'status', '') not in ('ok', 'degraded') then
    raise exception 'INVALID_WATCHDOG_STATUS' using errcode = '22023';
  end if;
  insert into private.admin_watchdog_status(id, status, updated_at)
    values (true, p_status - 'id', now())
  on conflict (id) do update set status = excluded.status, updated_at = excluded.updated_at;
  return true;
end;
$$;

revoke all on function public.admin_watchdog_status_read() from public, anon, authenticated;
revoke all on function public.admin_watchdog_status_write(jsonb) from public, anon, authenticated;
grant execute on function public.admin_watchdog_status_read() to service_role;
grant execute on function public.admin_watchdog_status_write(jsonb) to service_role;
