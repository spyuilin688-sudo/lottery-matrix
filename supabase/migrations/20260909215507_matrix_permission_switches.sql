-- Dedicated settings only; no membership plan or expiry mutations.
create table private.matrix_permission_settings (
  singleton boolean primary key default true check (singleton),
  subscription_purchase_visible boolean not null default false,
  registered_member_free_access boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
insert into private.matrix_permission_settings(singleton) values (true);
alter table private.matrix_permission_settings enable row level security;
revoke all on private.matrix_permission_settings from public, anon, authenticated;

create table private.matrix_permission_credentials (
  singleton boolean primary key default true check (singleton),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$')
);
alter table private.matrix_permission_credentials enable row level security;
revoke all on private.matrix_permission_credentials from public, anon, authenticated;

create function public.matrix_permission_settings()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'subscriptionPurchaseVisible', subscription_purchase_visible,
    'registeredMemberFreeAccess', registered_member_free_access,
    'revision', revision, 'updatedAt', updated_at
  ) from private.matrix_permission_settings where singleton;
$function$;
revoke all on function public.matrix_permission_settings() from public;
grant execute on function public.matrix_permission_settings() to anon, authenticated, service_role;

create function public.matrix_permission_settings_update(p_change jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_token text := coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb->>'x-matrix-management-token', '');
  v_settings private.matrix_permission_settings%rowtype;
  v_revision integer;
begin
  -- High-entropy, settings-only credential held by the owner-private Site server.
  -- It cannot read member data or invoke other privileged operations.
  if pg_catalog.length(v_token) < 43 or pg_catalog.length(v_token) > 256
    or not exists (
      select 1 from private.matrix_permission_credentials where singleton
      and token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_token, 'UTF8')), 'hex')
    ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if p_change is null or pg_catalog.jsonb_typeof(p_change) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_change)) <> 3
    or coalesce(p_change->>'key', '') not in ('subscriptionPurchaseVisible', 'registeredMemberFreeAccess')
    or pg_catalog.jsonb_typeof(p_change->'value') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(p_change->'expectedRevision') is distinct from 'number'
    or coalesce(p_change->>'expectedRevision', '') !~ '^[0-9]+$' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  v_revision := (p_change->>'expectedRevision')::integer;
  select * into strict v_settings from private.matrix_permission_settings where singleton for update;
  if v_settings.revision <> v_revision then
    raise exception using errcode = 'PT409', message = 'SETTINGS_CONFLICT';
  end if;
  update private.matrix_permission_settings set
    subscription_purchase_visible = case when p_change->>'key' = 'subscriptionPurchaseVisible' then (p_change->>'value')::boolean else subscription_purchase_visible end,
    registered_member_free_access = case when p_change->>'key' = 'registeredMemberFreeAccess' then (p_change->>'value')::boolean else registered_member_free_access end,
    revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
  where singleton;
  return public.matrix_permission_settings();
exception when numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'INVALID_REQUEST';
end;
$function$;
revoke all on function public.matrix_permission_settings_update(jsonb) from public;
grant execute on function public.matrix_permission_settings_update(jsonb) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.matrix_result_entitlements()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan text := 'free';
  v_paid boolean := false;
  v_free_access boolean := false;
  v_referrals integer := 0;
  v_dow integer := extract(isodow from pg_catalog.timezone('Asia/Taipei', pg_catalog.now()));
begin
  if v_uid is not null then
    select * into v_member from public.members where auth_user_id = v_uid limit 1;
    if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
      raise exception using errcode = '42501', message = 'FORBIDDEN';
    end if;
    select registered_member_free_access into v_free_access
    from private.matrix_permission_settings where singleton;
    v_free_access := coalesce(v_free_access, false);
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

