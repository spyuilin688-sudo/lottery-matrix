-- Post-migration contract, runnable on a local database without application fixtures.
begin read only;
do $retirement$
declare
 v_signature text;
 v_role text;
begin
 if to_regclass('public.matrix_custom_status_configs') is not null
   or to_regclass('public.matrix_custom_status_results') is not null then
   raise exception 'Retired custom tables remain';
 end if;
 if to_regprocedure('public.matrix_status_identity_get(jsonb)') is not null then
   raise exception 'Retired custom cache identity RPC remains';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.proname like 'matrix_custom_status%') then
   raise exception 'Retired custom RPC or helper remains';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.prokind='f'
   and (p.prosrc like '%matrix_custom_status%' or p.prosrc like '%canCustomizeStatus%'
     or p.prosrc like '%canUseCompositeCustomRoad%')) then
   raise exception 'A shared function still depends on custom status';
 end if;
 foreach v_signature in array array[
   'public.matrix_watchdog_chain_state(text,text)',
   'public.complete_matrix_watchdog_recovery(text,text,text,text)',
   'public.admin_service_operation_evidence()'
 ] loop
   foreach v_role in array array['anon','authenticated'] loop
     if has_function_privilege(v_role,v_signature,'EXECUTE') then
       raise exception '% may execute restricted function %',v_role,v_signature;
     end if;
   end loop;
   if not has_function_privilege('service_role',v_signature,'EXECUTE') then
     raise exception 'service_role cannot execute %',v_signature;
   end if;
 end loop;
 foreach v_role in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(v_role,'private.matrix_result_entitlements()','EXECUTE') then
     raise exception '% may execute private entitlement helper',v_role;
   end if;
 end loop;
 if to_regclass('public.lottery_draws') is null
   or to_regclass('public.matrix_analysis_runs') is null
   or to_regclass('public.matrix_analysis_artifacts') is null
   or to_regclass('private.matrix_analysis_active_versions') is null
   or to_regclass('public.matrix_watchdog_leases') is null
   or to_regclass('public.system_job_status') is null then
   raise exception 'A shared Matrix table was removed';
 end if;
end;
$retirement$;
rollback;
