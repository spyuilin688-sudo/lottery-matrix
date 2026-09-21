begin;
set local lock_timeout='2s';
-- These nonunique GINs are not used by the current materialized-base readers.
-- Abort on usage/definition drift; retain all expiry, list, integrity and FK indexes.
do $$
declare v_name text; v_definition text; v_scans bigint;
begin
 foreach v_name in array array['matrix_explore_results_prediction_numbers_idx','matrix_tianheng_results_prediction_numbers_idx'] loop
  select pg_get_indexdef(s.indexrelid),s.idx_scan into v_definition,v_scans
  from pg_stat_user_indexes s join pg_index i on i.indexrelid=s.indexrelid
  where s.schemaname='public' and s.indexrelname=v_name and not i.indisunique and not i.indisprimary;
  if v_definition is distinct from format('CREATE INDEX %I ON public.%I USING gin (prediction_numbers)',v_name,replace(v_name,'_prediction_numbers_idx',''))
    or v_scans is distinct from 0::bigint then
   raise exception 'RESULT_INDEX_RECHECK_REQUIRED: %',v_name;
  end if;
 end loop;
end $$;
-- Transactional drops briefly lock both tables; timeout rolls back instead of waiting.
drop index public.matrix_explore_results_prediction_numbers_idx;
drop index public.matrix_tianheng_results_prediction_numbers_idx;
commit;
-- Rollback, outside a transaction:
-- CREATE INDEX CONCURRENTLY matrix_explore_results_prediction_numbers_idx ON public.matrix_explore_results USING gin (prediction_numbers);
-- CREATE INDEX CONCURRENTLY matrix_tianheng_results_prediction_numbers_idx ON public.matrix_tianheng_results USING gin (prediction_numbers);
