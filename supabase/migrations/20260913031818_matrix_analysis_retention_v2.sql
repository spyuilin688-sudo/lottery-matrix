-- Rollout C: apply only after complete_owned is deployed to all workers.
-- Cleanup starts disabled; production preview and one supervised batch gate it.
begin;

create or replace function private.matrix_analysis_order_version(
  p_lottery text, p_draw_period text, p_number_order text, p_kind text
)
returns text language sql stable security invoker set search_path = ''
as $$
  select private.matrix_analysis_active_version(p_lottery,p_draw_period,p_number_order,p_kind);
$$;

-- Preserve both stages and bind the public validation handshake to their actual
-- identities. The composed identifier changes when either manifest slot changes.
create or replace function private.matrix_status_read_payload(p_lottery text, p_draw_period text)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_draw text := private.matrix_analysis_read_period(p_lottery, p_draw_period, 0);
  v_sorted text := private.matrix_analysis_order_version(p_lottery, v_draw, '依號碼由小到大排序', 'status');
  v_actual text := private.matrix_analysis_order_version(p_lottery, v_draw, '依實際開獎順序排序', 'status');
  v_version text;
  v_payload jsonb;
  v_stage_payload jsonb;
  v_explore jsonb := '[]'::jsonb;
  v_tianyan jsonb := '[]'::jsonb;
  v_items jsonb;
  v_stage record;
begin
  if v_sorted is null and v_actual is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;
  v_version := case when v_sorted is not null and v_actual is not null and v_sorted <> v_actual
    then v_draw || ':matrix-active:' || pg_catalog.md5(pg_catalog.jsonb_build_array(v_sorted,v_actual)::text)
    else coalesce(v_sorted, v_actual) end;
  v_payload := private.matrix_artifact_payload('status', p_lottery, v_draw, coalesce(v_sorted, v_actual));
  for v_stage in select * from (values
    (v_sorted, '依號碼由小到大排序'), (v_actual, '依實際開獎順序排序')
  ) as stage(analysis_version, number_order) where stage.analysis_version is not null
  loop
    v_stage_payload := private.matrix_artifact_payload('status', p_lottery, v_draw, v_stage.analysis_version);
    if pg_catalog.jsonb_typeof(v_stage_payload->'statusSources'->'explore'->'items') is distinct from 'array'
      or pg_catalog.jsonb_typeof(v_stage_payload->'statusSources'->'tianyan'->'items') is distinct from 'array' then
      raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
    end if;
    select coalesce(pg_catalog.jsonb_agg(item order by position), '[]'::jsonb) into v_items
    from pg_catalog.jsonb_array_elements(v_stage_payload->'statusSources'->'explore'->'items')
      with ordinality as source(item, position)
    where item->>'numberOrder' = v_stage.number_order;
    v_explore := v_explore || v_items;
    select coalesce(pg_catalog.jsonb_agg(item order by position), '[]'::jsonb) into v_items
    from pg_catalog.jsonb_array_elements(v_stage_payload->'statusSources'->'tianyan'->'items')
      with ordinality as source(item, position)
    where item->>'numberOrder' = v_stage.number_order;
    v_tianyan := v_tianyan || v_items;
  end loop;
  return pg_catalog.jsonb_build_object('lottery', p_lottery, 'drawPeriod', v_draw,
    'analysisVersion', v_version, 'payload', v_payload || pg_catalog.jsonb_build_object('statusSources',
      pg_catalog.jsonb_build_object(
        'explore', pg_catalog.jsonb_build_object('lottery', p_lottery, 'drawPeriod', v_draw, 'items', v_explore),
        'tianyan', pg_catalog.jsonb_build_object('lottery', p_lottery, 'drawPeriod', v_draw, 'items', v_tianyan)
      )));
end;
$$;

revoke all on function private.matrix_analysis_read_period(text,text,integer) from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_order_version(text,text,text,text) from public, anon, authenticated, service_role;


