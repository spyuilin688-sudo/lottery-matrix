-- Release-only: run AFTER the atomic subsystem draft has been installed and verified.
begin;
create function private.admin_security_push_tick() returns bigint
language plpgsql security definer set search_path='' as $$
declare v_url text;v_token text;v_request bigint;
begin
 if not exists(select 1 from private.admin_security_push_jobs j where (j.status='pending' and j.next_attempt_at<=now()) or (j.status='sending' and j.lease_until<=now())) then return null; end if;
 select decrypted_secret into v_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
 select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_notification_dispatch_token' limit 1;
 if nullif(trim(v_url),'') is null or nullif(trim(v_token),'') is null then raise exception 'SECURITY_PUSH_CONFIG_MISSING'; end if;
 select net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/admin-security-push',
 headers:=jsonb_build_object('Content-Type','application/json','x-matrix-dispatch-token',v_token),body:='{}'::jsonb,timeout_milliseconds:=30000) into v_request;
 return v_request;
end;$$;
revoke all on function private.admin_security_push_tick() from public,anon,authenticated,service_role;
select cron.schedule('admin-security-push-minute','* * * * *','select private.admin_security_push_tick();');
select cron.schedule('matrix-security-cleanup','*/5 * * * *','select private.security_cleanup();');
commit;
