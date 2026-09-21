begin;

create table private.matrix_primary_schedule (
 worker_group text primary key check(worker_group in ('evening','fantasy5')),
 cycle_date date not null,
 next_at timestamptz,
 dispatched_at timestamptz,
 completed_at timestamptz,
 last_error text
);
alter table private.matrix_primary_schedule enable row level security;
revoke all on private.matrix_primary_schedule from public,anon,authenticated,service_role;

create function private.matrix_primary_slots(p_group text,p_day date)
returns setof timestamptz language plpgsql immutable set search_path='' as $$
declare v_start timestamp; v_offset integer;
begin
 if p_group not in ('evening','fantasy5') or p_group is null or p_day is null then
  raise exception 'PRIMARY_GROUP_INVALID';
 end if;
 v_start:=p_day+case when p_group='evening' then time '20:30' else time '09:30' end;
 for v_offset in 0..260 by 10 loop
  return next (v_start+pg_catalog.make_interval(mins=>v_offset)) at time zone 'Asia/Taipei';
 end loop;
 for v_offset in 270..case when p_group='evening' then 540 else 480 end by 30 loop
  return next (v_start+pg_catalog.make_interval(mins=>v_offset)) at time zone 'Asia/Taipei';
 end loop;
end $$;

create function private.matrix_primary_lottery_complete(
 p_lottery text,p_day date,p_now timestamptz
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_draw public.lottery_draws; v_chain jsonb;
begin
 if private.matrix_recovery_draw_due(p_lottery,p_day,p_now) is false then return true; end if;
 select * into v_draw from public.lottery_draws where lottery=p_lottery
 order by draw_date desc nulls last,period desc limit 1;
 if not found or v_draw.draw_date is distinct from p_day
  or v_draw.result_status is distinct from 'confirmed' then return false; end if;
 v_chain:=public.matrix_watchdog_chain_state(p_lottery,v_draw.period);
 return coalesce(v_chain->>'latestPeriod'=v_draw.period
  and (v_chain->>'analysisComplete')::boolean is true
  and (v_chain->>'matrixStatusComplete')::boolean is true,false);
exception when others then
 return false;
end $$;

create function private.matrix_primary_group_complete(
 p_group text,p_day date,p_now timestamptz
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_lottery text;
begin
 if p_group not in ('evening','fantasy5') or p_group is null or p_day is null or p_now is null then
  raise exception 'PRIMARY_GROUP_INVALID';
 end if;
 foreach v_lottery in array case when p_group='evening'
  then array['今彩539','大樂透','六合彩'] else array['天天樂'] end loop
  if not private.matrix_primary_lottery_complete(v_lottery,p_day,p_now) then return false; end if;
 end loop;
 return true;
end $$;

create function private.matrix_primary_pending_lotteries(
 p_group text,p_day date,p_now timestamptz
) returns text[] language sql stable security definer set search_path='' as $$
 select coalesce(pg_catalog.array_agg(lottery order by ordinal),'{}'::text[])
 from pg_catalog.unnest(case when p_group='evening'
  then array['今彩539','大樂透','六合彩'] else array['天天樂'] end) with ordinality as item(lottery,ordinal)
 where not private.matrix_primary_lottery_complete(lottery,p_day,p_now)
$$;

create function private.matrix_primary_replan(p_group text)
returns void language plpgsql security definer set search_path='' as $$
declare v_next timestamptz; v_name text:='matrix-primary-next-'||p_group;
begin
 select next_at into v_next from private.matrix_primary_schedule
 where worker_group=p_group and completed_at is null;
 if v_next is null then
  if exists(select 1 from cron.job where jobname=v_name) then perform cron.unschedule(v_name); end if;
 else
  perform cron.schedule(v_name,pg_catalog.to_char(v_next at time zone 'UTC','MI HH24')||' * * *',
   pg_catalog.format('select private.matrix_primary_tick(%L);',p_group));
 end if;
end $$;

create function private.matrix_primary_tick(
 p_group text,p_now timestamptz default pg_catalog.now(),p_dispatch boolean default true
) returns bigint language plpgsql security definer set search_path='' as $$
declare
 v_local timestamp:=p_now at time zone 'Asia/Taipei'; v_open time; v_day date;
 v_next timestamptz; v_due_slot timestamptz; v_pending text[];
 v_url text; v_token text; v_request bigint;
begin
 if p_group not in ('evening','fantasy5') or p_group is null or p_now is null or not pg_catalog.isfinite(p_now) then
  raise exception 'PRIMARY_GROUP_INVALID';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-primary:'||p_group));
 v_open:=case when p_group='evening' then time '20:30' else time '09:30' end;
 v_day:=v_local::date-case when v_local::time<v_open then 1 else 0 end;
 select min(slot) into v_next from private.matrix_primary_slots(p_group,v_day) slot where slot>=pg_catalog.date_trunc('minute',p_now);
 insert into private.matrix_primary_schedule(worker_group,cycle_date,next_at)
 values(p_group,v_day,v_next)
 on conflict(worker_group) do update set cycle_date=excluded.cycle_date,next_at=excluded.next_at,
  dispatched_at=null,completed_at=null,last_error=null
 where private.matrix_primary_schedule.cycle_date<>excluded.cycle_date;

 if private.matrix_primary_group_complete(p_group,v_day,p_now) then
  update private.matrix_primary_schedule set next_at=null,completed_at=pg_catalog.clock_timestamp(),last_error=null
  where worker_group=p_group;
  perform private.matrix_primary_replan(p_group);
  return null;
 end if;

 select max(slot) into v_due_slot from private.matrix_primary_slots(p_group,v_day) slot
 where slot<=p_now and p_now<slot+interval '10 minutes';
 select min(slot) into v_next from private.matrix_primary_slots(p_group,v_day) slot where slot>p_now;
 update private.matrix_primary_schedule set next_at=v_next where worker_group=p_group;
 perform private.matrix_primary_replan(p_group);
 if not p_dispatch or v_due_slot is null then return null; end if;

 v_pending:=private.matrix_primary_pending_lotteries(p_group,v_day,p_now);
 if pg_catalog.cardinality(v_pending)=0 then return null; end if;
 update private.matrix_primary_schedule set dispatched_at=p_now where worker_group=p_group;
 begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_admin_watchdog_token' limit 1;
  if nullif(pg_catalog.btrim(v_url),'') is null or nullif(pg_catalog.btrim(v_token),'') is null then
   raise exception 'PRIMARY_DISPATCH_CONFIG_MISSING';
  end if;
  select net.http_post(
   url:=pg_catalog.rtrim(v_url,'/')||'/functions/v1/admin-api/api/internal/matrix-primary',
   headers:=pg_catalog.jsonb_build_object('Content-Type','application/json','Origin','https://matrixlottery.idv.tw','x-matrix-watchdog-token',v_token),
   body:=pg_catalog.jsonb_build_object('group',p_group,'cycleDate',v_day,'lotteries',v_pending),
   timeout_milliseconds:=30000
  ) into v_request;
 exception when others then
  update private.matrix_primary_schedule set last_error='PRIMARY_DISPATCH_FAILED' where worker_group=p_group;
 end;
 return v_request;
end $$;

create function private.matrix_primary_refresh(p_group text,p_now timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare v_state private.matrix_primary_schedule;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('matrix-primary:'||p_group));
 select * into v_state from private.matrix_primary_schedule where worker_group=p_group for update;
 if not found or v_state.completed_at is not null then return; end if;
 if private.matrix_primary_group_complete(p_group,v_state.cycle_date,p_now) then
  update private.matrix_primary_schedule set next_at=null,completed_at=pg_catalog.clock_timestamp(),last_error=null
  where worker_group=p_group;
 end if;
 perform private.matrix_primary_replan(p_group);
end $$;

create function private.matrix_primary_completion_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.certified_generation=new.generation and new.valid_until>pg_catalog.now() then
  perform private.matrix_primary_refresh(case when new.lottery='天天樂' then 'fantasy5' else 'evening' end,pg_catalog.now());
 end if;
 return null;
exception when others then
 update private.matrix_primary_schedule set last_error='PRIMARY_COMPLETION_CHECK_FAILED'
 where worker_group=case when new.lottery='天天樂' then 'fantasy5' else 'evening' end;
 return null;
end $$;
create trigger matrix_primary_certificate after insert or update of certified_at on private.matrix_worker_completion
 for each row execute function private.matrix_primary_completion_event();

create function private.matrix_primary_calendar_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.matrix_primary_refresh('evening',pg_catalog.now());
 perform private.matrix_primary_refresh('fantasy5',pg_catalog.now());
 return null;
end $$;
create trigger matrix_primary_calendar_override after insert or update or delete on private.notification_draw_day_overrides
 for each statement execute function private.matrix_primary_calendar_event();
create trigger matrix_primary_calendar_sync after insert or update or delete on private.notification_draw_calendar_sync
 for each statement execute function private.matrix_primary_calendar_event();

revoke all on function private.matrix_primary_slots(text,date),
 private.matrix_primary_lottery_complete(text,date,timestamptz),
 private.matrix_primary_group_complete(text,date,timestamptz),
 private.matrix_primary_pending_lotteries(text,date,timestamptz),
 private.matrix_primary_replan(text),private.matrix_primary_tick(text,timestamptz,boolean),
 private.matrix_primary_refresh(text,timestamptz),private.matrix_primary_completion_event(),
 private.matrix_primary_calendar_event()
 from public,anon,authenticated,service_role;

select cron.schedule('matrix-primary-start-evening','30 12 * * *','select private.matrix_primary_tick(''evening'');');
select cron.schedule('matrix-primary-start-fantasy5','30 1 * * *','select private.matrix_primary_tick(''fantasy5'');');
select private.matrix_primary_tick('evening',pg_catalog.now(),false);
select private.matrix_primary_tick('fantasy5',pg_catalog.now(),false);

commit;
