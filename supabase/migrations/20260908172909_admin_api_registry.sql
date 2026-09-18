begin;
set local lock_timeout = '5s';

-- OpenAPI only lists functions executable by its caller. The admin status page
-- needs registration evidence for member-only RPCs without executing them or
-- changing their grants. This stable query returns names, never member data.
create function public.admin_api_registry()
returns table (rpc_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct p.proname::text
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f';
$$;

revoke all on function public.admin_api_registry() from public, anon, authenticated;
grant execute on function public.admin_api_registry() to service_role;
comment on function public.admin_api_registry() is
  'Read-only API registration evidence for the administrator status page; does not verify execution permissions or invoke listed functions.';
commit;
