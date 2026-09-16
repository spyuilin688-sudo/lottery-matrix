begin;

-- One service-role read for the admin watchdog. All eligibility decisions stay
-- inside private.notification_is_draw_day(), which already owns manual
-- overrides, HKJC calendar validity, and Taiwan-lottery weekday fallback.
create or replace function public.matrix_watchdog_draw_days(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text;
  v_days jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  if p_start_date is null or p_end_date is null
    or not pg_catalog.isfinite(p_start_date)
    or not pg_catalog.isfinite(p_end_date)
    or p_end_date < p_start_date
    or p_end_date - p_start_date > 16 then
    raise exception using errcode = '22023', message = 'WATCHDOG_DRAW_DAY_RANGE_INVALID';
  end if;

  foreach v_lottery in array array['今彩539','天天樂','六合彩','大樂透']::text[] loop
    select coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_char(day_value, 'YYYY-MM-DD') order by day_value),
      '[]'::jsonb
    )
    into v_days
    from (
      select series.day_value::date as day_value
      from pg_catalog.generate_series(
        p_start_date::timestamp,
        p_end_date::timestamp,
        interval '1 day'
      ) as series(day_value)
      where private.notification_is_draw_day(v_lottery, series.day_value::date)
    ) resolved;

    v_result := v_result || pg_catalog.jsonb_build_object(v_lottery, v_days);
  end loop;

  return v_result;
end;
$$;

revoke all on function public.matrix_watchdog_draw_days(date,date)
  from public, anon, authenticated, service_role;
grant execute on function public.matrix_watchdog_draw_days(date,date) to service_role;

-- Keep the minute-level Pilio cron, but make its cheap database gate use the
-- same canonical resolver as reminders and the watchdog. This preserves
-- special draw dates while skipping official non-draw dates such as an HKJC
-- Thursday that is explicitly disabled by the synchronized calendar.
create or replace function private.notification_pilio_http_tick(
  p_now timestamptz default pg_catalog.now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Taipei';
  v_date date := v_local::date;
  v_minute integer := extract(hour from v_local)::integer * 60
    + extract(minute from v_local)::integer;
  v_should_call boolean := false;
  v_project_url text;
  v_token text;
  v_request_id bigint;
begin
  if v_minute between 1234 and 1260 then
    v_should_call := (
      private.notification_is_draw_day('今彩539', v_date)
      and not exists (
        select 1 from public.notification_events
        where event_type = 'lottery_result'
          and payload->>'lottery' = '今彩539'
          and payload->>'drawDate' = v_date::text
      )
    ) or (
      private.notification_is_draw_day('大樂透', v_date)
      and not exists (
        select 1 from public.notification_events
        where event_type = 'lottery_result'
          and payload->>'lottery' = '大樂透'
          and payload->>'drawDate' = v_date::text
      )
    );
  elsif v_minute between 1294 and 1320 then
    v_should_call := private.notification_is_draw_day('六合彩', v_date)
      and not exists (
        select 1 from public.notification_events
        where event_type = 'lottery_result'
          and payload->>'lottery' = '六合彩'
          and payload->>'drawDate' = v_date::text
      );
  end if;

  if not v_should_call then
    return null;
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'matrix_project_url'
  limit 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'matrix_notification_dispatch_token'
  limit 1;

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

notify pgrst, 'reload schema';
commit;
