begin;

-- Visitor identifiers have a 90-day retention horizon. Keep the same purge
-- function and alter the existing cron in place instead of waking every minute.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'matrix-visitor-retention';

  if v_job_id is null then
    raise exception 'MATRIX_VISITOR_RETENTION_CRON_MISSING';
  end if;

  perform cron.alter_job(
    job_id := v_job_id,
    schedule := '17 4 * * *'
  );
end;
$$;

create or replace function private.security_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '100ms'
as $$
begin
  delete from private.admin_security_push_jobs
  where id in (
    select id
    from private.admin_security_push_jobs
    where created_at < pg_catalog.now() - interval '7 days'
      and (status <> 'sending' or lease_until < pg_catalog.now())
    limit 1000
    for update skip locked
  );

  delete from private.security_policy_audit
  where id in (
    select id
    from private.security_policy_audit
    where created_at < pg_catalog.now() - interval '7 days'
    limit 1000
    for update skip locked
  );

  delete from private.security_events
  where (category, slot) in (
    select category, slot
    from private.security_events
    where updated_at < pg_catalog.now() - interval '7 days'
    limit 1000
    for update skip locked
  );

  delete from private.security_counters
  where (category, slot) in (
    select category, slot
    from private.security_counters
    where updated_at < pg_catalog.now() - interval '7 days'
    limit 1000
    for update skip locked
  );

  -- pg_cron does not clean job_run_details automatically. Keep a bounded
  -- diagnostic window and only remove finished rows, never an active run.
  delete from cron.job_run_details as run
  where run.runid in (
    select old_run.runid
    from cron.job_run_details as old_run
    where old_run.end_time is not null
      and old_run.end_time < pg_catalog.now() - interval '14 days'
    order by old_run.end_time, old_run.runid
    limit 5000
  );
end;
$$;

commit;
