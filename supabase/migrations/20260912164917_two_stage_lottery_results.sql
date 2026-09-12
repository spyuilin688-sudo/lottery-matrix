-- Additive rollout: deploy before the per-order workers and public readers.
set local lock_timeout = '5s';

alter table public.lottery_draws
  add column result_status text not null default 'confirmed'
    check (result_status in ('preliminary','confirmed'));
create index lottery_draws_preliminary_date_idx on public.lottery_draws(lottery,draw_date)
  where result_status='preliminary';

-- A source correction fences running renderers and the affected analysis stages.
-- Foreign keys cascade obsolete run deletion into chunks and result tables.
create function private.matrix_draw_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed_sorted boolean := true; cutoff date := new.draw_date; previous_period text := new.period;
begin
  if tg_op='UPDATE' then
    changed_sorted := (old.period,old.draw_date,old.numbers,old.sorted_numbers)
      is distinct from (new.period,new.draw_date,new.numbers,new.sorted_numbers);
    if not changed_sorted and old.draw_order_numbers is not distinct from new.draw_order_numbers
      and old.result_status is not distinct from new.result_status then return new; end if;
    previous_period := old.period;
    cutoff := case when old.draw_date is null or new.draw_date is null then null else least(old.draw_date,new.draw_date) end;
  end if;
  delete from public.matrix_analysis_runs run
    where run.lottery=new.lottery
      and ((tg_op='UPDATE' and (run.draw_period=previous_period or cutoff is null)) or exists(
        select 1 from public.lottery_draws d where d.lottery=run.lottery and d.period=run.draw_period
          and (cutoff is null or d.draw_date>=cutoff)))
      and (changed_sorted or run.analysis_version not like '%-sorted');
  update public.matrix_card_publications
    set desired_digest=null,desired_period=null,eligible_at=null,lease_token=null,lease_until=null
    where lottery=new.lottery;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function private.matrix_draw_changed() from public,anon,authenticated,service_role;
create trigger matrix_draw_changed before insert or update on public.lottery_draws
  for each row execute function private.matrix_draw_changed();

-- The date, not an estimated issue number, is the identity for provisional data.
create function private.matrix_stage_fast_result(p_lottery text,p_date date,p_numbers jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare latest public.lottery_draws; next_period text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_lottery,0));
  if exists(select 1 from public.lottery_draws where lottery=p_lottery and draw_date=p_date) then return; end if;
  select * into latest from public.lottery_draws where lottery=p_lottery
    order by draw_date desc nulls last,period desc limit 1 for update;
  if latest.id is null or latest.period !~ '^[0-9]{1,20}$' then
    raise exception using errcode='55000',message='FAST_RESULT_BASE_PERIOD_REQUIRED';
  end if;
  if latest.draw_date > p_date then return; end if;
  next_period := (latest.period::numeric+1)::text;
  next_period := pg_catalog.lpad(next_period,greatest(length(next_period),length(latest.period)),'0');
  insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers,source_id,result_status)
    values(p_lottery,next_period,p_date,p_numbers,p_numbers,null,'pilio','preliminary');
end $$;
revoke all on function private.matrix_stage_fast_result(text,date,jsonb) from public,anon,authenticated,service_role;

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
  perform private.notification_fanout_event((v_result->>'id')::uuid);
  return v_result;
end $$;

