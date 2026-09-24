alter table public.system_job_status
  add column if not exists source_period text,
  add column if not exists database_period text,
  add column if not exists written_period text;

alter table public.system_job_status
  drop constraint if exists system_job_status_status_check;

alter table public.system_job_status
  add constraint system_job_status_status_check
  check (status in ('running', 'waiting_source', 'success', 'failed'));
