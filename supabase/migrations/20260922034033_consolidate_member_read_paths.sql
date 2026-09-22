-- Consolidate repeated member/auth lookups while preserving existing public RPC contracts.
-- Production migration version: 20260922034033.

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

    if coalesce(p_member.referral_code, '') <> '' then
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
    'canUseThirteen', v_free_access or v_paid,
    'canUseFullRange', v_free_access or v_paid or v_referrals >= 50
      or (v_referrals >= 30 and v_dow in (2, 5)),
    'canUseTianyan', v_free_access
      or (v_paid and v_plan in ('quarterly', 'yearly', 'lifetime'))
      or coalesce(p_member.line_trial_started_at <= pg_catalog.now()
        and p_member.line_trial_started_at + interval '48 hours' > pg_catalog.now(), false),
    'canUseTiangong', v_free_access
      or (v_paid and v_plan in ('yearly', 'lifetime'))
      or coalesce(p_member.line_trial_started_at <= pg_catalog.now()
        and p_member.line_trial_started_at + interval '24 hours' > pg_catalog.now(), false),
    'canViewFullStatus', v_paid
  );
end;
$function$;

revoke all on function private.matrix_result_entitlements_for_member(uuid, public.members, text)
from public, anon, authenticated;

create or replace function private.matrix_result_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan_name text;
begin
  if v_uid is null then
    return private.matrix_result_entitlements_for_member(null, null::public.members, null);
  end if;

  select *
  into v_member
  from public.members
  where auth_user_id = v_uid
  limit 1;

  if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_member.current_plan_id is not null then
    select plan.name
    into v_plan_name
    from public.plans as plan
    where plan.id = v_member.current_plan_id;
  end if;

  return private.matrix_result_entitlements_for_member(v_uid, v_member, v_plan_name);
end;
$function$;

create or replace function public.member_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan_name text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into v_member
  from public.members
  where auth_user_id = v_uid
  limit 1;

  if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_member.current_plan_id is not null then
    select plan.name
    into v_plan_name
    from public.plans as plan
    where plan.id = v_member.current_plan_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'memberId', v_member.id,
    'lineUserId', v_member.line_user_id,
    'planName', case
      when v_member.is_lifetime then '終身方案'
      else coalesce(v_plan_name, '免費會員')
    end,
    'planExpiresAt', v_member.plan_expires_at,
    'isLifetime', v_member.is_lifetime,
    'exploreEntitlements',
      private.matrix_result_entitlements_for_member(v_uid, v_member, v_plan_name)
  );
end;
$function$;

create or replace function public.member_notification_settings_get()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid := private.active_member_id();
  v_settings jsonb;
begin
  select settings
  into v_settings
  from public.notification_settings
  where member_id = v_member_id;

  return coalesce(v_settings, private.default_member_notification_settings())
    #- '{settings,win}' #- '{selectedOptions,win}';
end;
$function$;

create or replace function public.member_notification_settings_save(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid := private.active_member_id();
  v_key_count integer;
begin
  p_settings := p_settings #- '{settings,win}' #- '{selectedOptions,win}';

  select pg_catalog.count(*)::integer
  into v_key_count
  from pg_catalog.jsonb_object_keys(p_settings);

  if pg_catalog.jsonb_typeof(p_settings) <> 'object'
    or v_key_count <> 5
    or not (p_settings ?& array['settings', 'selectedOptions', 'betTimes', 'statusOptions', 'collisionOptions'])
    or pg_catalog.jsonb_typeof(p_settings->'settings') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'selectedOptions') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'betTimes') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'statusOptions') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'collisionOptions') <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_SETTINGS';
  end if;

  insert into public.notification_settings (member_id, settings, updated_at)
  values (v_member_id, p_settings, pg_catalog.now())
  on conflict (member_id) do update
    set settings = excluded.settings,
        updated_at = excluded.updated_at;

  return p_settings;
exception
  when data_exception then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_SETTINGS';
end;
$function$;

create or replace function public.member_online_start()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid := private.active_member_id();
  v_session_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  insert into public.member_online_sessions (member_id, started_at)
  values (v_member_id, v_now)
  returning id into v_session_id;

  update public.members
  set last_online_at = v_now
  where id = v_member_id;

  return pg_catalog.jsonb_build_object('sessionId', v_session_id);
end;
$function$;

create or replace function public.member_online_end(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_member_id uuid := private.active_member_id();
  v_started_at timestamptz;
  v_existing_seconds integer;
  v_online_seconds integer;
  v_now timestamptz := pg_catalog.now();
begin
  select started_at, online_seconds
  into v_started_at, v_existing_seconds
  from public.member_online_sessions
  where id = p_session_id
    and member_id = v_member_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'MEMBER_ONLINE_SESSION_NOT_FOUND';
  end if;

  if v_existing_seconds is not null then
    return pg_catalog.jsonb_build_object('onlineSeconds', v_existing_seconds);
  end if;

  v_online_seconds := greatest(
    0,
    pg_catalog.floor(extract(epoch from v_now - v_started_at))::integer
  );

  update public.member_online_sessions
  set ended_at = v_now,
      online_seconds = v_online_seconds
  where id = p_session_id;

  update public.members
  set last_online_at = v_now,
      total_online_seconds = total_online_seconds + v_online_seconds,
      online_session_count = online_session_count + 1
  where id = v_member_id;

  return pg_catalog.jsonb_build_object('onlineSeconds', v_online_seconds);
end;
$function$;
