begin;

alter table public.notification_events drop constraint notification_events_source_check;
alter table public.notification_events add constraint notification_events_source_check
  check (source in ('railway','cron','admin','pilio'));

-- A date-only early result and the later official period share one notification.
create unique index notification_results_draw_date_key
  on public.notification_events ((payload->>'lottery'), (payload->>'drawDate'))
  where event_type='lottery_result' and payload->>'lottery' is not null and payload->>'drawDate' is not null;

create or replace function private.notification_event_enqueue(
  p_event_key text, p_event_type text, p_source text, p_occurred_at timestamptz, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event public.notification_events%rowtype;
  v_created boolean := false;
  v_event_key text := pg_catalog.btrim(p_event_key);
begin
  if nullif(v_event_key,'') is null
    or p_event_type is null or p_event_type not in ('lottery_result','matrix_status','matrix_card','bet_reminder','membership_expiry','system_notice')
    or p_source is null or p_source not in ('railway','cron','admin','pilio')
    or (p_source='pilio' and p_event_type<>'lottery_result')
    or p_occurred_at is null or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object' then
    raise exception using errcode='22023', message='INVALID_NOTIFICATION_EVENT';
  end if;

  insert into public.notification_events(event_key,event_type,source,payload,occurred_at)
    values(v_event_key,p_event_type,p_source,p_payload,p_occurred_at)
    on conflict do nothing returning * into v_event;
  if v_event.id is null then
    select * into v_event from public.notification_events
    where event_key=v_event_key or (
      p_event_type='lottery_result' and event_type='lottery_result'
      and payload->>'lottery'=p_payload->>'lottery'
      and payload->>'drawDate'=p_payload->>'drawDate'
    ) order by (event_key=v_event_key) desc limit 1;
  else
    v_created := true;
  end if;
  if v_event.id is null then
    raise exception using errcode='55000', message='NOTIFICATION_EVENT_ENQUEUE_FAILED';
  end if;
  -- Acknowledge the caller's key so already-deployed period-based producers
  -- accept a successful duplicate even when the stored event came from Pilio.
  return pg_catalog.jsonb_build_object('id',v_event.id,'eventKey',v_event_key,
    'eventType',v_event.event_type,'created',v_created,'fanoutStatus',v_event.fanout_status);
end;
$$;
revoke all on function private.notification_event_enqueue(text,text,text,timestamptz,jsonb)
  from public,anon,authenticated,service_role;

create or replace function private.notification_draw_date_label(p_payload jsonb)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_date_text text := p_payload->>'drawDate';
  v_date date;
begin
  -- Compatibility with already queued status/card events: look up their own
  -- official period. Never substitute the send date or another latest period.
  if v_date_text is null then
    select draw_date::text into v_date_text from public.lottery_draws
    where lottery=p_payload->>'lottery' and period=p_payload->>'period' limit 1;
  end if;
  if v_date_text is null or v_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode='22023',message='NOTIFICATION_DRAW_DATE_REQUIRED';
  end if;
  v_date := v_date_text::date;
  return pg_catalog.to_char(v_date,'MM/DD') || '(' ||
    (array['日','一','二','三','四','五','六'])[extract(dow from v_date)::integer+1] || ')';
end;
$$;
revoke all on function private.notification_draw_date_label(jsonb) from public,anon,authenticated,service_role;

create or replace function private.notification_render_payload(p_event_type text,p_event_key text,p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_title text;
  v_body text;
  v_numbers text;
  v_prefix text;
  v_copy text;
  v_tag text := pg_catalog.encode(extensions.digest(p_event_key,'sha256'),'hex');
begin
  if p_event_type in ('lottery_result','matrix_status','matrix_card') then
    v_prefix := private.notification_draw_date_label(p_payload) || ' ' || coalesce(p_payload->>'lottery','') || ' ';
  end if;
  if p_event_type='lottery_result' then
    select pg_catalog.string_agg(pg_catalog.lpad(number.value,2,'0'),'-' order by number.ordinality)
      into v_numbers from pg_catalog.jsonb_array_elements_text(coalesce(p_payload->'numbers','[]'::jsonb))
      with ordinality as number(value,ordinality);
    v_title := coalesce(p_payload->>'lottery','') || ' 開獎結果';
    v_body := v_prefix || '開獎號碼：' || coalesce(v_numbers,'');
  elsif p_event_type='matrix_status' then
    v_title := 'Matrix 狀態｜' || coalesce(p_payload->>'lottery','');
    v_copy := case p_payload->>'statusLabel'
      when '臨界' then '發現了極為罕見的版路！'
      when '共振' then '發現了具備強烈共振效應的版路！'
      when '聚合' then '發現了具備明顯規律集中性的版路！'
      when '啟動' then '發現了具備基本參考價值的版路！'
      else null end;
    if v_copy is null then raise exception using errcode='22023',message='NOTIFICATION_STATUS_INVALID'; end if;
    v_body := v_prefix || v_copy;
  elsif p_event_type='matrix_card' then
    v_title := 'Matrix 牌單｜' || coalesce(p_payload->>'lottery','');
    v_body := v_prefix || '最新的牌單已更新囉！';
  elsif p_event_type='bet_reminder' then
    v_title := coalesce(p_payload->>'lottery','') || ' 選號提醒';
    v_body := '選號時間到了，記得完成你的選號。';
  elsif p_event_type='membership_expiry' then
    v_title := 'Matrix Pro 即將到期';
    v_body := '距離到期剩 ' || coalesce(p_payload->>'daysBefore','') || ' 日（' || coalesce(p_payload->>'expiryDate','') || '）';
  elsif p_event_type='system_notice' then
    v_title := coalesce(p_payload->>'title','');
    v_body := coalesce(p_payload->>'body','');
  else
    raise exception using errcode='22023',message='INVALID_NOTIFICATION_EVENT_TYPE';
  end if;
  return pg_catalog.jsonb_build_object('title',v_title,'body',v_body,'url','/','tag',v_tag);
end;
$$;
revoke all on function private.notification_render_payload(text,text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.notification_fast_result_publish(p_lottery_code text,p_draw_date date,p_numbers text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_lottery text := case p_lottery_code when '539' then '今彩539' when 'marksix' then '六合彩' when 'lotto649' then '大樂透' else null end;
  v_count integer := case when p_lottery_code='539' then 5 else 7 end;
  v_maximum integer := case when p_lottery_code='539' then 39 else 49 end;
  v_result jsonb;
begin
  if v_lottery is null or p_draw_date is null or p_numbers is null or pg_catalog.cardinality(p_numbers)<>v_count then
    raise exception using errcode='22023',message='INVALID_FAST_RESULT';
  end if;
  if exists(select 1 from pg_catalog.unnest(p_numbers) as n(value) where value is null or value !~ '^\d{2}$') then
    raise exception using errcode='22023',message='INVALID_FAST_RESULT';
  end if;
  if exists(select 1 from pg_catalog.unnest(p_numbers) as n(value) where value::integer<1 or value::integer>v_maximum)
    or (select count(distinct value) from pg_catalog.unnest(p_numbers) as n(value))<>v_count then
    raise exception using errcode='22023',message='INVALID_FAST_RESULT';
  end if;
  v_result := private.notification_event_enqueue('lottery_result:' || p_lottery_code || ':' || p_draw_date::text,
    'lottery_result','pilio',pg_catalog.now(),pg_catalog.jsonb_build_object(
      'lottery',v_lottery,'lotteryCode',p_lottery_code,'drawDate',p_draw_date::text,'numbers',pg_catalog.to_jsonb(p_numbers)));
  perform private.notification_fanout_event((v_result->>'id')::uuid);
  return v_result;
end;
$$;
revoke all on function private.notification_fast_result_publish(text,date,text[]) from public,anon,authenticated,service_role;

create or replace function public.notification_fast_result_publish(p_lottery_code text,p_draw_date date,p_numbers text[])
returns jsonb language sql security definer set search_path = '' as $$
  select private.notification_fast_result_publish(p_lottery_code,p_draw_date,p_numbers);
$$;
revoke all on function public.notification_fast_result_publish(text,date,text[]) from public,anon,authenticated;
grant execute on function public.notification_fast_result_publish(text,date,text[]) to service_role;

create or replace function private.notification_pilio_http_tick(p_now timestamptz default pg_catalog.now())
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Taipei';
  v_minute integer := extract(hour from v_local)::integer*60+extract(minute from v_local)::integer;
  v_lottery text;
  v_project_url text;
  v_token text;
  v_request_id bigint;
begin
  v_lottery := case when v_minute between 1235 and 1240 then '今彩539'
    when v_minute between 1255 and 1260 then '大樂透'
    when v_minute between 1295 and 1300 then '六合彩' else null end;
  if v_lottery is null then return null; end if;
  if exists(select 1 from public.notification_events where event_type='lottery_result'
    and payload->>'lottery'=v_lottery and payload->>'drawDate'=v_local::date::text) then return null; end if;
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name='matrix_project_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='matrix_notification_dispatch_token' limit 1;
  if nullif(pg_catalog.btrim(v_project_url),'') is null or nullif(pg_catalog.btrim(v_token),'') is null then
    raise exception using errcode='55000',message='NOTIFICATION_PILIO_VAULT_MISSING';
  end if;
  select net.http_post(url:=pg_catalog.rtrim(v_project_url,'/') || '/functions/v1/notification-pilio',
    headers:=pg_catalog.jsonb_build_object('Content-Type','application/json','x-matrix-dispatch-token',v_token),
    body:='{}'::jsonb,timeout_milliseconds:=30000) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.notification_pilio_http_tick(timestamptz) from public,anon,authenticated,service_role;

select cron.schedule('matrix-notification-pilio-minute','* * * * *','select private.notification_pilio_http_tick();');

commit;
