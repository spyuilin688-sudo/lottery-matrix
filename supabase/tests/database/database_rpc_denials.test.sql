-- No member fixtures or production writes: every call uses a missing identity.
-- The transaction is explicitly read-only and rolls back its session settings.
begin read only;
set local request.method = '';
set local request.jwt.claims = '{"role":"authenticated"}';
set local role authenticated;
do $audit$
declare v_call text;
begin
  foreach v_call in array array[
    'public.matrix_custom_status_list()',
    'public.matrix_custom_status_reset(NULL::text,NULL::text)',
    'public.matrix_custom_status_save(NULL::jsonb)',
    'public.matrix_tiangong_list(NULL::jsonb)',
    'public.matrix_tiangong_validation(NULL::jsonb)',
    'public.matrix_tianyan_list(NULL::jsonb)',
    'public.matrix_tianyan_validation(NULL::jsonb)',
    'public.member_bootstrap()',
    'public.member_line_pwa_diagnostics_submit(NULL::jsonb)',
    'public.member_native_push_disable(NULL::uuid)',
    'public.member_native_push_save(NULL::uuid,NULL::text,NULL::text)',
    'public.member_notification_settings_get()',
    'public.member_notification_settings_save(NULL::jsonb)',
    'public.member_online_end(NULL::uuid)',
    'public.member_online_start()',
    'public.member_payment_history_get()',
    'public.member_pending_transfer_request()',
    'public.member_profile()',
    'public.member_push_subscription_disable(NULL::text)',
    'public.member_push_subscription_save(NULL::text,NULL::text,NULL::text)',
    'public.member_push_subscription_status(NULL::text)',
    'public.member_referral_submit(NULL::text)',
    'public.member_referral_summary()',
    'public.member_transfer_request_submit(NULL::text,NULL::text)',
    'public.redeem_activation_code(NULL::text)'
  ] loop
    begin
      execute 'select ' || v_call;
    exception when insufficient_privilege then
      continue;
    end;
    raise exception 'MISSING_IDENTITY_NOT_DENIED: %', v_call;
  end loop;
  if public.member_native_push_status(null) is distinct from
    '{"enabled":false,"refreshable":false}'::jsonb then
    raise exception 'MISSING_NATIVE_SESSION_NOT_DISABLED';
  end if;
end
$audit$;
reset role;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $audit$
declare v_call text; v_settings jsonb;
begin
  foreach v_call in array array[
    'public.matrix_explore_list(null::jsonb)',
    'public.matrix_explore_validation(null::jsonb)',
    'public.matrix_tianheng_list(null::jsonb)',
    'public.matrix_tianheng_validation(null::jsonb)'
  ] loop
    begin
      execute 'select ' || v_call;
    exception when invalid_parameter_value then
      continue;
    end;
    raise exception 'INVALID_PUBLIC_REQUEST_NOT_REJECTED: %', v_call;
  end loop;
  v_settings := public.matrix_permission_settings();
  if jsonb_typeof(v_settings) is distinct from 'object'
    or not (v_settings ?& array[
      'subscriptionPurchaseVisible','registeredMemberFreeAccess','revision','updatedAt'
    ]) or (select count(*) from jsonb_object_keys(v_settings))<>4 then
    raise exception 'PUBLIC_PERMISSION_SETTINGS_RESPONSE_CHANGED';
  end if;
end
$audit$;
rollback;
