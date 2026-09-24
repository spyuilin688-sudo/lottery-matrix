create unique index if not exists lottery_draws_lottery_period_key
on public.lottery_draws (lottery, period);

create or replace function public.merge_appdeploy_lottery_draw_batch(payload jsonb)
returns table(inserted_count bigint, updated_count bigint)
language sql
security invoker
set search_path = public
as $$
  with normalized as (
    select distinct on (lottery, period)
      lottery,
      period,
      nullif(draw_date, '')::date as draw_date,
      coalesce(numbers, '[]'::jsonb) as numbers,
      coalesce(sorted_numbers, numbers, '[]'::jsonb) as sorted_numbers,
      draw_order_numbers,
      coalesce(source_id, 'appdeploy') as source_id
    from jsonb_to_recordset(payload) as x(
      lottery text,
      period text,
      draw_date text,
      numbers jsonb,
      sorted_numbers jsonb,
      draw_order_numbers jsonb,
      source_id text
    )
    where lottery is not null
      and period is not null
      and jsonb_typeof(coalesce(numbers, '[]'::jsonb)) = 'array'
    order by lottery, period
  ),
  merged as (
    insert into public.lottery_draws (
      lottery, period, draw_date, numbers, sorted_numbers, draw_order_numbers, source_id
    )
    select lottery, period, draw_date, numbers, sorted_numbers, draw_order_numbers, source_id
    from normalized
    on conflict (lottery, period) do update
    set draw_date = coalesce(lottery_draws.draw_date, excluded.draw_date),
        numbers = case
          when jsonb_typeof(lottery_draws.numbers) <> 'array'
            or jsonb_array_length(lottery_draws.numbers) = 0
          then excluded.numbers else lottery_draws.numbers end,
        sorted_numbers = case
          when jsonb_typeof(lottery_draws.sorted_numbers) <> 'array'
            or jsonb_array_length(lottery_draws.sorted_numbers) = 0
          then excluded.sorted_numbers else lottery_draws.sorted_numbers end,
        draw_order_numbers = case
          when lottery_draws.draw_order_numbers is null
            or jsonb_typeof(lottery_draws.draw_order_numbers) <> 'array'
            or jsonb_array_length(lottery_draws.draw_order_numbers) = 0
          then excluded.draw_order_numbers else lottery_draws.draw_order_numbers end,
        source_id = coalesce(lottery_draws.source_id, excluded.source_id),
        updated_at = now()
    where (lottery_draws.draw_date is null and excluded.draw_date is not null)
       or ((jsonb_typeof(lottery_draws.numbers) <> 'array' or jsonb_array_length(lottery_draws.numbers) = 0)
           and jsonb_array_length(excluded.numbers) > 0)
       or ((jsonb_typeof(lottery_draws.sorted_numbers) <> 'array' or jsonb_array_length(lottery_draws.sorted_numbers) = 0)
           and jsonb_array_length(excluded.sorted_numbers) > 0)
       or ((lottery_draws.draw_order_numbers is null
            or jsonb_typeof(lottery_draws.draw_order_numbers) <> 'array'
            or jsonb_array_length(lottery_draws.draw_order_numbers) = 0)
           and excluded.draw_order_numbers is not null
           and jsonb_typeof(excluded.draw_order_numbers) = 'array'
           and jsonb_array_length(excluded.draw_order_numbers) > 0)
       or (lottery_draws.source_id is null and excluded.source_id is not null)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
  from merged;
$$;

revoke all on function public.merge_appdeploy_lottery_draw_batch(jsonb) from public;
revoke all on function public.merge_appdeploy_lottery_draw_batch(jsonb) from anon;
revoke all on function public.merge_appdeploy_lottery_draw_batch(jsonb) from authenticated;
grant execute on function public.merge_appdeploy_lottery_draw_batch(jsonb) to service_role;