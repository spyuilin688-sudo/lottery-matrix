begin;

-- Match the repository's latest-draw ordering, including null placement.
create index if not exists lottery_draws_worker_latest_idx
  on public.lottery_draws(lottery, draw_date desc nulls last, period desc);

-- A certificate of the worker's existing full readiness check. Mutations bump
-- the generation; workers may certify only the generation they inspected.
create table private.matrix_worker_completion (
  lottery text primary key,
  generation bigint not null default 0,
  certified_generation bigint,
  draw_period text,
  analysis_name text,
  notifications_ready boolean not null default false,
  valid_until timestamptz,
  certified_at timestamptz
);
alter table private.matrix_worker_completion enable row level security;
revoke all on private.matrix_worker_completion from public, anon, authenticated;

create function private.matrix_worker_completion_invalidate()
returns trigger language plpgsql security definer set search_path = '' as $$
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
  if tg_op = 'INSERT' then
    v_query := 'select ' || v_column || ' lottery from new_rows';
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
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'lottery_draws', 'matrix_analysis_runs', 'matrix_analysis_artifacts',
    'matrix_analysis_artifact_chunks', 'matrix_explore_results',
    'matrix_tianheng_results', 'matrix_tianshu_results',
    'matrix_card_publications', 'notification_events'
  ] loop
    execute format('create trigger matrix_worker_completion_insert after insert on public.%I referencing new table as new_rows for each statement execute function private.matrix_worker_completion_invalidate()', v_table);
    execute format('create trigger matrix_worker_completion_update after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function private.matrix_worker_completion_invalidate()', v_table);
    execute format('create trigger matrix_worker_completion_delete after delete on public.%I referencing old table as old_rows for each statement execute function private.matrix_worker_completion_invalidate()', v_table);
    execute format('create trigger matrix_worker_completion_truncate after truncate on public.%I for each statement execute function private.matrix_worker_completion_invalidate()', v_table);
  end loop;
end;
$$;

create function public.matrix_worker_completion_snapshot(
  p_lottery text, p_analysis_name text, p_require_notifications boolean
) returns jsonb language sql stable security definer set search_path = '' as $$
  -- One MVCC snapshot binds the returned draw and its completion certificate.
  -- No artifact payloads, projection counts, card histories or event scans.
  with latest as (
    select * from public.lottery_draws where lottery = p_lottery
    order by draw_date desc nulls last, period desc limit 1
  )
  select pg_catalog.jsonb_build_object(
    'draw', (select pg_catalog.to_jsonb(draw) from latest draw),
    'generation', coalesce(state.generation, 0),
    'ready', coalesce(
      state.certified_generation = state.generation
      and state.draw_period = (select period from latest)
      and (select result_status from latest) = 'confirmed'
      and state.analysis_name = p_analysis_name
      and (not p_require_notifications or state.notifications_ready)
      and state.valid_until > pg_catalog.now(), false)
  ) from (select 1) singleton
  left join private.matrix_worker_completion state on state.lottery = p_lottery;
$$;

create function public.matrix_worker_completion_certify(
  p_lottery text, p_draw_period text, p_analysis_name text,
  p_require_notifications boolean, p_generation bigint
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_generation bigint;
  v_valid_until timestamptz;
  v_versions text[] := array[
    p_draw_period || ':' || pg_catalog.split_part(p_analysis_name, ':', 1) || '-sorted',
    p_draw_period || ':' || pg_catalog.split_part(p_analysis_name, ':', 1) || '-draw'
  ];
begin
  insert into private.matrix_worker_completion(lottery) values (p_lottery)
    on conflict do nothing;
  select generation into v_generation from private.matrix_worker_completion
    where lottery = p_lottery for update;
  if v_generation <> p_generation then return false; end if;
  if not exists (
    select 1 from (
      select period, result_status from public.lottery_draws where lottery = p_lottery
      order by draw_date desc nulls last, period desc limit 1
    ) latest where period = p_draw_period and result_status = 'confirmed'
  ) then return false; end if;

  -- Expiration is the only invalidation that need not perform a table write.
  -- Compute this bound only after a cache miss passes the full Python guard.
  select min(expires_at) into v_valid_until from (
    select expires_at from public.matrix_analysis_artifacts where lottery = p_lottery and draw_period = p_draw_period and analysis_version = any(v_versions)
    union all select expires_at from public.matrix_analysis_artifact_chunks where lottery = p_lottery and draw_period = p_draw_period and analysis_version = any(v_versions)
    union all select expires_at from public.matrix_explore_results where lottery = p_lottery and draw_period = p_draw_period and analysis_version = any(v_versions)
    union all select expires_at from public.matrix_tianheng_results where lottery = p_lottery and draw_period = p_draw_period and analysis_version = any(v_versions)
    union all select expires_at from public.matrix_tianshu_results where lottery = p_lottery and draw_period = p_draw_period and analysis_version = any(v_versions)
  ) evidence;
  if v_valid_until is null or v_valid_until <= pg_catalog.clock_timestamp() then return false; end if;
  update private.matrix_worker_completion set
    certified_generation = v_generation, draw_period = p_draw_period,
    analysis_name = p_analysis_name, notifications_ready = p_require_notifications,
    valid_until = v_valid_until, certified_at = pg_catalog.clock_timestamp()
    where lottery = p_lottery;
  return true;
end;
$$;

revoke all on function private.matrix_worker_completion_invalidate() from public, anon, authenticated;
revoke all on function public.matrix_worker_completion_snapshot(text,text,boolean) from public, anon, authenticated;
revoke all on function public.matrix_worker_completion_certify(text,text,text,boolean,bigint) from public, anon, authenticated;
grant execute on function public.matrix_worker_completion_snapshot(text,text,boolean) to service_role;
grant execute on function public.matrix_worker_completion_certify(text,text,text,boolean,bigint) to service_role;

commit;
