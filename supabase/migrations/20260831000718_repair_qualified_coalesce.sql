-- COALESCE is SQL syntax, not a pg_catalog function. Older migrations
-- schema-qualified it inside function bodies, which fails only at runtime.
begin;

do $repair_qualified_coalesce$
declare
  v_function_oid oid;
  v_definition text;
begin
  for v_function_oid in
    select p.oid
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and position(
        'pg_catalog.coalesce'
        in pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid))
      ) > 0
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_function_oid);
    v_definition := pg_catalog.replace(v_definition, 'pg_catalog.coalesce', 'coalesce');
    execute v_definition;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and position(
        'pg_catalog.coalesce'
        in pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid))
      ) > 0
  ) then
    raise exception 'BROKEN_QUALIFIED_COALESCE_REMAINS';
  end if;
end;
$repair_qualified_coalesce$;

commit;
