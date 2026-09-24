-- GREATEST, LEAST, COALESCE, and NULLIF are SQL syntax constructs rather
-- than schema-qualified pg_catalog functions. Repair every stored function
-- in the application schemas so latent branches cannot fail at runtime.
begin;

do $repair_qualified_sql_constructs$
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
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) ~
        'pg_catalog\.(greatest|least|coalesce|nullif)[[:space:]]*\('
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_function_oid);
    v_definition := pg_catalog.regexp_replace(
      v_definition,
      'pg_catalog\.(greatest|least|coalesce|nullif)([[:space:]]*\()',
      '\1\2',
      'gi'
    );
    execute v_definition;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) ~
        'pg_catalog\.(greatest|least|coalesce|nullif)[[:space:]]*\('
  ) then
    raise exception 'BROKEN_QUALIFIED_SQL_CONSTRUCT_REMAINS';
  end if;
end;
$repair_qualified_sql_constructs$;

commit;
