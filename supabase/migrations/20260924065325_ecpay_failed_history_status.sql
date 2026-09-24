begin;

-- A signed provider failure releases its reservation without changing the
-- order's pending state. Project that verified result into the member history.
create or replace function public.member_payment_history_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_member_id uuid;
  v_history jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select member.id into v_member_id from public.members as member
  where member.auth_user_id = (select auth.uid());
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'MEMBER_REQUIRED';
  end if;

  select coalesce(pg_catalog.jsonb_agg(entry.item order by entry.recorded_at desc), '[]'::jsonb)
    into v_history
  from (
    select request.submitted_at as recorded_at,
      pg_catalog.jsonb_build_object(
        'id',request.id,'planName',plan.name,'amount',request.amount,
        'accountLastFive',request.account_last_five,'submittedAt',request.submitted_at,
        'paidAt',payment.paid_at,
        'status',case when payment.status in ('refunded','chargeback','cancelled','refund_required')
          then payment.status else request.status end
      ) as item
    from public.transfer_requests as request
    join public.plans as plan on plan.id=request.plan_id
    left join public.payments as payment on payment.transfer_request_id=request.id
    where request.member_id=v_member_id
    union all
    select orders.created_at as recorded_at,
      pg_catalog.jsonb_build_object(
        'id',orders.id,'planName',plan.name,'amount',orders.amount,
        'accountLastFive',null,'submittedAt',orders.created_at,
        'paidAt',payment.paid_at,
        'status',case
          when payment.status in ('refunded','chargeback','cancelled','refund_required')
            then payment.status
          when orders.status='pending' and orders.quota_state='released'
            and orders.quota_provider_status='10200095' then 'failed'
          else orders.status end
      ) as item
    from public.ecpay_orders as orders
    join public.plans as plan on plan.id=orders.plan_id
    left join public.payments as payment on payment.ecpay_order_id=orders.id
    where orders.member_id=v_member_id
  ) as entry;
  return v_history;
end;
$$;

revoke all on function public.member_payment_history_get() from public, anon;
grant execute on function public.member_payment_history_get() to authenticated;
notify pgrst, 'reload schema';
commit;
