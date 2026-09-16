create or replace function public.member_profile_20260829_impl()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select pg_catalog.jsonb_build_object(
    'memberId', m.id,
    'lineUserId', m.line_user_id,
    'status', m.status,
    'planName', coalesce(plan.name, '免費會員'),
    'planExpiresAt', m.plan_expires_at,
    'isLifetime', m.is_lifetime,
    'referralCode', m.referral_code,
    'realName', m.real_name,
    'gender', m.gender,
    'birthDate', m.birth_date,
    'phone', m.phone,
    'email', m.email,
    'address', m.address,
    'carrier', m.carrier,
    'bankLastFive', m.bank_last_five,
    'bankAccountName', m.bank_account_name
  )
  from public.members as m
  left join public.plans as plan on plan.id = m.current_plan_id
  where m.auth_user_id = auth.uid()
  limit 1
$function$;
