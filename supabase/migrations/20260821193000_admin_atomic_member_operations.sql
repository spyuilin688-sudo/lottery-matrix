alter table public.payments
  add column if not exists transfer_request_id uuid references public.transfer_requests(id);

create unique index if not exists payments_transfer_request_id_unique
  on public.payments (transfer_request_id)
  where transfer_request_id is not null;

create or replace function public.admin_set_member_status(
  p_member_id uuid,
  p_status text,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if p_status not in ('active', 'disabled') then raise exception '會員狀態不正確'; end if;
  select to_jsonb(m) into v_before from public.members m where m.id = p_member_id for update;
  if v_before is null then raise exception '會員不存在'; end if;
  update public.members set status = p_status where id = p_member_id returning to_jsonb(members) into v_after;
  insert into public.audit_logs(admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data)
  values (p_actor_id, p_actor_name, '修改', 'members', p_member_id::text,
    case when p_status = 'disabled' then '停用會員帳號' else '啟用會員帳號' end, v_before, v_after);
  return v_after;
end;
$$;

create or replace function public.admin_update_subscription(
  p_member_id uuid,
  p_action text,
  p_plan_id uuid,
  p_expires_at timestamptz,
  p_now timestamptz,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_duration integer;
  v_after jsonb;
  v_base timestamptz;
begin
  if p_action not in ('activate', 'renew', 'cancel', 'adjustExpiry', 'lifetime') then raise exception '訂閱操作不正確'; end if;
  select * into v_member from public.members where id = p_member_id for update;
  if not found then raise exception '會員不存在'; end if;

  if p_action = 'cancel' then
    update public.members set auto_renew = false where id = p_member_id returning to_jsonb(members) into v_after;
  elsif p_action = 'lifetime' then
    update public.members set plan_expires_at = null, is_lifetime = true, auto_renew = false where id = p_member_id returning to_jsonb(members) into v_after;
  elsif p_action = 'adjustExpiry' then
    if p_expires_at is null then raise exception '到期時間不正確'; end if;
    update public.members set plan_expires_at = p_expires_at, is_lifetime = false where id = p_member_id returning to_jsonb(members) into v_after;
  else
    select duration_days into v_duration from public.plans where id = p_plan_id;
    if v_duration is null or v_duration <= 0 then raise exception '訂閱方案不正確'; end if;
    v_base := case when p_action = 'renew' then greatest(p_now, coalesce(v_member.plan_expires_at, p_now)) else p_now end;
    update public.members
      set current_plan_id = p_plan_id,
          plan_started_at = case when p_action = 'activate' then p_now else coalesce(v_member.plan_started_at, p_now) end,
          plan_expires_at = v_base + make_interval(days => v_duration),
          is_lifetime = false,
          auto_renew = true
      where id = p_member_id
      returning to_jsonb(members) into v_after;
  end if;

  insert into public.audit_logs(admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data)
  values (p_actor_id, p_actor_name, '修改', 'members', p_member_id::text, '訂閱操作：' || p_action, to_jsonb(v_member), v_after);
  return v_after;
end;
$$;

create or replace function public.admin_review_transfer_request(
  p_transfer_id uuid,
  p_decision text,
  p_now timestamptz,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_request public.transfer_requests%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_after jsonb;
  v_member_after jsonb;
begin
  if p_decision not in ('confirmed', 'rejected') then raise exception '審核結果不正確'; end if;
  select * into v_request from public.transfer_requests where id = p_transfer_id for update;
  if not found then raise exception '轉帳申請不存在'; end if;
  if v_request.status <> 'pending' then raise exception '此轉帳申請已完成審核'; end if;

  update public.transfer_requests set status = p_decision where id = p_transfer_id returning to_jsonb(transfer_requests) into v_after;
  if p_decision = 'confirmed' then
    select * into v_member from public.members where id = v_request.member_id for update;
    select duration_days into v_duration from public.plans where id = v_request.plan_id;
    if v_member.id is null or v_duration is null then raise exception '會員或方案不存在'; end if;
    insert into public.payments(member_id, plan_id, transfer_request_id, amount, paid_at, status)
    values (v_request.member_id, v_request.plan_id, v_request.id, v_request.amount, coalesce(v_request.transferred_at, p_now), 'confirmed');
    update public.members
      set current_plan_id = v_request.plan_id,
          plan_started_at = coalesce(v_member.plan_started_at, p_now),
          plan_expires_at = greatest(p_now, coalesce(v_member.plan_expires_at, p_now)) + make_interval(days => v_duration),
          is_lifetime = false,
          auto_renew = true
      where id = v_request.member_id
      returning to_jsonb(members) into v_member_after;
    insert into public.audit_logs(admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data)
    values (p_actor_id, p_actor_name, '修改', 'members', v_request.member_id::text, '轉帳確認並續訂方案', to_jsonb(v_member), v_member_after);
  end if;
  insert into public.audit_logs(admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data)
  values (p_actor_id, p_actor_name, '審核', 'transfer_requests', p_transfer_id::text,
    case when p_decision = 'confirmed' then '確認轉帳申請' else '拒絕轉帳申請' end, to_jsonb(v_request), v_after);
  return v_after;
end;
$$;

revoke all on function public.admin_set_member_status(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_update_subscription(uuid, text, uuid, timestamptz, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_review_transfer_request(uuid, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_member_status(uuid, text, uuid, text) to service_role;
grant execute on function public.admin_update_subscription(uuid, text, uuid, timestamptz, timestamptz, uuid, text) to service_role;
grant execute on function public.admin_review_transfer_request(uuid, text, timestamptz, uuid, text) to service_role;
