begin;

update public.members
set referral_code = pg_catalog.upper(nullif(pg_catalog.btrim(referral_code), ''))
where referral_code is distinct from pg_catalog.upper(nullif(pg_catalog.btrim(referral_code), ''));

update public.members
set invitation_code = pg_catalog.upper(nullif(pg_catalog.btrim(invitation_code), ''))
where invitation_code is distinct from pg_catalog.upper(nullif(pg_catalog.btrim(invitation_code), ''));

create unique index if not exists members_referral_code_normalized_key
  on public.members ((pg_catalog.upper(pg_catalog.btrim(referral_code))))
  where nullif(pg_catalog.btrim(referral_code), '') is not null;

create index if not exists members_invitation_code_normalized_idx
  on public.members ((pg_catalog.upper(pg_catalog.btrim(invitation_code))))
  where nullif(pg_catalog.btrim(invitation_code), '') is not null;

create or replace function private.ensure_member_referral_code(p_member_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existing_code text;
  v_candidate_code text;
  v_attempt integer;
begin
  select nullif(pg_catalog.btrim(member.referral_code), '')
  into v_existing_code
  from public.members as member
  where member.id = p_member_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_existing_code is not null then
    v_existing_code := pg_catalog.upper(v_existing_code);
    update public.members
    set referral_code = v_existing_code
    where id = p_member_id
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
      where id = p_member_id
        and nullif(pg_catalog.btrim(referral_code), '') is null;

      if found then
        return v_candidate_code;
      end if;

      select nullif(pg_catalog.btrim(member.referral_code), '')
      into v_existing_code
      from public.members as member
      where member.id = p_member_id
      for update;

      if v_existing_code is not null then
        return pg_catalog.upper(v_existing_code);
      end if;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  raise exception using errcode = 'P0001', message = 'REFERRAL_CODE_GENERATION_FAILED';
end;
$$;

revoke all on function private.ensure_member_referral_code(uuid) from public, anon, authenticated, service_role;

create or replace function public.member_referral_summary()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.active_member_id();
  v_member public.members%rowtype;
  v_referral_code text;
  v_referral_success_count integer := 0;
  v_has_invitation_code boolean := false;
  v_has_confirmed_payment boolean := false;
begin
  select member.*
  into v_member
  from public.members as member
  where member.id = v_member_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if nullif(pg_catalog.btrim(v_member.line_user_id), '') is null then
    raise exception using errcode = '42501', message = 'LINE_IDENTITY_REQUIRED';
  end if;

  v_referral_code := private.ensure_member_referral_code(v_member_id);
  v_has_invitation_code := nullif(pg_catalog.btrim(v_member.invitation_code), '') is not null;

  select exists (
    select 1
    from public.payments as payment
    where payment.member_id = v_member_id
      and payment.status = 'confirmed'
  )
  into v_has_confirmed_payment;

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
    'canSubmitReferralCode', not v_has_invitation_code and not v_has_confirmed_payment
  );
end;
$$;

create or replace function public.member_referral_submit(p_referral_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.active_member_id();
  v_referral_code text := pg_catalog.upper(nullif(pg_catalog.btrim(p_referral_code), ''));
  v_target_member_id uuid;
  v_member public.members%rowtype;
  v_target_member public.members%rowtype;
begin
  if v_referral_code is null then
    raise exception using errcode = '22023', message = 'INVALID_REFERRAL_CODE';
  end if;

  select member.*
  into v_member
  from public.members as member
  where member.id = v_member_id;

  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if nullif(pg_catalog.btrim(v_member.line_user_id), '') is null then
    raise exception using errcode = '42501', message = 'LINE_IDENTITY_REQUIRED';
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

  perform 1
  from public.members as locked_member
  where locked_member.id = any (array[v_member_id, v_target_member_id])
  order by locked_member.id
  for update;

  select member.*
  into v_member
  from public.members as member
  where member.id = v_member_id;

  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if nullif(pg_catalog.btrim(v_member.line_user_id), '') is null then
    raise exception using errcode = '42501', message = 'LINE_IDENTITY_REQUIRED';
  end if;

  if nullif(pg_catalog.btrim(v_member.invitation_code), '') is not null then
    raise exception using errcode = 'P0001', message = 'REFERRAL_CODE_ALREADY_SUBMITTED';
  end if;

  if exists (
    select 1
    from public.payments as payment
    where payment.member_id = v_member_id
      and payment.status = 'confirmed'
  ) then
    raise exception using errcode = 'P0001', message = 'REFERRAL_CODE_AFTER_PAYMENT';
  end if;

  select member.*
  into v_target_member
  from public.members as member
  where member.id = v_target_member_id;

  if not found
     or pg_catalog.upper(pg_catalog.btrim(v_target_member.referral_code)) <> v_referral_code then
    raise exception using errcode = 'P0001', message = 'REFERRAL_CODE_NOT_FOUND';
  end if;

  update public.members
  set invitation_code = v_referral_code
  where id = v_member_id;

  return public.member_referral_summary();
end;
$$;

revoke all on function public.member_referral_summary() from public, anon, service_role;
revoke all on function public.member_referral_submit(text) from public, anon, service_role;
grant execute on function public.member_referral_summary() to authenticated;
grant execute on function public.member_referral_submit(text) to authenticated;

notify pgrst, 'reload schema';

commit;