create function private.matrix_analysis_retained_versions()
returns table(lottery text, draw_period text, analysis_version text)
language sql stable security invoker set search_path = ''
as $$
  select run.lottery,run.draw_period,run.analysis_version
  from public.matrix_analysis_runs run where run.status = 'running'
  union
  select active.lottery,active.draw_period,active.analysis_version
  from private.matrix_analysis_active_versions active
  join private.matrix_analysis_recent_completed_periods() period
    on period.lottery = active.lottery and period.draw_period = active.draw_period;
$$;

-- A split stage supersedes only its own order. An unsuffixed legacy version
-- remains shared until neither manifest slot references it.
create function private.matrix_analysis_superseded_versions()
returns table(lottery text, draw_period text, analysis_version text)
language sql stable security invoker set search_path = ''
as $$
  select run.lottery,run.draw_period,run.analysis_version
  from public.matrix_analysis_runs run
  where not exists (
    select 1 from private.matrix_analysis_active_versions active
    where active.lottery=run.lottery and active.draw_period=run.draw_period
      and active.analysis_version=run.analysis_version
  ) and exists (
    select 1 from private.matrix_analysis_active_versions active
    where active.lottery=run.lottery and active.draw_period=run.draw_period
      and (pg_catalog.right(run.analysis_version,pg_catalog.length(active.number_order)+1) = '-' || active.number_order
        or run.analysis_version ~ ':matrix-python-v[0-9]+$')
  );
$$;

create table private.matrix_maintenance_status (
  job_name text primary key,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_deleted integer not null default 0,
  deletable_backlog integer not null default 0,
  last_error text,
  updated_at timestamptz not null default pg_catalog.now(),
  cleanup_enabled boolean not null default false
);
alter table private.matrix_maintenance_status enable row level security;
revoke all on table private.matrix_maintenance_status from public, anon, authenticated, service_role;
insert into private.matrix_maintenance_status(job_name) values ('analysis-retention');

create function private.matrix_analysis_cleanup_preview()
returns table(table_name text, expired_total bigint, expired_retained bigint, expired_deletable bigint, superseded_rows bigint)
language sql stable security invoker set search_path = ''
as $$
  with retained as materialized (select * from private.matrix_analysis_retained_versions()),
  superseded as materialized (select * from private.matrix_analysis_superseded_versions()),
  cutoff as materialized (select pg_catalog.statement_timestamp() as at),
  rows as (
    select 'explore' as table_name,lottery,draw_period,analysis_version,expires_at from public.matrix_explore_results
    union all select 'tianheng',lottery,draw_period,analysis_version,expires_at from public.matrix_tianheng_results
    union all select 'artifacts',lottery,draw_period,analysis_version,expires_at from public.matrix_analysis_artifacts
    union all select 'chunks',lottery,draw_period,analysis_version,expires_at from public.matrix_analysis_artifact_chunks
  ), totals as (
    select rows.table_name,
      pg_catalog.count(*) filter (where rows.expires_at < cutoff.at) as expired_total,
      pg_catalog.count(*) filter (where rows.expires_at < cutoff.at and retained.lottery is not null) as expired_retained,
      pg_catalog.count(*) filter (where rows.expires_at < cutoff.at and retained.lottery is null) as expired_deletable,
      pg_catalog.count(*) filter (where superseded.lottery is not null) as superseded_rows
    from rows cross join cutoff
    left join retained using (lottery,draw_period,analysis_version)
    left join superseded using (lottery,draw_period,analysis_version)
    group by rows.table_name
  )
  select names.table_name,coalesce(totals.expired_total,0),coalesce(totals.expired_retained,0),
    coalesce(totals.expired_deletable,0),coalesce(totals.superseded_rows,0)
  from (values ('explore'),('tianheng'),('artifacts'),('chunks')) names(table_name)
  left join totals using (table_name);
$$;

create function private.matrix_analysis_cleanup_batch(p_now timestamptz, p_batch_size integer default 5000)
returns integer language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_now timestamptz;
  v_deleted integer := 0;
  v_count integer;
  v_backlog integer;
  v_limit integer;
  v_table record;
  v_run_ids uuid[];
  v_error text;
