alter table public.system_job_status
  add column if not exists lease_token text,
  add column if not exists lease_expires_at timestamptz;

create or replace function public.claim_system_job_recovery(
  p_job_name text,
  p_lottery text,
  p_lease_token text,
  p_now timestamptz,
  p_force boolean default false
)
returns table (
  state text,
  failure_count integer,
  retry_after timestamptz,
  lease_token text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.system_job_status%rowtype;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception 'SYSTEM_JOB_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_job_name is null or p_job_name = '' or p_lease_token is null or p_lease_token = '' then
    raise exception 'SYSTEM_JOB_RECOVERY_ARGUMENT_INVALID' using errcode = '22023';
  end if;

  insert into public.system_job_status (
    job_name,
    lottery,
    status,
    started_at,
    finished_at,
    error,
    updated_at,
    failure_count,
    retry_after,
    recovery_exhausted
  ) values (
    p_job_name,
    p_lottery,
    'running',
    p_now,
    null,
    null,
    p_now,
    0,
    null,
    false
  )
  on conflict (job_name) do nothing;

  select status_row.*
  into v_row
  from public.system_job_status as status_row
  where status_row.job_name = p_job_name
  for update;

  if v_row.lease_expires_at is not null and v_row.lease_expires_at > p_now then
    return query select 'busy'::text, v_row.failure_count, null::timestamptz, null::text;
    return;
  end if;

  if not p_force and (v_row.recovery_exhausted or v_row.failure_count >= 3) then
    return query select 'exhausted'::text, v_row.failure_count, null::timestamptz, null::text;
    return;
  end if;

  if not p_force and v_row.retry_after is not null and v_row.retry_after > p_now then
    return query select 'cooldown'::text, v_row.failure_count, v_row.retry_after, null::text;
    return;
  end if;

  update public.system_job_status as status_row
  set
    lottery = p_lottery,
    status = 'running',
    started_at = p_now,
    finished_at = null,
    error = null,
    updated_at = p_now,
    failure_count = case when p_force then 0 else status_row.failure_count end,
    retry_after = null,
    recovery_exhausted = false,
    lease_token = p_lease_token,
    lease_expires_at = p_now + interval '45 seconds'
  where status_row.job_name = p_job_name
  returning status_row.* into v_row;

  return query select 'acquired'::text, v_row.failure_count, null::timestamptz, p_lease_token;
end;
$$;

create or replace function public.finish_system_job_recovery(
  p_job_name text,
  p_lease_token text,
  p_succeeded boolean,
  p_error text,
  p_now timestamptz
)
returns table (
  state text,
  failure_count integer,
  retry_after timestamptz,
  error text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.system_job_status%rowtype;
  v_failure_count integer;
  v_exhausted boolean;
  v_retry_after timestamptz;
begin
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception 'SYSTEM_JOB_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select status_row.*
  into v_row
  from public.system_job_status as status_row
  where status_row.job_name = p_job_name
  for update;

  if not found or v_row.lease_token is distinct from p_lease_token then
    raise exception 'SYSTEM_JOB_RECOVERY_LEASE_MISMATCH' using errcode = '40001';
  end if;

  if p_succeeded then
    update public.system_job_status as status_row
    set
      status = 'success',
      finished_at = p_now,
      error = null,
      updated_at = p_now,
      failure_count = 0,
      retry_after = null,
      recovery_exhausted = false,
      lease_token = null,
      lease_expires_at = null
    where status_row.job_name = p_job_name;
    return query select 'success'::text, 0, null::timestamptz, null::text;
    return;
  end if;

  v_failure_count := v_row.failure_count + 1;
  v_exhausted := v_failure_count >= 3;
  v_retry_after := case
    when v_exhausted then null
    else p_now + interval '10 minutes'
  end;
  update public.system_job_status as status_row
  set
    status = 'failed',
    finished_at = p_now,
    error = p_error,
    updated_at = p_now,
    failure_count = v_failure_count,
    retry_after = v_retry_after,
    recovery_exhausted = v_exhausted,
    lease_token = null,
    lease_expires_at = null
  where status_row.job_name = p_job_name;

  return query select
    case when v_exhausted then 'exhausted'::text else 'scheduled'::text end,
    v_failure_count,
    v_retry_after,
    p_error;
end;
$$;

revoke all on function public.claim_system_job_recovery(text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
revoke all on function public.finish_system_job_recovery(text, text, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_system_job_recovery(text, text, text, timestamptz, boolean)
  to service_role;
grant execute on function public.finish_system_job_recovery(text, text, boolean, text, timestamptz)
  to service_role;
