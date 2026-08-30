begin;

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
        'status', request.status
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

drop trigger if exists skip_super_admin_audit_logs on public.audit_logs;

notify pgrst, 'reload schema';

commit;
