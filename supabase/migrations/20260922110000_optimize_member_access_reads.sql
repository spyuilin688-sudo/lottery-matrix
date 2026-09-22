begin;

-- Resolve an authenticated active member once, then pass that authoritative
-- snapshot through private helpers instead of re-reading public.members in
-- wrapper and implementation layers.
create or replace function private.active_member_record()
returns public.members
language plpgsql
stable
security definer
set search_path = ''
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
  limit 1;

  if not found or pg_catalog.coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return v_member;
end;
$function$;

revoke all on function private.active_member_record()
  from public, anon, authenticated, service_role;

create or replace function private.active_member_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_member public.members%rowtype;
begin
  v_member := private.active_member_record();
  return v_member.id;
end;
$function$;

revoke all on function private.active_member_id()
  from public, anon, authenticated;

-- Keep the entitlement rules in one place while allowing callers that already
-- own an active member row to avoid resolving the same member and plan again.
create or replace function private.matrix_result_entitlements_for_member(
  p_member public.members,
  p_plan_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan text := 'free';
  v_paid boolean := false;
  v_free_access boolean := false;
  v_referrals integer := 0;
  v_dow integer := extract(isodow from pg_catalog.timezone('Asia/Taipei', pg_catalog.now()));
begin
  select settings.registered_member_free_access
  into v_free_access
  from private.matrix_permission_settings as settings
  where settings.singleton;
  v_free_access := pg_catalog.coalesce(v_free_access, false);

  if p_member.is_lifetime then
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
      and pg_catalog.coalesce(p_member.plan_expires_at > pg_catalog.now(), false);
  end if;

  if pg_catalog.coalesce(p_member.referral_code, '') <> '' then
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

  return pg_catalog.jsonb_build_object(
    'canUseSeven', v_free_access or v_paid or v_referrals >= 15
      or (
        private.member_login_perks_eligible(p_member.auth_user_id, p_member.line_user_id)
        and v_dow in (2, 5)
      )
      or (v_referrals >= 10 and v_dow in (1, 4)),
    'canUseThirteen', v_free_access or v_paid,
    'canUseFullRange', v_free_access or v_paid or v_referrals >= 50
      or (v_referrals >= 30 and v_dow in (2, 5)),
    'canUseTianyan', v_free_access
      or (v_paid and v_plan in ('quarterly', 'yearly', 'lifetime'))
      or pg_catalog.coalesce(
        p_member.line_trial_started_at <= pg_catalog.now()
        and p_member.line_trial_started_at + interval '48 hours' > pg_catalog.now(),
        false
      ),
    'canUseTiangong', v_free_access
      or (v_paid and v_plan in ('yearly', 'lifetime'))
      or pg_catalog.coalesce(
        p_member.line_trial_started_at <= pg_catalog.now()
        and p_member.line_trial_started_at + interval '24 hours' > pg_catalog.now(),
        false
      ),
    'canViewFullStatus', v_paid
  );
end;
$function$;

revoke all on function private.matrix_result_entitlements_for_member(public.members, text)
  from public, anon, authenticated, service_role;

create or replace function private.matrix_result_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan_name text;
begin
  if v_uid is null then
    return pg_catalog.jsonb_build_object(
      'canUseSeven', false,
      'canUseThirteen', false,
      'canUseFullRange', false,
      'canUseTianyan', false,
      'canUseTiangong', false,
      'canViewFullStatus', false
    );
  end if;

  select member, plan.name
  into v_member, v_plan_name
  from public.members as member
  left join public.plans as plan on plan.id = member.current_plan_id
  where member.auth_user_id = v_uid
  limit 1;

  if not found or pg_catalog.coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return private.matrix_result_entitlements_for_member(v_member, v_plan_name);
end;
$function$;

revoke all on function private.matrix_result_entitlements()
  from public, anon, authenticated;

create or replace function public.member_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_member public.members%rowtype;
  v_plan_name text;
  v_entitlements jsonb;
begin
  v_member := private.active_member_record();

  select plan.name
  into v_plan_name
  from public.plans as plan
  where plan.id = v_member.current_plan_id;

  v_entitlements := private.matrix_result_entitlements_for_member(v_member, v_plan_name);

  return pg_catalog.jsonb_build_object(
    'memberId', v_member.id,
    'lineUserId', v_member.line_user_id,
    'planName', case
      when v_member.is_lifetime then '終身方案'
      else pg_catalog.coalesce(v_plan_name, '免費會員')
    end,
    'planExpiresAt', v_member.plan_expires_at,
    'isLifetime', v_member.is_lifetime,
    'exploreEntitlements', v_entitlements
  );
end;
$function$;

-- Notification settings: the public guard resolves member_id once and the
-- private worker operates only on that id.
create or replace function private.member_notification_settings_get_for_member(
  p_member_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_settings jsonb;
begin
  select settings.settings
  into v_settings
  from public.notification_settings as settings
  where settings.member_id = p_member_id;

  return pg_catalog.coalesce(
    v_settings,
    private.default_member_notification_settings()
  ) #- '{settings,win}' #- '{selectedOptions,win}';
end;
$function$;

create or replace function private.member_notification_settings_save_for_member(
  p_member_id uuid,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key_count integer;
begin
  p_settings := p_settings #- '{settings,win}' #- '{selectedOptions,win}';

  select pg_catalog.count(*)::integer
  into v_key_count
  from pg_catalog.jsonb_object_keys(p_settings);

  if pg_catalog.jsonb_typeof(p_settings) <> 'object'
    or v_key_count <> 5
    or not (
      p_settings ?& array[
        'settings', 'selectedOptions', 'betTimes', 'statusOptions', 'collisionOptions'
      ]
    )
    or pg_catalog.jsonb_typeof(p_settings->'settings') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'selectedOptions') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'betTimes') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'statusOptions') <> 'object'
    or pg_catalog.jsonb_typeof(p_settings->'collisionOptions') <> 'object'
  then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_SETTINGS';
  end if;

  insert into public.notification_settings (member_id, settings, updated_at)
  values (p_member_id, p_settings, pg_catalog.now())
  on conflict (member_id) do update
    set settings = excluded.settings,
        updated_at = excluded.updated_at;

  return p_settings;
