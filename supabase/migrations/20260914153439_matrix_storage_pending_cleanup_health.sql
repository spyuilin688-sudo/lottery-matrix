-- Normal pending retention work must not make a healthy service warn.
-- Keep the existing RPC payload and its service-role-only execution boundary.
begin;

create or replace function public.matrix_analysis_storage_health()
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
    -- A bounded successful cleanup may leave work for the next hourly tick.
    -- Pending counts remain observable; their presence alone is not a failure.
    -- No capacity percentage is inferred from the database's physical size.
    'status',case when integrity.unhealthy > 0 or maintenance.value->>'last_error' is not null then 'Critical'
      when not (maintenance.value->>'cleanup_enabled')::boolean
        or (maintenance.value->>'cleanup_due')::boolean then 'Warning'
      else 'Healthy' end
  ) from totals cross join integrity cross join maintenance;
$$;

commit;
