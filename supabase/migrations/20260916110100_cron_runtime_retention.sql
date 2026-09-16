begin;

-- matrix-visitor-retention and matrix-security-cleanup cadence are already owned
-- by runtime_idle_schedule_guards. Keep those schedules unchanged and only
-- extend the existing security cleanup body with bounded pg_cron history pruning.
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
