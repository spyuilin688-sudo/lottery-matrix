begin;

do $matrix_python_v8_explore_rpc$
declare
  v_function_oid oid;
  v_definition text;
begin
  for v_function_oid in
    select p.oid
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in ('matrix_explore_list', 'matrix_explore_validation')
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_function_oid);

    if position('matrix-python-v7' in v_definition) = 0 then
      raise exception 'EXPECTED_MATRIX_PYTHON_V7_REFERENCE_MISSING:%', v_function_oid;
    end if;

    v_definition := pg_catalog.replace(
      v_definition,
      'matrix-python-v7',
      'matrix-python-v8'
    );
    execute v_definition;
  end loop;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in ('matrix_explore_list', 'matrix_explore_validation')
  ) <> 2 then
    raise exception 'MATRIX_EXPLORE_RPC_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in ('matrix_explore_list', 'matrix_explore_validation')
      and position('matrix-python-v7' in pg_catalog.pg_get_functiondef(p.oid)) > 0
  ) then
    raise exception 'MATRIX_PYTHON_V7_RPC_REFERENCE_REMAINS';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in ('matrix_explore_list', 'matrix_explore_validation')
      and position('matrix-python-v8' in pg_catalog.pg_get_functiondef(p.oid)) = 0
  ) then
    raise exception 'MATRIX_PYTHON_V8_RPC_REFERENCE_MISSING';
  end if;
end;
$matrix_python_v8_explore_rpc$;

commit;
