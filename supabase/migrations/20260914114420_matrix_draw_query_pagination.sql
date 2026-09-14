-- Read-only query boundary for the existing Railway API. No draw rows, triggers,
-- algorithm rules, grants on tables, or indexes are changed by this migration.
create or replace function public.matrix_draw_query(
  p_lottery text,
  p_kind text,
  p_limit integer default 500,
  p_cursor jsonb default null,
  p_numbers jsonb default '[]'::jsonb,
  p_order text default '依號碼由小到大排序',
  p_future_offset integer default 1
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_revision text;
  v_offset integer := 0;
  v_limit integer;
  v_items jsonb;
  v_years jsonb;
  v_has_more boolean;
  v_draws jsonb;
  v_conflict boolean;
begin
  if p_lottery is null or p_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or p_kind is null or p_kind not in ('summary', 'latest', 'history', 'tongxing')
    or p_limit is null or p_limit not between 1 and 500
    or p_future_offset is null or p_future_offset not between 1 and 30
    or p_order is null or p_order not in ('依號碼由小到大排序', '依實際開獎順序排序') then
    raise exception using errcode = '22023', message = 'Invalid draw query parameters';
  end if;
  if p_numbers is null or pg_catalog.jsonb_typeof(p_numbers) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid draw query numbers';
  end if;
  if pg_catalog.jsonb_array_length(p_numbers) > 49 or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_numbers) as n(value)
    where pg_catalog.jsonb_typeof(n.value) <> 'string'
      or (n.value #>> '{}') !~ '^(0[1-9]|[1-4][0-9])$'
  ) then
    raise exception using errcode = '22023', message = 'Invalid draw query numbers';
  end if;

  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(p_cursor) <> 'object'
      or pg_catalog.jsonb_typeof(p_cursor -> 'offset') is distinct from 'number'
      or (p_cursor ->> 'offset') !~ '^[0-9]{1,10}$'
      or pg_catalog.jsonb_typeof(p_cursor -> 'revision') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'Invalid draw query cursor';
    end if;
    if (p_cursor ->> 'offset')::bigint > 2147483147 then
      raise exception using errcode = '22023', message = 'Invalid draw query cursor offset';
    end if;
    v_offset := (p_cursor ->> 'offset')::integer;
  end if;

  -- The existing matrix_draw_changed trigger sets updated_at = clock_timestamp()
  -- for additions and corrections, including older periods. Hash every raw
  -- period/timestamp pair: MAX(updated_at) misses transactions that commit out
  -- of timestamp order. JSON encoding and UTC make this deterministic without
  -- delimiter ambiguity. STABLE shares one snapshot with the rows below.
  select pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_array(d.period, d.updated_at at time zone 'UTC') order by d.period
  ), '[]'::jsonb)::text)
  into v_revision from public.lottery_draws d where d.lottery = p_lottery;
  if p_cursor is not null and p_cursor <> 'null'::jsonb
    and (p_cursor ->> 'revision') is distinct from v_revision then
    return pg_catalog.jsonb_build_object('error', 'DRAW_HISTORY_CHANGED', 'revision', v_revision);
  end if;

  if p_kind = 'summary' then
    select coalesce(pg_catalog.jsonb_agg(y.year order by y.year desc), '[]'::jsonb)
    into v_years from (
      select distinct pg_catalog.to_char(d.draw_date, 'YYYY') as year
      from public.lottery_draws d where d.lottery = p_lottery and d.draw_date is not null
    ) y;
    return pg_catalog.jsonb_build_object('revision', v_revision, 'years', v_years);
  end if;

  if p_kind = 'tongxing' and pg_catalog.jsonb_array_length(p_numbers) = 0 then
    return pg_catalog.jsonb_build_object('revision', v_revision, 'groups', '[]'::jsonb, 'nextCursor', null);
  end if;
  v_limit := case when p_kind = 'latest' then 1 else p_limit end;
  -- Preserve the API's established 8-digit Taiwan period aliases without
  -- rewriting stored periods. Compare precisely the fields _normalize_draw
  -- exposes: sorted numbers replace numbers, values pad to two digits, and
  -- missing draw order remains distinct from an explicitly empty array.
  with source as (
    select d.*, case when p_lottery in ('今彩539', '大樂透') and d.period ~ '^[0-9]{8}$'
      then pg_catalog.lpad(d.period, 9, '0') else d.period end as canonical_period
    from public.lottery_draws d where d.lottery = p_lottery
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
  ), canonical as (
    select canonical_period, pg_catalog.min(draw_date) as draw_date,
      (pg_catalog.jsonb_agg(raw order by draw_date desc nulls last, period desc) -> 0) as raw,
      pg_catalog.count(distinct normalized) > 1 as conflict
    from comparable group by canonical_period
  )
  select coalesce(pg_catalog.jsonb_agg(raw order by draw_date desc nulls last, canonical_period desc), '[]'::jsonb),
    coalesce(pg_catalog.bool_or(conflict), false)
  into v_draws, v_conflict from canonical;
  if v_conflict then
    return pg_catalog.jsonb_build_object('error', 'DRAW_HISTORY_CONFLICT', 'revision', v_revision);
  end if;

  if p_kind in ('latest', 'history') then
    with page as materialized (
      select d.raw as item, d.position as rn
      from pg_catalog.jsonb_array_elements(v_draws) with ordinality d(raw, position)
      order by d.position
      limit v_limit + 1 offset case when p_kind = 'latest' then 0 else v_offset end
    ), numbered as (
      select item, pg_catalog.row_number() over (order by rn) as position from page
    )
    select coalesce(pg_catalog.jsonb_agg(item order by position) filter (where position <= v_limit), '[]'::jsonb),
      pg_catalog.count(*) > v_limit
    into v_items, v_has_more from numbered;
    return pg_catalog.jsonb_build_object('revision', v_revision, 'items', v_items, 'nextCursor',
      case when v_has_more and p_kind = 'history'
        then pg_catalog.jsonb_build_object('offset', v_offset + v_limit, 'revision', v_revision)
        else null end);
  end if;

  with draws as (
    select d.raw, d.position,
    case when p_order = '依實際開獎順序排序' then
      case when d.raw ->> 'result_status' = 'preliminary'
          or pg_catalog.jsonb_typeof(d.raw -> 'draw_order_numbers') is distinct from 'array' then '[]'::jsonb
        else d.raw -> 'draw_order_numbers' end
      else coalesce(nullif(nullif(d.raw -> 'sorted_numbers', '[]'::jsonb), 'null'::jsonb),
        nullif(d.raw -> 'numbers', 'null'::jsonb), '[]'::jsonb)
    end as selected_numbers
    from pg_catalog.jsonb_array_elements(v_draws) with ordinality d(raw, position)
  ), paired as (
    -- Window over ALL draws before filtering; a matching locked draw predicts
    -- the draw exactly p_future_offset periods newer, not the next match.
    select raw, selected_numbers,
      pg_catalog.lag(raw, p_future_offset) over chronology as predicted,
      pg_catalog.row_number() over chronology as rn
    from draws
    window chronology as (order by position)
  ), page as materialized (
    select pg_catalog.jsonb_build_object('lockedEntry', raw, 'predictedEntry', predicted) as item, rn
    from paired where predicted is not null
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements_text(p_numbers) wanted(value)
        where not exists (
          select 1 from pg_catalog.jsonb_array_elements_text(selected_numbers) available(value)
          where pg_catalog.lpad(pg_catalog.btrim(available.value), 2, '0') = wanted.value
        )
      )
    order by rn desc limit v_limit + 1 offset v_offset
  ), numbered as (
    select item, pg_catalog.row_number() over (order by rn desc) as position from page
  )
  select coalesce(pg_catalog.jsonb_agg(item order by position) filter (where position <= v_limit), '[]'::jsonb),
    pg_catalog.count(*) > v_limit
  into v_items, v_has_more from numbered;
  return pg_catalog.jsonb_build_object('revision', v_revision, 'groups', v_items, 'nextCursor',
    case when v_has_more
      then pg_catalog.jsonb_build_object('offset', v_offset + v_limit, 'revision', v_revision)
      else null end);
end;
$function$;

revoke all on function public.matrix_draw_query(text, text, integer, jsonb, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.matrix_draw_query(text, text, integer, jsonb, jsonb, text, integer) to service_role;
comment on function public.matrix_draw_query(text, text, integer, jsonb, jsonb, text, integer)
  is 'Read-only Railway draw queries with revision-bound pagination; only service_role may execute.';
