-- Release-only rollback: stop new code producers first. Retains private evidence/audit for review.
begin;
-- If scheduler was installed, unschedule only our jobs before running this script:
-- select cron.unschedule(jobid) from cron.job where jobname in ('admin-security-push-minute','matrix-security-cleanup');
do $$declare f text;op text;n text;begin
 foreach f in array array['explore','tianyan','tiangong'] loop foreach op in array array['list','validation'] loop
 n:='matrix_'||f||'_'||op;
 execute format('drop function public.%I(jsonb)',n);
 execute format('alter function private.%I(jsonb) rename to %I',n||'_impl',n);
 execute format('alter function private.%I(jsonb) set schema public',n);
 execute format('revoke all on function public.%I(jsonb) from public,anon,authenticated,service_role',n);
 execute format('grant execute on function public.%I(jsonb) to authenticated,service_role',n);
 if f='explore' then execute format('grant execute on function public.%I(jsonb) to anon',n); end if;
 end loop;end loop;
end$$;
update private.security_policies set mode='observe';
revoke all on function public.security_observe(text,text,boolean,text),public.security_policy_update(uuid,text,text,integer,integer,integer),public.security_policy_list(uuid),public.admin_security_push_claim(),public.admin_security_push_eligible(uuid,uuid),public.admin_security_push_finish(uuid,uuid,text,boolean) from service_role;
commit;
