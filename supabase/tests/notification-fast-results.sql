begin;

do $$
declare
  v_body text;
  v_state text;
  v_copy text;
begin
  v_body := private.notification_render_payload('lottery_result','test',
    '{"lottery":"今彩539","period":"115000216","drawDate":"2026-09-05","numbers":["03","08","10","28","38"]}'::jsonb)->>'body';
  assert v_body = '09/05(六) 03-08-10-28-38', 'result uses the actual draw date, weekday and padded hyphenated numbers';
  assert private.notification_render_payload('bet_reminder','test','{}')->>'body'
    = '選號時間到了，記得完成你的選號。', 'reminder copy';
  assert private.notification_render_payload('matrix_card','test',
    '{"lottery":"今彩539","drawDate":"2026-09-05"}')->>'body'
    = '09/05(六) 最新的牌單已經更新囉！', 'card uses draw date';
  for v_state,v_copy in select * from (values
    ('臨界','發現了極為罕見的版路！'),
    ('共振','發現了具備強烈共振效應的版路！'),
    ('聚合','發現了具備明顯規律集中性的版路！'),
    ('啟動','發現了具備基本參考價值的版路！')
  ) as copies(state,copy) loop
    assert private.notification_render_payload('matrix_status','test',
      jsonb_build_object('lottery','今彩539','drawDate','2026-09-05','statusLabel',v_state))->>'body'
      = v_copy, 'status maps to its approved copy';
  end loop;
  begin
    perform private.notification_render_payload('matrix_card','test',
      '{"lottery":"今彩539","period":"test-missing-draw-period"}');
    raise exception 'missing draw date was silently replaced';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers)
values ('今彩539','199000001','2099-09-04','["03","08","10","28","38"]','["03","08","10","28","38"]');
do $$
begin
  assert private.notification_draw_date_label('{"lottery":"今彩539","period":"199000001"}')
    = private.notification_draw_date_label('{"drawDate":"2099-09-04"}'), 'legacy payload resolves its own official period date';
end;
$$;

do $$
declare
  v_early jsonb;
  v_formal jsonb;
  v_draws jsonb;
  v_events bigint;
  v_outbox bigint;
begin
  select coalesce(jsonb_agg(to_jsonb(d) order by lottery,period),'[]'::jsonb) into v_draws from public.lottery_draws d;
  v_early := public.notification_fast_result_publish('539','2099-09-05',array['03','08','10','28','38']);
  v_formal := private.notification_event_enqueue('lottery_result:539:test-formal-period','lottery_result','railway',now(),
    '{"lottery":"今彩539","lotteryCode":"539","period":"test-formal-period","drawDate":"2099-09-05","numbers":["03","08","10","28","38"]}');
  assert (v_early->>'created')::boolean, 'first early result creates an event';
  assert not (v_formal->>'created')::boolean, 'formal result for the same draw does not create another event';
  assert v_early->>'id' = v_formal->>'id', 'both sources resolve to one notification event';
  assert v_formal->>'eventKey' = 'lottery_result:539:test-formal-period', 'legacy producer receives its own input key as acknowledgement';
  select count(*) into v_events from public.notification_events where event_type='lottery_result' and payload->>'lottery'='今彩539' and payload->>'drawDate'='2099-09-05';
  assert v_events = 1, 'only one event per lottery and draw date';
  select count(*) into v_outbox from public.notification_outbox where event_id=(v_early->>'id')::uuid;
  assert v_outbox = (select count(*) from public.members where private.notification_member_matches(id,'lottery_result','{"lottery":"今彩539"}')),
    'early result is rendered and queued for all matching members immediately';
  perform private.notification_fanout_event((v_formal->>'id')::uuid);
  assert (select count(*) from public.notification_outbox where event_id=(v_early->>'id')::uuid) = v_outbox, 'repeat source does not fan out again';
  assert (select coalesce(jsonb_agg(to_jsonb(d) order by lottery,period),'[]'::jsonb) from public.lottery_draws d
    where not (lottery='今彩539' and draw_date='2099-09-05')) = v_draws,
    'early result preserves existing draw data';
  assert (select count(*)=1 from public.lottery_draws where lottery='今彩539' and draw_date='2099-09-05'
    and period='199000002' and result_status='preliminary' and draw_order_numbers is null
    and sorted_numbers='["03","08","10","28","38"]'::jsonb),
    'early result stores one new date with next provisional period and no fabricated draw order';
  assert private.notification_pilio_http_tick('2099-09-05T12:35:00Z') is null, 'recorded result stops source polling';
  assert private.notification_pilio_http_tick('2099-09-05T12:34:59Z') is null, 'no request before the configured window';
  assert private.notification_pilio_http_tick('2099-09-05T13:41:00Z') is null, 'no request after the final window';

  v_formal := private.notification_event_enqueue('lottery_result:marksix:test-first-formal','lottery_result','railway',now(),
    '{"lottery":"六合彩","lotteryCode":"marksix","period":"test-first-formal","drawDate":"2099-09-04","numbers":["09","18","26","30","33","45","28"]}');
  v_early := public.notification_fast_result_publish('marksix','2099-09-04',array['09','18','26','30','33','45','28']);
  assert not (v_early->>'created')::boolean and v_early->>'id'=v_formal->>'id', 'formal-first and early-first share the same deduplication';

  begin
    perform public.notification_fast_result_publish('539','2099-09-05',array['03','08','10','28']);
    raise exception 'incomplete result was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.notification_fast_result_publish('marksix','2099-09-05',array['09','18','26','30','33','45','45']);
    raise exception 'duplicate special number was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

do $$
begin
  assert not has_function_privilege('anon','public.notification_fast_result_publish(text,date,text[])','EXECUTE'), 'anonymous users cannot publish early notifications';
  assert not has_function_privilege('authenticated','public.notification_fast_result_publish(text,date,text[])','EXECUTE'), 'members cannot forge early notifications';
  assert has_function_privilege('service_role','public.notification_fast_result_publish(text,date,text[])','EXECUTE'), 'trusted function can publish';
end;
$$;

select 'notification fast results contract passed' as result;
rollback;
