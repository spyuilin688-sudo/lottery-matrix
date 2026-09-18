begin;

create or replace function public.member_online_end_20260829_impl(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_started_at timestamptz;
  v_existing_seconds integer;
  v_online_seconds integer;
  v_now timestamptz := pg_catalog.now();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select id into v_member_id from public.members where auth_user_id = v_uid limit 1;
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  select started_at, online_seconds
    into v_started_at, v_existing_seconds
  from public.member_online_sessions
  where id = p_session_id and member_id = v_member_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'MEMBER_ONLINE_SESSION_NOT_FOUND';
  end if;
  if v_existing_seconds is not null then
    return pg_catalog.jsonb_build_object('onlineSeconds', v_existing_seconds);
  end if;
  v_online_seconds := greatest(
    0,
    pg_catalog.floor(extract(epoch from v_now - v_started_at))::integer
  );
  update public.member_online_sessions
    set ended_at = v_now, online_seconds = v_online_seconds
    where id = p_session_id;
  update public.members
    set last_online_at = v_now,
      total_online_seconds = total_online_seconds + v_online_seconds,
      online_session_count = online_session_count + 1
    where id = v_member_id;
  return pg_catalog.jsonb_build_object('onlineSeconds', v_online_seconds);
end;
$$;

create or replace function public.admin_transfer_request_review(
  p_transfer_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.now();
  v_request public.transfer_requests%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_request_after jsonb;
  v_member_after jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
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
      v_actor_id, '管理員', '修改', 'members', v_request.member_id::text,
      '手動轉帳確認並開通或續訂方案', to_jsonb(v_member), v_member_after
    );
  end if;

  insert into public.audit_logs (
    admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data
  ) values (
    v_actor_id, '管理員', '審核', 'transfer_requests', p_transfer_id::text,
    case when p_decision = 'confirmed' then '確認轉帳申請' else '退回轉帳申請' end,
    to_jsonb(v_request), v_request_after
  );
  return v_request_after;
end;
$$;

revoke all on function public.member_online_end_20260829_impl(uuid) from public, anon, authenticated;
revoke all on function public.member_online_start() from public, anon;
revoke all on function public.member_online_end(uuid) from public, anon;
grant execute on function public.member_online_start() to authenticated;
grant execute on function public.member_online_end(uuid) to authenticated;
grant execute on function public.admin_transfer_request_review(uuid, text) to authenticated;

commit;