begin
  -- Both cron and Railway use this exact transaction lock and this one core.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('matrix-analysis-cleanup',0)) then
    return 0;
  end if;
  if not exists (select 1 from private.matrix_maintenance_status
    where job_name='analysis-retention' and cleanup_enabled) then return 0; end if;

  update private.matrix_maintenance_status set last_started_at=pg_catalog.clock_timestamp(),
    last_deleted=0,updated_at=pg_catalog.clock_timestamp() where job_name='analysis-retention';
  -- This subtransaction rolls back EVERY result/pointer deletion on error, but
  -- its enclosing transaction can still commit the error record below.
  begin
    if p_now is null then raise exception 'CLEANUP_TIME_REQUIRED' using errcode='22023'; end if;
    if p_batch_size is null or p_batch_size < 1 then
      raise exception 'CLEANUP_BATCH_SIZE_INVALID' using errcode='22023';
    end if;
    -- Repeatable-read snapshots cannot provide the post-lock freshness required
    -- below. All normal RPC and pg_cron invocations use READ COMMITTED.
    if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
      raise exception 'CLEANUP_REQUIRES_READ_COMMITTED';
    end if;
    v_now := least(p_now,pg_catalog.clock_timestamp());

    -- Source invalidation can remove a newer period and bring an older one INTO
    -- the retained three. Freeze draw writes for this bounded batch, but allow
    -- reads and complete_owned's draw FOR SHARE. NOWAIT never queues behind a
    -- crawler; it exits safely instead. This lock also keeps draw-date ordering
    -- and confirmed/draw-order eligibility stable for the health check.
    lock table public.lottery_draws in share mode nowait;
    -- Protect the currently completed recent periods against acquire_run
    -- reopening a damaged complete run. Lock order stays draw -> run -> child.
    perform 1 from public.matrix_analysis_runs run
    join private.matrix_analysis_recent_completed_periods() period
      on period.lottery=run.lottery and period.draw_period=run.draw_period
    where run.status='complete' order by run.id for share of run nowait;
    -- A separate VOLATILE PL/pgSQL statement takes a fresh READ COMMITTED
    -- snapshot after the locks, never the candidate query's original snapshot.
    if exists (select 1 from private.matrix_analysis_active_version_health() where required) then
      raise exception 'MATRIX_ACTIVE_VERSION_UNHEALTHY';
    end if;

    -- Fixed metadata, never caller-provided identifiers. Each table has a direct
    -- FK to runs; artifact DELETE does NOT cascade into chunks or result rows.
    -- The four tables therefore use this identical predicate and locking code.
    for v_table in select * from (values
      ('matrix_explore_results',5000,'lottery,draw_period,analysis_version,item_id',
        'target.lottery=victim.lottery and target.draw_period=victim.draw_period and target.analysis_version=victim.analysis_version and target.item_id=victim.item_id'),
      ('matrix_tianheng_results',5000,'lottery,draw_period,analysis_version,item_id',
        'target.lottery=victim.lottery and target.draw_period=victim.draw_period and target.analysis_version=victim.analysis_version and target.item_id=victim.item_id'),
      ('matrix_analysis_artifact_chunks',2000,'id','target.id=victim.id'),
      ('matrix_analysis_artifacts',500,'id','target.id=victim.id')
    ) spec(relation_name,max_rows,key_columns,key_match)
    loop
      v_limit := least(p_batch_size,v_table.max_rows);
      -- Bound parent locks as well as deleted rows. SKIP LOCKED yields to active
      -- acquire/write/restore/complete calls rather than waiting on their run.
      execute pg_catalog.format($query$
        with retained as materialized (select * from private.matrix_analysis_retained_versions())
        select coalesce(pg_catalog.array_agg(candidate.id),array[]::uuid[]) from (
          select run.id from public.matrix_analysis_runs run
          where not exists (select 1 from retained
            where retained.lottery=run.lottery and retained.draw_period=run.draw_period
              and retained.analysis_version=run.analysis_version)
            and exists (select 1 from public.%I result
              where result.lottery=run.lottery and result.draw_period=run.draw_period
                and result.analysis_version=run.analysis_version and result.expires_at < $1)
          order by run.id limit $2 for update of run skip locked
        ) candidate
      $query$,v_table.relation_name) into v_run_ids using v_now,v_limit;
      if pg_catalog.cardinality(v_run_ids)=0 then continue; end if;

      -- This is deliberately a NEW SQL statement after the run locks. Retained
      -- membership and TTL are checked again with a fresh statement snapshot.
      -- Those run locks prevent reacquisition/activation until deletion commits.
      execute pg_catalog.format($query$
        with retained as materialized (select * from private.matrix_analysis_retained_versions()),
        victims as materialized (
          select %2$s from public.%1$I result
          join public.matrix_analysis_runs run
            on run.lottery=result.lottery and run.draw_period=result.draw_period
              and run.analysis_version=result.analysis_version
          where run.id=any($1) and result.expires_at < $2
            and not exists (select 1 from retained
              where retained.lottery=result.lottery and retained.draw_period=result.draw_period
                and retained.analysis_version=result.analysis_version)
          order by result.expires_at,%2$s limit $3 for update of result skip locked
        ), removed as (
          delete from public.%1$I target using victims victim where %3$s
          returning target.lottery,target.draw_period,target.analysis_version
        ), retired as (
          delete from private.matrix_analysis_active_versions active using removed
          where active.lottery=removed.lottery and active.draw_period=removed.draw_period
            and active.analysis_version=removed.analysis_version
            and not exists (select 1 from retained
              where retained.lottery=active.lottery and retained.draw_period=active.draw_period
                and retained.analysis_version=active.analysis_version)
          returning 1
        )
        select pg_catalog.count(*)::integer from removed
      $query$,v_table.relation_name,
        case when v_table.key_columns='id' then 'result.id'
          else 'result.lottery,result.draw_period,result.analysis_version,result.item_id' end,
        v_table.key_match) into v_count using v_run_ids,v_now,v_limit;
      v_deleted := v_deleted + v_count;
    end loop;
    select least(coalesce(pg_catalog.sum(expired_deletable),0),2147483647)::integer into v_backlog
      from private.matrix_analysis_cleanup_preview();
    update private.matrix_maintenance_status set
      last_finished_at=pg_catalog.clock_timestamp(),last_deleted=v_deleted,
      deletable_backlog=v_backlog,last_error=null,updated_at=pg_catalog.clock_timestamp()
      where job_name='analysis-retention';
  exception when others then
    get stacked diagnostics v_error = message_text;
    v_error := sqlstate || ': ' || v_error;
    -- Refresh the backlog after the deletion subtransaction rolled back. If
    -- even preview is unavailable, preserve the last known count and the
    -- original failure instead of losing the maintenance error transaction.
    begin
      select least(coalesce(pg_catalog.sum(expired_deletable),0),2147483647)::integer into v_backlog
        from private.matrix_analysis_cleanup_preview();
    exception when others then v_backlog := null;
    end;
    -- last_finished_at continues to mean LAST SUCCESS. A failed attempt cannot
    -- suppress Railway fallback, even if a previous success was very recent.
    update private.matrix_maintenance_status set last_deleted=0,
      deletable_backlog=coalesce(v_backlog,deletable_backlog),last_error=pg_catalog.left(v_error,1000),
      updated_at=pg_catalog.clock_timestamp() where job_name='analysis-retention';
    return 0;
  end;
  return v_deleted;
