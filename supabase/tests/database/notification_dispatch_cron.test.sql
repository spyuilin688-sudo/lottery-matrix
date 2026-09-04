begin;

select plan(14);

create or replace function public.notification_test_cron_job_count()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if pg_catalog.to_regclass('cron.job') is null then
    return -1;
  end if;
  execute $sql$
    select pg_catalog.count(*)
    from cron.job
    where jobname in (
      'matrix-notification-pipeline-minute',
      'matrix-notification-dispatch-minute'
    )
  $sql$ into v_count;
  return v_count;
end;
$$;

create or replace function public.notification_test_cron_active_count()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if pg_catalog.to_regclass('cron.job') is null then
    return -1;
  end if;
  execute $sql$
    select pg_catalog.count(*)
    from cron.job
    where jobname in (
      'matrix-notification-pipeline-minute',
      'matrix-notification-dispatch-minute'
    )
      and active
  $sql$ into v_count;
  return v_count;
end;
$$;

create or replace function public.notification_test_cron_job_spec(p_jobname text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_spec text;
begin
  if pg_catalog.to_regclass('cron.job') is null then
    return null;
  end if;
  execute $sql$
    select schedule || '|' || command
    from cron.job
    where jobname = $1
    order by jobid desc
    limit 1
  $sql$ into v_spec using p_jobname;
  return v_spec;
end;
$$;

create or replace function public.notification_test_dispatch_tick_error()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state text;
  v_message text;
begin
  if pg_catalog.to_regprocedure('private.notification_dispatch_http_tick()') is null then
    return 'MISSING_FUNCTION';
  end if;
  begin
    execute 'select private.notification_dispatch_http_tick()';
    return 'NO_ERROR';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    return v_state || ':' || v_message;
  end;
end;
$$;

select has_extension('pg_cron', 'pg_cron is installed for notification scheduling');
select has_extension('pg_net', 'pg_net is installed for notification dispatch HTTP');
select has_function(
  'private',
  'notification_dispatch_http_tick',
  array[]::text[],
  'private notification_dispatch_http_tick exists'
);

select is(
  public.notification_test_cron_job_count(),
  2::bigint,
  'exactly two notification cron jobs exist'
);
select is(
  public.notification_test_cron_active_count(),
  0::bigint,
  'notification cron jobs are created inactive'
);
select is(
  public.notification_test_cron_job_spec('matrix-notification-pipeline-minute'),
  '* * * * *|select private.notification_pipeline_tick(pg_catalog.now());',
  'pipeline cron runs every minute and calls only the DB tick'
);
select is(
  public.notification_test_cron_job_spec('matrix-notification-dispatch-minute'),
  '* * * * *|select private.notification_dispatch_http_tick();',
  'dispatch cron runs every minute and calls the trusted HTTP tick'
);

select extensions.matches(
  pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('private.notification_dispatch_http_tick()')
  ),
  'vault\.decrypted_secrets',
  'dispatch tick reads secrets from Vault'
);
select extensions.matches(
  pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('private.notification_dispatch_http_tick()')
  ),
  'matrix_project_url',
  'dispatch tick uses the project URL Vault name'
);
select extensions.matches(
  pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('private.notification_dispatch_http_tick()')
  ),
  'matrix_notification_dispatch_token',
  'dispatch tick uses the dispatch token Vault name'
);
select extensions.matches(
  pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('private.notification_dispatch_http_tick()')
  ),
  'x-matrix-dispatch-token',
  'dispatch tick sends the custom dispatch token header'
);

select is(
  public.notification_test_dispatch_tick_error(),
  '55000:NOTIFICATION_DISPATCH_VAULT_MISSING',
  'missing Vault values fail closed with the stable dispatch error'
);

select ok(
  not pg_catalog.coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure('private.notification_dispatch_http_tick()'),
      'EXECUTE'
    ),
    true
  ),
  'anon cannot execute the trusted dispatch tick'
);
select ok(
  not pg_catalog.coalesce(
    pg_catalog.has_function_privilege(
      'authenticated',
      pg_catalog.to_regprocedure('private.notification_dispatch_http_tick()'),
      'EXECUTE'
    ),
    true
  ),
  'authenticated cannot execute the trusted dispatch tick'
);

select * from finish();

rollback;
