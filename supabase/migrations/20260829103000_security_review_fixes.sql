begin;

create or replace function private.active_member_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select * into v_member from public.members where auth_user_id = v_uid limit 1;
  if not found or pg_catalog.coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_member.id;
end;
$$;

create or replace function private.bootstrap_member_allowed()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if exists (
    select 1 from public.members
    where auth_user_id = v_uid
      and pg_catalog.coalesce(status, '') in ('停用', 'disabled', 'inactive')
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
end;
$$;

revoke all on function private.active_member_id() from public, anon, authenticated;
revoke all on function private.bootstrap_member_allowed() from public, anon, authenticated;

alter function public.member_bootstrap() rename to member_bootstrap_20260829_impl;
alter function public.member_profile() rename to member_profile_20260829_impl;
alter function public.member_notification_settings_get() rename to member_notification_settings_get_20260829_impl;
alter function public.member_notification_settings_save(jsonb) rename to member_notification_settings_save_20260829_impl;
alter function public.member_online_start() rename to member_online_start_20260829_impl;
alter function public.member_online_end(uuid) rename to member_online_end_20260829_impl;

revoke all on function public.member_bootstrap_20260829_impl() from public, anon, authenticated;
revoke all on function public.member_profile_20260829_impl() from public, anon, authenticated;
revoke all on function public.member_notification_settings_get_20260829_impl() from public, anon, authenticated;
revoke all on function public.member_notification_settings_save_20260829_impl(jsonb) from public, anon, authenticated;
revoke all on function public.member_online_start_20260829_impl() from public, anon, authenticated;
revoke all on function public.member_online_end_20260829_impl(uuid) from public, anon, authenticated;

create function public.member_bootstrap()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.bootstrap_member_allowed();
  return public.member_bootstrap_20260829_impl();
end;
$$;

create function public.member_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.active_member_id();
  return public.member_profile_20260829_impl();
end;
$$;

create function public.member_notification_settings_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.active_member_id();
  return public.member_notification_settings_get_20260829_impl();
end;
$$;

create function public.member_notification_settings_save(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.active_member_id();
  return public.member_notification_settings_save_20260829_impl(p_settings);
end;
$$;

create function public.member_online_start()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.active_member_id();
  return public.member_online_start_20260829_impl();
end;
$$;

create function public.member_online_end(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.active_member_id();
  return public.member_online_end_20260829_impl(p_session_id);
end;
$$;

grant execute on function public.member_bootstrap() to authenticated;
grant execute on function public.member_profile() to authenticated;
grant execute on function public.member_notification_settings_get() to authenticated;
grant execute on function public.member_notification_settings_save(jsonb) to authenticated;
grant execute on function public.member_online_start() to authenticated;
grant execute on function public.member_online_end(uuid) to authenticated;

create or replace function private.matrix_result_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan text := 'free';
  v_paid boolean := false;
  v_referrals integer := 0;
  v_dow integer := extract(isodow from pg_catalog.timezone('Asia/Taipei', pg_catalog.now()));
begin
  if v_uid is not null then
    select * into v_member from public.members where auth_user_id = v_uid limit 1;
    if not found or pg_catalog.coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
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
      v_plan := pg_catalog.coalesce(v_plan, 'free');
      v_paid := v_plan <> 'free'
        and pg_catalog.coalesce(v_member.plan_expires_at > pg_catalog.now(), false);
    end if;
    if pg_catalog.coalesce(v_member.referral_code, '') <> '' then
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
    'canUseSeven', v_paid or v_referrals >= 15 or v_dow in (2, 5) or (v_referrals >= 10 and v_dow in (1, 4)),
    'canUseThirteen', v_paid,
    'canUseFullRange', v_paid or v_referrals >= 50 or (v_referrals >= 30 and v_dow in (2, 5)),
    'canUseTianyan', v_paid and v_plan in ('quarterly', 'yearly', 'lifetime'),
    'canUseTiangong', v_paid and v_plan in ('yearly', 'lifetime'),
    'canViewFullStatus', v_paid,
    'canCustomizeStatus', v_paid and v_plan <> 'trial',
    'canUseCompositeCustomRoad', v_paid and v_plan in ('quarterly', 'yearly', 'lifetime')
  );
end;
$$;

revoke all on function private.matrix_result_entitlements() from public, anon, authenticated;

create or replace function public.matrix_status_sources_get(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_sources jsonb;
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透') then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;
  select run.analysis_version, run.draw_period into v_version, v_draw
  from public.matrix_analysis_runs as run
  where run.lottery = v_lottery and run.status = 'complete'
    and (v_period is null or run.draw_period = v_period)
  order by run.completed_at desc nulls last limit 1;
  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  v_payload := private.matrix_artifact_payload('status', v_lottery, v_draw, v_version);
  v_sources := v_payload->'statusSources';
  if v_sources is null or v_sources->'explore' is null or v_sources->'tianyan' is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  return pg_catalog.jsonb_build_object(
    'analysisVersion', v_version,
    'drawPeriod', v_draw,
    'explore', v_sources->'explore',
    'tianyan', v_sources->'tianyan'
  );
end;
$$;

revoke all on function public.matrix_status_get(jsonb) from public, anon, authenticated;
revoke all on function public.matrix_status_sources_get(jsonb) from public, anon, authenticated;
grant execute on function public.matrix_status_sources_get(jsonb) to service_role;

alter function public.matrix_custom_status_reset(text, text) rename to matrix_custom_status_reset_20260829_impl;
revoke all on function public.matrix_custom_status_reset_20260829_impl(text, text) from public, anon, authenticated;

create function public.matrix_custom_status_reset(p_lottery text, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.matrix_result_entitlements();
  return public.matrix_custom_status_reset_20260829_impl(p_lottery, p_status);
end;
$$;

grant execute on function public.matrix_custom_status_reset(text, text) to authenticated;

commit;
