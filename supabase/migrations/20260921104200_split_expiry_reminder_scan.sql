begin;

-- Minute-level work only needs to answer whether a configured bet reminder can
-- fire at this Taipei minute. Membership-expiry reminders are date-based, so
-- scanning all members every minute is unnecessary.
create or replace function private.notification_time_events_due(
  p_now timestamptz default pg_catalog.now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.now());
  v_local_date date := (v_now at time zone 'Asia/Taipei')::date;
  v_local_minute text := pg_catalog.to_char(v_now at time zone 'Asia/Taipei', 'HH24:MI');
  v_539 boolean;
  v_fantasy5 boolean;
  v_marksix boolean;
  v_lotto649 boolean;
begin
  v_539 := private.notification_is_draw_day('今彩539', v_local_date);
  v_fantasy5 := private.notification_is_draw_day('天天樂', v_local_date);
  v_marksix := private.notification_is_draw_day('六合彩', v_local_date);
  v_lotto649 := private.notification_is_draw_day('大樂透', v_local_date);

  return exists (
    select 1
    from public.notification_settings as setting
    join public.members as member on member.id = setting.member_id
    where coalesce(member.status, '') not in ('停用', 'disabled', 'inactive')
      and setting.settings @> '{"settings":{"bet":true}}'::jsonb
      and (
        (
          v_539
          and setting.settings @> pg_catalog.jsonb_build_object(
            'betTimes',
            pg_catalog.jsonb_build_object('今彩539', pg_catalog.jsonb_build_array(v_local_minute))
          )
        )
        or (
          v_fantasy5
          and setting.settings @> pg_catalog.jsonb_build_object(
            'betTimes',
            pg_catalog.jsonb_build_object('天天樂', pg_catalog.jsonb_build_array(v_local_minute))
          )
        )
        or (
          v_marksix
          and setting.settings @> pg_catalog.jsonb_build_object(
            'betTimes',
            pg_catalog.jsonb_build_object('六合彩', pg_catalog.jsonb_build_array(v_local_minute))
          )
        )
        or (
          v_lotto649
          and setting.settings @> pg_catalog.jsonb_build_object(
            'betTimes',
            pg_catalog.jsonb_build_object('大樂透', pg_catalog.jsonb_build_array(v_local_minute))
          )
        )
      )
    limit 1
  );
end;
$$;

revoke all on function private.notification_time_events_due(timestamptz)
  from public, anon, authenticated, service_role;

-- Expiry reminders are date-based and idempotent by event_key. Run once at
-- Taipei midnight and once five minutes later as a bounded retry instead of
-- making every minute inspect member expiries. pg_cron uses UTC here.
select cron.schedule(
  'matrix-notification-expiry-daily',
  '0,5 16 * * *',
  'select private.notification_time_events_tick(pg_catalog.now());'
);

commit;
