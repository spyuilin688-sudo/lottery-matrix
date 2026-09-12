-- Rollout A: additive manifest and fenced completion. Existing readers and cleanup
-- remain unchanged until every worker uses matrix_analysis_complete_owned.
begin;

-- Keep the fail-closed backfill snapshot stable against writes and invalidation.
-- Take locks in the same draw -> run -> artifact order as source invalidation.
lock table public.lottery_draws, public.matrix_analysis_runs,
  public.matrix_analysis_artifacts in share row exclusive mode;

create table private.matrix_analysis_active_versions (
  lottery text not null,
  draw_period text not null,
  number_order text not null check (number_order in ('sorted','draw')),
  analysis_version text not null,
  activated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (lottery, draw_period, number_order),
  foreign key (lottery, draw_period, analysis_version)
    references public.matrix_analysis_runs(lottery, draw_period, analysis_version)
    on delete cascade
);
alter table private.matrix_analysis_active_versions enable row level security;
revoke all on table private.matrix_analysis_active_versions from public, anon, authenticated, service_role;

-- One period rule for backfill, health and the subsequent retention migration.
create function private.matrix_analysis_recent_completed_periods()
returns table(lottery text, draw_period text)
language sql stable security invoker set search_path = ''
as $$
  with periods as (
    select distinct run.lottery, run.draw_period, draw.draw_date
    from public.matrix_analysis_runs run
    left join public.lottery_draws draw
      on draw.lottery = run.lottery and draw.period = run.draw_period
    where run.status = 'complete'
  ), ranked as (
    select lottery, draw_period, pg_catalog.row_number() over (
      partition by lottery
      order by (draw_date is not null) desc, draw_date desc nulls last, draw_period desc
    ) as position from periods
  )
  select lottery, draw_period from ranked where position <= 3;
$$;

create function private.matrix_analysis_draw_order_eligible(p_lottery text, p_draw_period text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.lottery_draws draw
    where draw.lottery = p_lottery and draw.period = p_draw_period
      and draw.lottery <> '天天樂' and draw.result_status = 'confirmed'
      and case when pg_catalog.jsonb_typeof(draw.draw_order_numbers) = 'array'
        and pg_catalog.jsonb_typeof(draw.numbers) = 'array' then
        pg_catalog.jsonb_array_length(draw.draw_order_numbers) = case draw.lottery when '今彩539' then 5 else 7 end
        and pg_catalog.jsonb_array_length(draw.numbers) = pg_catalog.jsonb_array_length(draw.draw_order_numbers)
        and draw.draw_order_numbers @> draw.numbers and draw.numbers @> draw.draw_order_numbers
        and (select pg_catalog.count(distinct n) from pg_catalog.jsonb_array_elements(draw.draw_order_numbers) n)
          = pg_catalog.jsonb_array_length(draw.draw_order_numbers)
        and (draw.lottery = '今彩539' or draw.draw_order_numbers->6 is not distinct from draw.numbers->6)
      else false end
  );
$$;

create function private.matrix_analysis_missing_kinds(p_lottery text, p_draw_period text, p_analysis_version text)
returns text[] language sql stable security invoker set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(kind order by kind), array[]::text[])
  from pg_catalog.unnest(array['explore','tianheng','tianyan','tiangong','status']) as required(kind)
  where not exists (
    select 1 from public.matrix_analysis_artifacts artifact
    where artifact.lottery = p_lottery and artifact.draw_period = p_draw_period
      and artifact.analysis_version = p_analysis_version and artifact.kind = required.kind
  );
$$;

create function private.matrix_analysis_active_version(
  p_lottery text, p_draw_period text, p_number_order text, p_kind text
)
returns text language sql stable security invoker set search_path = ''
as $$
  select active.analysis_version
  from private.matrix_analysis_active_versions active
  join public.matrix_analysis_runs run
    on run.lottery = active.lottery and run.draw_period = active.draw_period
    and run.analysis_version = active.analysis_version and run.status = 'complete'
  where active.lottery = p_lottery and active.draw_period = p_draw_period
    and active.number_order = case p_number_order
      when '依號碼由小到大排序' then 'sorted' when '依實際開獎順序排序' then 'draw' end
    and (active.number_order = 'sorted' or private.matrix_analysis_draw_order_eligible(p_lottery,p_draw_period))
    and exists (
      select 1 from public.matrix_analysis_artifacts artifact
      where artifact.lottery = active.lottery and artifact.draw_period = active.draw_period
        and artifact.analysis_version = active.analysis_version and artifact.kind = p_kind
    );
