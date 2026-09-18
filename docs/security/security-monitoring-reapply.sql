-- Reapply after rollback only; preserves existing evidence and policies. Scheduler remains separate.
begin;
-- Preconditions verify the six audited ACLs and original volatility before moving definitions unchanged.
do $$declare f text; op text; n text; p pg_proc%rowtype; begin
 foreach f in array array['explore','tianyan','tiangong'] loop foreach op in array array['list','validation'] loop
 n:='matrix_'||f||'_'||op;
 select * into strict p from pg_proc where oid=to_regprocedure('public.'||n||'(jsonb)');
 if exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee=0 or pg_get_userbyid(acl.grantee) not in ('postgres','anon','authenticated','service_role') or (acl.is_grantable and acl.grantee<>p.proowner)) then raise exception 'SECURITY_WRAPPER_UNEXPECTED_ACL: %',n; end if;
 if p.provolatile<>'s' or not p.prosecdef or p.prorettype<>'jsonb'::regtype or to_regprocedure('private.'||n||'_impl(jsonb)') is not null then raise exception 'SECURITY_WRAPPER_PRECONDITION: %',n; end if;
 if has_function_privilege('anon',p.oid,'execute')<>(f='explore') or not has_function_privilege('authenticated',p.oid,'execute') or not has_function_privilege('service_role',p.oid,'execute') then raise exception 'SECURITY_WRAPPER_ACL_CHANGED: %',n; end if;
 execute format('alter function public.%I(jsonb) set schema private',n);
 execute format('alter function private.%I(jsonb) rename to %I',n,n||'_impl');
 execute format('revoke all on function private.%I(jsonb) from public,anon,authenticated',n||'_impl');
 end loop;end loop;end$$;

create or replace function private.matrix_request_guard(p_operation text,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_method text:=nullif(current_setting('request.method',true),''); v_uid text; v_source text; v_guard jsonb; v_result jsonb;
 v_code text;v_message text;v_detail text;v_hint text; v_status text;
begin
 if v_method is not null and v_method<>'POST' then raise exception using errcode='25006',message='POST_REQUIRED'; end if;
 if v_method='POST' then
   if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'prefer','') ~* '(^|,)\s*tx\s*=\s*rollback\s*(,|$)' then raise exception using errcode='22023',message='TRANSACTION_ROLLBACK_NOT_SUPPORTED'; end if;
   begin
    v_uid:=auth.uid()::text;
    select encode(sha256(convert_to(secret||coalesce(v_uid,'unattributed'),'UTF8')),'hex') into v_source from private.security_identity_secret;
    v_guard:=private.security_collect('public_query',v_source,v_uid is not null,'attempt');
   exception when others then v_guard:=null; end;
   if v_guard->>'allowed'='false' then
     perform set_config('response.status','429',true);
     perform set_config('response.headers',jsonb_build_array(jsonb_build_object('Retry-After',v_guard->>'retryAfter'))::text,true);
     return jsonb_build_object('code','RATE_LIMITED','message','Too many requests','details',null,'hint',null);
   end if;
 end if;
 begin
   case p_operation
    when 'explore_list' then v_result:=private.matrix_explore_list_impl(p_request);
    when 'explore_validation' then v_result:=private.matrix_explore_validation_impl(p_request);
    when 'tianyan_list' then v_result:=private.matrix_tianyan_list_impl(p_request);
    when 'tianyan_validation' then v_result:=private.matrix_tianyan_validation_impl(p_request);
    when 'tiangong_list' then v_result:=private.matrix_tiangong_list_impl(p_request);
    when 'tiangong_validation' then v_result:=private.matrix_tiangong_validation_impl(p_request);
    else raise exception 'INVALID_OPERATION';
   end case;
 exception when others then
   get stacked diagnostics v_code=returned_sqlstate,v_message=message_text,v_detail=pg_exception_detail,v_hint=pg_exception_hint;
   if v_method is null or not(v_code in ('42501','22023','22P02','22007','22008') or (v_code='P0001' and v_message in ('ANALYSIS_NOT_FOUND','ANALYSIS_NOT_READY','ANALYSIS_VERSION_MISMATCH','ANALYSIS_STALE','INVALID_REQUEST','FORBIDDEN'))) then raise; end if;
 end;
 if v_code is not null then
   if v_code<>'P0001' then
     begin perform private.security_collect('public_query',v_source,v_uid is not null,case when v_code='42501' then 'denied' else 'invalid' end); exception when others then null; end;
   end if;
   v_status:=case when v_code='42501' then case when coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','anon')='anon' then '401' else '403' end else '400' end;
   perform set_config('response.status',v_status,true);
   return jsonb_build_object('code',v_code,'message',v_message,'details',nullif(v_detail,''),'hint',nullif(v_hint,''));
 end if;
 return v_result;
end;$$;
revoke all on function private.matrix_request_guard(text,jsonb) from public,anon,authenticated,service_role;

do $$declare f text;op text;n text;v_owner text;begin
 foreach f in array array['explore','tianyan','tiangong'] loop foreach op in array array['list','validation'] loop
 n:='matrix_'||f||'_'||op;
 select pg_get_userbyid(proowner) into v_owner from pg_proc where oid=to_regprocedure('private.'||n||'_impl(jsonb)');
 execute format('create function public.%I(p_request jsonb) returns jsonb language sql volatile security definer set search_path='''' as %L',n,'select private.matrix_request_guard('||quote_literal(f||'_'||op)||',p_request)');
 execute format('alter function public.%I(jsonb) owner to %I',n,v_owner);
 execute format('revoke all on function public.%I(jsonb) from public,anon,authenticated,service_role',n);
 execute format('grant execute on function public.%I(jsonb) to authenticated,service_role',n);
 if f='explore' then execute format('grant execute on function public.%I(jsonb) to anon',n); end if;
 end loop;end loop;
end$$;

grant execute on function public.security_observe(text,text,boolean,text),public.security_policy_update(uuid,text,text,integer,integer,integer),public.security_policy_list(uuid),public.admin_security_push_claim(),public.admin_security_push_eligible(uuid,uuid),public.admin_security_push_finish(uuid,uuid,text,boolean) to service_role;
commit;