end;
$$;

create or replace function public.matrix_analysis_cleanup_expired(p_now timestamptz)
returns integer language sql volatile security definer set search_path = ''
as $$
  select private.matrix_analysis_cleanup_batch(p_now,5000);
$$;

create function private.matrix_analysis_cleanup_tick()
returns integer language sql volatile security invoker set search_path = ''
as $$
  select private.matrix_analysis_cleanup_batch(pg_catalog.clock_timestamp(),5000);
$$;

create function public.matrix_analysis_cleanup_status()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'job_name','analysis-retention','last_started_at',status.last_started_at,
    'last_finished_at',status.last_finished_at,'last_deleted',coalesce(status.last_deleted,0),
    'deletable_backlog',coalesce(status.deletable_backlog,0),'last_error',status.last_error,
    'cleanup_enabled',coalesce(status.cleanup_enabled,false),
    'cleanup_due',status.last_finished_at is null or status.last_error is not null
      or status.last_finished_at <= pg_catalog.statement_timestamp()-interval '2 hours'
  )
  from (values ('analysis-retention')) job(name)
  left join private.matrix_maintenance_status status on status.job_name=job.name;
$$;

create function public.matrix_analysis_storage_health()
returns jsonb language sql stable security definer set search_path = ''
as $$
  with preview as materialized (select * from private.matrix_analysis_cleanup_preview()),
  totals as (
    select pg_catalog.sum(superseded_rows) as superseded_rows,
      pg_catalog.sum(expired_deletable) as expired_deletable_rows from preview
  ), integrity as (
    select pg_catalog.count(distinct (lottery,draw_period,number_order)) as unhealthy
    from private.matrix_analysis_active_version_health()
  ), maintenance as (select public.matrix_analysis_cleanup_status() as value)
  select pg_catalog.jsonb_build_object(
    'checked_at',pg_catalog.statement_timestamp(),
    'database_size_bytes',pg_catalog.pg_database_size(pg_catalog.current_database()),
    'tables',(select pg_catalog.jsonb_object_agg(preview.table_name,
      (pg_catalog.to_jsonb(preview)-'table_name') || pg_catalog.jsonb_build_object('size_bytes',
        pg_catalog.pg_total_relation_size(case preview.table_name
          when 'explore' then 'public.matrix_explore_results'::regclass
          when 'tianheng' then 'public.matrix_tianheng_results'::regclass
          when 'artifacts' then 'public.matrix_analysis_artifacts'::regclass
          when 'chunks' then 'public.matrix_analysis_artifact_chunks'::regclass end))) from preview),
    'active_versions',(select pg_catalog.count(*) from private.matrix_analysis_active_versions),
    'active_unhealthy',integrity.unhealthy,'superseded_rows',totals.superseded_rows,
    'expired_deletable_rows',totals.expired_deletable_rows,
    'cleanup',maintenance.value-'cleanup_due',
    -- Two hours matches the fallback contract: one hourly cron may be delayed.
    -- No capacity percentage is inferred from the database's physical size.
    'status',case when integrity.unhealthy > 0 or maintenance.value->>'last_error' is not null then 'Critical'
      when not (maintenance.value->>'cleanup_enabled')::boolean
        or (maintenance.value->>'cleanup_due')::boolean or totals.expired_deletable_rows > 0 then 'Warning'
      else 'Healthy' end
  ) from totals cross join integrity cross join maintenance;
