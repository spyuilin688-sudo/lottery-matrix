begin;

alter table public.payments
  drop constraint payments_status_check;

alter table public.payments
  add column reversed_at timestamptz,
  add column reversal_reason text,
  add column reversed_by uuid,
  add column reversed_by_name text,
  add constraint payments_status_check
    check (status in ('pending', 'confirmed', 'rejected', 'refunded', 'chargeback', 'cancelled')),
  add constraint payments_reversal_metadata_check
    check (
      (
        status in ('refunded', 'chargeback', 'cancelled')
        and reversed_at is not null
        and reversal_reason is not null
        and nullif(pg_catalog.regexp_replace(reversal_reason, '[[:space:]]', '', 'g'), '') is not null
        and pg_catalog.char_length(reversal_reason) <= 500
        and reversed_by is not null
        and reversed_by_name is not null
        and nullif(pg_catalog.btrim(reversed_by_name), '') is not null
      )
      or
      (
        status not in ('refunded', 'chargeback', 'cancelled')
        and reversed_at is null
        and reversal_reason is null
        and reversed_by is null
        and reversed_by_name is null
      )
    );

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
  v_payment public.payments%rowtype;
  v_payment_after jsonb;
  v_reason text := nullif(pg_catalog.btrim(p_reason, E' \t\n\r\f\v'), '');
  v_actor_name text := nullif(pg_catalog.btrim(p_actor_name), '');
  v_referral_code text;
  v_referral_success_count integer := 0;
begin
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
  if not exists (
    select 1 from public.admin_accounts as admin_account
    where admin_account.id = p_actor_id
  ) then
    raise exception using errcode = 'P0002', message = 'ADMIN_ACTOR_NOT_FOUND';
  end if;

  select payment.*
  into v_payment
  from public.payments as payment
  where payment.id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = p_status then
    v_payment_after := pg_catalog.to_jsonb(v_payment);
  elsif v_payment.status in ('refunded', 'chargeback', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_REVERSAL_CONFLICT';
  elsif v_payment.status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'PAYMENT_NOT_CONFIRMED';
  else
    update public.payments
    set status = p_status,
        reversed_at = pg_catalog.now(),
        reversal_reason = v_reason,
        reversed_by = p_actor_id,
        reversed_by_name = v_actor_name
    where id = p_payment_id
    returning pg_catalog.to_jsonb(payments) into v_payment_after;

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
      v_actor_name,
      '沖銷',
      'payments',
      p_payment_id::text,
      case p_status
        when 'refunded' then '記錄已完成退款'
        when 'chargeback' then '記錄已完成刷退'
        else '記錄已完成交易取消'
      end,
      pg_catalog.to_jsonb(v_payment),
      v_payment_after
    );
  end if;

  select pg_catalog.upper(pg_catalog.btrim(member.invitation_code))
  into v_referral_code
  from public.members as member
  where member.id = v_payment.member_id;

  if nullif(v_referral_code, '') is not null then
    select pg_catalog.count(distinct invited.id)::integer
    into v_referral_success_count
    from public.members as invited
    where pg_catalog.upper(pg_catalog.btrim(invited.invitation_code)) = v_referral_code
      and exists (
        select 1
        from public.payments as payment
        where payment.member_id = invited.id
          and payment.status = 'confirmed'
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

revoke all on function public.admin_record_payment_reversal(
  uuid,
  text,
  text,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.admin_record_payment_reversal(
  uuid,
  text,
  text,
  uuid,
  text
) to service_role;

create or replace function public.member_payment_history_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_history jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select member.id into v_member_id
  from public.members as member
  where member.auth_user_id = (select auth.uid());

  if v_member_id is null then
    raise exception using errcode = '42501', message = 'MEMBER_REQUIRED';
  end if;

  select coalesce(jsonb_agg(entry.item order by entry.recorded_at desc), '[]'::jsonb)
  into v_history
  from (
    select request.submitted_at as recorded_at,
      jsonb_build_object(
        'id', request.id,
        'planName', plan.name,
        'amount', request.amount,
        'accountLastFive', request.account_last_five,
        'submittedAt', request.submitted_at,
        'paidAt', payment.paid_at,
        'status', case
          when payment.status in ('refunded', 'chargeback', 'cancelled') then payment.status
          else request.status
        end
      ) as item
    from public.transfer_requests as request
    join public.plans as plan on plan.id = request.plan_id
    left join public.payments as payment on payment.transfer_request_id = request.id
    where request.member_id = v_member_id
  ) as entry;

  return v_history;
end;
$$;

revoke all on function public.member_payment_history_get() from public, anon;
grant execute on function public.member_payment_history_get() to authenticated;

notify pgrst, 'reload schema';

commit;
