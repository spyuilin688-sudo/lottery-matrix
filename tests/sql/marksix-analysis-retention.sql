begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $test$
declare
  v_prefix text := 'qa-retention-' || gen_random_uuid()::text || '-';
  v_period text;
  v_status text;
  v_removed integer;
  i integer;
begin
  for i in 1..6 loop
    v_period := v_prefix || i::text;
    v_status := case when i <= 4 then 'complete' when i = 5 then 'running' else 'failed' end;
    insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers)
    values('六合彩',v_period,('2099-01-01'::date + i),'["01","02","03","04","05","06","07"]','["01","02","03","04","05","06","07"]');
    insert into public.matrix_analysis_runs(lottery,draw_period,analysis_version,phase,cursor,total,status,started_at,completed_at)
    values('六合彩',v_period,v_period || ':matrix-python-v12','explore',0,0,v_status,now(),case when v_status='complete' then now() else null end);
    insert into public.matrix_analysis_artifacts(lottery,draw_period,analysis_version,kind,payload,completed_at,expires_at)
    values('六合彩',v_period,v_period || ':matrix-python-v12','explore','{"items":[]}',now(),'1900-01-01');
    insert into public.matrix_analysis_artifact_chunks(lottery,draw_period,analysis_version,kind,chunk_index,cursor_start,cursor_end,payload,expires_at)
    values('六合彩',v_period,v_period || ':matrix-python-v12','explore',0,0,1,'{"items":[]}','1900-01-01');
    insert into public.matrix_explore_results(lottery,draw_period,analysis_version,item_id,number,locked_position,prediction_distance,consecutive,highest_streak,prediction_numbers,algorithm_type,number_order,rule_count,locked_source_index,locked_source_period,reference_offset,reference_position,item,validation,expires_at,explore_range)
    values('六合彩',v_period,v_period || ':matrix-python-v12','qa-item','01',1,1,'準5進6',5,'["02"]','加減','依號碼由小到大排序',1,0,v_period,1,1,'{}','{}','1900-01-01','標準範圍');
  end loop;
  v_removed := public.matrix_analysis_cleanup_expired('1901-01-01');
  if v_removed <> 6 then raise exception 'EXPECTED_SIX_EXPIRED_ROWS_REMOVED:%',v_removed; end if;
  for i in 1..6 loop
    v_period := v_prefix || i::text;
    if (exists(select 1 from public.matrix_analysis_artifacts where lottery='六合彩' and draw_period=v_period)) <> (i in (2,3,4,5))
      or (exists(select 1 from public.matrix_analysis_artifact_chunks where lottery='六合彩' and draw_period=v_period)) <> (i in (2,3,4,5))
      or (exists(select 1 from public.matrix_explore_results where lottery='六合彩' and draw_period=v_period)) <> (i in (2,3,4,5)) then
      raise exception 'RETENTION_RESULT_MISMATCH:%',i;
    end if;
  end loop;
  if has_function_privilege('anon','public.matrix_analysis_cleanup_expired(timestamptz)','execute')
    or has_function_privilege('authenticated','public.matrix_analysis_cleanup_expired(timestamptz)','execute')
    or not has_function_privilege('service_role','public.matrix_analysis_cleanup_expired(timestamptz)','execute') then
    raise exception 'CLEANUP_RPC_PRIVILEGES_INCORRECT';
  end if;
end;
$test$;
rollback;

