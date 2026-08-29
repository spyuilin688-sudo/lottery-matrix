create or replace function private.bootstrap_member_allowed()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if exists (
    select 1 from public.members
    where auth_user_id = v_uid
      and coalesce(status, '') in ('停用', 'disabled', 'inactive')
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
end;
$$;

create or replace function private.active_member_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select * into v_member from public.members where auth_user_id = v_uid limit 1;
  if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_member.id;
end;
$$;

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
      else coalesce(plan.name, '免費會員')
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

notify pgrst, 'reload schema';