exception
  when data_exception then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_SETTINGS';
end;
$function$;

revoke all on function private.member_notification_settings_get_for_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.member_notification_settings_save_for_member(uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.member_notification_settings_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_member_id uuid := private.active_member_id();
begin
  return private.member_notification_settings_get_for_member(v_member_id);
end;
$function$;

create or replace function public.member_notification_settings_save(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member_id uuid := private.active_member_id();
begin
  return private.member_notification_settings_save_for_member(v_member_id, p_settings);
end;
$function$;

-- Online tracking follows the same pattern: authorize once, then reuse member_id
-- through the write path without a second auth.uid()/members lookup.
create or replace function private.member_online_start_for_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  insert into public.member_online_sessions (member_id, started_at)
  values (p_member_id, v_now)
  returning id into v_session_id;

  update public.members
  set last_online_at = v_now
  where id = p_member_id;

  return pg_catalog.jsonb_build_object('sessionId', v_session_id);
end;
$function$;

create or replace function private.member_online_end_for_member(
  p_member_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_started_at timestamptz;
  v_existing_seconds integer;
  v_online_seconds integer;
  v_now timestamptz := pg_catalog.now();
begin
  select session.started_at, session.online_seconds
  into v_started_at, v_existing_seconds
  from public.member_online_sessions as session
  where session.id = p_session_id
    and session.member_id = p_member_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'MEMBER_ONLINE_SESSION_NOT_FOUND';
  end if;

  if v_existing_seconds is not null then
    return pg_catalog.jsonb_build_object('onlineSeconds', v_existing_seconds);
  end if;

  v_online_seconds := pg_catalog.greatest(
    0,
    pg_catalog.floor(
      pg_catalog.extract(epoch from v_now - v_started_at)
    )::integer
  );

  update public.member_online_sessions
  set ended_at = v_now,
      online_seconds = v_online_seconds
  where id = p_session_id;

  update public.members
  set last_online_at = v_now,
      total_online_seconds = total_online_seconds + v_online_seconds,
      online_session_count = online_session_count + 1
  where id = p_member_id;

  return pg_catalog.jsonb_build_object('onlineSeconds', v_online_seconds);
end;
$function$;

revoke all on function private.member_online_start_for_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.member_online_end_for_member(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.member_online_start()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member_id uuid := private.active_member_id();
begin
  return private.member_online_start_for_member(v_member_id);
end;
$function$;

create or replace function public.member_online_end(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member_id uuid := private.active_member_id();
begin
  return private.member_online_end_for_member(v_member_id, p_session_id);
end;
$function$;

commit;
