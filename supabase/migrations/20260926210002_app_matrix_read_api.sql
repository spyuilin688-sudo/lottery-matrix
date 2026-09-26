begin;
set local lock_timeout='3s';

create function public.app_matrix_entitlements()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_enabled boolean := false;
begin
  if auth.uid() is not null then
    v_enabled := exists(select 1 from public.app_entitlements where member_id=private.active_app_member_id() and source='free_launch');
  end if;
  return jsonb_build_object('canUseSeven',v_enabled,'canUseThirteen',v_enabled,
    'canUseFullRange',v_enabled,'canUseTianyan',v_enabled,'canUseTiangong',v_enabled,'canViewFullStatus',v_enabled);
end;
$$;
revoke all on function public.app_matrix_entitlements() from public,anon,authenticated,service_role;
grant execute on function public.app_matrix_entitlements() to anon,authenticated;

-- Extract the verified query definitions without retyping their filtering logic.
-- Fail closed if a concurrent branch has changed any inspected predecessor.
-- Only private wrappers can supply entitlements; neither request JSON nor GUCs
-- select an authorization provider. Existing PWA public guards stay in place.
do $extract$
declare r record; v_original text; v_core text; v_operation text; v_guard text;
begin
  for r in select * from (values
    ('matrix_explore_list_impl','a0e2bdd2ea8ee29fe286fd7de2c6b263'),
    ('matrix_explore_validation_impl','08daee1885ac5ecae6bb3b5e40e3f1c7'),
    ('matrix_tianheng_list_impl','6decc14101fbf3b91d78ad8f09120318'),
    ('matrix_tianheng_validation_impl','4b315870107ecbd78c39b1d629ef474b'),
    ('matrix_tianshu_list_impl','d21b41ba54742166fc4829363d654ccf'),
    ('matrix_tianshu_validation_impl','c423046546f2517715e5406e391f60f5'),
    ('matrix_tianyan_list_impl','8b4530fed5c4745e023d3b7f6cfc7db7'),
    ('matrix_tianyan_validation_impl','0d0a84acd69f03e8354bce148334e2d8'),
    ('matrix_tiangong_list_impl','6c37bcce7e7675b76aaa98efb95eef61'),
    ('matrix_tiangong_validation_impl','0c5a68736ed08a75a84e0b83a6aea3cb')
  ) as inspected(name,digest) loop
    v_original := pg_get_functiondef(to_regprocedure(format('private.%I(jsonb)',r.name)));
    if v_original is null or md5(v_original)<>r.digest then raise exception 'APP_MATRIX_PREDECESSOR_CHANGED: %',r.name; end if;
    v_operation := regexp_replace(r.name,'^matrix_|_impl$','','g');
    v_core := replace(v_original,r.name||'(p_request jsonb)',replace(r.name,'_impl','_core')||'(p_request jsonb, p_entitlements jsonb)');
    v_core := replace(v_core,'private.matrix_result_entitlements()','p_entitlements');
    if v_core=v_original or position('private.matrix_result_entitlements()' in v_core)>0 then raise exception 'APP_MATRIX_EXTRACTION_FAILED'; end if;
    execute v_core;
    execute format('revoke all on function private.matrix_%s_core(jsonb,jsonb) from public,anon,authenticated,service_role',v_operation);
    execute format('create or replace function private.%I(p_request jsonb) returns jsonb language sql stable security definer set search_path='''' as $body$ select private.matrix_%s_core(p_request,private.matrix_result_entitlements()) $body$',r.name,v_operation);
    execute format('revoke all on function private.%I(jsonb) from public,anon,authenticated,service_role',r.name);
  end loop;

  v_guard := pg_get_functiondef('private.matrix_request_guard(text,jsonb)'::regprocedure);
  if md5(v_guard)<>'a2729bcad5f247d5cd65cfbb424e7931' then raise exception 'APP_MATRIX_PREDECESSOR_CHANGED: matrix_request_guard'; end if;
  v_guard := replace(v_guard,'private.matrix_request_guard(','private.app_matrix_request_guard(');
  foreach v_operation in array array['explore_list','explore_validation','tianheng_list','tianheng_validation','tianshu_list','tianshu_validation','tianyan_list','tianyan_validation','tiangong_list','tiangong_validation'] loop
    v_guard := replace(v_guard,'private.matrix_'||v_operation||'_impl(p_request)',
      'private.matrix_'||v_operation||'_core(p_request,public.app_matrix_entitlements())');
  end loop;
  execute v_guard;
  revoke all on function private.app_matrix_request_guard(text,jsonb) from public,anon,authenticated,service_role;
  foreach v_operation in array array['explore_list','explore_validation','tianheng_list','tianheng_validation','tianshu_list','tianshu_validation','tianyan_list','tianyan_validation','tiangong_list','tiangong_validation'] loop
    execute format('create function public.app_matrix_%s(p_request jsonb) returns jsonb language sql security definer set search_path='''' as $body$ select private.app_matrix_request_guard(%L,p_request) $body$',v_operation,v_operation);
    execute format('revoke all on function public.app_matrix_%s(jsonb) from public,anon,authenticated,service_role',v_operation);
    execute format('grant execute on function public.app_matrix_%s(jsonb) to anon,authenticated',v_operation);
  end loop;
end;
$extract$;
notify pgrst,'reload schema';
commit;
