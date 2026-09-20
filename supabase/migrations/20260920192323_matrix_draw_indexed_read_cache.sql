-- Move alias reconciliation to writes. Reads retain global fail-closed conflict
-- detection, but latest/history use a bounded index scan, never a history hash.
-- Backfill and trigger installation are atomic; this lock blocks draw writers
-- for the migration only. Existing opaque revision cursors expire once.
begin;
lock table public.lottery_draws in share row exclusive mode;
create schema if not exists private;
create table private.matrix_draw_read_state (
  lottery text primary key,
  revision text not null default pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
);
create table private.matrix_draw_read_rows (
  lottery text not null,
  canonical_period text not null,
  draw_date date,
  raw jsonb not null,
  conflict boolean not null,
  primary key (lottery, canonical_period)
);
create index matrix_draw_read_page_idx on private.matrix_draw_read_rows
  (lottery, draw_date desc nulls last, canonical_period desc);
create index matrix_draw_read_conflict_idx on private.matrix_draw_read_rows (lottery) where conflict;
alter table private.matrix_draw_read_state enable row level security;
alter table private.matrix_draw_read_rows enable row level security;
revoke all on private.matrix_draw_read_state, private.matrix_draw_read_rows from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select on private.matrix_draw_read_state, private.matrix_draw_read_rows to service_role;
create policy matrix_draw_read_state_service on private.matrix_draw_read_state for select to service_role using (true);
create policy matrix_draw_read_rows_service on private.matrix_draw_read_rows for select to service_role using (true);

