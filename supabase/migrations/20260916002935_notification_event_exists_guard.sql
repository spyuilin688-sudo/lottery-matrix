begin;

-- Cheap service-role-only existence probe for Railway producers. This reuses
-- notification_events as the durable cross-invocation state and does not add a
-- second notification state table. The existing unique constraints remain the
-- final concurrency defense.
create or replace function public.matrix_notification_event_exists(
  p_event_key text,
  p_event_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event_key text := pg_catalog.btrim(coalesce(p_event_key, ''));
  v_lottery text := p_payload->>'lottery';
  v_draw_date text := p_payload->>'drawDate';
begin
  if v_event_key = ''
    or p_event_type is null
    or p_payload is null
    or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_EVENT_PROBE';
  end if;

  if exists (
    select 1
    from public.notification_events
    where event_key = v_event_key
  ) then
    return true;
  end if;

  -- Pilio preliminary results use a date-based key while Railway confirmation
  -- uses the official period key. Treat the same lottery/date as already
  -- published so a later cron invocation does not make a duplicate HTTP call.
  if p_event_type = 'lottery_result'
    and nullif(v_lottery, '') is not null
    and v_draw_date ~ '^\d{4}-\d{2}-\d{2}$' then
    return exists (
      select 1
      from public.notification_events
      where event_type = 'lottery_result'
        and payload->>'lottery' = v_lottery
        and payload->>'drawDate' = v_draw_date
    );
  end if;

  return false;
end;
$$;

revoke all on function public.matrix_notification_event_exists(text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.matrix_notification_event_exists(text,text,jsonb)
  to service_role;

commit;
