-- Paid or globally free members already have seven-period and full-range access.
-- Only aggregate confirmed referrals when they can affect the returned rights.

create or replace function private.matrix_result_entitlements_for_member(
  p_uid uuid,
  p_member public.members,
  p_plan_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_plan text := 'free';
  v_paid boolean := false;
  v_free_access boolean := false;
  v_line_registration_access boolean := false;
  v_referrals integer := 0;
  v_dow integer := extract(isodow from pg_catalog.timezone('Asia/Taipei', pg_catalog.now()));
begin
  if p_uid is not null then
    if p_member.id is null
      or coalesce(p_member.status, '') in ('停用', 'disabled', 'inactive') then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;

    select registered_member_free_access into v_free_access
    from private.matrix_permission_settings
    where singleton;
    v_free_access := coalesce(v_free_access, false);

    if coalesce(p_member.is_lifetime, false) then
      v_plan := 'lifetime';
      v_paid := true;
    else
      v_plan := case p_plan_name
        when '試用方案' then 'trial'
        when '月費方案' then 'monthly'
        when '季費方案' then 'quarterly'
        when '年費方案' then 'yearly'
        else 'free'
      end;
      v_paid := v_plan <> 'free'
        and coalesce(p_member.plan_expires_at > pg_catalog.now(), false);
    end if;

    v_line_registration_access := coalesce(
      p_member.line_trial_started_at <= pg_catalog.now()
      and p_member.line_trial_started_at + interval '48 hours' > pg_catalog.now(),
      false
    );

    if not v_paid and not v_free_access and coalesce(p_member.referral_code, '') <> '' then
      select pg_catalog.count(distinct invited.id)::integer
      into v_referrals
      from public.members as invited
      where invited.invitation_code = p_member.referral_code
        and exists (
          select 1
          from public.payments as payment
          where payment.member_id = invited.id
            and payment.status = 'confirmed'
        );
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'canUseSeven', v_free_access or v_paid or v_referrals >= 15
      or (p_uid is not null and private.member_login_perks_eligible(p_uid, p_member.line_user_id) and v_dow in (2, 5))
      or (v_referrals >= 10 and v_dow in (1, 4)),
    'canUseThirteen', v_free_access or v_paid or v_line_registration_access,
    'canUseFullRange', v_free_access or v_paid or v_referrals >= 50
      or (v_referrals >= 30 and v_dow in (2, 5))
      or v_line_registration_access,
    'canUseTianyan', v_free_access
      or (v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')),
    'canUseTiangong', v_free_access
      or (v_paid and v_plan in ('yearly', 'lifetime')),
    'canViewFullStatus', v_paid
  );
end;
$function$;

revoke all on function private.matrix_result_entitlements_for_member(uuid, public.members, text)
from public, anon, authenticated;