$$;

-- The backfill never mistakes a sorted-only run for a draw source. Legacy
-- unsuffixed versions can serve both orders; every candidate must have five kinds.
do $$
declare
  slot record;
  v_version text;
begin
  for slot in
    select period.lottery, period.draw_period, requested.number_order,
      case requested.number_order when 'sorted' then '依號碼由小到大排序' else '依實際開獎順序排序' end as label
    from private.matrix_analysis_recent_completed_periods() period
    cross join (values ('sorted'),('draw')) requested(number_order)
    where requested.number_order = 'sorted'
      or private.matrix_analysis_draw_order_eligible(period.lottery,period.draw_period)
    order by period.lottery, period.draw_period, requested.number_order
  loop
    select run.analysis_version into v_version
    from public.matrix_analysis_runs run
    where run.lottery = slot.lottery and run.draw_period = slot.draw_period and run.status = 'complete'
      and pg_catalog.cardinality(private.matrix_analysis_missing_kinds(run.lottery,run.draw_period,run.analysis_version)) = 0
      and (
        pg_catalog.right(run.analysis_version,pg_catalog.length(slot.number_order)+1) = '-' || slot.number_order
        or (run.analysis_version = private.matrix_analysis_order_version(slot.lottery,slot.draw_period,slot.label,'status')
          and run.analysis_version !~ '-(sorted|draw)$')
        or run.analysis_version ~ ('^' || slot.draw_period || ':matrix-python-v[0-9]+$')
      )
    order by case
      when pg_catalog.right(run.analysis_version,pg_catalog.length(slot.number_order)+1) = '-' || slot.number_order then 0
      when run.analysis_version = private.matrix_analysis_order_version(slot.lottery,slot.draw_period,slot.label,'status') then 1
      else 2 end,
      run.completed_at desc nulls last, run.started_at desc, run.analysis_version desc
    limit 1;
    if v_version is null then
      raise exception 'MATRIX_ACTIVE_VERSION_BACKFILL_INCOMPLETE: lottery=%, draw_period=%, number_order=%',
        slot.lottery, slot.draw_period, slot.number_order;
    end if;
    insert into private.matrix_analysis_active_versions(lottery,draw_period,number_order,analysis_version)
      values (slot.lottery,slot.draw_period,slot.number_order,v_version);
  end loop;
end;
$$;

