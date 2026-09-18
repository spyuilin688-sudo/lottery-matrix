-- Emergency rollback of this guard change only; restores the audited previous function.
-- WARNING: this restores the previous silent rate-limit degradation. Apply only if needed
-- to recover compatibility, and follow with a corrected forward migration.
CREATE OR REPLACE FUNCTION private.matrix_request_guard(p_operation text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    when 'tianheng_list' then v_result:=private.matrix_tianheng_list_impl(p_request);
    when 'tianheng_validation' then v_result:=private.matrix_tianheng_validation_impl(p_request);
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
end;$function$;
