create table if not exists public.matrix_watchdog_leases (
  lease_key text primary key,
  owner_id text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint matrix_watchdog_leases_key_length
    check (char_length(lease_key) between 1 and 120),
  constraint matrix_watchdog_leases_owner_length
    check (char_length(owner_id) between 1 and 200)
);

comment on table public.matrix_watchdog_leases is
  'Short-lived cross-host idempotency leases for the independent Matrix watchdog.';

alter table public.matrix_watchdog_leases enable row level security;
revoke all on table public.matrix_watchdog_leases from anon, authenticated;
grant select, insert, update, delete on table public.matrix_watchdog_leases to service_role;

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
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at
  where public.matrix_watchdog_leases.expires_at <= now()
     or public.matrix_watchdog_leases.owner_id = excluded.owner_id;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_matrix_watchdog_lease(
  p_lease_key text,
  p_owner_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.matrix_watchdog_leases
  where lease_key = p_lease_key
    and owner_id = p_owner_id;
  return found;
end;
$$;

create or replace function public.renew_matrix_watchdog_lease(
  p_lease_key text,
  p_owner_id text,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ttl_seconds not between 60 and 3600 then
    raise exception 'INVALID_WATCHDOG_LEASE';
  end if;

  update public.matrix_watchdog_leases
  set expires_at = now() + make_interval(secs => p_ttl_seconds)
  where lease_key = p_lease_key
    and owner_id = p_owner_id;
  return found;
end;
$$;

revoke all on function public.claim_matrix_watchdog_lease(text, text, integer) from public;
revoke all on function public.release_matrix_watchdog_lease(text, text) from public;
revoke all on function public.renew_matrix_watchdog_lease(text, text, integer) from public;
grant execute on function public.claim_matrix_watchdog_lease(text, text, integer) to service_role;
grant execute on function public.release_matrix_watchdog_lease(text, text) to service_role;
grant execute on function public.renew_matrix_watchdog_lease(text, text, integer) to service_role;
