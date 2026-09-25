create or replace function public.admin_delete_activation_code(
  p_code_id uuid,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before jsonb;
  v_actor_role text;
  v_member_id uuid;
  v_locked_member_id uuid;
  v_member_before public.members%rowtype;
  v_member_after public.members%rowtype;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;

  select activation_code.redeemed_by_member_id
  into v_member_id
  from public.activation_codes as activation_code
  where activation_code.id = p_code_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACTIVATION_CODE_NOT_FOUND';
  end if;

  if v_member_id is not null then
    select member.*
    into v_member_before
    from public.members as member
    where member.id = v_member_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_REDEEMED_MEMBER_NOT_FOUND';
    end if;
  end if;

  select
    pg_catalog.to_jsonb(activation_code),
    activation_code.redeemed_by_member_id
  into v_before, v_locked_member_id
  from public.activation_codes as activation_code
  where activation_code.id = p_code_id
  for update;

  if v_before is null then
    raise exception using errcode = 'P0002', message = 'ACTIVATION_CODE_NOT_FOUND';
  end if;

  if v_locked_member_id is not null and v_member_id is null then
    select member.*
    into v_member_before
    from public.members as member
    where member.id = v_locked_member_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_REDEEMED_MEMBER_NOT_FOUND';
    end if;
    v_member_id := v_locked_member_id;
  elsif v_locked_member_id is distinct from v_member_id then
    raise exception using errcode = 'P0001', message = 'ACTIVATION_CODE_REDEMPTION_CHANGED';
  end if;

  select admin_account.role
  into v_actor_role
  from public.admin_accounts as admin_account
  where admin_account.id = p_actor_id
    and admin_account.status = '啟用';

  if v_before ->> 'status' = 'used'
     or v_before ->> 'redeemed_at' is not null
     or v_locked_member_id is not null then
    if v_actor_role is distinct from '超級管理員' then
      raise exception using
        errcode = '42501',
        message = 'REDEEMED_ACTIVATION_CODE_DELETE_FORBIDDEN';
    end if;
  end if;

  delete from public.activation_codes
  where id = p_code_id;

  if v_member_id is not null then
    select member.*
    into v_member_after
    from public.members as member
    where member.id = v_member_id;

    if not found
       or row(
         v_member_after.current_plan_id,
         v_member_after.plan_started_at,
         v_member_after.plan_expires_at,
         v_member_after.is_lifetime,
         v_member_after.auto_renew,
         v_member_after.subscription_revision
       ) is distinct from row(
         v_member_before.current_plan_id,
         v_member_before.plan_started_at,
         v_member_before.plan_expires_at,
         v_member_before.is_lifetime,
         v_member_before.auto_renew,
         v_member_before.subscription_revision
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'ACTIVATION_CODE_DELETE_ENTITLEMENT_CHANGED';
    end if;
  end if;

  if v_actor_role is distinct from '超級管理員' then
    insert into public.audit_logs (
      admin_id,
      admin,
      operation_type,
      target_table,
      target_id,
      content,
      before_data
    ) values (
      p_actor_id,
      p_actor_name,
      '刪除',
      'activation_codes',
      p_code_id::text,
      '刪除啟動碼',
      v_before
    );
  end if;

  return pg_catalog.jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.admin_delete_activation_code(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_delete_activation_code(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