-- All Python formal writers use one transaction for date reconciliation and
-- result invalidation. Bulk historical imports keep their existing row shape.
create function public.matrix_upsert_draws(p_draws jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  item jsonb; incoming public.lottery_draws; existing public.lottery_draws;
  saved public.lottery_draws; results jsonb := '[]'; n_count integer; maximum integer;
  later public.lottery_draws; pending jsonb; estimate jsonb; anchor text; estimate_period text;
begin
  if p_draws is null or jsonb_typeof(p_draws)<>'array' then
    raise exception using errcode='22023',message='INVALID_DRAWS';
  end if;
  -- Consistent lock ordering also protects mixed-lottery administrative imports.
  for item in select value from jsonb_array_elements(p_draws) order by value->>'lottery',value->>'draw_date',value->>'period' loop
    incoming := jsonb_populate_record(null::public.lottery_draws,item);
    incoming.result_status := coalesce(incoming.result_status,'confirmed');
    n_count := case incoming.lottery when '今彩539' then 5 when '天天樂' then 5 else 7 end;
    maximum := case incoming.lottery when '今彩539' then 39 when '天天樂' then 39 else 49 end;
    if incoming.lottery is null or incoming.lottery not in ('今彩539','天天樂','六合彩','大樂透')
      or incoming.period is null or incoming.period !~ '^[0-9]{1,20}$'
      or incoming.result_status not in ('preliminary','confirmed')
      or jsonb_typeof(incoming.numbers) is distinct from 'array'
      or jsonb_typeof(incoming.sorted_numbers) is distinct from 'array' then
      raise exception using errcode='22023',message='INVALID_DRAW';
    end if;
    if jsonb_array_length(incoming.numbers)<>n_count or jsonb_array_length(incoming.sorted_numbers)<>n_count
      or exists(select 1 from jsonb_array_elements_text(incoming.numbers) n where n !~ '^\d{2}$') then
      raise exception using errcode='22023',message='INVALID_DRAW_NUMBERS';
    end if;
    if exists(select 1 from jsonb_array_elements_text(incoming.numbers) n where n::integer<1 or n::integer>maximum)
      or (select count(distinct n) from jsonb_array_elements_text(incoming.numbers) n)<>n_count
      or not (incoming.sorted_numbers @> incoming.numbers and incoming.numbers @> incoming.sorted_numbers)
      or (n_count=7 and incoming.sorted_numbers->6 is distinct from incoming.numbers->6) then
      raise exception using errcode='22023',message='INVALID_DRAW_NUMBERS';
    end if;
    if incoming.draw_order_numbers='null'::jsonb or incoming.draw_order_numbers='[]'::jsonb then incoming.draw_order_numbers := null; end if;
    if incoming.result_status='preliminary' then incoming.draw_order_numbers := null; end if;
    if incoming.draw_order_numbers is not null then
      if jsonb_typeof(incoming.draw_order_numbers)<>'array' then raise exception 'INVALID_DRAW_ORDER'; end if;
      if jsonb_array_length(incoming.draw_order_numbers)<>n_count
        or not (incoming.draw_order_numbers @> incoming.numbers and incoming.numbers @> incoming.draw_order_numbers)
        or (n_count=7 and incoming.draw_order_numbers->6 is distinct from incoming.numbers->6) then
        raise exception using errcode='22023',message='INVALID_DRAW_ORDER';
      end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(incoming.lottery,0));
    select * into existing from public.lottery_draws where lottery=incoming.lottery
      and ((draw_date=incoming.draw_date and result_status='preliminary') or period=incoming.period
        or (draw_date=incoming.draw_date and incoming.result_status='preliminary'))
      order by (draw_date=incoming.draw_date and result_status='preliminary') desc, id limit 1 for update;
    if existing.id is not null and incoming.result_status='preliminary' and existing.result_status='confirmed' then
      saved := existing;
    elsif existing.id is not null then
      if existing.result_status='confirmed' and existing.draw_date is not null and incoming.draw_date is not null
        and existing.draw_date<>incoming.draw_date then raise exception 'DRAW_PERIOD_DATE_CONFLICT'; end if;
      pending := '[]';
      if existing.result_status='preliminary' and incoming.result_status='confirmed'
        and existing.period<>incoming.period then
        anchor := incoming.period;
        for later in select * from public.lottery_draws where lottery=incoming.lottery
          and draw_date>incoming.draw_date order by draw_date,id for update loop
          if later.result_status='confirmed' then
            anchor := later.period;
          else
            estimate_period := (anchor::numeric+1)::text;
            estimate_period := lpad(estimate_period,greatest(length(estimate_period),length(anchor),length(later.period)),'0');
            pending := pending || jsonb_build_array(jsonb_build_object('id',later.id,'period',estimate_period));
            anchor := estimate_period;
          end if;
        end loop;
        for estimate in select value from jsonb_array_elements(pending) loop
          if exists(select 1 from public.lottery_draws d where d.lottery=incoming.lottery
            and d.period=estimate->>'period' and d.id<>existing.id
            and not exists(select 1 from jsonb_array_elements(pending) e where (e->>'id')::bigint=d.id)) then
            raise exception 'DRAW_PERIOD_DATE_CONFLICT';
          end if;
        end loop;
        -- Temporary keys are invisible outside this transaction. Free all old
        -- estimates before assigning final keys, including downward corrections.
        update public.lottery_draws d set period='reconcile:'||d.id::text
          where exists(select 1 from jsonb_array_elements(pending) e where (e->>'id')::bigint=d.id);
      end if;
      update public.lottery_draws set period=incoming.period,draw_date=incoming.draw_date,
        numbers=incoming.numbers,sorted_numbers=incoming.sorted_numbers,draw_order_numbers=incoming.draw_order_numbers,
        source_id=incoming.source_id,result_status=incoming.result_status where id=existing.id returning * into saved;
      for estimate in select value from jsonb_array_elements(pending) loop
        update public.lottery_draws set period=estimate->>'period' where id=(estimate->>'id')::bigint;
      end loop;
    else
      insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers,source_id,result_status)
        values(incoming.lottery,incoming.period,incoming.draw_date,incoming.numbers,incoming.sorted_numbers,
          incoming.draw_order_numbers,incoming.source_id,incoming.result_status) returning * into saved;
    end if;
    results := results || jsonb_build_array(to_jsonb(saved));
  end loop;
  return results;
end $$;
revoke all on function public.matrix_upsert_draws(jsonb) from public,anon,authenticated;
grant execute on function public.matrix_upsert_draws(jsonb) to service_role;
