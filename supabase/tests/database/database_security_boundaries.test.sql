-- Read-only catalog regression test; never invokes jobs or notification senders.
begin read only;
do $audit$
declare v_table text; v_role text; v_privilege text;
begin
  foreach v_table in array array[
    'activation_code_batches', 'activation_codes', 'admin_accounts',
    'admin_login_records', 'audit_logs', 'payments', 'plans', 'transfer_requests'
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || v_table,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'UNEXPECTED_BROWSER_TABLE_PRIVILEGE: %.%', v_role, v_table;
      end if;
    end loop;
    foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if not has_table_privilege('service_role', 'public.' || v_table, v_privilege) then
        raise exception 'SERVICE_TABLE_ACCESS_MISSING: %.%', v_table, v_privilege;
      end if;
    end loop;
  end loop;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p')
      and not c.relrowsecurity
  ) then raise exception 'APP_TABLE_RLS_DISABLED'; end if;
  if not exists (
    select 1 from pg_constraint k join pg_attribute a
      on a.attrelid=k.conrelid and a.attnum=any(k.conkey)
    where k.conrelid='private.security_identity_secret'::regclass
      and k.contype='p' and k.convalidated and cardinality(k.conkey)=1
      and a.attname='singleton' and a.attnotnull and a.atttypid='boolean'::regtype
  ) then raise exception 'SECURITY_SECRET_SINGLETON_PRIMARY_KEY_MISSING'; end if;
  if not exists (
    select 1 from pg_constraint where conrelid='private.security_identity_secret'::regclass
      and contype='c' and convalidated and pg_get_constraintdef(oid)='CHECK (singleton)'
  ) then raise exception 'SECURITY_SECRET_SINGLETON_CHECK_MISSING'; end if;
  if (select count(*) from private.security_identity_secret) <> 1 then
    raise exception 'SECURITY_SECRET_SINGLETON_CARDINALITY_CHANGED';
  end if;
  if has_schema_privilege('anon','private','USAGE')
    or has_schema_privilege('authenticated','private','USAGE') then
    raise exception 'PRIVATE_SCHEMA_EXPOSED';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
      and (has_function_privilege('anon',p.oid,'EXECUTE')
        or has_function_privilege('authenticated',p.oid,'EXECUTE'))
      and (n.nspname<>'public' or not p.prosecdef
        or not coalesce(p.proconfig @> array['search_path=""'],false))
  ) then raise exception 'BROWSER_RPC_SECURITY_BOUNDARY_CHANGED'; end if;
  if (
    select array_agg(p.proname::text order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')
  ) is distinct from array[
    'matrix_explore_list','matrix_explore_validation','matrix_permission_settings',
    'matrix_tianheng_list','matrix_tianheng_validation'
  ] then raise exception 'ANONYMOUS_RPC_ALLOWLIST_CHANGED'; end if;
end
$audit$;
rollback;
