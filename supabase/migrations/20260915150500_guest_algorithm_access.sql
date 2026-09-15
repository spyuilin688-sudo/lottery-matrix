create or replace function private.matrix_result_entitlements()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan text := 'free';
  v_paid boolean := false;
  v_free_access boolean := false;
  v_referrals integer := 0;
  v_dow integer := extract(isodow from pg_catalog.timezone('Asia/Taipei', pg_catalog.now()));
begin
  -- The global free-access switch applies to visitors as well as registered members.
  -- Paid/member-specific entitlements below still require a real authenticated member.
  select registered_member_free_access into v_free_access
  from private.matrix_permission_settings where singleton;
  v_free_access := coalesce(v_free_access, false);

  if v_uid is not null then
    select * into v_member from public.members where auth_user_id = v_uid limit 1;
    if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
    if v_member.is_lifetime then
      v_plan := 'lifetime';
      v_paid := true;
    else
      select case plan.name
        when '試用方案' then 'trial'
        when '月費方案' then 'monthly'
        when '季費方案' then 'quarterly'
        when '年費方案' then 'yearly'
        else 'free'
      end into v_plan
      from public.plans as plan where plan.id = v_member.current_plan_id;
      v_plan := coalesce(v_plan, 'free');
      v_paid := v_plan <> 'free'
        and coalesce(v_member.plan_expires_at > pg_catalog.now(), false);
    end if;
    if coalesce(v_member.referral_code, '') <> '' then
      select pg_catalog.count(distinct invited.id)::integer into v_referrals
      from public.members as invited
      where invited.invitation_code = v_member.referral_code
        and exists (
          select 1 from public.payments as payment
          where payment.member_id = invited.id and payment.status = 'confirmed'
        );
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'canUseSeven', v_free_access or v_paid or v_referrals >= 15 or (v_uid is not null and nullif(pg_catalog.btrim(v_member.line_user_id), '') is not null and v_dow in (2, 5)) or (v_referrals >= 10 and v_dow in (1, 4)),
    'canUseThirteen', v_free_access or v_paid,
    'canUseFullRange', v_free_access or v_paid or v_referrals >= 50 or (v_referrals >= 30 and v_dow in (2, 5)),
    'canUseTianyan', v_free_access or (v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')) or coalesce(v_member.line_trial_started_at <= pg_catalog.now() and v_member.line_trial_started_at + interval '48 hours' > pg_catalog.now(), false),
    'canUseTiangong', v_free_access or (v_paid and v_plan in ('yearly', 'lifetime')) or coalesce(v_member.line_trial_started_at <= pg_catalog.now() and v_member.line_trial_started_at + interval '24 hours' > pg_catalog.now(), false),
    'canViewFullStatus', v_paid,
    'canCustomizeStatus', v_paid and v_plan <> 'trial',
    'canUseCompositeCustomRoad', v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')
  );
end;
$function$;

grant execute on function public.matrix_tianyan_list(jsonb) to anon;
grant execute on function public.matrix_tianyan_validation(jsonb) to anon;
grant execute on function public.matrix_tiangong_list(jsonb) to anon;
grant execute on function public.matrix_tiangong_validation(jsonb) to anon;
