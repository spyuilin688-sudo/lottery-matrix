begin;

-- Keep the existing five-minute notification recovery job as the only poller.
-- It now wakes a lightweight Mark Six calendar refresh only when the calendar
-- is actually due (daily or within 20 minutes of an enabled reminder).
create or replace function private.notification_draw_calendar_refresh_due(
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Taipei';
  v_state private.notification_draw_calendar_sync;
  v_due boolean;
begin
  if p_now is null or not pg_catalog.isfinite(p_now) then
    return false;
  end if;

  select *
    into v_state
  from private.notification_draw_calendar_sync
  where lottery = '六合彩';

  if not found
    or v_state.lease_expires_at > p_now
    or v_state.next_attempt_at > p_now then
    return false;
  end if;

  v_due := v_state.last_success_at is null
    or v_state.last_error is not null
    or (v_state.last_success_at at time zone 'Asia/Taipei')::date < v_local::date;

  if not v_due and v_state.last_success_at <= p_now - interval '15 minutes' then
    select exists (
      select 1
      from public.notification_settings s
      join public.members m on m.id = s.member_id
      cross join lateral pg_catalog.jsonb_array_elements_text(
        case
          when pg_catalog.jsonb_typeof(s.settings#>'{betTimes,六合彩}') = 'array'
            then s.settings#>'{betTimes,六合彩}'
          else '[]'::jsonb
        end
      ) t(value)
      cross join (values (0),(1)) d(offset_days)
      where coalesce(m.status,'') not in ('停用','disabled','inactive')
        and s.settings#>>'{settings,bet}' = 'true'
        and case
          when t.value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
            (v_local::date + d.offset_days + t.value::time)
              between v_local and v_local + interval '20 minutes'
          else false
        end
    ) into v_due;
  end if;

  return coalesce(v_due, false);
end;
$$;

create or replace function private.notification_draw_calendar_refresh_http_tick(
  p_now timestamptz default pg_catalog.now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Taipei';
  v_cycle_date date;
  v_url text;
  v_token text;
  v_request bigint;
begin
  if not private.notification_draw_calendar_refresh_due(p_now) then
    return null;
  end if;

  -- The existing primary worker route already supports a single-lottery run.
  -- Reuse it instead of creating another Railway service or another cron job.
  v_cycle_date := v_local::date
    - case when v_local::time < time '20:30' then 1 else 0 end;

  select decrypted_secret
    into v_url
  from vault.decrypted_secrets
  where name = 'matrix_project_url'
  limit 1;

  select decrypted_secret
    into v_token
  from vault.decrypted_secrets
  where name = 'matrix_admin_watchdog_token'
  limit 1;

  if nullif(pg_catalog.btrim(v_url),'') is null
    or nullif(pg_catalog.btrim(v_token),'') is null then
    raise exception 'CALENDAR_REFRESH_CONFIG_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_url,'/') || '/functions/v1/admin-api/api/internal/matrix-primary',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type','application/json',
      'Origin','https://matrixlottery.idv.tw',
      'x-matrix-watchdog-token',v_token
    ),
    body := pg_catalog.jsonb_build_object(
      'group','evening',
      'cycleDate',v_cycle_date,
      'lotteries',pg_catalog.jsonb_build_array('六合彩')
    ),
    timeout_milliseconds := 30000
  ) into v_request;

  return v_request;
end;
$$;

revoke all on function private.notification_draw_calendar_refresh_due(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.notification_draw_calendar_refresh_http_tick(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.notification_recovery_tick(
  p_now timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fanout jsonb := '{}'::jsonb;
  v_web bigint;
  v_native bigint;
  v_admin bigint;
  v_calendar bigint;
  v_fanout_failed boolean := false;
  v_web_failed boolean := false;
  v_native_failed boolean := false;
  v_admin_failed boolean := false;
  v_calendar_failed boolean := false;
begin
  begin
    v_fanout := private.notification_fanout_drain(100, p_now);
  exception
    when others then
      v_fanout_failed := true;
  end;

  begin
    v_web := private.notification_dispatch_http_tick();
  exception
    when others then
      v_web_failed := true;
  end;

  begin
    v_native := private.native_notification_dispatch_http_tick();
  exception
    when others then
      v_native_failed := true;
  end;

  begin
    v_admin := private.admin_transfer_push_tick();
  exception
    when others then
      v_admin_failed := true;
  end;

  begin
    v_calendar := private.notification_draw_calendar_refresh_http_tick(p_now);
  exception
    when others then
      v_calendar_failed := true;
  end;

  return pg_catalog.jsonb_build_object(
    'fanout', v_fanout,
    'fanoutFailed', v_fanout_failed,
    'webRequestId', v_web,
    'webFailed', v_web_failed,
    'nativeRequestId', v_native,
    'nativeFailed', v_native_failed,
    'adminRequestId', v_admin,
    'adminFailed', v_admin_failed,
    'calendarRequestId', v_calendar,
    'calendarFailed', v_calendar_failed
  );
end;
$$;

revoke all on function private.notification_recovery_tick(timestamptz)
  from public, anon, authenticated, service_role;

commit;
