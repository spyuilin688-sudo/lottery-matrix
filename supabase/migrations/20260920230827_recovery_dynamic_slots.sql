begin;

alter table private.admin_watchdog_schedule add column next_check_at timestamptz;

create table private.matrix_recovery_schedule (
 lottery text primary key check(lottery in ('今彩539','大樂透','六合彩','天天樂')),
 worker_group text not null check(worker_group in ('evening','fantasy5')),
 cycle_date date not null,
 next_at timestamptz,
 dispatched_at timestamptz,
 completed_at timestamptz,
 skip_reason text check(skip_reason in ('no-draw')),
 last_error text
);
alter table private.matrix_recovery_schedule enable row level security;
revoke all on private.matrix_recovery_schedule from public,anon,authenticated,service_role;

create function private.matrix_recovery_slots(p_group text,p_day date)
returns setof timestamptz language plpgsql immutable set search_path='' as $$
declare v_start timestamp; v_offset integer;
begin
 if p_group not in ('evening','fantasy5') or p_group is null or p_day is null then raise exception 'RECOVERY_GROUP_INVALID'; end if;
 v_start:=p_day+case when p_group='evening' then time '20:30' else time '09:30' end;
 -- The switch instant belongs to the fifty-minute phase, exactly once.
 for v_offset in 0..260 by 10 loop
  return next (v_start+pg_catalog.make_interval(mins=>v_offset)) at time zone 'Asia/Taipei';
 end loop;
 for v_offset in 270..case when p_group='evening' then 569 else 509 end by 50 loop
  return next (v_start+pg_catalog.make_interval(mins=>v_offset)) at time zone 'Asia/Taipei';
 end loop;
 if p_group='evening' then
  return next (p_day+1+time '12:00') at time zone 'Asia/Taipei';
  return next (p_day+1+time '18:00') at time zone 'Asia/Taipei';
 else
  return next (p_day+1+time '00:00') at time zone 'Asia/Taipei';
  return next (p_day+1+time '06:00') at time zone 'Asia/Taipei';
 end if;
end $$;

-- False is reserved for known no-draw days; missing HKJC coverage remains pending.
create function private.matrix_recovery_draw_due(p_lottery text,p_day date,p_now timestamptz)
returns boolean language sql stable set search_path='' as $$
 select case when p_lottery<>'六合彩' then private.notification_is_draw_day(p_lottery,p_day)
 when exists(select 1 from private.notification_draw_day_overrides o where o.lottery=p_lottery and o.draw_date=p_day and o.source_kind='manual')
 then private.notification_is_draw_day(p_lottery,p_day)
 when exists(select 1 from private.notification_draw_calendar_sync s where s.lottery=p_lottery and s.last_error is null and s.last_success_at<=p_now and s.valid_until>p_now and p_day between s.coverage_start and s.coverage_end)
 then private.notification_is_draw_day(p_lottery,p_day)
 else true end
$$;

create function private.matrix_recovery_next_check(p_now timestamptz)
returns timestamptz language sql stable set search_path='' as $$
 select min(t) from (
  select next_at t from private.matrix_recovery_schedule where completed_at is null and skip_reason is null
  union all
  select (d + start_time + case when (d+start_time) at time zone 'Asia/Taipei' <= p_now then interval '1 day' else interval '0' end) at time zone 'Asia/Taipei'
  from (select (p_now at time zone 'Asia/Taipei')::date d) days cross join (values(time '09:30'),(time '20:30')) starts(start_time)
 ) candidates
$$;

create function private.matrix_recovery_replan(p_group text)
returns void language plpgsql security definer set search_path='' as $$
declare v_next timestamptz; v_name text:='matrix-recovery-next-'||p_group;
begin
 select min(next_at) into v_next from private.matrix_recovery_schedule
 where worker_group=p_group and completed_at is null and skip_reason is null;
 if v_next is null then
  if exists(select 1 from cron.job where jobname=v_name) then perform cron.unschedule(v_name); end if;
 else
  perform cron.schedule(v_name,pg_catalog.to_char(v_next at time zone 'UTC','MI HH24')||' * * *',
   pg_catalog.format('select private.matrix_recovery_tick(%L);',p_group));
 end if;
 update private.admin_watchdog_schedule set next_check_at=private.matrix_recovery_next_check(pg_catalog.now()) where id=true;
