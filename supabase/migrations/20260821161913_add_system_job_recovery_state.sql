alter table public.system_job_status
  add column if not exists failure_count integer not null default 0,
  add column if not exists retry_after timestamptz,
  add column if not exists recovery_exhausted boolean not null default false;

alter table public.system_job_status
  drop constraint if exists system_job_status_failure_count_check;

alter table public.system_job_status
  add constraint system_job_status_failure_count_check
  check (failure_count >= 0);
