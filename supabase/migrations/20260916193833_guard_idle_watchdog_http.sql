begin;

-- Keep the physical 10-minute watchdog cadence, but avoid waking the admin API
-- unless the current tick overlaps one of the recovery checkpoints already
-- used by apps/admin/backend/watchdog.ts. Draw-day eligibility stays delegated
-- to the canonical Supabase resolver so manual overrides and synchronized
-- calendars remain authoritative.
create or replace function private.matrix_watchdog_should_call(
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current_minute timestamptz := pg_catalog.date_trunc('minute', p_now);
  v_previous_tick timestamptz := pg_catalog.date_trunc('minute', p_now) - interval '10 minutes';
  v_local_date date := (p_now at time zone 'Asia/Taipei')::date;
  v_lottery text;
  v_cycle_offset integer;
  v_cycle_day date;
  v_base timestamptz;
  v_next_primary timestamptz;
  v_future_offset integer;
  v_future_day date;
  v_checkpoint integer;
  v_due_at timestamptz;
  v_is_cycle_day boolean;
  v_checkpoints integer[] := array[
    10,20,30,40,50,60,70,80,90,
    120,150,180,210,240,270,300,
    360,420,480,540,600,660,720,780,840,
    900,960,1020,1080,1140,1200,1260,1320,1380,
    1410
  ];
begin
  foreach v_lottery in array array['今彩539','天天樂','六合彩','大樂透']::text[] loop
    for v_cycle_offset in 0..1 loop
      v_cycle_day := v_local_date - v_cycle_offset;
      v_is_cycle_day := private.notification_is_draw_day(v_lottery, v_cycle_day)
        or (
          v_lottery = '六合彩'
          and extract(isodow from v_cycle_day)::integer = 7
          and private.notification_is_draw_day('六合彩', v_cycle_day - 1)
        );
      if not v_is_cycle_day then
        continue;
      end if;

      if v_lottery = '天天樂' then
        -- The upstream Fantasy 5 draw is 18:33 America/Los_Angeles on the
        -- previous source date. Converting that instant automatically follows
        -- DST and yields the same 09:33/10:33 Taipei clock used by watchdog.ts.
        v_base := (((v_cycle_day - 1)::text || ' 18:33:00')::timestamp
          at time zone 'America/Los_Angeles');
      elsif v_lottery = '今彩539' then
        v_base := (v_cycle_day + time '20:33') at time zone 'Asia/Taipei';
      elsif v_lottery = '大樂透' then
        v_base := (v_cycle_day + time '20:53') at time zone 'Asia/Taipei';
      else
        v_base := (v_cycle_day + time '21:33') at time zone 'Asia/Taipei';
      end if;

      v_next_primary := 'infinity'::timestamptz;
      for v_future_offset in 1..9 loop
        v_future_day := v_cycle_day + v_future_offset;
        if not private.notification_is_draw_day(v_lottery, v_future_day) then
          continue;
        end if;

        if v_lottery = '天天樂' then
          v_next_primary := (((v_future_day - 1)::text || ' 18:33:00')::timestamp
            at time zone 'America/Los_Angeles');
        elsif v_lottery = '今彩539' then
          v_next_primary := (v_future_day + time '20:33') at time zone 'Asia/Taipei';
        elsif v_lottery = '大樂透' then
          v_next_primary := (v_future_day + time '20:53') at time zone 'Asia/Taipei';
        else
          v_next_primary := (v_future_day + time '21:33') at time zone 'Asia/Taipei';
        end if;
        exit;
      end loop;

      foreach v_checkpoint in array v_checkpoints loop
        -- The production evaluator stops Saturday Mark Six recovery after the
        -- first 90 minutes; Sunday owns the later weekend recovery cycle.
        if v_lottery = '六合彩'
          and extract(isodow from v_cycle_day)::integer = 6
          and v_checkpoint > 90 then
          continue;
        end if;

        v_due_at := v_base + pg_catalog.make_interval(mins => v_checkpoint);
        if v_due_at < v_next_primary
          and v_due_at > v_previous_tick
          and v_due_at <= v_current_minute then
          return true;
        end if;
      end loop;
    end loop;
  end loop;

  return false;
end;
$$;

revoke all on function private.matrix_watchdog_should_call(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.matrix_admin_watchdog_http_tick(
  p_now timestamptz default pg_catalog.now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_token text;
  v_request_id bigint;
begin
  if not private.matrix_watchdog_should_call(p_now) then
    return null;
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'matrix_project_url'
  limit 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'matrix_admin_watchdog_token'
  limit 1;

  if nullif(pg_catalog.btrim(v_project_url), '') is null
    or nullif(pg_catalog.btrim(v_token), '') is null then
    raise exception using errcode = '55000', message = 'MATRIX_WATCHDOG_VAULT_MISSING';
  end if;

  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/admin-api/api/internal/matrix-watchdog',
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Origin', 'https://matrixlottery.idv.tw',
      'x-matrix-watchdog-token', v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.matrix_admin_watchdog_http_tick(timestamptz)
  from public, anon, authenticated, service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'matrix-admin-watchdog-v1';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'matrix-admin-watchdog-v1',
  '3-59/10 * * * *',
  'select private.matrix_admin_watchdog_http_tick();'
);

commit;