create function private.matrix_draw_read_refresh(p_lottery text, p_period text)
returns void language plpgsql security definer set search_path = '' as $refresh$
begin
  delete from private.matrix_draw_read_rows where lottery = p_lottery and canonical_period = p_period;
  with source as (
    select d.*, case when p_lottery in ('今彩539', '大樂透') and d.period ~ '^[0-9]{8}$'
      then pg_catalog.lpad(d.period, 9, '0') else d.period end as canonical_period
    from public.lottery_draws d where d.lottery = p_lottery
      and (d.period = p_period or (p_lottery in ('今彩539', '大樂透')
        and p_period ~ '^0[0-9]{8}$' and d.period = pg_catalog.right(p_period, 8)))
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
  insert into private.matrix_draw_read_rows (lottery, canonical_period, draw_date, raw, conflict)
  select p_lottery, canonical_period, draw_date, raw, conflict from canonical;
end;
$refresh$;
revoke all on function private.matrix_draw_read_refresh(text,text) from public, anon, authenticated, service_role;

create function private.matrix_draw_read_changed()
returns trigger language plpgsql security definer set search_path = '' as $changed$
declare
  v_lottery text;
  v_period text;
begin
  if tg_op = 'UPDATE' and old is not distinct from new then return null; end if;
  if tg_op = 'TRUNCATE' then
    update private.matrix_draw_read_state
      set revision = pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
    delete from private.matrix_draw_read_rows;
    return null;
  end if;
  -- Lock each affected lottery before refreshing aliases. Concurrent alias writes
  -- serialize here; the refresh runs with the latest committed statement snapshot.
  for v_lottery in
    select distinct lottery from (values
      (case when tg_op <> 'INSERT' then old.lottery end),
      (case when tg_op <> 'DELETE' then new.lottery end)
    ) affected(lottery) where lottery is not null order by lottery
  loop
    insert into private.matrix_draw_read_state (lottery) values (v_lottery)
    on conflict (lottery) do update
      set revision = pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  end loop;
  if tg_op <> 'INSERT' then
    v_period := case when old.lottery in ('今彩539', '大樂透') and old.period ~ '^[0-9]{8}$'
      then pg_catalog.lpad(old.period,9,'0') else old.period end;
    perform private.matrix_draw_read_refresh(old.lottery, v_period);
  end if;
  if tg_op <> 'DELETE' then
    v_period := case when new.lottery in ('今彩539', '大樂透') and new.period ~ '^[0-9]{8}$'
      then pg_catalog.lpad(new.period,9,'0') else new.period end;
    perform private.matrix_draw_read_refresh(new.lottery, v_period);
  end if;
  return null;
end;
$changed$;
revoke all on function private.matrix_draw_read_changed() from public, anon, authenticated, service_role;
create trigger matrix_draw_read_changed after insert or update or delete on public.lottery_draws
  for each row execute function private.matrix_draw_read_changed();
create trigger matrix_draw_read_truncated after truncate on public.lottery_draws
  for each statement execute function private.matrix_draw_read_changed();

insert into private.matrix_draw_read_state(lottery)
  select lottery from public.lottery_draws
  union select unnest(array['今彩539','天天樂','六合彩','大樂透']);
do $backfill$
declare v_row record;
begin
  for v_row in select distinct lottery,
    case when lottery in ('今彩539','大樂透') and period ~ '^[0-9]{8}$'
      then pg_catalog.lpad(period,9,'0') else period end as period
    from public.lottery_draws
  loop
    perform private.matrix_draw_read_refresh(v_row.lottery, v_row.period);
  end loop;
end;
$backfill$;

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

  select revision into strict v_revision from private.matrix_draw_read_state where lottery = p_lottery;
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

  if exists (select 1 from private.matrix_draw_read_rows where lottery = p_lottery and conflict) then
    return pg_catalog.jsonb_build_object('error', 'DRAW_HISTORY_CONFLICT', 'revision', v_revision);
  end if;
  if p_kind in ('latest', 'history') then
    with page as materialized (
      select raw as item, draw_date, canonical_period from private.matrix_draw_read_rows
      where lottery = p_lottery
      order by draw_date desc nulls last, canonical_period desc
      limit case when p_kind = 'latest' then 1 else v_limit + 1 end
      offset case when p_kind = 'latest' then 0 else v_offset end
    ), numbered as (
      select item, pg_catalog.row_number() over (order by draw_date desc nulls last, canonical_period desc) as position from page
    )
    select coalesce(pg_catalog.jsonb_agg(item order by position) filter (where position <= v_limit), '[]'::jsonb),
      pg_catalog.count(*) > v_limit into v_items, v_has_more from numbered;
    return pg_catalog.jsonb_build_object('revision', v_revision, 'items', v_items, 'nextCursor',
      case when v_has_more and p_kind = 'history'
        then pg_catalog.jsonb_build_object('offset', v_offset + v_limit, 'revision', v_revision) else null end);
  end if;

  with canonical as (
    select * from private.matrix_draw_read_rows where lottery = p_lottery
  ), draws as (
    select c.raw,
      pg_catalog.row_number() over (order by c.draw_date desc nulls last, c.canonical_period desc) as position,
      case when p_order = '依實際開獎順序排序' then
        case when c.raw ->> 'result_status' = 'preliminary'
            or pg_catalog.jsonb_typeof(c.raw -> 'draw_order_numbers') is distinct from 'array' then '[]'::jsonb
          else c.raw -> 'draw_order_numbers' end
        else coalesce(nullif(nullif(c.raw -> 'sorted_numbers', '[]'::jsonb), 'null'::jsonb),
          nullif(c.raw -> 'numbers', 'null'::jsonb), '[]'::jsonb)
      end as selected_numbers
    from canonical c
  ), paired as (
    -- Window over ALL canonical draws before filtering; a matching locked draw
    -- predicts the draw exactly p_future_offset periods newer.
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
  into v_items, v_has_more
  from numbered;

  return pg_catalog.jsonb_build_object('revision', v_revision, 'groups', v_items, 'nextCursor',
    case when v_has_more
      then pg_catalog.jsonb_build_object('offset', v_offset + v_limit, 'revision', v_revision)
      else null end);
end;
$function$;

revoke all on function public.matrix_draw_query(text, text, integer, jsonb, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.matrix_draw_query(text, text, integer, jsonb, jsonb, text, integer) to service_role;
comment on function public.matrix_draw_query(text, text, integer, jsonb, jsonb, text, integer)
  is 'Indexed canonical latest/history reads with transactionally maintained revisions and alias conflict checks; only service_role may execute.';

commit;
