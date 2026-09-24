begin;

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
        select payment.id, payment.plan_id, payment.paid_at, plan.duration_days
        from public.payments as payment
        left join public.plans as plan on plan.id = payment.plan_id
        where payment.member_id = v_member_id and payment.status = 'confirmed'
        order by payment.paid_at, payment.id
      loop
        if v_purchase.paid_at is null
          or v_purchase.duration_days is null or v_purchase.duration_days <= 0 then
          raise exception using errcode = 'PT409', message = 'PAYMENT_ENTITLEMENT_CONFLICT';
        end if;
        v_expected_started_at := coalesce(v_expected_started_at, v_purchase.paid_at);
        v_expected_expires_at := greatest(
          v_purchase.paid_at, coalesce(v_expected_expires_at, v_purchase.paid_at)
        ) + pg_catalog.make_interval(days => v_purchase.duration_days);
        v_expected_plan_id := v_purchase.plan_id;

        if v_purchase.id <> p_payment_id then
          v_remaining_started_at := coalesce(v_remaining_started_at, v_purchase.paid_at);
          v_remaining_expires_at := greatest(
            v_purchase.paid_at, coalesce(v_remaining_expires_at, v_purchase.paid_at)
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

revoke all on function public.admin_record_payment_reversal(uuid,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.admin_record_payment_reversal(uuid,text,text,uuid,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