end $$;

-- Calendar writes rearm only future requested slots; they never launch recovery.
create function private.matrix_recovery_refresh_calendar(p_group text,p_now timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare r private.matrix_recovery_schedule; v_skip text; v_next timestamptz;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-recovery:'||p_group));
 for r in select * from private.matrix_recovery_schedule where worker_group=p_group and completed_at is null loop
  v_skip:=case when not private.matrix_recovery_draw_due(r.lottery,r.cycle_date,p_now) then 'no-draw' end;
  if v_skip is distinct from r.skip_reason then
   select min(slot) into v_next from private.matrix_recovery_slots(p_group,r.cycle_date) slot where slot>p_now;
   update private.matrix_recovery_schedule set skip_reason=v_skip,next_at=case when v_skip is null then v_next end,dispatched_at=null where lottery=r.lottery;
  end if;
 end loop;
 perform private.matrix_recovery_replan(p_group);
end $$;
create function private.matrix_recovery_calendar_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.matrix_recovery_refresh_calendar('evening',pg_catalog.now());
 perform private.matrix_recovery_refresh_calendar('fantasy5',pg_catalog.now());
 return null;
end $$;
create trigger matrix_recovery_calendar_override after insert or update or delete on private.notification_draw_day_overrides
 for each statement execute function private.matrix_recovery_calendar_event();
create trigger matrix_recovery_calendar_sync after insert or update or delete on private.notification_draw_calendar_sync
 for each statement execute function private.matrix_recovery_calendar_event();
revoke all on function private.matrix_recovery_refresh_calendar(text,timestamptz),private.matrix_recovery_calendar_event() from public,anon,authenticated,service_role;

create function public.matrix_recovery_complete(p_lottery text,p_period text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_state private.matrix_recovery_schedule; v_draw public.lottery_draws; v_chain jsonb; v_group text;
begin
 v_group:=case when p_lottery='天天樂' then 'fantasy5' else 'evening' end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-recovery:'||v_group));
 select * into v_state from private.matrix_recovery_schedule where lottery=p_lottery for update;
 if not found then return false; end if;
 if v_state.completed_at is not null then return true; end if;
 select * into v_draw from public.lottery_draws where lottery=p_lottery
 order by draw_date desc nulls last,period desc limit 1;
 if v_draw.period is distinct from p_period or v_draw.draw_date is distinct from v_state.cycle_date
  or v_draw.result_status is distinct from 'confirmed' then return false; end if;
 v_chain:=public.matrix_watchdog_chain_state(p_lottery,p_period);
 if v_chain->>'latestPeriod' is distinct from p_period
  or (v_chain->>'analysisComplete')::boolean is distinct from true
  or (v_chain->>'matrixStatusComplete')::boolean is distinct from true then return false; end if;
 update private.matrix_recovery_schedule set completed_at=pg_catalog.clock_timestamp(),next_at=null,dispatched_at=null,last_error=null where lottery=p_lottery;
 perform private.matrix_recovery_replan(v_group);
 return true;
end $$;

create function private.matrix_recovery_tick(p_group text,p_now timestamptz default pg_catalog.now(),p_dispatch boolean default true)
returns bigint language plpgsql security definer set search_path='' as $$
declare
 v_local timestamp:=p_now at time zone 'Asia/Taipei'; v_day date; v_open time;
 v_lottery text; v_state private.matrix_recovery_schedule; v_next timestamptz;
 v_url text; v_token text; v_request bigint; v_due boolean:=false;
 v_completed timestamptz; v_period text; v_due_slot timestamptz;
begin
 if p_group not in ('evening','fantasy5') or p_group is null or p_now is null or not pg_catalog.isfinite(p_now) then raise exception 'RECOVERY_GROUP_INVALID'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-recovery:'||p_group));
 v_open:=case when p_group='evening' then time '20:30' else time '09:30' end;
 v_day:=v_local::date-case when v_local::time<v_open then 1 else 0 end;
 foreach v_lottery in array case when p_group='evening' then array['今彩539','大樂透','六合彩'] else array['天天樂'] end loop
  select min(slot) into v_next from private.matrix_recovery_slots(p_group,v_day) slot where slot>=pg_catalog.date_trunc('minute',p_now);
  insert into private.matrix_recovery_schedule(lottery,worker_group,cycle_date,next_at,skip_reason)
  values(v_lottery,p_group,v_day,v_next,case when not private.matrix_recovery_draw_due(v_lottery,v_day,p_now) then 'no-draw' end)
  on conflict(lottery) do update set cycle_date=excluded.cycle_date,next_at=excluded.next_at,completed_at=null,dispatched_at=null,skip_reason=excluded.skip_reason,last_error=null
  where private.matrix_recovery_schedule.cycle_date<>excluded.cycle_date;
  update private.matrix_recovery_schedule set skip_reason=case when not private.matrix_recovery_draw_due(v_lottery,v_day,p_now) then 'no-draw' end
   where lottery=v_lottery and completed_at is null;
  select * into v_state from private.matrix_recovery_schedule where lottery=v_lottery;
  if v_state.completed_at is not null or v_state.skip_reason is not null then continue; end if;
  -- Existing completed data can suppress even the first scheduled HTTP request.
  select c.draw_period into v_period from private.matrix_worker_completion c
  where c.lottery=v_lottery and c.certified_generation=c.generation and c.valid_until>p_now;
  if v_period is not null then
   begin perform public.matrix_recovery_complete(v_lottery,v_period);
   exception when others then
    update private.matrix_recovery_schedule set last_error='RECOVERY_COMPLETION_CHECK_FAILED' where lottery=v_lottery;
   end;
  end if;
  select * into v_state from private.matrix_recovery_schedule where lottery=v_lottery;
  if v_state.completed_at is not null or v_state.skip_reason is not null then continue; end if;
  select max(slot) into v_due_slot from private.matrix_recovery_slots(p_group,v_day) slot where slot<=p_now and p_now<slot+interval '10 minutes';
  if p_dispatch and v_state.next_at<=p_now and v_due_slot is not null then
   v_due:=true;
   update private.matrix_recovery_schedule set dispatched_at=p_now where lottery=v_lottery;
  end if;
  select min(slot) into v_next from private.matrix_recovery_slots(p_group,v_day) slot where slot>p_now;
  update private.matrix_recovery_schedule set next_at=v_next where lottery=v_lottery;
 end loop;
 -- Persist the next allowed wakeup before dispatch. Daily starts independently
 -- restore the next cycle if a previous database execution failed completely.
 perform private.matrix_recovery_replan(p_group);
 if not v_due then return null; end if;
 select updated_at into v_completed from private.admin_watchdog_status where id=true;
 insert into private.admin_watchdog_schedule as current(id,checked_at,due,pending_since)
 values(true,p_now,true,p_now) on conflict(id) do update set checked_at=excluded.checked_at,due=true,
 pending_since=case when current.pending_since is not null and (v_completed is null or v_completed<current.pending_since) then current.pending_since else p_now end;
 begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_admin_watchdog_token' limit 1;
  if nullif(pg_catalog.btrim(v_url),'') is null or nullif(pg_catalog.btrim(v_token),'') is null then raise exception 'RECOVERY_DISPATCH_CONFIG_MISSING'; end if;
  select net.http_post(url:=pg_catalog.rtrim(v_url,'/')||'/functions/v1/admin-api/api/internal/matrix-watchdog',
   headers:=pg_catalog.jsonb_build_object('Content-Type','application/json','Origin','https://matrixlottery.idv.tw','x-matrix-watchdog-token',v_token),
   body:='{}'::jsonb,timeout_milliseconds:=30000) into v_request;
 exception when others then
  update private.matrix_recovery_schedule set last_error='RECOVERY_DISPATCH_FAILED' where worker_group=p_group and dispatched_at=p_now;
 end;
 return v_request;
end $$;

create function public.matrix_recovery_pending(p_now timestamptz default pg_catalog.now())
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('lottery',lottery,'cycleDate',cycle_date) order by lottery),'[]'::jsonb)
 from private.matrix_recovery_schedule
 where completed_at is null and skip_reason is null and dispatched_at<=p_now and dispatched_at>p_now-interval '10 minutes'
