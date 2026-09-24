begin;

-- Receipt time and entitlement application time differ for manual transfers.
-- Keep receipts immutable, and persist the existing member revision to retain
-- the serialized grant order without changing any entitlement calculation.
alter table public.payments
  add column entitlement_granted_at timestamptz,
  add column entitlement_revision bigint,
  add constraint payments_entitlement_evidence_check check (
    (entitlement_granted_at is null and entitlement_revision is null)
    or (entitlement_granted_at is not null and entitlement_revision is not null and entitlement_revision > 0)
  );
create unique index payments_member_entitlement_revision_unique
  on public.payments(member_id, entitlement_revision)
  where entitlement_revision is not null;

create or replace function public.ecpay_payment_confirm(
  p_merchant_trade_no text, p_merchant_id text, p_trade_no text, p_amount integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.ecpay_orders%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_target_rank integer;
  v_current_rank integer;
  v_refund_required boolean;
  v_status text;
  v_now timestamptz := pg_catalog.now();
begin
  if p_trade_no is null or p_trade_no !~ '^[A-Za-z0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_TRADE';
  end if;
  select * into v_order from public.ecpay_orders
  where merchant_trade_no = p_merchant_trade_no for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.merchant_id is distinct from p_merchant_id or v_order.amount is distinct from p_amount then
    raise exception using errcode = 'P0001', message = 'ORDER_MISMATCH';
  end if;
  if v_order.status in ('confirmed', 'refund_required') then
    if v_order.trade_no is distinct from p_trade_no then
      raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('orderId',v_order.id,'status',v_order.status);
  end if;

  select * into v_member from public.members where id = v_order.member_id for update;
  select duration_days, case name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
  into v_duration, v_target_rank from public.plans where id = v_order.plan_id;
  if v_member.id is null or v_duration is null then
    raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
  end if;
  select case name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
  into v_current_rank from public.plans where id = v_member.current_plan_id;
  v_refund_required := coalesce(v_member.is_lifetime, false)
    or (v_member.plan_expires_at > v_now and coalesce(v_current_rank, 0) > v_target_rank);
  v_status := case when v_refund_required then 'refund_required' else 'confirmed' end;
  update public.ecpay_orders set status=v_status,trade_no=p_trade_no,paid_at=v_now
  where id=v_order.id;
  insert into public.payments(
    member_id,plan_id,ecpay_order_id,amount,paid_at,status,
    entitlement_granted_at,entitlement_revision
  ) values (
    v_order.member_id,v_order.plan_id,v_order.id,v_order.amount,v_now,v_status,
    case when not v_refund_required then v_now end,
    case when not v_refund_required then v_member.subscription_revision + 1 end
  );
  if not v_refund_required then
    update public.members set
    current_plan_id=v_order.plan_id,
    plan_started_at=coalesce(v_member.plan_started_at,v_now),
    plan_expires_at=greatest(v_now,coalesce(v_member.plan_expires_at,v_now))
      + pg_catalog.make_interval(days => v_duration),
    is_lifetime=false,
    auto_renew=false
  where id=v_order.member_id;
  end if;
  return pg_catalog.jsonb_build_object('orderId',v_order.id,'status',v_status);
end;
$$;

create or replace function public.admin_review_transfer_request(
  p_transfer_id uuid,
  p_decision text,
  p_now timestamp with time zone,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.transfer_requests%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_target_rank integer;
  v_current_rank integer;
  v_refund_required boolean := false;
  v_request_after jsonb;
  v_member_after jsonb;
begin
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
  returning pg_catalog.to_jsonb(transfer_requests) into v_request_after;

  if p_decision = 'confirmed' then
    select * into v_member
    from public.members
    where id = v_request.member_id
    for update;

    select duration_days, case name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
    into v_duration, v_target_rank from public.plans where id = v_request.plan_id;
    if v_member.id is null or v_duration is null then
      raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
    end if;

    select case name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
    into v_current_rank from public.plans where id = v_member.current_plan_id;
    v_refund_required := coalesce(v_member.is_lifetime, false)
      or (v_member.plan_expires_at > pg_catalog.now() and coalesce(v_current_rank, 0) > v_target_rank);

    insert into public.payments (
      member_id,
      plan_id,
      transfer_request_id,
      amount,
      paid_at,
      status,
      entitlement_granted_at,
      entitlement_revision
    ) values (
      v_request.member_id,
      v_request.plan_id,
      v_request.id,
      v_request.amount,
      coalesce(v_request.transferred_at, p_now),
      case when v_refund_required then 'refund_required' else 'confirmed' end,
      case when not v_refund_required then p_now end,
      case when not v_refund_required then v_member.subscription_revision + 1 end
    );

    if not v_refund_required then
    update public.members
    set current_plan_id = v_request.plan_id,
        plan_started_at = coalesce(v_member.plan_started_at, p_now),
        plan_expires_at = greatest(
          p_now,
          coalesce(v_member.plan_expires_at, p_now)
        ) + pg_catalog.make_interval(days => v_duration),
        is_lifetime = false,
        auto_renew = false
    where id = v_request.member_id
    returning pg_catalog.to_jsonb(members) into v_member_after;

    insert into public.audit_logs (
      admin_id,
      admin,
      operation_type,
      target_table,
      target_id,
      content,
      before_data,
      after_data
    ) values (
      p_actor_id,
      p_actor_name,
      '修改',
      'members',
      v_request.member_id::text,
      '手動轉帳確認並開通或續訂方案',
      pg_catalog.to_jsonb(v_member),
      v_member_after
    );
    end if;
  end if;

  insert into public.audit_logs (
    admin_id,
    admin,
    operation_type,
    target_table,
    target_id,
    content,
    before_data,
    after_data
  ) values (
    p_actor_id,
    p_actor_name,
    '審核',
    'transfer_requests',
    p_transfer_id::text,
    case when p_decision = 'rejected' then '拒絕轉帳申請'
         when v_refund_required then '確認已收款，但會員權限已升級；需退款處理'
         else '確認轉帳申請' end,
    pg_catalog.to_jsonb(v_request),
    v_request_after
  );

  return v_request_after;
end;
$$;

create or replace function public.admin_record_payment_reversal(
  p_payment_id uuid,
  p_status text,
  p_reason text,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.admin_accounts%rowtype;
  v_member_id uuid;
  v_member public.members%rowtype;
  v_payment public.payments%rowtype;
  v_payment_after jsonb;
  v_purchase record;
  v_expected_plan_id uuid;
  v_expected_started_at timestamptz;
  v_expected_expires_at timestamptz;
  v_remaining_plan_id uuid;
  v_remaining_started_at timestamptz;
  v_remaining_expires_at timestamptz;
  v_reason text := nullif(pg_catalog.btrim(p_reason, E' \t\n\r\f\v'), '');
  v_actor_name text := nullif(pg_catalog.btrim(p_actor_name), '');
  v_referral_code text;
  v_referral_success_count integer := 0;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    pg_catalog.current_setting('request.jwt.claim.role', true), ''
  ) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;
  if p_payment_id is null then
    raise exception using errcode = '22023', message = 'PAYMENT_ID_REQUIRED';
  end if;
  if p_status is null or p_status not in ('refunded', 'chargeback', 'cancelled') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_REVERSAL_STATUS';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'PAYMENT_REVERSAL_REASON_REQUIRED';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PAYMENT_REVERSAL_REASON_TOO_LONG';
  end if;
  if p_actor_id is null or v_actor_name is null then
    raise exception using errcode = '22023', message = 'PAYMENT_REVERSAL_ACTOR_REQUIRED';
  end if;

  select * into v_actor
  from public.admin_accounts as account
  where account.id = p_actor_id
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'ADMIN_ACTOR_NOT_FOUND';
  end if;
  if v_actor.role is distinct from '超級管理員' or v_actor.status is distinct from '啟用' then
    raise exception using errcode = '42501', message = 'PAYMENT_REVERSAL_FORBIDDEN';
  end if;

  -- Payment confirmations and subscription edits lock the member first.
  -- Follow that order so a concurrent purchase cannot change the replay while it runs.
  select payment.member_id into v_member_id
  from public.payments as payment
  where payment.id = p_payment_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;
  select * into v_member
  from public.members as member
  where member.id = v_member_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
  end if;
  select * into v_payment
  from public.payments as payment
  where payment.id = p_payment_id
  for update;
  if not found or v_payment.member_id is distinct from v_member_id then
    raise exception using errcode = 'PT409', message = 'PAYMENT_ENTITLEMENT_CONFLICT';
  end if;

  if v_payment.status = p_status then
    v_payment_after := pg_catalog.to_jsonb(v_payment);
  elsif v_payment.status in ('refunded', 'chargeback', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_REVERSAL_CONFLICT';
  elsif v_payment.status not in ('confirmed', 'refund_required') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_NOT_CONFIRMED';
  else
    if v_payment.status = 'confirmed' then
      for v_purchase in
        select payment.id, payment.plan_id, payment.paid_at, plan.duration_days,
          payment.entitlement_revision,
          case
            when payment.entitlement_granted_at is not null
              and payment.entitlement_revision <= v_member.subscription_revision
              then payment.entitlement_granted_at
            -- Existing ECPay confirmation used the same database timestamp for
            -- receipt and grant. Only an exact linked order proves that contract.
            when payment.entitlement_granted_at is null
              and payment.entitlement_revision is null
              and payment.transfer_request_id is null
              and orders.status = 'confirmed'
              and orders.member_id = payment.member_id
              and orders.plan_id = payment.plan_id
              and orders.amount = payment.amount
              and orders.paid_at = payment.paid_at
              then payment.paid_at
          end as granted_at,
          count(*) filter (where payment.entitlement_revision is null)
            over (partition by payment.paid_at) as legacy_time_count
        from public.payments as payment
        left join public.plans as plan on plan.id = payment.plan_id
        left join public.ecpay_orders as orders on orders.id = payment.ecpay_order_id
        where payment.member_id = v_member_id and payment.status = 'confirmed'
        -- Old matched ECPay grants predate this migration. New grants follow the
        -- member-lock application order even if captured timestamps arrive late.
        order by payment.entitlement_revision nulls first, payment.paid_at, payment.id
      loop
        if v_purchase.paid_at is null or v_purchase.granted_at is null
          or (v_purchase.entitlement_revision is null and v_purchase.legacy_time_count <> 1)
          or v_purchase.duration_days is null or v_purchase.duration_days <= 0 then
          raise exception using errcode = 'PT409', message = 'PAYMENT_ENTITLEMENT_CONFLICT';
        end if;
        v_expected_started_at := coalesce(v_expected_started_at, v_purchase.granted_at);
        v_expected_expires_at := greatest(
          v_purchase.granted_at, coalesce(v_expected_expires_at, v_purchase.granted_at)
        ) + pg_catalog.make_interval(days => v_purchase.duration_days);
        v_expected_plan_id := v_purchase.plan_id;

        if v_purchase.id <> p_payment_id then
          v_remaining_started_at := coalesce(v_remaining_started_at, v_purchase.granted_at);
          v_remaining_expires_at := greatest(
            v_purchase.granted_at, coalesce(v_remaining_expires_at, v_purchase.granted_at)
          ) + pg_catalog.make_interval(days => v_purchase.duration_days);
          v_remaining_plan_id := v_purchase.plan_id;
        end if;
      end loop;

      if v_member.current_plan_id is distinct from v_expected_plan_id
        or v_member.plan_started_at is distinct from v_expected_started_at
        or v_member.plan_expires_at is distinct from v_expected_expires_at
        or v_member.is_lifetime is distinct from false
        or v_member.auto_renew is distinct from false then
        raise exception using errcode = 'PT409', message = 'PAYMENT_ENTITLEMENT_CONFLICT';
      end if;

      update public.members
      set current_plan_id = v_remaining_plan_id,
          plan_started_at = v_remaining_started_at,
          plan_expires_at = v_remaining_expires_at,
          is_lifetime = false,
          auto_renew = false
      where id = v_member_id;
    end if;

    update public.payments
    set status = p_status,
        reversed_at = pg_catalog.now(),
        reversal_reason = v_reason,
        reversed_by = p_actor_id,
        reversed_by_name = v_actor_name
    where id = p_payment_id
    returning pg_catalog.to_jsonb(payments) into v_payment_after;

    insert into public.audit_logs (
      admin_id, admin, operation_type, target_table, target_id,
      content, before_data, after_data
    ) values (
      p_actor_id, v_actor_name, '沖銷', 'payments', p_payment_id::text,
      case p_status
        when 'refunded' then '記錄已完成退款'
        when 'chargeback' then '記錄已完成刷退'
        else '記錄已完成交易取消'
      end,
      pg_catalog.to_jsonb(v_payment), v_payment_after
    );
  end if;

  select pg_catalog.upper(pg_catalog.btrim(member.invitation_code))
  into v_referral_code
  from public.members as member
  where member.id = v_member_id;

  if nullif(v_referral_code, '') is not null then
    select pg_catalog.count(distinct invited.id)::integer
    into v_referral_success_count
    from public.members as invited
    where pg_catalog.upper(pg_catalog.btrim(invited.invitation_code)) = v_referral_code
      and exists (
        select 1 from public.payments as payment
        where payment.member_id = invited.id and payment.status = 'confirmed'
      );
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_payment_after->>'id',
    'memberId', v_payment_after->>'member_id',
    'status', v_payment_after->>'status',
    'reversedAt', v_payment_after->>'reversed_at',
    'reversalReason', v_payment_after->>'reversal_reason',
    'reversedBy', v_payment_after->>'reversed_by',
    'reversedByName', v_payment_after->>'reversed_by_name',
    'referralSuccessCount', v_referral_success_count
  );
end;
$$;

revoke all on function public.ecpay_payment_confirm(text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.ecpay_payment_confirm(text,text,text,integer) to service_role;
revoke all on function public.admin_review_transfer_request(uuid,text,timestamptz,uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_review_transfer_request(uuid,text,timestamptz,uuid,text) to service_role;
revoke all on function public.admin_record_payment_reversal(uuid,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_record_payment_reversal(uuid,text,text,uuid,text) to service_role;

notify pgrst, 'reload schema';
commit;
