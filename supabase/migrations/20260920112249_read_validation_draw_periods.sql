-- Read only periods used by an expanded validation, preserving canonical aliases.
create or replace function public.matrix_draw_periods(p_lottery text, p_periods text[])
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_aliases text[];
  v_items jsonb;
  v_conflict boolean;
begin
  if p_lottery is null or p_lottery not in ('今彩539','天天樂','六合彩','大樂透')
    or p_periods is null or cardinality(p_periods) > 500
    or exists(select 1 from unnest(p_periods) p where p is null or p !~ '^[0-9]{1,12}$') then
    raise exception using errcode = '22023', message = 'INVALID_PERIODS';
  end if;
  with canonical as (
    select case when p_lottery in ('今彩539','大樂透') then
      case when p ~ '^[0-9]{6}$' then left(p,3) || '000' || right(p,3)
        when p ~ '^[0-9]{8}$' then lpad(p,9,'0') else p end else p end as period
    from unnest(p_periods) p
  ) select array_agg(distinct alias) into v_aliases from canonical c
    cross join lateral unnest(array[c.period, case when p_lottery in ('今彩539','大樂透')
      and c.period ~ '^0[0-9]{8}$' then right(c.period,8) else c.period end]) alias;
    with source as (
      select d.*, case when p_lottery in ('今彩539', '大樂透') and d.period ~ '^[0-9]{8}$'
        then pg_catalog.lpad(d.period, 9, '0') else d.period end as canonical_period
      from public.lottery_draws d where d.lottery = p_lottery and d.period = any(v_aliases)
    ), aliases as (
      select s.*, pg_catalog.count(*) over (partition by canonical_period) as alias_count
      from source s
    ), comparable as (
      select a.canonical_period, a.draw_date, a.period,
        pg_catalog.jsonb_build_object(
          'period', a.canonical_period, 'draw_date', a.draw_date, 'numbers', a.numbers,
          'sorted_numbers', a.sorted_numbers, 'draw_order_numbers', a.draw_order_numbers,
          'result_status', a.result_status
        ) as raw,
        case when a.alias_count > 1 then pg_catalog.jsonb_build_array(
          a.draw_date,
          (select coalesce(pg_catalog.jsonb_agg(pg_catalog.lpad(pg_catalog.btrim(n.value), 2, '0') order by n.position), '[]'::jsonb)
            from pg_catalog.jsonb_array_elements_text(coalesce(
              nullif(nullif(a.sorted_numbers, '[]'::jsonb), 'null'::jsonb),
              nullif(a.numbers, 'null'::jsonb), '[]'::jsonb
            )) with ordinality n(value, position)),
          case when pg_catalog.jsonb_typeof(a.draw_order_numbers) = 'array' then
            (select coalesce(pg_catalog.jsonb_agg(pg_catalog.lpad(pg_catalog.btrim(n.value), 2, '0') order by n.position), '[]'::jsonb)
              from pg_catalog.jsonb_array_elements_text(a.draw_order_numbers) with ordinality n(value, position))
            else null end,
          a.result_status
        ) else null end as normalized
      from aliases a
    ), canonical as materialized (
      select canonical_period, pg_catalog.min(draw_date) as draw_date,
        (pg_catalog.jsonb_agg(raw order by draw_date desc nulls last, period desc) -> 0) as raw,
        pg_catalog.count(distinct normalized) > 1 as conflict
      from comparable group by canonical_period
    )
    select coalesce(jsonb_agg(raw order by draw_date desc nulls last, canonical_period desc), '[]'::jsonb),
      coalesce(bool_or(conflict),false) into v_items, v_conflict from canonical;
  if v_conflict then return jsonb_build_object('error','DRAW_HISTORY_CONFLICT'); end if;
  return jsonb_build_object('items', v_items);
end;
$$;
revoke all on function public.matrix_draw_periods(text,text[]) from public, anon, authenticated;
grant execute on function public.matrix_draw_periods(text,text[]) to service_role;
