begin;

-- A new notification event fans out and wakes dispatch through
-- notification_event_publish_after_insert. Calling fanout again here also
-- scans an existing event when another producer recorded the same draw first.
create or replace function private.notification_fast_result_publish(p_lottery_code text,p_draw_date date,p_numbers text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_lottery text := case p_lottery_code when '539' then '今彩539' when 'marksix' then '六合彩' when 'lotto649' then '大樂透' else null end;
  v_count integer := case when p_lottery_code='539' then 5 else 7 end;
  v_maximum integer := case when p_lottery_code='539' then 39 else 49 end;
  v_result jsonb; v_sorted text[];
begin
  if v_lottery is null or p_draw_date is null or p_numbers is null or pg_catalog.cardinality(p_numbers)<>v_count then
    raise exception using errcode='22023',message='INVALID_FAST_RESULT';
  end if;
  if exists(select 1 from pg_catalog.unnest(p_numbers) n(value) where value is null or value !~ '^\d{2}$') then
    raise exception using errcode='22023',message='INVALID_FAST_RESULT';
  end if;
  if exists(select 1 from pg_catalog.unnest(p_numbers) n(value) where value::integer<1 or value::integer>v_maximum)
    or (select count(distinct value) from pg_catalog.unnest(p_numbers) n(value))<>v_count then
    raise exception using errcode='22023',message='INVALID_FAST_RESULT';
  end if;
  select array_agg(value order by case when v_count=7 and ordinal=7 then 100 else value::integer end)
    into v_sorted from pg_catalog.unnest(p_numbers) with ordinality n(value,ordinal);
  perform private.matrix_stage_fast_result(v_lottery,p_draw_date,pg_catalog.to_jsonb(v_sorted));
  v_result := private.notification_event_enqueue('lottery_result:'||p_lottery_code||':'||p_draw_date::text,
    'lottery_result','pilio',pg_catalog.now(),pg_catalog.jsonb_build_object(
      'lottery',v_lottery,'lotteryCode',p_lottery_code,'drawDate',p_draw_date::text,'numbers',pg_catalog.to_jsonb(v_sorted)));
  return v_result;
end $$;

revoke all on function private.notification_fast_result_publish(text,date,text[])
  from public,anon,authenticated,service_role;

commit;
