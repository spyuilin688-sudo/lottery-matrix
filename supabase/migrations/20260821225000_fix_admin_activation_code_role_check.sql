create or replace function public.admin_delete_activation_code(
  p_code_id uuid,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ADMIN_BACKEND_REQUIRED';
  end if;

  select pg_catalog.to_jsonb(activation_code)
  into v_before
  from public.activation_codes as activation_code
  where activation_code.id = p_code_id
  for update;

  if v_before is null then
    raise exception using errcode = 'P0002', message = 'ACTIVATION_CODE_NOT_FOUND';
  end if;

  delete from public.activation_codes
  where id = p_code_id;

  insert into public.audit_logs (
    admin_id,
    admin,
    operation_type,
    target_table,
    target_id,
    content,
    before_data
  ) values (
    p_actor_id,
    p_actor_name,
    '刪除',
    'activation_codes',
    p_code_id::text,
    '刪除啟動碼',
    v_before
  );

  return pg_catalog.jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.admin_delete_activation_code(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_delete_activation_code(uuid, uuid, text)
  to service_role;
