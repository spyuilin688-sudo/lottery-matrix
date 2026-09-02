-- audit_logs.admin_id references admin_accounts.id, not auth.users.id.
-- Resolve the authenticated administrator through the canonical auth email
-- before writing either audit record.
begin;

create or replace function public.admin_transfer_request_review(
  p_transfer_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_account_id uuid;
  v_actor_name text;
  v_now timestamptz := pg_catalog.now();
  v_request public.transfer_requests%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_request_after jsonb;
  v_member_after jsonb;
begin
  if v_auth_user_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  select admin_account.id,
         coalesce(nullif(pg_catalog.btrim(admin_account.name), ''), '管理員')
    into v_actor_account_id, v_actor_name
  from auth.users as auth_user
  join public.admin_accounts as admin_account
    on pg_catalog.lower(admin_account.account) = pg_catalog.lower(auth_user.email)
  where auth_user.id = v_auth_user_id
  limit 1;
  if v_actor_account_id is null then
    raise exception using errcode = '42501', message = 'ADMIN_ACCOUNT_NOT_FOUND';
  end if;

  if p_decision not in ('confirmed', 'rejected') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_DECISION';
  end if;

  select * into v_request
  from public.transfer_requests
  where id = p_transfer_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TRANSFER_REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'TRANSFER_REQUEST_ALREADY_REVIEWED';
  end if;

  update public.transfer_requests
  set status = p_decision
  where id = p_transfer_id
  returning to_jsonb(transfer_requests) into v_request_after;

  if p_decision = 'confirmed' then
    select * into v_member
    from public.members
    where id = v_request.member_id
    for update;
    select duration_days into v_duration
    from public.plans
    where id = v_request.plan_id;
    if v_member.id is null or v_duration is null then
      raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
    end if;

    insert into public.payments (
      member_id, plan_id, transfer_request_id, amount, paid_at, status
    ) values (
      v_request.member_id, v_request.plan_id, v_request.id, v_request.amount, v_now, 'confirmed'
    );

    update public.members
    set current_plan_id = v_request.plan_id,
        plan_started_at = coalesce(v_member.plan_started_at, v_now),
        plan_expires_at = greatest(
          v_now,
          coalesce(v_member.plan_expires_at, v_now)
        ) + pg_catalog.make_interval(days => v_duration),
        is_lifetime = false,
        auto_renew = false
    where id = v_request.member_id
    returning to_jsonb(members) into v_member_after;

    insert into public.audit_logs (
      admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data
    ) values (
      v_actor_account_id, v_actor_name, '修改', 'members', v_request.member_id::text,
      '手動轉帳確認並開通或續訂方案', to_jsonb(v_member), v_member_after
    );
  end if;

  insert into public.audit_logs (
    admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data
  ) values (
    v_actor_account_id, v_actor_name, '審核', 'transfer_requests', p_transfer_id::text,
    case when p_decision = 'confirmed' then '確認轉帳申請' else '退回轉帳申請' end,
    to_jsonb(v_request), v_request_after
  );
  return v_request_after;
end;
$$;

revoke all on function public.admin_transfer_request_review(uuid, text) from public, anon;
grant execute on function public.admin_transfer_request_review(uuid, text) to authenticated;

commit;