$$;

create function private.matrix_recovery_completion_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='matrix_worker_completion' then
  if new.certified_generation=new.generation and new.valid_until>pg_catalog.now() then
   perform public.matrix_recovery_complete(new.lottery,new.draw_period);
  end if;
 elsif new.job_name like 'matrix-recovery:%' and new.status='success'
  and (tg_op='INSERT' or new.recovery_count>old.recovery_count) then
  perform public.matrix_recovery_complete(new.lottery,new.written_period);
 end if;
 return null;
exception when others then
 -- Auxiliary scheduling must not roll back successful analysis/publication.
 update private.matrix_recovery_schedule set last_error='RECOVERY_SCHEDULE_UPDATE_FAILED' where lottery=new.lottery;
 return null;
end $$;
create trigger matrix_recovery_certificate after insert or update of certified_at on private.matrix_worker_completion
 for each row execute function private.matrix_recovery_completion_event();
create trigger matrix_recovery_success after insert or update of recovery_count on public.system_job_status
 for each row execute function private.matrix_recovery_completion_event();

revoke all on function private.matrix_recovery_slots(text,date),private.matrix_recovery_draw_due(text,date,timestamptz),private.matrix_recovery_replan(text),
 private.matrix_recovery_tick(text,timestamptz,boolean),private.matrix_recovery_next_check(timestamptz),private.matrix_recovery_completion_event(),public.matrix_recovery_complete(text,text),public.matrix_recovery_pending(timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.matrix_recovery_complete(text,text),public.matrix_recovery_pending(timestamptz) to service_role;

create or replace function public.admin_watchdog_status_read()
returns jsonb language sql stable set search_path='' as $$
 select (s.status-'schedule')||pg_catalog.jsonb_build_object('id','singleton')
 ||case when t.id is null then '{}'::jsonb else pg_catalog.jsonb_build_object('schedule',pg_catalog.jsonb_build_object(
 'checkedAt',t.checked_at,'due',t.due,'nextCheckAt',t.next_check_at,
 'pendingSince',case when s.updated_at>=t.pending_since then null else t.pending_since end)) end
 from private.admin_watchdog_status s left join private.admin_watchdog_schedule t on t.id=s.id where s.id=true
$$;
revoke all on function public.admin_watchdog_status_read() from public,anon,authenticated;
grant execute on function public.admin_watchdog_status_read() to service_role;

-- Replace the old poller; do not run both scheduling systems.
do $$begin
 if exists(select 1 from cron.job where jobname='matrix-admin-watchdog-v1') then perform cron.unschedule('matrix-admin-watchdog-v1'); end if;
end$$;
select cron.schedule('matrix-recovery-start-evening','30 12 * * *','select private.matrix_recovery_tick(''evening'');');
select cron.schedule('matrix-recovery-start-fantasy5','30 1 * * *','select private.matrix_recovery_tick(''fantasy5'');');
-- Installation queues future slots only; it never performs recovery itself.
select private.matrix_recovery_tick('evening',pg_catalog.now(),false);
select private.matrix_recovery_tick('fantasy5',pg_catalog.now(),false);
insert into private.admin_watchdog_schedule(id,checked_at,due,next_check_at)
values(true,pg_catalog.now(),false,private.matrix_recovery_next_check(pg_catalog.now()))
on conflict(id) do update set next_check_at=excluded.next_check_at;
commit;
