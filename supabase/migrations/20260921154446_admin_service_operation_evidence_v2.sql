begin;

create or replace function public.admin_service_operation_evidence()
returns table(rpc_name text, observed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'admin_matrix_permission_settings_update',
    (select updated_at from private.matrix_permission_settings where revision>0 limit 1)
  union all select 'member_bootstrap',
    (select registered_at from public.members order by registered_at desc nulls last limit 1)
  union all select 'member_line_pwa_diagnostics_submit',
    (select created_at from private.line_pwa_handoff_diagnostics order by created_at desc nulls last limit 1)
  union all select 'record_matrix_visit',
    (select created_at from private.matrix_visitor_identifiers order by created_at desc nulls last limit 1)
  union all select 'member_notification_settings_save',
    (select updated_at from public.notification_settings order by updated_at desc nulls last limit 1)
  union all select 'member_transfer_request_submit',
    (select submitted_at from public.transfer_requests order by submitted_at desc nulls last limit 1)
  union all select 'member_push_subscription_save',
    (select updated_at from public.member_push_subscriptions where enabled order by updated_at desc nulls last limit 1)
  union all select 'member_push_subscription_disable',
    (select updated_at from public.member_push_subscriptions where not enabled order by updated_at desc nulls last limit 1)
  union all select 'member_online_start',
    (select started_at from public.member_online_sessions order by started_at desc nulls last limit 1)
  union all select 'member_online_end',
    (select ended_at from public.member_online_sessions where ended_at is not null order by ended_at desc limit 1)
  union all select 'redeem_activation_code',
    (select redeemed_at from public.activation_codes where redeemed_at is not null order by redeemed_at desc limit 1)
  union all select 'matrix_manual_refresh_claim',
    (select expires_at - interval '30 minutes' from public.matrix_manual_refresh_jobs order by expires_at desc limit 1)
  union all select 'claim_matrix_watchdog_lease',
    (select acquired_at from public.matrix_watchdog_leases order by acquired_at desc nulls last limit 1)
  union all select 'begin_matrix_watchdog_recovery',
    (select recovery_started_at from public.matrix_watchdog_leases where recovery_started_at is not null order by recovery_started_at desc limit 1)
  union all select 'finish_matrix_watchdog_recovery',
    (select finished_at from public.system_job_status
      where job_name like 'matrix-recovery:%' and error='RECOVERY_NOT_VERIFIED'
      order by finished_at desc nulls last limit 1)
  union all select 'notification_dispatch_claim',
    (select processing_started_at from public.notification_outbox where processing_started_at is not null order by processing_started_at desc limit 1)
  union all select 'notification_dispatch_mark_failed',
    (select processed_at from public.notification_outbox where status='failed' order by processed_at desc nulls last limit 1)
  union all select 'notification_dispatch_mark_retry',
    (select updated_at from public.notification_outbox where status='pending' and attempt_count>0 order by updated_at desc nulls last limit 1)
  union all select 'notification_dispatch_mark_sent',
    (select processed_at from public.notification_outbox where status='sent' order by processed_at desc nulls last limit 1)
  union all select 'notification_dispatch_mark_skipped',
    (select processed_at from public.notification_outbox where status='skipped' order by processed_at desc nulls last limit 1)
  union all select 'notification_event_enqueue_server',
    (select created_at from public.notification_events order by created_at desc nulls last limit 1);
$$;

revoke all on function public.admin_service_operation_evidence()
  from public, anon, authenticated;
grant execute on function public.admin_service_operation_evidence()
  to service_role;

notify pgrst, 'reload schema';
commit;
