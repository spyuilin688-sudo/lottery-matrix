-- Backfills reconcile provisional rows by date, never by their estimated period.
-- Keep the existing invoker permissions, validation, locks and change trigger.
set local lock_timeout = '5s';

create or replace function public.matrix_upsert_draws(p_draws jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  item jsonb; incoming public.lottery_draws; existing public.lottery_draws; period_match public.lottery_draws;
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
    -- Estimated periods can belong to a different date. Locate that collision
    -- separately; it must never select a different provisional draw for update.
    select * into period_match from public.lottery_draws
      where lottery=incoming.lottery and period=incoming.period for update;
    select * into existing from public.lottery_draws where lottery=incoming.lottery
      and ((draw_date=incoming.draw_date and result_status='preliminary')
        or (period=incoming.period and (result_status='confirmed' or draw_date is not distinct from incoming.draw_date))
        or (draw_date=incoming.draw_date and incoming.result_status='preliminary'))
      order by (draw_date=incoming.draw_date and result_status='preliminary') desc, id limit 1 for update;
    if existing.id is not null and incoming.result_status='preliminary' and existing.result_status='confirmed' then
      saved := existing;
    else
      if existing.result_status='confirmed' and existing.draw_date is not null and incoming.draw_date is not null
        and existing.draw_date<>incoming.draw_date then raise exception 'DRAW_PERIOD_DATE_CONFLICT'; end if;
      if period_match.id is not null and period_match.id is distinct from existing.id then
        if incoming.result_status<>'confirmed' or period_match.result_status<>'preliminary'
          or incoming.draw_date is null or period_match.draw_date is null
          or period_match.draw_date<=incoming.draw_date then
          raise exception 'DRAW_PERIOD_DATE_CONFLICT';
        end if;
      end if;
      pending := '[]';
      if incoming.result_status='confirmed' and (
        (existing.result_status='preliminary' and existing.period<>incoming.period)
        or (period_match.id is not null and period_match.id is distinct from existing.id)) then
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
          if estimate->>'period'=incoming.period
            or (select count(*) from jsonb_array_elements(pending) e where e->>'period'=estimate->>'period')>1
            or exists(select 1 from public.lottery_draws d where d.lottery=incoming.lottery
              and d.period=estimate->>'period' and d.id is distinct from existing.id
              and not exists(select 1 from jsonb_array_elements(pending) e where (e->>'id')::bigint=d.id)) then
            raise exception 'DRAW_PERIOD_DATE_CONFLICT';
          end if;
        end loop;
        -- Free estimates atomically before inserting the historical official row
        -- or correcting a same-date row, preserving every provisional date and ID.
        update public.lottery_draws d set period='reconcile:'||d.id::text
          where exists(select 1 from jsonb_array_elements(pending) e where (e->>'id')::bigint=d.id);
      end if;
      if existing.id is not null then
        update public.lottery_draws set period=incoming.period,draw_date=incoming.draw_date,
          numbers=incoming.numbers,sorted_numbers=incoming.sorted_numbers,draw_order_numbers=incoming.draw_order_numbers,
          source_id=incoming.source_id,result_status=incoming.result_status where id=existing.id returning * into saved;
      else
        insert into public.lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers,source_id,result_status)
          values(incoming.lottery,incoming.period,incoming.draw_date,incoming.numbers,incoming.sorted_numbers,
            incoming.draw_order_numbers,incoming.source_id,incoming.result_status) returning * into saved;
      end if;
      for estimate in select value from jsonb_array_elements(pending) loop
        update public.lottery_draws set period=estimate->>'period' where id=(estimate->>'id')::bigint;
      end loop;
    end if;
    results := results || jsonb_build_array(to_jsonb(saved));
  end loop;
  return results;
end $$;
revoke all on function public.matrix_upsert_draws(jsonb) from public,anon,authenticated;
grant execute on function public.matrix_upsert_draws(jsonb) to service_role;
