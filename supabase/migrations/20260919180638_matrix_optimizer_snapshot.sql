create function public.matrix_optimizer_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sql jsonb := null; v_indexes jsonb; v_tables jsonb; v_functions jsonb; v_security jsonb; v_jobs jsonb; v_reset timestamptz;
begin
 select stats_reset into v_reset from pg_catalog.pg_stat_database where datname=pg_catalog.current_database();
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into v_indexes from (
  select i.schemaname,i.relname,i.indexrelname,i.indexrelid::text as identity,i.idx_scan,
    pg_catalog.pg_relation_size(i.indexrelid) as bytes,x.indisunique,x.indisprimary
  from pg_catalog.pg_stat_user_indexes i join pg_catalog.pg_index x on x.indexrelid=i.indexrelid
  where i.schemaname in ('public','private') order by i.idx_scan, i.indexrelid limit 200
 ) s;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into v_tables from (
  select schemaname,relname,seq_scan,seq_tup_read,n_live_tup,pg_catalog.pg_total_relation_size(relid) as bytes
  from pg_catalog.pg_stat_user_tables where schemaname in ('public','private') order by seq_tup_read desc limit 100
 ) s;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into v_functions from (
  select schemaname,funcname,calls,total_time,self_time from pg_catalog.pg_stat_user_functions order by total_time desc limit 50
 ) s;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into v_security from (
  select p.oid::text as identity,n.nspname as schema,p.proname as name,pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') order by p.oid limit 100
 ) s;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into v_jobs from (
  select job_name,lottery,status,retry_count,recovery_count,last_recovery_at,started_at,finished_at
  from public.system_job_status order by job_name limit 32
 ) s;
 begin
  if pg_catalog.to_regclass('extensions.pg_stat_statements') is not null then
   execute 'select coalesce(jsonb_agg(to_jsonb(s)),''[]''::jsonb) from (select queryid::text,calls,mean_exec_time,total_exec_time,rows from extensions.pg_stat_statements order by total_exec_time desc limit 50) s' into v_sql;
  elsif pg_catalog.to_regclass('public.pg_stat_statements') is not null then
   execute 'select coalesce(jsonb_agg(to_jsonb(s)),''[]''::jsonb) from (select queryid::text,calls,mean_exec_time,total_exec_time,rows from public.pg_stat_statements order by total_exec_time desc limit 50) s' into v_sql;
  end if;
 exception when undefined_column or insufficient_privilege or object_not_in_prerequisite_state then v_sql := null;
 end;
 return jsonb_build_object('observedAt',now(),'statsReset',v_reset,'indexes',v_indexes,'tables',v_tables,
 'functions',v_functions,'security',v_security,'jobs',v_jobs,'statements',v_sql);
end;
$$;
revoke all on function public.matrix_optimizer_snapshot() from public,anon,authenticated;
grant execute on function public.matrix_optimizer_snapshot() to service_role;
notify pgrst,'reload schema';