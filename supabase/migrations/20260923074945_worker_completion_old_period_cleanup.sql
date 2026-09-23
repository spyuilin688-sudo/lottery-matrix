begin;
set local lock_timeout = '3s';

-- Reject a changed predecessor so concurrent trigger work is not overwritten.
do $guard$
begin
  if md5(pg_get_functiondef('private.matrix_worker_completion_invalidate()'::regprocedure))
     <> 'd9d91c08015f2a17be547effa7225610' then
    raise exception 'WORKER_COMPLETION_PREDECESSOR_CHANGED';
  end if;
end $guard$;

CREATE OR REPLACE FUNCTION private.matrix_worker_completion_invalidate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_query text;
  v_column text := case when tg_table_name = 'notification_events'
    then 'payload->>''lottery''' else 'lottery' end;
  v_lottery text;
begin
  if tg_op = 'TRUNCATE' then
    update private.matrix_worker_completion set generation = generation + 1;
    return null;
  end if;
  -- Transition tables amortize bulk writes: one generation update per lottery,
  -- per statement, even when a batch materializes thousands of result rows.
  if tg_op='UPDATE' and tg_table_name in ('matrix_explore_results','matrix_tianheng_results') then
    -- Only proven representation-only transitions preserve completion. All real
    -- field/validation/expiry changes and every other mutation still invalidate.
    v_query:=pg_catalog.format($query$
      select coalesce(n.lottery,o.lottery) lottery from new_rows n full join old_rows o
      using(lottery,draw_period,analysis_version,item_id)
      where not coalesce(o.item_column_mask=0 and n.item_column_mask<>0
        and (to_jsonb(n)-'item'-'item_column_mask')=(to_jsonb(o)-'item'-'item_column_mask')
        and private.matrix_result_item(n::public.%I)=private.matrix_result_item(o::public.%I),false)
    $query$,tg_table_name,tg_table_name);
  elsif tg_op = 'INSERT' then
    v_query := 'select ' || v_column || ' lottery from new_rows';
  elsif tg_op = 'DELETE' and tg_table_name in (
    'matrix_analysis_artifacts', 'matrix_analysis_artifact_chunks',
    'matrix_explore_results', 'matrix_tianheng_results', 'matrix_tianshu_results'
  ) then
    -- Retention deletes for older periods cannot change current readiness.
    -- Compare against the latest draw, not the last certificate: a new draw
    -- may exist before its first completion certificate is written.
    v_query := $query$
      select old.lottery from old_rows old
      where old.draw_period = (
        select draw.period from public.lottery_draws draw
        where draw.lottery = old.lottery
        order by draw.draw_date desc nulls last, draw.period desc limit 1
      )
    $query$;
  elsif tg_op = 'DELETE' then
    v_query := 'select ' || v_column || ' lottery from old_rows';
  else
    v_query := 'select ' || v_column || ' lottery from new_rows union all select '
      || v_column || ' lottery from old_rows';
  end if;
  for v_lottery in execute
    'select distinct lottery from (' || v_query || ') changed where lottery is not null order by lottery'
  loop
    insert into private.matrix_worker_completion as state(lottery, generation)
      values (v_lottery, 1)
      on conflict (lottery) do update set generation = state.generation + 1;
  end loop;
  return null;
end;
$function$;
commit;
