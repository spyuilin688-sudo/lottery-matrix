begin;

-- Extend the existing notification calendar; keep one date resolver.
alter table private.notification_draw_day_overrides
  add column source_kind text not null default 'manual' check (source_kind in ('manual','hkjc')),
  add column valid_until timestamptz;

create table private.notification_draw_calendar_sync (
  lottery text primary key check (lottery = '六合彩'),
  lease_owner uuid,
  lease_expires_at timestamptz,
  last_started_at timestamptz,
  last_success_at timestamptz,
  valid_until timestamptz,
  next_attempt_at timestamptz,
  coverage_start date,
  coverage_end date,
  last_error text
);
alter table private.notification_draw_calendar_sync enable row level security;
revoke all on private.notification_draw_calendar_sync from public, anon, authenticated, service_role;
insert into private.notification_draw_calendar_sync(lottery) values ('六合彩');

-- Fetch daily and in the 20 minutes before an enabled member's reminder.
-- This controls source polling only; notification_is_draw_day owns eligibility.
create function public.notification_draw_calendar_acquire(p_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_local timestamp := v_now at time zone 'Asia/Taipei';
  v_state private.notification_draw_calendar_sync;
  v_due boolean;
begin
  if p_owner_id is null then return false; end if;
  select * into v_state from private.notification_draw_calendar_sync
    where lottery='六合彩' for update skip locked;
  if not found or v_state.lease_expires_at > v_now or v_state.next_attempt_at > v_now then return false; end if;
  v_due := v_state.last_success_at is null or v_state.last_error is not null
    or (v_state.last_success_at at time zone 'Asia/Taipei')::date < v_local::date;
  if not v_due and v_state.last_success_at <= v_now - interval '15 minutes' then
    select exists (
      select 1 from public.notification_settings s
      join public.members m on m.id=s.member_id
      cross join lateral pg_catalog.jsonb_array_elements_text(case
        when pg_catalog.jsonb_typeof(s.settings#>'{betTimes,六合彩}')='array'
        then s.settings#>'{betTimes,六合彩}' else '[]'::jsonb end) t(value)
      cross join (values (0),(1)) d(offset_days)
      where coalesce(m.status,'') not in ('停用','disabled','inactive')
        and s.settings#>>'{settings,bet}'='true'
        and case when t.value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          (v_local::date+d.offset_days+t.value::time) between v_local and v_local+interval '20 minutes'
        else false end
    ) into v_due;
  end if;
  if not v_due then return false; end if;
  update private.notification_draw_calendar_sync set lease_owner=p_owner_id,
    lease_expires_at=v_now+interval '5 minutes', last_started_at=v_now,
    next_attempt_at=v_now+interval '5 minutes',valid_until=v_now,last_error='OFFICIAL_CALENDAR_PENDING'
    where lottery='六合彩';
  return true;
end;
$$;

-- A complete month includes false days, so removed dates are disabled atomically.
create function public.notification_draw_calendar_complete(
  p_owner_id uuid, p_days jsonb, p_fetched_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_today date := (v_now at time zone 'Asia/Taipei')::date;
  v_state private.notification_draw_calendar_sync;
  v_start date;
  v_end date;
  v_count integer;
  v_unique integer;
begin
  select * into v_state from private.notification_draw_calendar_sync where lottery='六合彩' for update;
  if not found or v_state.lease_owner is distinct from p_owner_id or p_owner_id is null
    or v_state.lease_expires_at is null or v_state.lease_expires_at <= v_now then return false; end if;
  if p_fetched_at is null or not pg_catalog.isfinite(p_fetched_at)
    or p_fetched_at < v_state.last_started_at or p_fetched_at > v_now+interval '1 minute'
    or p_fetched_at < v_now-interval '5 minutes'
    or pg_catalog.jsonb_typeof(p_days) is distinct from 'array' then
    raise exception 'OFFICIAL_CALENDAR_INVALID';
  end if;
  if pg_catalog.jsonb_array_length(p_days) not between 28 and 62 or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_days) d
    where pg_catalog.jsonb_typeof(d) is distinct from 'object'
      or coalesce(d->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or pg_catalog.jsonb_typeof(d->'isDrawDay') is distinct from 'boolean'
  ) then raise exception 'OFFICIAL_CALENDAR_INVALID'; end if;
  select min((d->>'date')::date),max((d->>'date')::date),count(*),count(distinct d->>'date')
    into v_start,v_end,v_count,v_unique from pg_catalog.jsonb_array_elements(p_days) d;
  if v_start <> pg_catalog.date_trunc('month',v_today)::date
    or v_end not in ((v_start+interval '1 month'-interval '1 day')::date,
                    (v_start+interval '2 months'-interval '1 day')::date)
    or v_count <> v_end-v_start+1 or v_count <> v_unique
    or not exists (select 1 from pg_catalog.jsonb_array_elements(p_days) d where (d->>'isDrawDay')::boolean)
    then raise exception 'OFFICIAL_CALENDAR_INVALID'; end if;

  insert into private.notification_draw_day_overrides as existing
    (lottery,draw_date,is_draw_day,reason,source_url,updated_at,source_kind,valid_until)
  select '六合彩',(d->>'date')::date,(d->>'isDrawDay')::boolean,
    '香港賽馬會官方攪珠日期表','https://bet.hkjc.com/ch/marksix/fixtures',v_now,'hkjc',v_now+interval '26 hours'
  from pg_catalog.jsonb_array_elements(p_days) d
  on conflict (lottery,draw_date) do update set
    is_draw_day=excluded.is_draw_day,reason=excluded.reason,source_url=excluded.source_url,
    updated_at=excluded.updated_at,valid_until=excluded.valid_until
  where existing.source_kind='hkjc';
  update private.notification_draw_calendar_sync set
    lease_owner=null,lease_expires_at=null,last_success_at=v_now,valid_until=v_now+interval '26 hours',
    next_attempt_at=v_now+interval '5 minutes',coverage_start=v_start,coverage_end=v_end,last_error=null
    where lottery='六合彩';
  return true;
end;
$$;

create function public.notification_draw_calendar_fail(p_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  update private.notification_draw_calendar_sync set lease_owner=null,lease_expires_at=null,
    valid_until=v_now,next_attempt_at=v_now+interval '15 minutes',last_error='OFFICIAL_CALENDAR_UNAVAILABLE'
    where lottery='六合彩' and lease_owner=p_owner_id and lease_expires_at>v_now;
  return found;
end;
$$;

create or replace function private.notification_is_draw_day(p_lottery text,p_taipei_date date)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare
  v_override private.notification_draw_day_overrides;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_weekday integer;
begin
  if p_lottery is null or p_lottery not in ('今彩539','天天樂','六合彩','大樂透')
    or p_taipei_date is null or not pg_catalog.isfinite(p_taipei_date) then return false; end if;
  select * into v_override from private.notification_draw_day_overrides
    where lottery=p_lottery and draw_date=p_taipei_date;
  if found then
    if v_override.source_kind='manual' then return v_override.is_draw_day; end if;
    return coalesce(v_override.is_draw_day and v_override.valid_until>v_now and exists (
      select 1 from private.notification_draw_calendar_sync s where s.lottery=p_lottery
        and s.last_error is null and s.last_success_at<=v_now and s.valid_until>v_now
        and p_taipei_date between s.coverage_start and s.coverage_end
    ),false);
  end if;
  v_weekday := extract(isodow from p_taipei_date)::integer;
  return case p_lottery
    when '今彩539' then v_weekday between 1 and 6
    when '天天樂' then true
    when '大樂透' then v_weekday in (2,5)
    else false
  end;
end;
$$;

-- Admin backend uses a service-only read; private state stays out of the Data API.
create function public.notification_draw_calendar_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  with state as (
    select s.*,coalesce(s.last_error is null and s.last_success_at<=pg_catalog.statement_timestamp()
      and s.valid_until>pg_catalog.statement_timestamp()
      and (pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date between s.coverage_start and s.coverage_end,false) as confirmed
    from private.notification_draw_calendar_sync s where s.lottery='六合彩'
  )
  select pg_catalog.jsonb_build_object(
    'lottery',s.lottery,'status',case when s.confirmed
      then '已確認' else '待確認' end,
    'checked_at',pg_catalog.statement_timestamp(),'last_checked_at',s.last_started_at,
    'last_success_at',s.last_success_at,'valid_until',s.valid_until,
    'coverage_start',s.coverage_start,'coverage_end',s.coverage_end,
    'is_draw_day_today',private.notification_is_draw_day(s.lottery,(pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date),
    'next_draw_date',(select min(o.draw_date) from private.notification_draw_day_overrides o
      where o.lottery=s.lottery and o.draw_date>=(pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date
        and private.notification_is_draw_day(o.lottery,o.draw_date)),
    'message',case when not s.confirmed
      then '官方日期待確認，六合彩選號提醒暫停。'
      when private.notification_is_draw_day(s.lottery,(pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date)
      then '今天開獎，依設定時間提醒。' else '今天沒有排定開獎，不發送選號提醒。' end
  ) from state s;
$$;

revoke all on function private.notification_is_draw_day(text,date) from public,anon,authenticated,service_role;
revoke all on function public.notification_draw_calendar_acquire(uuid) from public,anon,authenticated;
revoke all on function public.notification_draw_calendar_complete(uuid,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.notification_draw_calendar_fail(uuid) from public,anon,authenticated;
revoke all on function public.notification_draw_calendar_status() from public,anon,authenticated;
grant execute on function public.notification_draw_calendar_acquire(uuid) to service_role;
grant execute on function public.notification_draw_calendar_complete(uuid,jsonb,timestamptz) to service_role;
grant execute on function public.notification_draw_calendar_fail(uuid) to service_role;
grant execute on function public.notification_draw_calendar_status() to service_role;
notify pgrst,'reload schema';
commit;
