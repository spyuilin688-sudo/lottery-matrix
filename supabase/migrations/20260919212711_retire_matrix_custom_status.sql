-- Deploy the custom-free frontend, Edge Functions and Railway workers first.
-- Stop/drain older workers before this cleanup; old clients must no longer call
-- the retired RPCs. This transaction preserves every shared analysis/status row.
-- Generated with supabase migration new, then ordered after existing 20260920 migrations.
begin;
set local lock_timeout = '5s';

create or replace function public.matrix_watchdog_chain_state(p_lottery text, p_draw_period text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_analysis jsonb;
  v_matrix boolean;
  v_version text;
  v_latest text;
begin
  v_analysis := public.matrix_watchdog_analysis_state(p_lottery, p_draw_period);
  select period into v_latest from public.lottery_draws where lottery = p_lottery
    order by draw_date desc nulls last, period desc limit 1;
  v_version := v_analysis->'activeVersions'->>'sorted';
  v_matrix := v_version is not null and not exists (
    select 1 from pg_catalog.jsonb_each_text(v_analysis->'activeVersions') active
    where not exists (select 1 from public.matrix_analysis_artifacts a
      where a.lottery = p_lottery and a.draw_period = p_draw_period
      and a.analysis_version = active.value and a.kind = 'status')
  );
  return pg_catalog.jsonb_build_object(
    'drawPeriod', p_draw_period, 'latestPeriod', v_latest,
    'analysis', v_analysis,
    'analysisComplete', coalesce(v_analysis->>'status' = 'complete' and v_version is not null, false),
    'matrixStatusComplete', coalesce(v_matrix, false),
    'observedAt', pg_catalog.now()
  );
end;
$$;

create or replace function public.complete_matrix_watchdog_recovery(
 p_lottery text, p_owner_id text, p_runner_id text, p_draw_period text
) returns boolean language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_chain jsonb;
begin
 -- Fence shared draw, analysis and Matrix Status evidence until success commits.
 lock table public.lottery_draws in share mode;
 lock table public.matrix_analysis_runs in share mode;
 lock table public.matrix_analysis_artifacts in share mode;
 lock table private.matrix_analysis_active_versions in share mode;
 perform 1 from public.matrix_watchdog_leases
 where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id and expires_at>pg_catalog.clock_timestamp()
 for update;
 if not found then return false; end if;
 v_chain := public.matrix_watchdog_chain_state(p_lottery,p_draw_period);
 if v_chain->>'latestPeriod' is distinct from p_draw_period
   or (v_chain->>'analysisComplete')::boolean is distinct from true
   or (v_chain->>'matrixStatusComplete')::boolean is distinct from true then return false; end if;
 if not exists (select 1 from public.matrix_watchdog_leases where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id and expires_at>pg_catalog.clock_timestamp()) then return false; end if;
 update public.system_job_status set status='success',finished_at=now(),updated_at=now(),error=null,
   recovery_count=recovery_count+1,last_recovery_at=now(),written_period=p_draw_period
 where job_name='matrix-recovery:'||p_lottery;
 if not found then raise exception 'RECOVERY_START_MISSING'; end if;
 delete from public.matrix_watchdog_leases where lease_key='railway:'||p_lottery and owner_id=p_owner_id and runner_id=p_runner_id;
 return true;
end;
$$;

create or replace function public.admin_service_operation_evidence()
returns table(rpc_name text, observed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select 'admin_matrix_permission_settings_update', (select updated_at from private.matrix_permission_settings where revision>0 limit 1)
  union all select 'member_bootstrap', (select registered_at from public.members order by registered_at desc nulls last limit 1)
  union all select 'member_line_pwa_diagnostics_submit', (select created_at from private.line_pwa_handoff_diagnostics order by created_at desc nulls last limit 1)
  union all select 'member_notification_settings_save', (select updated_at from public.notification_settings order by updated_at desc nulls last limit 1)
  union all select 'member_transfer_request_submit', (select submitted_at from public.transfer_requests order by submitted_at desc nulls last limit 1)
  union all select 'member_push_subscription_save', (select updated_at from public.member_push_subscriptions where enabled order by updated_at desc nulls last limit 1)
  union all select 'member_push_subscription_disable', (select updated_at from public.member_push_subscriptions where not enabled order by updated_at desc nulls last limit 1)
  union all select 'member_online_start', (select started_at from public.member_online_sessions order by started_at desc nulls last limit 1)
  union all select 'member_online_end', (select ended_at from public.member_online_sessions where ended_at is not null order by ended_at desc limit 1)
  union all select 'redeem_activation_code', (select redeemed_at from public.activation_codes where redeemed_at is not null order by redeemed_at desc limit 1)
  union all select 'claim_matrix_watchdog_lease', (select acquired_at from public.matrix_watchdog_leases order by acquired_at desc nulls last limit 1)
  union all select 'begin_matrix_watchdog_recovery', (select recovery_started_at from public.matrix_watchdog_leases where recovery_started_at is not null order by recovery_started_at desc limit 1)
  union all select 'notification_dispatch_claim', (select processing_started_at from public.notification_outbox where processing_started_at is not null order by processing_started_at desc limit 1)
  union all select 'notification_dispatch_mark_failed', (select processed_at from public.notification_outbox where status='failed' order by processed_at desc nulls last limit 1)
  union all select 'notification_dispatch_mark_retry', (select updated_at from public.notification_outbox where status='pending' and attempt_count>0 order by updated_at desc nulls last limit 1)
  union all select 'notification_dispatch_mark_sent', (select processed_at from public.notification_outbox where status='sent' order by processed_at desc nulls last limit 1)
  union all select 'notification_dispatch_mark_skipped', (select processed_at from public.notification_outbox where status='skipped' order by processed_at desc nulls last limit 1)
  union all select 'notification_event_enqueue_server', (select created_at from public.notification_events order by created_at desc nulls last limit 1);
$$;

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
    'canUseSeven', v_free_access or v_paid or v_referrals >= 15
      or (v_uid is not null and private.member_login_perks_eligible(v_uid, v_member.line_user_id) and v_dow in (2, 5))
      or (v_referrals >= 10 and v_dow in (1, 4)),
    'canUseThirteen', v_free_access or v_paid,
    'canUseFullRange', v_free_access or v_paid or v_referrals >= 50
      or (v_referrals >= 30 and v_dow in (2, 5)),
    'canUseTianyan', v_free_access
      or (v_paid and v_plan in ('quarterly', 'yearly', 'lifetime'))
      or coalesce(v_member.line_trial_started_at <= pg_catalog.now()
        and v_member.line_trial_started_at + interval '48 hours' > pg_catalog.now(), false),
    'canUseTiangong', v_free_access
      or (v_paid and v_plan in ('yearly', 'lifetime'))
      or coalesce(v_member.line_trial_started_at <= pg_catalog.now()
        and v_member.line_trial_started_at + interval '24 hours' > pg_catalog.now(), false),
    'canViewFullStatus', v_paid
  );
end;
$function$;

-- Preserve the existing service-only API boundary and private entitlement ACL.
revoke all on function public.matrix_watchdog_chain_state(text,text),
 public.complete_matrix_watchdog_recovery(text,text,text,text),
 public.admin_service_operation_evidence() from public,anon,authenticated;
grant execute on function public.matrix_watchdog_chain_state(text,text),
 public.complete_matrix_watchdog_recovery(text,text,text,text),
 public.admin_service_operation_evidence() to service_role;
revoke all on function private.matrix_result_entitlements() from public,anon,authenticated,service_role;

-- Explicit signatures and RESTRICT prevent deletion of unexpected dependents.
-- Identity-only RPC was used exclusively by the retired custom result cache.
drop function public.matrix_status_identity_get(jsonb) restrict;
drop function public.matrix_custom_status_list() restrict;
drop function public.matrix_custom_status_save(jsonb) restrict;
drop function public.matrix_custom_status_reset(text,text) restrict;
drop function public.matrix_custom_status_reset_20260829_impl(text,text) restrict;
drop function public.matrix_custom_status_publish(jsonb) restrict;
drop function public.matrix_custom_status_clear_if_unconfigured(uuid,text) restrict;
drop table public.matrix_custom_status_results restrict;
drop table public.matrix_custom_status_configs restrict;
-- The config table owns the config_lock trigger; dropping it releases this helper.
drop function private.matrix_custom_status_config_lock() restrict;
drop function private.matrix_custom_status_key_matches(text,jsonb) restrict;
drop function private.matrix_custom_status_normalize_config(jsonb,boolean) restrict;
drop function private.matrix_custom_status_road_types(jsonb,boolean) restrict;

notify pgrst, 'reload schema';
commit;
