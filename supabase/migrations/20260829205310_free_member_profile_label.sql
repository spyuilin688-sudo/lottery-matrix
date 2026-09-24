create or replace function public.member_profile_20260829_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.active_member_id();
  v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'lineUserId', member.line_user_id,
    'planName', case
      when member.is_lifetime then '終身方案'
      else pg_catalog.coalesce(plan.name, '免費會員')
    end,
    'planExpiresAt', member.plan_expires_at,
    'isLifetime', member.is_lifetime
  ) into v_result
  from public.members as member
  left join public.plans as plan on plan.id = member.current_plan_id
  where member.id = v_member_id
  limit 1;

  if v_result is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_result;
end;
$$;

revoke all on function public.member_profile_20260829_impl() from public, anon, authenticated;
