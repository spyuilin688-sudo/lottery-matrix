-- Consolidate referral reads while preserving stable row-lock ordering and public RPC contracts.
begin;

create or replace function private.ensure_member_referral_code_locked(p_member public.members)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing_code text := nullif(pg_catalog.btrim(p_member.referral_code), '');
  v_candidate_code text;
  v_attempt integer;
begin
  if p_member.id is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_existing_code is not null then
    v_existing_code := pg_catalog.upper(v_existing_code);
    update public.members
    set referral_code = v_existing_code
    where id = p_member.id
      and referral_code is distinct from v_existing_code;
    return v_existing_code;
  end if;

  for v_attempt in 1..10 loop
    v_candidate_code := 'MATRIX-' || pg_catalog.upper(
      pg_catalog.substr(
        pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
        1,
        10
      )
    );

    begin
      update public.members
      set referral_code = v_candidate_code
      where id = p_member.id
        and nullif(pg_catalog.btrim(referral_code), '') is null;

      if found then
        return v_candidate_code;
      end if;

      raise exception using errcode = '42501', message = 'FORBIDDEN';
    exception
      when unique_violation then
        null;
    end;
  end loop;

  raise exception using errcode = 'P0001', message = 'REFERRAL_CODE_GENERATION_FAILED';
end;
$function$;

revoke all on function private.ensure_member_referral_code_locked(public.members)
from public, anon, authenticated, service_role;

create or replace function private.member_referral_summary_for_locked_member(p_member public.members)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_referral_code text;
  v_referral_success_count integer := 0;
  v_has_invitation_code boolean := false;
begin
  if p_member.id is null
    or coalesce(p_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if not private.member_login_perks_eligible(p_member.auth_user_id, p_member.line_user_id) then
    raise exception using errcode = '42501', message = 'LINE_IDENTITY_REQUIRED';
  end if;

  v_referral_code := private.ensure_member_referral_code_locked(p_member);
  v_has_invitation_code := nullif(pg_catalog.btrim(p_member.invitation_code), '') is not null;

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

  return pg_catalog.jsonb_build_object(
    'referralCode', v_referral_code,
    'referralSuccessCount', v_referral_success_count,
    'hasInvitationCode', v_has_invitation_code,
    'canSubmitReferralCode', not v_has_invitation_code
  );
end;
$function$;

revoke all on function private.member_referral_summary_for_locked_member(public.members)
from public, anon, authenticated, service_role;

create or replace function public.member_referral_summary()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select member.*
  into v_member
  from public.members as member
  where member.auth_user_id = v_uid
  limit 1
  for update;

  if not found
    or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return private.member_referral_summary_for_locked_member(v_member);
end;
$function$;

create or replace function public.member_referral_submit(p_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_target_member_id uuid;
  v_referral_code text := pg_catalog.upper(nullif(pg_catalog.btrim(p_referral_code), ''));
  v_member public.members%rowtype;
  v_target_member public.members%rowtype;
  v_locked public.members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if v_referral_code is null then
    raise exception using errcode = '22023', message = 'INVALID_REFERRAL_CODE';
  end if;

  select member.id
  into v_member_id
  from public.members as member
  where member.auth_user_id = v_uid
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select member.id
  into v_target_member_id
  from public.members as member
  where pg_catalog.upper(pg_catalog.btrim(member.referral_code)) = v_referral_code
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'REFERRAL_CODE_NOT_FOUND';
  end if;

  if v_target_member_id = v_member_id then
    raise exception using errcode = '22023', message = 'SELF_REFERRAL_NOT_ALLOWED';
  end if;

  for v_locked in
    select member.*
    from public.members as member
    where member.id = any (array[v_member_id, v_target_member_id])
    order by member.id
    for update
  loop
    if v_locked.id = v_member_id then
      v_member := v_locked;
    elsif v_locked.id = v_target_member_id then
      v_target_member := v_locked;
    end if;
  end loop;

  if v_member.id is null
    or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if not private.member_login_perks_eligible(v_member.auth_user_id, v_member.line_user_id) then
    raise exception using errcode = '42501', message = 'LINE_IDENTITY_REQUIRED';
  end if;

  if nullif(pg_catalog.btrim(v_member.invitation_code), '') is not null then
    raise exception using errcode = 'P0001', message = 'REFERRAL_CODE_ALREADY_SUBMITTED';
  end if;

  if v_target_member.id is null
    or pg_catalog.upper(pg_catalog.btrim(v_target_member.referral_code)) <> v_referral_code then
    raise exception using errcode = 'P0001', message = 'REFERRAL_CODE_NOT_FOUND';
  end if;

  update public.members
  set invitation_code = v_referral_code
  where id = v_member_id;

  v_member.invitation_code := v_referral_code;
  return private.member_referral_summary_for_locked_member(v_member);
end;
$function$;

commit;
