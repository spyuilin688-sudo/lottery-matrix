begin;

-- Keep the Edge polling window and the pg_cron gate identical. The Edge
-- function still performs the authoritative date/number parsing; this wrapper
-- only decides whether an invocation is useful.
create or replace function private.notification_pilio_http_tick(p_now timestamptz default pg_catalog.now())
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Taipei';
  v_date date := v_local::date;
  v_isodow integer := extract(isodow from v_local)::integer;
  v_minute integer := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_should_call boolean := false;
  v_project_url text;
  v_token text;
  v_request_id bigint;
begin
  -- 20:34-21:00: 今彩539 / 大樂透. 21:34-22:00:六合彩.
  -- Draw days are explicit here so the wrapper has no dependency on a second
  -- scheduler helper: 539 Mon-Sat, Lotto649 Tue/Fri, Mark Six Tue/Thu/Sat.
  if v_minute between 1234 and 1260 then
    v_should_call := (
      v_isodow between 1 and 6
      and not exists (
        select 1 from public.notification_events
        where event_type = 'lottery_result'
          and payload->>'lottery' = '今彩539'
          and payload->>'drawDate' = v_date::text
      )
    ) or (
      v_isodow in (2, 5)
      and not exists (
        select 1 from public.notification_events
        where event_type = 'lottery_result'
          and payload->>'lottery' = '大樂透'
          and payload->>'drawDate' = v_date::text
      )
    );
  elsif v_minute between 1294 and 1320 then
    v_should_call := v_isodow in (2, 4, 6)
      and not exists (
        select 1 from public.notification_events
        where event_type = 'lottery_result'
          and payload->>'lottery' = '六合彩'
          and payload->>'drawDate' = v_date::text
      );
  end if;

  if not v_should_call then return null; end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'matrix_project_url' limit 1;
  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'matrix_notification_dispatch_token' limit 1;
  if nullif(pg_catalog.btrim(v_project_url), '') is null
    or nullif(pg_catalog.btrim(v_token), '') is null then
    raise exception using errcode = '55000', message = 'NOTIFICATION_PILIO_VAULT_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/notification-pilio',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-matrix-dispatch-token', v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.notification_pilio_http_tick(timestamptz)
  from public, anon, authenticated, service_role;

-- The source job stays minute-level because the useful windows begin on minute
-- boundaries and it self-skips when today is not a draw day or the result is
-- already recorded.
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'matrix-notification-pilio-minute';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;
select cron.schedule(
  'matrix-notification-pilio-minute',
  '* * * * *',
  'select private.notification_pilio_http_tick();'
);

-- Anonymous visitor identifiers expire after 90 days. Running the same delete
-- every minute provides no product benefit; once daily is sufficient.
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'matrix-visitor-retention';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;
select cron.schedule(
  'matrix-visitor-retention',
  '17 19 * * *',
  'select private.purge_matrix_visitor_identifiers();'
);

-- Security monitoring records are retained for days, not minutes. Hourly
-- cleanup preserves the retention contract without five-minute churn.
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'matrix-security-cleanup';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;
select cron.schedule(
  'matrix-security-cleanup',
  '27 * * * *',
  'select private.security_cleanup();'
);

commit;
