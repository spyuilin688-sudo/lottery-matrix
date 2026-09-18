alter table public.members
  add column if not exists last_online_at timestamptz,
  add column if not exists total_online_seconds bigint not null default 0,
  add column if not exists online_session_count bigint not null default 0;

create table if not exists public.member_online_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  online_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists member_online_sessions_member_started_idx
  on public.member_online_sessions(member_id, started_at desc);

alter table public.member_online_sessions enable row level security;
revoke all on table public.member_online_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.member_online_sessions to service_role;

create or replace function public.record_member_online_start(
  p_member_id uuid,
  p_now timestamptz
)
returns table(session_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
begin
  insert into public.member_online_sessions(member_id, started_at)
  values (p_member_id, p_now)
  returning id into v_session_id;

  update public.members
  set last_online_at = p_now
  where id = p_member_id;

  return query select v_session_id;
end;
$$;

create or replace function public.record_member_online_end(
  p_member_id uuid,
  p_session_id uuid,
  p_now timestamptz
)
returns table(online_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_started_at timestamptz;
  v_existing_seconds integer;
  v_online_seconds integer;
begin
  select started_at, member_online_sessions.online_seconds
  into v_started_at, v_existing_seconds
  from public.member_online_sessions
  where id = p_session_id and member_id = p_member_id
  for update;

  if not found then
    raise exception 'MEMBER_ONLINE_SESSION_NOT_FOUND';
  end if;

  if v_existing_seconds is not null then
    return query select v_existing_seconds;
    return;
  end if;

  v_online_seconds := greatest(0, floor(extract(epoch from p_now - v_started_at)))::integer;

  update public.member_online_sessions
  set ended_at = p_now, online_seconds = v_online_seconds
  where id = p_session_id;

  update public.members
  set last_online_at = p_now,
      total_online_seconds = total_online_seconds + v_online_seconds,
      online_session_count = online_session_count + 1
  where id = p_member_id;

  return query select v_online_seconds;
end;
$$;

revoke execute on function public.record_member_online_start(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_member_online_end(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_member_online_start(uuid, timestamptz) to service_role;
grant execute on function public.record_member_online_end(uuid, uuid, timestamptz) to service_role;
