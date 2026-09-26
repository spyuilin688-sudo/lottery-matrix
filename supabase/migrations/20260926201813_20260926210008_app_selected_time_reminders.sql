begin;
-- Independent App reminders use the same canonical draw-day resolver and clock
-- slots as PWA, but never publish personal App data into PWA events/outbox.
create function private.app_selected_time_reminders_tick(p_now timestamptz default pg_catalog.now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_now timestamptz:=coalesce(p_now,pg_catalog.now());
 v_local timestamp:=v_now at time zone 'Asia/Taipei';
 v_minute text:=pg_catalog.to_char(v_local,'HH24:MI');
 v_scheduled text:=pg_catalog.to_char(v_local,'YYYY-MM-DD"T"HH24:MI:00')||'+08:00';
 v_created integer;
begin
 insert into private.app_native_push_events(event_key,event_type,payload,created_at)
 select 'app_bet_reminder:'||m.id::text||':'||lottery.code||':'||v_scheduled,
   'bet_reminder',jsonb_build_object('memberId',m.id::text,'lottery',lottery.name,'lotteryCode',lottery.code,'scheduledAt',v_scheduled),v_now
 from public.app_notification_settings s join public.app_members m on m.id=s.member_id
 cross join (values ('今彩539','539'),('天天樂','fantasy5'),('六合彩','marksix'),('大樂透','lotto649')) lottery(name,code)
 where m.status='active' and s.settings @> '{"settings":{"bet":true}}'::jsonb
   and private.notification_is_draw_day(lottery.name,v_local::date)
   and s.settings @> jsonb_build_object('betTimes',jsonb_build_object(lottery.name,jsonb_build_array(v_minute)))
 on conflict(event_key) do nothing;
 get diagnostics v_created=row_count;
 return jsonb_build_object('created',v_created,'minute',v_minute);
end;
$$;
create function private.app_selected_time_reminders_publish_tick(p_now timestamptz default pg_catalog.now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 v_result:=private.app_selected_time_reminders_tick(p_now);
 -- Best-effort wake cannot erase the durable event or the preceding PWA tick.
 if (v_result->>'created')::integer>0 then
  begin perform private.app_notification_recovery_tick(); exception when others then null; end;
 end if;
 return v_result;
exception when others then return jsonb_build_object('error','APP_REMINDER_TICK_FAILED');
end;
$$;
revoke all on function private.app_selected_time_reminders_tick(timestamptz),private.app_selected_time_reminders_publish_tick(timestamptz)
 from public,anon,authenticated,service_role;
do $$
declare v_job record;v_count integer:=0;
begin
 for v_job in select jobid,command from cron.job where jobname in (
  'matrix-notification-bet-0500-0730','matrix-notification-bet-0800','matrix-notification-bet-0900',
  'matrix-notification-bet-1600-1830','matrix-notification-bet-1900','matrix-notification-bet-2000','matrix-notification-bet-2100'
 ) loop
  perform cron.alter_job(job_id:=v_job.jobid,command:=v_job.command||' select private.app_selected_time_reminders_publish_tick(pg_catalog.now());');
  v_count:=v_count+1;
 end loop;
 if v_count<>7 then raise exception 'APP_REMINDER_FIXED_SCHEDULES_MISSING';end if;
end;
$$;
commit;