$$;

revoke all on function private.matrix_analysis_retained_versions() from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_superseded_versions() from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_cleanup_preview() from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_cleanup_batch(timestamptz,integer) from public, anon, authenticated, service_role;
revoke all on function private.matrix_analysis_cleanup_tick() from public, anon, authenticated, service_role;
revoke all on function public.matrix_analysis_cleanup_expired(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.matrix_analysis_cleanup_status() from public, anon, authenticated, service_role;
revoke all on function public.matrix_analysis_storage_health() from public, anon, authenticated, service_role;
grant execute on function public.matrix_analysis_cleanup_expired(timestamptz) to service_role;
grant execute on function public.matrix_analysis_cleanup_status() to service_role;
grant execute on function public.matrix_analysis_storage_health() to service_role;

-- Replace only this exact job name, including any legacy duplicates belonging
-- to another role. Unrelated cron jobs and their schedules remain untouched.
do $$
declare v_job record;
begin
  if pg_catalog.to_regnamespace('cron') is null then raise exception 'PG_CRON_REQUIRED'; end if;
  for v_job in select jobid from cron.job where jobname='matrix-analysis-retention'
  loop perform cron.unschedule(v_job.jobid); end loop;
  perform cron.schedule('matrix-analysis-retention','17 * * * *','select private.matrix_analysis_cleanup_tick();');
end;
$$;

commit;
