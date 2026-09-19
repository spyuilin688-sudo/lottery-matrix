-- Match the existing Watchdog origin guard without weakening authentication.
begin;
create or replace function private.matrix_optimizer_http_tick(p_scope text) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_url text;v_token text;v_request bigint;
begin
 if p_scope is null or p_scope not in ('railway','database') then raise exception 'OPTIMIZER_SCOPE_INVALID';end if;
 perform private.matrix_optimizer_prune();
 select decrypted_secret into v_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
 select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_admin_watchdog_token' limit 1;
 if nullif(trim(v_url),'') is null or nullif(trim(v_token),'') is null then return null;end if;
 select net.http_post(url:=rtrim(v_url,'/')||'/functions/v1/admin-api/api/internal/matrix-watchdog',
 headers:=jsonb_build_object('Content-Type','application/json','Origin','https://matrixlottery.idv.tw','x-matrix-watchdog-token',v_token),
 body:=jsonb_build_object('optimizer',true,'optimizerScope',p_scope),timeout_milliseconds:=120000) into v_request;
 return v_request;
end $$;

commit;
