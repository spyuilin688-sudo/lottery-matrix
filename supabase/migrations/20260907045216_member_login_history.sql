create schema if not exists matrix_private;
revoke all on schema matrix_private from public, anon, authenticated;

create table public.member_login_records (
  id uuid primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  login_at timestamptz not null,
  login_ip inet,
  last_connection_ip inet,
  last_connection_at timestamptz not null,
  historical boolean not null default false
);
create index member_login_records_user_time_idx on public.member_login_records(auth_user_id, login_at desc, id desc);
create index member_login_records_connection_idx on public.member_login_records(auth_user_id, last_connection_at desc, id desc);
alter table public.member_login_records enable row level security;
revoke all on public.member_login_records from public, anon, authenticated;
grant select, insert, update, delete on public.member_login_records to service_role;

create table public.member_ip_locations (
  ip inet primary key,
  country_code text,
  city text,
  checked_at timestamptz not null default now()
);
alter table public.member_ip_locations enable row level security;
revoke all on public.member_ip_locations from public, anon, authenticated;
grant select, insert, update, delete on public.member_ip_locations to service_role;

create or replace function matrix_private.capture_member_login()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.member_login_records(id, auth_user_id, login_at, login_ip, last_connection_ip, last_connection_at)
  values (new.id, new.user_id, coalesce(new.created_at, now()), new.ip, new.ip, coalesce(new.updated_at, new.created_at, now()))
  on conflict (id) do update set
    login_ip = case when member_login_records.historical then member_login_records.login_ip else coalesce(member_login_records.login_ip, excluded.login_ip) end,
    last_connection_ip = excluded.last_connection_ip,
    last_connection_at = greatest(member_login_records.last_connection_at, excluded.last_connection_at);
  return new;
exception when others then
  -- Observability must never prevent a member from authenticating.
  raise warning 'member_login_capture_failed [%]', sqlstate;
  return new;
end;
$$;
revoke all on function matrix_private.capture_member_login() from public, anon, authenticated;
create trigger matrix_capture_member_login after insert or update of ip, updated_at on auth.sessions
for each row execute function matrix_private.capture_member_login();

-- Existing session IPs may have changed since the original login.
insert into public.member_login_records(id, auth_user_id, login_at, login_ip, last_connection_ip, last_connection_at, historical)
select id, user_id, coalesce(created_at, now()), null, ip, coalesce(updated_at, created_at, now()), true from auth.sessions
on conflict (id) do nothing;

create view public.member_latest_connections with (security_invoker = true) as
select distinct on (auth_user_id) auth_user_id, last_connection_ip, last_connection_at
from public.member_login_records order by auth_user_id, last_connection_at desc, id desc;
revoke all on public.member_latest_connections from public, anon, authenticated;
grant select on public.member_latest_connections to service_role;