create function public.matrix_analysis_complete_owned(
  p_lottery text, p_draw_period text, p_analysis_version text, p_owner_id text, p_completed_at timestamptz
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.matrix_analysis_runs%rowtype;
  v_order text;
  v_now timestamptz;
begin
  -- Lock the draw first: source updates lock it before invalidating its runs.
  perform 1 from public.lottery_draws draw
    where draw.lottery = p_lottery and draw.period = p_draw_period for share;
  select * into v_run from public.matrix_analysis_runs run
    where run.lottery = p_lottery and run.draw_period = p_draw_period
      and run.analysis_version = p_analysis_version for update;
  if not found or v_run.status <> 'running'
    or nullif(pg_catalog.btrim(p_owner_id),'') is null
    or v_run.lease_owner is distinct from p_owner_id
    or v_run.lease_expires_at is null
    or v_run.lease_expires_at <= pg_catalog.clock_timestamp() then
    return false;
  end if;
  v_order := case when pg_catalog.right(p_analysis_version,7) = '-sorted' then 'sorted'
    when pg_catalog.right(p_analysis_version,5) = '-draw' then 'draw' end;
  if v_order = 'draw' and not private.matrix_analysis_draw_order_eligible(p_lottery,p_draw_period) then
    return false;
  end if;
  -- Owned artifact writes already serialize on the run. These row locks also
  -- prevent direct artifact deletion between completeness validation and commit.
  perform 1 from public.matrix_analysis_artifacts artifact
    where artifact.lottery = p_lottery and artifact.draw_period = p_draw_period
      and artifact.analysis_version = p_analysis_version
      and artifact.kind in ('explore','tianheng','tianyan','tiangong','status')
    order by artifact.kind for share;
  if pg_catalog.cardinality(private.matrix_analysis_missing_kinds(p_lottery,p_draw_period,p_analysis_version)) <> 0 then
    return false;
  end if;
  -- A lock wait must never extend the lease implicitly.
  v_now := pg_catalog.clock_timestamp();
  if v_run.lease_expires_at <= v_now then return false; end if;
  update public.matrix_analysis_runs set phase = 'complete', status = 'complete',
    completed_at = coalesce(p_completed_at,v_now), error = null,
    lease_owner = null, lease_expires_at = null, updated_at = v_now
    where id = v_run.id;
  if v_order is not null then
    insert into private.matrix_analysis_active_versions(lottery,draw_period,number_order,analysis_version,activated_at)
      values (p_lottery,p_draw_period,v_order,p_analysis_version,v_now)
    on conflict (lottery,draw_period,number_order) do update
      set analysis_version = excluded.analysis_version, activated_at = excluded.activated_at;
  end if;
  return true;
end;
$$;

-- Historical pointers are reported with required=false. C can retire them when
-- their last artifacts expire without treating them as missing recent slots.
create function private.matrix_analysis_active_version_health()
returns table(lottery text, draw_period text, number_order text, analysis_version text,
  required boolean, issue text, missing_kinds text[])
language sql stable security invoker set search_path = ''
as $$
  with recent as materialized (select * from private.matrix_analysis_recent_completed_periods()),
  expected as (
    select recent.lottery, recent.draw_period, orders.number_order from recent
    cross join (values ('sorted'),('draw')) orders(number_order)
    where orders.number_order = 'sorted' or private.matrix_analysis_draw_order_eligible(recent.lottery,recent.draw_period)
  ), pointers as (
    select active.*, run.id as run_id, run.status,
      exists (select 1 from expected where expected.lottery = active.lottery
        and expected.draw_period = active.draw_period and expected.number_order = active.number_order) as required,
      private.matrix_analysis_missing_kinds(active.lottery,active.draw_period,active.analysis_version) as missing_kinds
    from private.matrix_analysis_active_versions active
    left join public.matrix_analysis_runs run on run.lottery = active.lottery and run.draw_period = active.draw_period
      and run.analysis_version = active.analysis_version
  )
  select expected.lottery, expected.draw_period, expected.number_order, null::text, true, 'missing_slot', array[]::text[]
  from expected where not exists (
    select 1 from private.matrix_analysis_active_versions active
    where active.lottery = expected.lottery and active.draw_period = expected.draw_period and active.number_order = expected.number_order
  )
  union all
  select p.lottery,p.draw_period,p.number_order,p.analysis_version,p.required,problem.issue,p.missing_kinds
  from pointers p cross join lateral (
    select 'missing_run' as issue where p.run_id is null
    union all select 'noncomplete_run' where p.run_id is not null and p.status <> 'complete'
    union all select 'missing_kinds' where pg_catalog.cardinality(p.missing_kinds) > 0
    union all select 'invalid_order' where p.number_order not in ('sorted','draw')
    union all select 'ineligible_draw' where p.number_order = 'draw'
      and not private.matrix_analysis_draw_order_eligible(p.lottery,p.draw_period)
  ) problem;
$$;

revoke all on function private.matrix_analysis_recent_completed_periods() from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_draw_order_eligible(text,text) from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_missing_kinds(text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_active_version(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_active_version_health() from public, anon, authenticated, service_role;
revoke all on function public.matrix_analysis_complete_owned(text,text,text,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.matrix_analysis_complete_owned(text,text,text,text,timestamptz) to service_role;

commit;
