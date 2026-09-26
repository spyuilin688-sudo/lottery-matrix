-- Read-only summary for the already-authorized admin member page.
-- Keep the existing inclusive start boundary and clamp each session before summing.
create function public.admin_member_online_summary(p_member_ids uuid[], p_since timestamptz)
returns table(member_id uuid, online_seconds bigint)
language sql stable security invoker set search_path = ''
as $$
  select sessions.member_id, sum(greatest(coalesce(sessions.online_seconds, 0), 0))::bigint
  from public.member_online_sessions as sessions
  where sessions.member_id = any(p_member_ids)
    and sessions.started_at >= p_since
  group by sessions.member_id
$$;

revoke all on function public.admin_member_online_summary(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.admin_member_online_summary(uuid[], timestamptz) to service_role;
