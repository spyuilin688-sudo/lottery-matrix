begin;

-- Admin diagnostics return metadata only. Member RPC grants and entitlements are
-- unchanged; this does not impersonate a member or execute a member operation.
create function public.admin_matrix_result_probe(p_kind text)
returns table(lottery text, period text, analysis_version text, records integer, list_ok boolean, validation_ok boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_payload jsonb;
  v_header jsonb;
  v_item jsonb;
  v_validation jsonb;
  v_order constant text := '依號碼由小到大排序';
begin
  if p_kind is null or p_kind not in ('tianyan','tiangong') then
    raise exception using errcode='22023',message='INVALID_PROBE_KIND';
  end if;
  foreach lottery in array array['今彩539','天天樂','六合彩','大樂透'] loop
    period := null; analysis_version := null; records := 0; list_ok := false; validation_ok := false;
    begin
      period := private.matrix_analysis_read_period(lottery, null, 0);
      analysis_version := private.matrix_analysis_order_version(lottery, period, v_order, p_kind);
      if analysis_version is not null then
        v_payload := private.matrix_artifact_payload(p_kind, lottery, period, analysis_version);
        select a.payload into v_header from public.matrix_analysis_artifacts a
          where a.lottery=admin_matrix_result_probe.lottery and a.draw_period=period
            and a.analysis_version=admin_matrix_result_probe.analysis_version and a.kind=p_kind;
        list_ok := coalesce(jsonb_typeof(v_payload->'items')='array'
          and v_payload->>'lottery'=lottery and v_payload->>'drawPeriod'=period
          and (p_kind<>'tiangong' or v_payload->>'numberOrder'=v_order),false);
        if list_ok then
          -- A missing chunk must not masquerade as a valid empty analysis.
          if v_header->>'storage'='chunks' then
            -- total/cursor count computation work, not returned result items.
            list_ok := coalesce((v_header->>'itemCount')::integer=jsonb_array_length(v_payload->'items')
              and (v_header->>'chunkCount')::integer=(select count(*) from public.matrix_analysis_artifact_chunks c
                where c.lottery=admin_matrix_result_probe.lottery and c.draw_period=period
                  and c.analysis_version=admin_matrix_result_probe.analysis_version and c.kind=p_kind),false);
          end if;
          list_ok := list_ok and not exists (
            select 1 from jsonb_array_elements(v_payload->'items') item
            where jsonb_typeof(item)<>'object' or nullif(item->>'id','') is null
              or (p_kind='tianyan' and coalesce(item->>'numberOrder' not in (v_order,'依實際開獎順序排序'),true))
          );
          select count(*)::integer into records from jsonb_array_elements(v_payload->'items') item
            where p_kind='tiangong' or item->>'numberOrder'=v_order;
          select item into v_item from jsonb_array_elements(v_payload->'items') item
            where p_kind='tiangong' or item->>'numberOrder'=v_order limit 1;
          if list_ok and records=0 then validation_ok := null;
          elsif list_ok then
            v_validation := v_payload->'validationById'->(v_item->>'id');
            validation_ok := coalesce(jsonb_typeof(v_validation)='object'
              and v_validation->>'itemId'=v_item->>'id'
              and case p_kind when 'tianyan' then
                case when jsonb_typeof(v_validation->'rules')='array' then jsonb_array_length(v_validation->'rules')=2 else false end
              else jsonb_typeof(v_validation->'evidence')='object' end,false);
          end if;
        end if;
      end if;
    exception when others then
      -- Do not leak SQL, payloads or credentials through an admin status card.
      list_ok := false; validation_ok := false;
    end;
    return next;
  end loop;
end;
$$;

-- These are related persisted outcomes, not an RPC invocation audit. Deleted or
-- overwritten history cannot prove that an operation has never been used.
create function public.admin_service_operation_evidence()
returns table(rpc_name text, observed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select 'matrix_custom_status_save', (select updated_at from public.matrix_custom_status_configs order by updated_at desc nulls last limit 1)
  union all select 'admin_matrix_permission_settings_update', (select updated_at from private.matrix_permission_settings where revision>0 limit 1)
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

revoke all on function public.admin_matrix_result_probe(text), public.admin_service_operation_evidence() from public, anon, authenticated;
grant execute on function public.admin_matrix_result_probe(text), public.admin_service_operation_evidence() to service_role;
notify pgrst, 'reload schema';
commit;
